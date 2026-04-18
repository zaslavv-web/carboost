-- Удаляем дублирующий триггер на test_attempts (оба вызывали одну и ту же функцию,
-- что приводило к двойной вставке в employee_career_assignments и notifications,
-- блокируя завершение теста)
DROP TRIGGER IF EXISTS auto_reward_test_attempt ON public.test_attempts;

-- Оборачиваем тело функции в безопасный EXCEPTION-блок, чтобы любые сбои
-- (награды, назначение трека, уведомления) НЕ блокировали сохранение попытки теста
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
  BEGIN
    IF NEW.total > 0 THEN
      pct := (NEW.score::numeric / NEW.total::numeric) * 100;
      IF pct >= 80 THEN
        PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_passed_high',
          'Тест пройден на ' || round(pct) || '%');
      END IF;
      PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_completed', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Reward grant failed for user %: %', NEW.user_id, SQLERRM;
  END;

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Career track auto-assign failed for user %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;