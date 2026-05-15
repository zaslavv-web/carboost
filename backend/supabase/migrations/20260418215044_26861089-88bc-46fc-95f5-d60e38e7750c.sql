-- Уникальность названия компании без учёта регистра/пробелов
CREATE UNIQUE INDEX IF NOT EXISTS companies_name_lower_unique
  ON public.companies (lower(btrim(name)));

-- RPC для регистрации новой компании (HRD при signup). Доступна и анонимам, чтобы можно было вызвать сразу после signUp.
CREATE OR REPLACE FUNCTION public.register_company(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text := btrim(_name);
  v_id uuid;
BEGIN
  IF v_clean IS NULL OR length(v_clean) < 2 THEN
    RAISE EXCEPTION 'Название компании должно содержать минимум 2 символа';
  END IF;
  IF length(v_clean) > 120 THEN
    RAISE EXCEPTION 'Название компании слишком длинное (максимум 120 символов)';
  END IF;

  SELECT id INTO v_id FROM public.companies WHERE lower(btrim(name)) = lower(v_clean) LIMIT 1;
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'Компания с таким названием уже зарегистрирована';
  END IF;

  INSERT INTO public.companies (name) VALUES (v_clean) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_company(text) TO anon, authenticated;

-- RPC для поиска компании по названию (employee/manager/company_admin при signup)
CREATE OR REPLACE FUNCTION public.find_company_by_name(_name text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies
  WHERE lower(btrim(name)) = lower(btrim(_name))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.find_company_by_name(text) TO anon, authenticated;