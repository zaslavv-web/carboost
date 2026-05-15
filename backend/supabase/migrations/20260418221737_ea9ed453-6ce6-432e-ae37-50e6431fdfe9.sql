-- Расширяем триггер по тестам: автоназначение карьерного трека по должности
CREATE OR REPLACE FUNCTION public.on_test_attempt_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pct numeric;
  v_position_id uuid;
  v_template_id uuid;
BEGIN
  -- Награды (как было)
  IF NEW.total > 0 THEN
    pct := (NEW.score::numeric / NEW.total::numeric) * 100;
    IF pct >= 80 THEN
      PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_passed_high',
        'Тест пройден на ' || round(pct) || '%');
    END IF;
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_completed', NULL);
  END IF;

  -- Автоназначение карьерного трека: всегда после прохождения, если трек ещё не назначен
  SELECT position_id INTO v_position_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;

  IF v_position_id IS NOT NULL AND NEW.company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.employee_career_assignments
       WHERE user_id = NEW.user_id AND status = 'active'
     )
  THEN
    SELECT id INTO v_template_id
    FROM public.career_track_templates
    WHERE company_id = NEW.company_id
      AND is_active = true
      AND from_position_id = v_position_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_template_id IS NOT NULL THEN
      INSERT INTO public.employee_career_assignments
        (user_id, company_id, template_id, status, current_step, assigned_at, assigned_by)
      VALUES
        (NEW.user_id, NEW.company_id, v_template_id, 'active', 0, now(), NULL);

      INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
      VALUES (NEW.user_id, NEW.company_id,
              'Назначен карьерный трек',
              'По результатам теста вам автоматически назначен подходящий карьерный трек.',
              'career_track');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Убедимся, что триггер существует на таблице test_attempts
DROP TRIGGER IF EXISTS trg_on_test_attempt_created ON public.test_attempts;
CREATE TRIGGER trg_on_test_attempt_created
AFTER INSERT ON public.test_attempts
FOR EACH ROW EXECUTE FUNCTION public.on_test_attempt_created();

-- Разовое автоназначение для тех, кто уже прошёл тест, но трека нет
INSERT INTO public.employee_career_assignments
  (user_id, company_id, template_id, status, current_step, assigned_at, assigned_by)
SELECT DISTINCT ON (ta.user_id)
       ta.user_id, ta.company_id, t.id, 'active', 0, now(), NULL
FROM public.test_attempts ta
JOIN public.profiles p ON p.user_id = ta.user_id
JOIN public.career_track_templates t
  ON t.company_id = ta.company_id
 AND t.is_active = true
 AND t.from_position_id = p.position_id
WHERE ta.company_id IS NOT NULL
  AND p.position_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_career_assignments eca
    WHERE eca.user_id = ta.user_id AND eca.status = 'active'
  )
ORDER BY ta.user_id, ta.created_at ASC;