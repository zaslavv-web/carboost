
-- Positions table
CREATE TABLE public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  department text,
  psychological_profile jsonb DEFAULT '{}',
  competency_profile jsonb DEFAULT '[]',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view positions" ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "HRD can manage positions" ON public.positions FOR ALL USING (has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "Superadmin can manage positions" ON public.positions FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Position career paths
CREATE TABLE public.position_career_paths (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  to_position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  strategy_description text,
  requirements jsonb DEFAULT '[]',
  estimated_months integer,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_position_id, to_position_id)
);

ALTER TABLE public.position_career_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view career paths" ON public.position_career_paths FOR SELECT TO authenticated USING (true);
CREATE POLICY "HRD can manage career paths" ON public.position_career_paths FOR ALL USING (has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "Superadmin can manage career paths" ON public.position_career_paths FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER update_career_paths_updated_at BEFORE UPDATE ON public.position_career_paths
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- HR Documents table
CREATE TABLE public.hr_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('talent_management', 'hr_strategy', 'motivation_strategy')),
  title text NOT NULL,
  description text,
  file_url text,
  file_name text,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_data jsonb,
  scenario_id uuid REFERENCES public.assessment_scenarios(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HRD can manage hr_documents" ON public.hr_documents FOR ALL USING (has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "Superadmin can manage hr_documents" ON public.hr_documents FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER update_hr_documents_updated_at BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add position_id to profiles
ALTER TABLE public.profiles ADD COLUMN position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

-- Storage bucket for HR documents
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documents', 'hr-documents', false);

CREATE POLICY "HRD can upload hr docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "HRD can view hr docs" ON storage.objects FOR SELECT USING (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "HRD can delete hr docs" ON storage.objects FOR DELETE USING (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'hrd'::app_role));
CREATE POLICY "Superadmin can upload hr docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmin can view hr docs" ON storage.objects FOR SELECT USING (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmin can delete hr docs" ON storage.objects FOR DELETE USING (bucket_id = 'hr-documents' AND has_role(auth.uid(), 'superadmin'::app_role));
