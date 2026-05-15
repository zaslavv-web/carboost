-- Tests authored by HRD (closed-question / single-choice)
CREATE TABLE IF NOT EXISTS public.closed_question_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  source_file_url text,
  source_file_name text,
  -- questions JSON shape:
  -- [{ id, text, competency, options:[{id,text}], correct_option_id, weight }]
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.closed_question_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view active company tests"
  ON public.closed_question_tests FOR SELECT TO authenticated
  USING (is_active = true AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "HRD can manage company tests"
  ON public.closed_question_tests FOR ALL
  USING (public.has_role(auth.uid(),'hrd'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin can manage company tests"
  ON public.closed_question_tests FOR ALL
  USING (public.has_role(auth.uid(),'company_admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin can manage all tests"
  ON public.closed_question_tests FOR ALL
  USING (public.has_role(auth.uid(),'superadmin'::app_role));

CREATE TRIGGER set_closed_question_tests_updated_at
  BEFORE UPDATE ON public.closed_question_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attempts
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  test_id uuid REFERENCES public.closed_question_tests(id) ON DELETE SET NULL,
  test_source text NOT NULL DEFAULT 'hrd', -- 'hrd' | 'ai_generated'
  -- answers shape: [{ question_id, selected_option_id, correct_option_id, is_correct, competency }]
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- competency_breakdown: [{ competency, score, total }]
  competency_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own attempts"
  ON public.test_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own attempts"
  ON public.test_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "HRD can view company attempts"
  ON public.test_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hrd'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin can view company attempts"
  ON public.test_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'company_admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin can view all attempts"
  ON public.test_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'::app_role));

-- Storage bucket for HRD test source files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('hrd-tests','hrd-tests', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "HRD can read company test files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hrd-tests');

CREATE POLICY "HRD can upload company test files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'hrd'::app_role)
      OR public.has_role(auth.uid(),'company_admin'::app_role)
      OR public.has_role(auth.uid(),'superadmin'::app_role)
    )
  );

CREATE POLICY "HRD can delete company test files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'hrd'::app_role)
      OR public.has_role(auth.uid(),'company_admin'::app_role)
      OR public.has_role(auth.uid(),'superadmin'::app_role)
    )
  );