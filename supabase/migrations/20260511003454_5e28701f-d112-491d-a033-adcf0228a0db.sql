
CREATE TABLE IF NOT EXISTS public.pricing_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  phone text,
  plan text NOT NULL CHECK (plan IN ('cloud','on_premise')),
  headcount integer,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
  admin_notes text,
  source text DEFAULT 'pricing_page',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin can read pricing inquiries"
  ON public.pricing_inquiries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'));

CREATE POLICY "Superadmin can update pricing inquiries"
  ON public.pricing_inquiries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'));

CREATE POLICY "Superadmin can delete pricing inquiries"
  ON public.pricing_inquiries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_pricing_inquiries_updated_at
  BEFORE UPDATE ON public.pricing_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_pricing_inquiry(
  _name text, _email text, _plan text,
  _company text DEFAULT NULL, _phone text DEFAULT NULL,
  _headcount integer DEFAULT NULL, _message text DEFAULT NULL,
  _source text DEFAULT 'pricing_page'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(_name,''));
  v_email text := lower(btrim(COALESCE(_email,'')));
  v_admin RECORD;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Имя должно быть от 2 до 120 символов';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Некорректный email';
  END IF;
  IF _plan NOT IN ('cloud','on_premise') THEN
    RAISE EXCEPTION 'Неверный тариф';
  END IF;
  IF _company IS NOT NULL AND length(btrim(_company)) > 200 THEN
    RAISE EXCEPTION 'Слишком длинное название компании';
  END IF;
  IF _headcount IS NOT NULL AND (_headcount < 1 OR _headcount > 1000000) THEN
    RAISE EXCEPTION 'Некорректный размер команды';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 4000 THEN
    RAISE EXCEPTION 'Слишком длинный комментарий';
  END IF;

  INSERT INTO public.pricing_inquiries(name,email,company,phone,plan,headcount,message,source)
  VALUES (v_name, v_email, NULLIF(btrim(COALESCE(_company,'')),''),
          NULLIF(btrim(COALESCE(_phone,'')),''), _plan, _headcount,
          NULLIF(btrim(COALESCE(_message,'')),''),
          COALESCE(NULLIF(btrim(COALESCE(_source,'')),''),'pricing_page'))
  RETURNING id INTO v_id;

  -- Уведомить суперадминов
  FOR v_admin IN
    SELECT ur.user_id, p.company_id FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'superadmin'
  LOOP
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_admin.user_id, v_admin.company_id,
      '💼 Новая заявка на тариф (' || CASE _plan WHEN 'cloud' THEN 'Cloud' ELSE 'On-Premise' END || ')',
      v_name || ' (' || v_email || ')' || COALESCE(' • ' || _company,'') ||
      COALESCE(' • ' || _headcount || ' чел.','') ||
      COALESCE(E'\n' || _message,''),
      'pricing_inquiry');
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pricing_inquiry(text,text,text,text,text,integer,text,text) TO anon, authenticated;
