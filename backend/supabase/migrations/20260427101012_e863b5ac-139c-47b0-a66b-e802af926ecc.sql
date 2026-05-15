REVOKE ALL ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) TO authenticated;