CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.user_id THEN
    NEW.is_verified := OLD.is_verified;
    NEW.requested_role := OLD.requested_role;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    NEW.overall_score := OLD.overall_score;
    NEW.role_readiness := OLD.role_readiness;
    IF current_setting('app.allow_profile_position_update', true) IS DISTINCT FROM 'true' THEN
      NEW.position_id := OLD.position_id;
    END IF;
    NEW.pending_position_id := COALESCE(NEW.pending_position_id, OLD.pending_position_id);
  END IF;

  IF public.has_role(auth.uid(), 'company_admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'superadmin'::app_role)
     AND auth.uid() <> NEW.user_id THEN
    NEW.is_verified := OLD.is_verified;
    NEW.requested_role := OLD.requested_role;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    NEW.overall_score := OLD.overall_score;
    NEW.role_readiness := OLD.role_readiness;
  END IF;

  RETURN NEW;
END;
$$;

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

  PERFORM set_config('app.allow_profile_position_update', 'true', true);

  UPDATE public.profiles
  SET position_id = COALESCE(_position_id, position_id),
      position = COALESCE(v_position_title, position),
      department = COALESCE(NULLIF((_answers->'basic'->>'department'), ''), department)
  WHERE user_id = v_user_id;

  PERFORM set_config('app.allow_profile_position_update', 'false', true);

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

REVOKE ALL ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text) TO authenticated;