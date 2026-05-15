DROP POLICY IF EXISTS "Anyone can submit a demo request" ON public.demo_requests;

CREATE OR REPLACE FUNCTION public.submit_demo_request(
  _name TEXT,
  _email TEXT,
  _company TEXT DEFAULT NULL,
  _headcount INTEGER DEFAULT NULL,
  _source TEXT DEFAULT 'landing'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _name_trim TEXT := btrim(_name);
  _email_trim TEXT := lower(btrim(_email));
BEGIN
  IF _name_trim IS NULL OR length(_name_trim) < 2 OR length(_name_trim) > 120 THEN
    RAISE EXCEPTION 'Имя должно быть от 2 до 120 символов';
  END IF;
  IF _email_trim !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Некорректный email';
  END IF;
  IF _company IS NOT NULL AND length(btrim(_company)) > 200 THEN
    RAISE EXCEPTION 'Слишком длинное название компании';
  END IF;
  IF _headcount IS NOT NULL AND (_headcount < 1 OR _headcount > 1000000) THEN
    RAISE EXCEPTION 'Некорректный размер команды';
  END IF;

  INSERT INTO public.demo_requests (name, email, company, headcount, source)
  VALUES (_name_trim, _email_trim, NULLIF(btrim(_company), ''), _headcount, COALESCE(NULLIF(btrim(_source), ''), 'landing'))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_demo_request(TEXT, TEXT, TEXT, INTEGER, TEXT) TO anon, authenticated;