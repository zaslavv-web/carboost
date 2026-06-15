
-- 1) Profiles: prevent self-assigned company_id / role escalation on INSERT
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND company_id IS NULL AND is_verified = false);

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(),'superadmin') THEN RETURN NEW; END IF;
  IF auth.uid() = NEW.user_id THEN
    NEW.company_id := NULL;
    NEW.is_verified := false;
    IF NEW.requested_role = 'superadmin' THEN NEW.requested_role := 'employee'; END IF;
    NEW.overall_score := 0;
    NEW.role_readiness := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields_insert();

-- 2) Invitations: hide plain token column from end users
REVOKE SELECT (token) ON public.employee_invitations FROM anon, authenticated;

-- 3) Notifications: restrict self-insert types to 'info' only
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND notification_type = 'info');

-- 4) Gamification rewards: stop exposing gift_content / monetary fields to employees
DROP POLICY IF EXISTS "Company users can view company reward types" ON public.gamification_reward_types;

DROP VIEW IF EXISTS public.gamification_rewards_public;
CREATE VIEW public.gamification_rewards_public
WITH (security_invoker = off) AS
SELECT id, company_id, title, description, category, icon, points, is_active,
       created_by, created_at, updated_at, reward_kind, image_url,
       trigger_mode, trigger_events, non_monetary_title, non_monetary_description
FROM public.gamification_reward_types
WHERE company_id = public.get_user_company_id(auth.uid())
  AND is_active = true;
GRANT SELECT ON public.gamification_rewards_public TO authenticated;

-- 5) Closed-question tests: hide correct answers from employees
DROP POLICY IF EXISTS "Company users can view active company tests" ON public.closed_question_tests;

DROP VIEW IF EXISTS public.closed_question_tests_safe;
CREATE VIEW public.closed_question_tests_safe
WITH (security_invoker = off) AS
SELECT id, company_id, position_id, title, description, is_active,
       created_at, updated_at,
       COALESCE(jsonb_array_length(questions), 0) AS question_count
FROM public.closed_question_tests
WHERE company_id = public.get_user_company_id(auth.uid())
  AND is_active = true;
GRANT SELECT ON public.closed_question_tests_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.get_safe_test_questions(_test_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_qs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT company_id, questions INTO v_company, v_qs
  FROM public.closed_question_tests WHERE id = _test_id AND is_active = true;
  IF v_company IS NULL THEN RAISE EXCEPTION 'test not found'; END IF;
  IF v_company IS DISTINCT FROM public.get_user_company_id(auth.uid())
     AND NOT public.has_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(q - 'correct_option_id'), '[]'::jsonb)
          FROM jsonb_array_elements(v_qs) AS q);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_safe_test_questions(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_safe_test_questions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_test_attempt(_test_id uuid, _source text, _answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid; v_user_company uuid; v_qs jsonb; v_q jsonb;
  v_qid text; v_selected text; v_correct text; v_competency text; v_weight numeric;
  v_total numeric := 0; v_earned numeric := 0;
  v_details jsonb := '[]'::jsonb; v_compmap jsonb := '{}'::jsonb;
  v_score int; v_attempt_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT company_id, questions INTO v_company, v_qs
  FROM public.closed_question_tests WHERE id = _test_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'test not found'; END IF;
  v_user_company := public.get_user_company_id(auth.uid());
  IF v_company IS DISTINCT FROM v_user_company
     AND NOT public.has_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR v_q IN SELECT * FROM jsonb_array_elements(v_qs) LOOP
    v_qid := v_q->>'id'; v_correct := v_q->>'correct_option_id';
    v_competency := COALESCE(v_q->>'competency','general');
    v_weight := COALESCE((v_q->>'weight')::numeric, 1);
    v_selected := _answers->>v_qid;
    v_total := v_total + v_weight;
    IF v_selected = v_correct THEN v_earned := v_earned + v_weight; END IF;
    v_details := v_details || jsonb_build_object(
      'question_id', v_qid, 'selected_option_id', v_selected,
      'is_correct', v_selected = v_correct, 'competency', v_competency, 'weight', v_weight);
    v_compmap := jsonb_set(v_compmap, ARRAY[v_competency],
      jsonb_build_object(
        'earned', COALESCE((v_compmap->v_competency->>'earned')::numeric,0)
                  + CASE WHEN v_selected=v_correct THEN v_weight ELSE 0 END,
        'total',  COALESCE((v_compmap->v_competency->>'total')::numeric,0) + v_weight));
  END LOOP;
  v_score := ROUND((v_earned / GREATEST(v_total,1)) * 100)::int;
  INSERT INTO public.test_attempts(user_id, company_id, test_id, test_source, answers, competency_breakdown, score, total)
  VALUES (auth.uid(), v_user_company, _test_id, COALESCE(_source,'hrd'), v_details,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'competency', key,
       'score', ROUND((value->>'earned')::numeric / GREATEST((value->>'total')::numeric,1) * 100)::int,
       'total', (value->>'total')::numeric)), '[]'::jsonb) FROM jsonb_each(v_compmap)),
    v_score, 100)
  RETURNING id INTO v_attempt_id;
  RETURN jsonb_build_object('attempt_id', v_attempt_id, 'score', v_score, 'total', 100,
    'breakdown', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'competency', key,
        'score', ROUND((value->>'earned')::numeric / GREATEST((value->>'total')::numeric,1) * 100)::int,
        'total', (value->>'total')::numeric)), '[]'::jsonb) FROM jsonb_each(v_compmap)));
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_test_attempt(uuid,text,jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(uuid,text,jsonb) TO authenticated;

-- 6) Revoke EXECUTE on admin-only SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.assign_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_invite_employees(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_shop_order(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_shop_order(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.payout_hr_task_rewards() FROM anon;
REVOKE EXECUTE ON FUNCTION public.payout_peer_recognition() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_currency(uuid, uuid, integer, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.build_employee_artifacts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) FROM anon;
