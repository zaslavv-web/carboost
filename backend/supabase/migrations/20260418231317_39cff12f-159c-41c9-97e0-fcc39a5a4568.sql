-- Расширяем допустимые типы уведомлений (если есть CHECK constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_notification_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_notification_type_check;
  END IF;
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
    CHECK (notification_type IN (
      'info','reward','assignment','system','career_track',
      'career_step_passed','career_step_failed','test_assigned','new_employee'
    ));
END $$;

-- Функция: построить блок артефактов для сотрудника
CREATE OR REPLACE FUNCTION public.build_employee_artifacts(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
  v_rewards text;
  v_text text := '';
BEGIN
  SELECT score, total, created_at INTO v_attempt
  FROM public.test_attempts
  WHERE user_id = _user_id
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_attempt IS NOT NULL THEN
    v_text := v_text || '📊 Последний тест: ' || v_attempt.score || '/' || v_attempt.total
              || ' (' || to_char(v_attempt.created_at, 'DD.MM.YYYY') || '). ';
  END IF;

  SELECT string_agg(rt.title, ', ') INTO v_rewards
  FROM public.employee_rewards er
  JOIN public.gamification_reward_types rt ON rt.id = er.reward_type_id
  WHERE er.user_id = _user_id AND er.awarded_at > now() - interval '30 days';
  IF v_rewards IS NOT NULL THEN
    v_text := v_text || '🏆 Награды (30д): ' || v_rewards || '.';
  END IF;

  RETURN v_text;
END;
$$;

-- Функция: разослать уведомления о событии этапа
CREATE OR REPLACE FUNCTION public.notify_career_event(
  _user_id uuid,
  _company_id uuid,
  _title text,
  _description text,
  _ntype text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_dept text;
  v_head uuid;
  v_manager uuid;
  v_hrd RECORD;
BEGIN
  -- сотруднику
  INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
  VALUES (_user_id, _company_id, _title, _description, _ntype);

  -- линейному руководителю
  SELECT manager_id INTO v_manager FROM public.team_members
  WHERE employee_id = _user_id LIMIT 1;
  IF v_manager IS NOT NULL AND v_manager <> _user_id THEN
    INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
    VALUES (v_manager, _company_id,
            'Сотрудник: ' || _title,
            _description, _ntype);
  END IF;

  -- head отдела (если отличается от manager)
  SELECT department INTO v_employee_dept FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  IF v_employee_dept IS NOT NULL THEN
    SELECT head_user_id INTO v_head FROM public.departments
    WHERE company_id = _company_id AND name = v_employee_dept LIMIT 1;
    IF v_head IS NOT NULL AND v_head <> _user_id AND v_head IS DISTINCT FROM v_manager THEN
      INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
      VALUES (v_head, _company_id,
              'Сотрудник отдела: ' || _title,
              _description, _ntype);
    END IF;
  END IF;

  -- всем HRD компании
  FOR v_hrd IN
    SELECT p.user_id FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.company_id = _company_id AND ur.role = 'hrd' AND p.user_id <> _user_id
  LOOP
    INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
    VALUES (v_hrd.user_id, _company_id,
            'HR-событие: ' || _title,
            _description, _ntype);
  END LOOP;
END;
$$;

-- Триггер на изменение этапа/статуса карьерного назначения
CREATE OR REPLACE FUNCTION public.on_career_step_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_template RECORD;
  v_artifacts text;
  v_desc text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.current_step = OLD.current_step AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_profile FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  SELECT title INTO v_template FROM public.career_track_templates WHERE id = NEW.template_id LIMIT 1;
  v_artifacts := public.build_employee_artifacts(NEW.user_id);

  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' завершил трек "' ||
              COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Карьерный трек завершён', v_desc, 'career_step_passed');
  ELSIF NEW.status = 'failed' THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' не прошёл этап ' || NEW.current_step ||
              ' трека "' || COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Этап не пройден', v_desc, 'career_step_failed');
  ELSIF NEW.current_step > COALESCE(OLD.current_step, -1) THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' перешёл на этап ' || NEW.current_step ||
              ' трека "' || COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Этап пройден', v_desc, 'career_step_passed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_career_step_changed ON public.employee_career_assignments;
CREATE TRIGGER trg_on_career_step_changed
AFTER INSERT OR UPDATE ON public.employee_career_assignments
FOR EACH ROW EXECUTE FUNCTION public.on_career_step_changed();