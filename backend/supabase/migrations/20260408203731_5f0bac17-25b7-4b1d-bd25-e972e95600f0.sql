
CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  head_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "HRD can manage departments" ON public.departments FOR ALL USING (has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "Superadmin can manage departments" ON public.departments FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
