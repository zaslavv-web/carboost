-- 1. Extend gamification_reward_types
ALTER TABLE public.gamification_reward_types
  ADD COLUMN IF NOT EXISTS reward_kind text NOT NULL DEFAULT 'achievement',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS trigger_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS trigger_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gift_content text,
  ADD COLUMN IF NOT EXISTS non_monetary_title text,
  ADD COLUMN IF NOT EXISTS non_monetary_description text,
  ADD COLUMN IF NOT EXISTS monetary_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS monetary_currency text DEFAULT 'RUB';

-- Validation: reward_kind enum-like check via trigger (avoid CHECK for flexibility)
CREATE OR REPLACE FUNCTION public.validate_reward_type()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reward_kind NOT IN ('achievement','digital_gift','non_monetary','monetary') THEN
    RAISE EXCEPTION 'Invalid reward_kind: %', NEW.reward_kind;
  END IF;
  IF NEW.trigger_mode NOT IN ('manual','auto') THEN
    RAISE EXCEPTION 'Invalid trigger_mode: %', NEW.trigger_mode;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_reward_type_trigger ON public.gamification_reward_types;
CREATE TRIGGER validate_reward_type_trigger
  BEFORE INSERT OR UPDATE ON public.gamification_reward_types
  FOR EACH ROW EXECUTE FUNCTION public.validate_reward_type();

-- 2. Public bucket for reward images
INSERT INTO storage.buckets (id, name, public)
VALUES ('reward-images', 'reward-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read reward images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reward-images');

CREATE POLICY "Authenticated can upload reward images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reward-images');

CREATE POLICY "Authenticated can update reward images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'reward-images');

CREATE POLICY "Authenticated can delete reward images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reward-images');

-- 3. Auto-grant rewards function (for any trigger event)
CREATE OR REPLACE FUNCTION public.grant_rewards_for_event(
  _user_id uuid,
  _company_id uuid,
  _event_code text,
  _description text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rt RECORD;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN RETURN; END IF;
  FOR rt IN
    SELECT id FROM public.gamification_reward_types
    WHERE company_id = _company_id
      AND is_active = true
      AND trigger_mode = 'auto'
      AND trigger_events ? _event_code
  LOOP
    -- Avoid duplicate grant on same day for same event
    IF NOT EXISTS (
      SELECT 1 FROM public.employee_rewards
      WHERE reward_type_id = rt.id
        AND user_id = _user_id
        AND awarded_at::date = now()::date
    ) THEN
      INSERT INTO public.employee_rewards (reward_type_id, user_id, company_id, description)
      VALUES (rt.id, _user_id, _company_id, COALESCE(_description, 'Авто: ' || _event_code));
    END IF;
  END LOOP;
END;
$$;

-- 4. Trigger on employee_rewards → write history (achievements + notifications)
CREATE OR REPLACE FUNCTION public.on_reward_granted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rt RECORD;
  ach_title text;
  ach_desc text;
BEGIN
  SELECT * INTO rt FROM public.gamification_reward_types WHERE id = NEW.reward_type_id;
  IF rt IS NULL THEN RETURN NEW; END IF;

  ach_title := '🏆 ' || rt.title;
  ach_desc := COALESCE(rt.description, '') ||
              CASE
                WHEN rt.reward_kind = 'monetary' THEN ' • Денежное вознаграждение: ' || COALESCE(rt.monetary_amount::text,'0') || ' ' || COALESCE(rt.monetary_currency,'RUB')
                WHEN rt.reward_kind = 'non_monetary' THEN ' • ' || COALESCE(rt.non_monetary_title,'')
                WHEN rt.reward_kind = 'digital_gift' THEN ' • Цифровой подарок'
                ELSE ''
              END;

  INSERT INTO public.achievements (user_id, company_id, title, description, icon, achievement_date)
  VALUES (NEW.user_id, NEW.company_id, ach_title, ach_desc, COALESCE(rt.icon,'award'), NEW.awarded_at::date);

  INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
  VALUES (NEW.user_id, NEW.company_id, 'Вы получили награду: ' || rt.title,
          COALESCE(NEW.description, rt.description, ''), 'reward');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reward_granted_trigger ON public.employee_rewards;
CREATE TRIGGER on_reward_granted_trigger
  AFTER INSERT ON public.employee_rewards
  FOR EACH ROW EXECUTE FUNCTION public.on_reward_granted();

-- Allow trigger to insert into notifications for the rewarded user (bypass user_id RLS via SECURITY DEFINER already covers it)

-- 5. Auto triggers on domain events
-- 5a. test_attempts → high score
CREATE OR REPLACE FUNCTION public.on_test_attempt_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pct numeric;
BEGIN
  IF NEW.total > 0 THEN
    pct := (NEW.score::numeric / NEW.total::numeric) * 100;
    IF pct >= 80 THEN
      PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_passed_high',
        'Тест пройден на ' || round(pct) || '%');
    END IF;
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_completed', NULL);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_reward_test_attempt ON public.test_attempts;
CREATE TRIGGER auto_reward_test_attempt
  AFTER INSERT ON public.test_attempts
  FOR EACH ROW EXECUTE FUNCTION public.on_test_attempt_created();

-- 5b. assessments → ai assessment completed
CREATE OR REPLACE FUNCTION public.on_assessment_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'ai_assessment_completed', NULL);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_reward_assessment ON public.assessments;
CREATE TRIGGER auto_reward_assessment
  AFTER INSERT ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.on_assessment_created();

-- 5c. career_goals completed
CREATE OR REPLACE FUNCTION public.on_career_goal_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'career_goal_achieved', NEW.title);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_reward_career_goal ON public.career_goals;
CREATE TRIGGER auto_reward_career_goal
  AFTER INSERT OR UPDATE ON public.career_goals
  FOR EACH ROW EXECUTE FUNCTION public.on_career_goal_updated();

-- 5d. employee_career_assignments completed
CREATE OR REPLACE FUNCTION public.on_career_assignment_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'career_track_completed', NULL);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_reward_career_assignment ON public.employee_career_assignments;
CREATE TRIGGER auto_reward_career_assignment
  AFTER INSERT OR UPDATE ON public.employee_career_assignments
  FOR EACH ROW EXECUTE FUNCTION public.on_career_assignment_updated();

-- 5e. profiles: hire anniversary check helper (manual cron later) + position promotion
CREATE OR REPLACE FUNCTION public.on_profile_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.position_id IS DISTINCT FROM OLD.position_id AND OLD.position_id IS NOT NULL THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'position_promotion', 'Повышение должности');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_reward_profile ON public.profiles;
CREATE TRIGGER auto_reward_profile
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_updated();