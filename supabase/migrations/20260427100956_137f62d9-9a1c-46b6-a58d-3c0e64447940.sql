-- Extend positions into full job profile templates
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS profile_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_positions_company_status ON public.positions(company_id, profile_status);

-- Keep status values valid without relying on time-based constraints
CREATE OR REPLACE FUNCTION public.validate_position_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_status NOT IN ('draft', 'review', 'approved', 'archived') THEN
    RAISE EXCEPTION 'Invalid profile_status: %', NEW.profile_status;
  END IF;
  IF NEW.profile_version < 1 THEN
    RAISE EXCEPTION 'profile_version must be positive';
  END IF;
  IF NEW.profile_status = 'approved' AND OLD.profile_template IS DISTINCT FROM NEW.profile_template THEN
    NEW.profile_version := COALESCE(OLD.profile_version, 0) + 1;
  END IF;
  IF NEW.profile_status = 'approved' AND OLD.profile_status IS DISTINCT FROM 'approved' THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_position_profile_status ON public.positions;
CREATE TRIGGER trg_validate_position_profile_status
BEFORE INSERT OR UPDATE ON public.positions
FOR EACH ROW EXECUTE FUNCTION public.validate_position_profile_status();

-- Employee questionnaire versions
CREATE TABLE IF NOT EXISTS public.employee_questionnaires (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid,
  position_id uuid,
  other_position_title text,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  skill_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_interpretation jsonb,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  next_update_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_questionnaires ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_employee_questionnaires_user_created ON public.employee_questionnaires(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_questionnaires_company_status ON public.employee_questionnaires(company_id, status);

CREATE OR REPLACE FUNCTION public.validate_employee_questionnaire()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'submitted', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid questionnaire status: %', NEW.status;
  END IF;
  IF NEW.version < 1 THEN
    RAISE EXCEPTION 'questionnaire version must be positive';
  END IF;
  IF NEW.position_id IS NULL AND NULLIF(trim(COALESCE(NEW.other_position_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Position or other position title is required';
  END IF;
  IF NEW.status IN ('submitted', 'confirmed') AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  IF NEW.next_update_due_at IS NULL AND NEW.status IN ('submitted', 'confirmed') THEN
    NEW.next_update_due_at := now() + interval '6 months';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_employee_questionnaire ON public.employee_questionnaires;
CREATE TRIGGER trg_validate_employee_questionnaire
BEFORE INSERT OR UPDATE ON public.employee_questionnaires
FOR EACH ROW EXECUTE FUNCTION public.validate_employee_questionnaire();

CREATE POLICY "Employees view own questionnaires"
ON public.employee_questionnaires
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Employees create own questionnaires"
ON public.employee_questionnaires
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Employees update own draft questionnaires"
ON public.employee_questionnaires
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status IN ('draft', 'submitted'))
WITH CHECK (auth.uid() = user_id AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "HRD view company questionnaires"
ON public.employee_questionnaires
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'hrd'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin view company questionnaires"
ON public.employee_questionnaires
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'company_admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin manage all questionnaires"
ON public.employee_questionnaires
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Questionnaire evidence files metadata
CREATE TABLE IF NOT EXISTS public.employee_questionnaire_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  file_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_questionnaire_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_employee_questionnaire_files_questionnaire ON public.employee_questionnaire_files(questionnaire_id);

CREATE POLICY "View questionnaire files via questionnaire"
ON public.employee_questionnaire_files
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.employee_questionnaires q
  WHERE q.id = employee_questionnaire_files.questionnaire_id
    AND (
      q.user_id = auth.uid()
      OR (public.has_role(auth.uid(), 'hrd'::app_role) AND q.company_id = public.get_user_company_id(auth.uid()))
      OR (public.has_role(auth.uid(), 'company_admin'::app_role) AND q.company_id = public.get_user_company_id(auth.uid()))
      OR public.has_role(auth.uid(), 'superadmin'::app_role)
    )
));

CREATE POLICY "Insert own questionnaire files"
ON public.employee_questionnaire_files
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.employee_questionnaires q
  WHERE q.id = employee_questionnaire_files.questionnaire_id
    AND q.user_id = auth.uid()
));

CREATE POLICY "Delete own draft questionnaire files"
ON public.employee_questionnaire_files
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.employee_questionnaires q
  WHERE q.id = employee_questionnaire_files.questionnaire_id
    AND q.user_id = auth.uid()
    AND q.status IN ('draft', 'submitted')
));

-- Private bucket for questionnaire evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-questionnaires', 'employee-questionnaires', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Employees upload own questionnaire files" ON storage.objects;
CREATE POLICY "Employees upload own questionnaire files"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-questionnaires'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND public.get_user_company_id(auth.uid())::text = (storage.foldername(name))[1]
  AND lower(right(name, position('.' in reverse(name)) - 1)) IN ('docx', 'pdf', 'jpg', 'jpeg', 'png')
  AND (metadata->>'mimetype') IN (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'image/jpeg',
    'image/png'
  )
);

DROP POLICY IF EXISTS "Employees view own questionnaire storage files" ON storage.objects;
CREATE POLICY "Employees view own questionnaire storage files"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-questionnaires'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
    OR (
      (public.has_role(auth.uid(), 'hrd'::app_role) OR public.has_role(auth.uid(), 'company_admin'::app_role))
      AND public.get_user_company_id(auth.uid())::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Employees delete own questionnaire storage files" ON storage.objects;
CREATE POLICY "Employees delete own questionnaire storage files"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-questionnaires'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Safe submit helper: saves questionnaire, updates passport basics, stores competency self-assessment, creates assessment snapshot
CREATE OR REPLACE FUNCTION public.submit_employee_questionnaire(
  _questionnaire_id uuid,
  _position_id uuid,
  _other_position_title text,
  _answers jsonb,
  _skill_gaps jsonb,
  _status text DEFAULT 'submitted'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_questionnaire_id uuid := _questionnaire_id;
  v_position_title text;
  v_full_name text;
  v_department text;
  v_comp jsonb;
  v_score integer := 0;
  v_hr uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT company_id, full_name, department INTO v_company_id, v_full_name, v_department
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User company is required';
  END IF;

  IF _position_id IS NOT NULL THEN
    SELECT title INTO v_position_title
    FROM public.positions
    WHERE id = _position_id AND company_id = v_company_id
    LIMIT 1;
    IF v_position_title IS NULL THEN
      RAISE EXCEPTION 'Position is not available for this company';
    END IF;
  ELSE
    v_position_title := NULLIF(trim(COALESCE(_other_position_title, '')), '');
    IF v_position_title IS NULL THEN
      RAISE EXCEPTION 'Position is required';
    END IF;
  END IF;

  IF _status NOT IN ('draft', 'submitted', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid questionnaire status';
  END IF;

  IF v_questionnaire_id IS NULL THEN
    INSERT INTO public.employee_questionnaires(user_id, company_id, position_id, other_position_title, answers, skill_gaps, status)
    VALUES (v_user_id, v_company_id, _position_id, NULLIF(trim(COALESCE(_other_position_title, '')), ''), COALESCE(_answers, '{}'::jsonb), COALESCE(_skill_gaps, '[]'::jsonb), _status)
    RETURNING id INTO v_questionnaire_id;
  ELSE
    UPDATE public.employee_questionnaires
    SET position_id = _position_id,
        other_position_title = NULLIF(trim(COALESCE(_other_position_title, '')), ''),
        answers = COALESCE(_answers, '{}'::jsonb),
        skill_gaps = COALESCE(_skill_gaps, '[]'::jsonb),
        status = _status,
        version = version + CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END
    WHERE id = v_questionnaire_id AND user_id = v_user_id
    RETURNING id INTO v_questionnaire_id;

    IF v_questionnaire_id IS NULL THEN
      RAISE EXCEPTION 'Questionnaire not found';
    END IF;
  END IF;

  UPDATE public.profiles
  SET position_id = COALESCE(_position_id, position_id),
      position = COALESCE(v_position_title, position),
      department = COALESCE(NULLIF((_answers->'basic'->>'department'), ''), department)
  WHERE user_id = v_user_id;

  DELETE FROM public.competencies WHERE user_id = v_user_id AND company_id = v_company_id;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(_answers->'competencies', '[]'::jsonb))
  LOOP
    IF NULLIF(trim(COALESCE(v_comp->>'name', '')), '') IS NOT NULL THEN
      INSERT INTO public.competencies(user_id, company_id, skill_name, skill_value)
      VALUES (
        v_user_id,
        v_company_id,
        v_comp->>'name',
        LEAST(100, GREATEST(0, COALESCE((v_comp->>'level')::integer, 1) * 25))
      );
    END IF;
  END LOOP;

  SELECT COALESCE(round(avg(LEAST(100, GREATEST(0, COALESCE((c->>'level')::integer, 1) * 25))))::integer, 0)
  INTO v_score
  FROM jsonb_array_elements(COALESCE(_answers->'competencies', '[]'::jsonb)) c;

  IF _status IN ('submitted', 'confirmed') THEN
    INSERT INTO public.assessments(user_id, company_id, assessment_type, score, assessment_data, change_value)
    VALUES (v_user_id, v_company_id, 'onboarding_questionnaire', v_score, jsonb_build_object('questionnaire_id', v_questionnaire_id, 'skill_gaps', COALESCE(_skill_gaps, '[]'::jsonb)), null);
  END IF;

  IF _position_id IS NULL THEN
    SELECT ur.user_id INTO v_hr
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role IN ('hrd'::app_role, 'company_admin'::app_role)
      AND p.company_id = v_company_id
    LIMIT 1;

    IF v_hr IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
      VALUES (v_hr, v_company_id, 'Новая должность на проверку', COALESCE(v_full_name, 'Сотрудник') || ' указал(а) должность: ' || v_position_title, 'position_review');
    END IF;
  END IF;

  RETURN v_questionnaire_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) TO authenticated;