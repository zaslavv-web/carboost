
-- ============================================================
-- 1. test_attempts: remove direct INSERT, force submit_test_attempt RPC
-- ============================================================
DROP POLICY IF EXISTS "Users can create own attempts" ON public.test_attempts;
-- service_role and SECURITY DEFINER RPC remain able to insert.

-- ============================================================
-- 2. user_roles: HRD must use verify_user / reject_user / delete_user RPCs
-- ============================================================
DROP POLICY IF EXISTS "HRD can insert non-privileged roles in own company" ON public.user_roles;
DROP POLICY IF EXISTS "HRD can delete non-privileged roles in own company" ON public.user_roles;

-- ============================================================
-- 3. Revoke EXECUTE on internal/trigger SECURITY DEFINER functions.
--    These are invoked by triggers or by other SECURITY DEFINER RPCs;
--    they must not be callable directly from the API.
-- ============================================================
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.on_profile_updated()',
    'public.validate_reward_type()',
    'public.on_assessment_created()',
    'public.on_career_goal_updated()',
    'public.protect_profile_sensitive_fields()',
    'public.protect_profile_sensitive_fields_insert()',
    'public.on_career_assignment_updated()',
    'public.update_updated_at_column()',
    'public.on_reward_granted()',
    'public.payout_hr_task_rewards()',
    'public.hash_invitation_token()',
    'public.on_career_assignment_step_sync()',
    'public.on_reward_grant_award_currency()',
    'public.sync_step_goals_to_personal(uuid)',
    'public.on_test_attempt_created()',
    'public.on_career_step_changed()',
    'public.payout_peer_recognition()',
    'public.validate_employee_questionnaire()',
    'public.handle_new_user()',
    'public.notify_career_event(uuid,uuid,text,text,text)',
    'public.grant_rewards_for_event(uuid,uuid,text,text)',
    'public.build_employee_artifacts(uuid)',
    'public.find_company_by_name(text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Function % not found, skipping', fn;
    END;
  END LOOP;
END $$;

-- Ensure service_role retains EXECUTE on everything (PostgREST role for definer chains)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
