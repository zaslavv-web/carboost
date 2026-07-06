
-- 1. Переключаем views с SECURITY DEFINER на SECURITY INVOKER
ALTER VIEW public.gamification_rewards_public SET (security_invoker = true);
ALTER VIEW public.closed_question_tests_safe SET (security_invoker = true);

-- 2. Отзываем EXECUTE у anon и authenticated со ВСЕХ SECURITY DEFINER функций public
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated, public',
                   r.schema_name, r.func_name, r.args);
  END LOOP;
END $$;

-- 3. Возвращаем EXECUTE публичным формам лендинга (вызываются анонимно)
GRANT EXECUTE ON FUNCTION public.submit_demo_request(text, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_pricing_inquiry(text, text, text, text, text, integer, text, text) TO anon, authenticated;
