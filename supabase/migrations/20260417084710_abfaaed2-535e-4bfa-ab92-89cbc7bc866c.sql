-- 1. Add pending position to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

-- 2. Email domain mapping table
CREATE TABLE IF NOT EXISTS public.email_domain_position_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  email_domain text NOT NULL,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email_domain)
);

ALTER TABLE public.email_domain_position_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view company mappings"
  ON public.email_domain_position_mappings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "HRD can manage company mappings"
  ON public.email_domain_position_mappings FOR ALL
  USING (public.has_role(auth.uid(), 'hrd'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin can manage company mappings"
  ON public.email_domain_position_mappings FOR ALL
  USING (public.has_role(auth.uid(), 'company_admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin can manage all mappings"
  ON public.email_domain_position_mappings FOR ALL
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Anyone authenticated can read mappings for assignment"
  ON public.email_domain_position_mappings FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER set_email_domain_mappings_updated_at
  BEFORE UPDATE ON public.email_domain_position_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();