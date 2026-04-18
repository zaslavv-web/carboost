
-- 1) Расширяем CHECK constraint, чтобы триггеры могли создавать системные уведомления
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'info','success','warning','achievement','career_track','reward','assignment','system'
  ]));

-- 2) Бэкфилл для vzaslav@mail.ru: назначаем подходящий трек по его текущей должности
DO $$
DECLARE
  v_user uuid;
  v_company uuid;
  v_position uuid;
  v_template uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = 'vzaslav@mail.ru' LIMIT 1;
  IF v_user IS NULL THEN RETURN; END IF;

  SELECT company_id, position_id INTO v_company, v_position
  FROM public.profiles WHERE user_id = v_user LIMIT 1;

  IF v_position IS NULL OR v_company IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.employee_career_assignments WHERE user_id = v_user AND status = 'active') THEN
    RETURN;
  END IF;

  SELECT id INTO v_template
  FROM public.career_track_templates
  WHERE company_id = v_company AND is_active = true AND from_position_id = v_position
  ORDER BY created_at ASC LIMIT 1;

  IF v_template IS NULL THEN RETURN; END IF;

  INSERT INTO public.employee_career_assignments
    (user_id, company_id, template_id, status, current_step, assigned_at)
  VALUES (v_user, v_company, v_template, 'active', 0, now())
  ON CONFLICT (user_id, template_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
  VALUES (v_user, v_company,
          'Назначен карьерный трек',
          'По результатам пройденного теста вам автоматически назначен подходящий карьерный трек.',
          'career_track');
END $$;
