
-- 1. Расширяем career_goals привязкой к этапу трека
ALTER TABLE public.career_goals
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS step_order integer,
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_career_goals_assignment ON public.career_goals(assignment_id, step_order);

-- 2. Сценарии проверки этапа
CREATE TABLE IF NOT EXISTS public.career_step_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  step_order integer NOT NULL,
  company_id uuid,
  requires_test boolean NOT NULL DEFAULT true,
  test_id uuid,
  min_test_score integer NOT NULL DEFAULT 80,
  requires_files boolean NOT NULL DEFAULT true,
  min_files integer NOT NULL DEFAULT 1,
  requires_comment boolean NOT NULL DEFAULT true,
  instructions text,
  reinforced_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, step_order)
);

ALTER TABLE public.career_step_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view step scenarios"
  ON public.career_step_scenarios FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "HRD can manage step scenarios"
  ON public.career_step_scenarios FOR ALL
  USING (public.has_role(auth.uid(), 'hrd') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin can manage step scenarios"
  ON public.career_step_scenarios FOR ALL
  USING (public.has_role(auth.uid(), 'company_admin') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin can manage all step scenarios"
  ON public.career_step_scenarios FOR ALL
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER trg_step_scenarios_updated
  BEFORE UPDATE ON public.career_step_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Заявки сотрудников на проверку этапа
CREATE TABLE IF NOT EXISTS public.career_step_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  template_id uuid NOT NULL,
  step_order integer NOT NULL,
  user_id uuid NOT NULL,
  company_id uuid,
  attempt_no integer NOT NULL DEFAULT 1,
  is_reinforced boolean NOT NULL DEFAULT false,
  comment text,
  test_attempt_id uuid,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_step_submissions_assignment ON public.career_step_submissions(assignment_id, step_order);
CREATE INDEX IF NOT EXISTS idx_step_submissions_status ON public.career_step_submissions(status, company_id);

ALTER TABLE public.career_step_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own submissions"
  ON public.career_step_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own submissions"
  ON public.career_step_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Manager view team submissions"
  ON public.career_step_submissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.employee_id = career_step_submissions.user_id AND tm.manager_id = auth.uid()
  ));

CREATE POLICY "Manager update team submissions"
  ON public.career_step_submissions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.employee_id = career_step_submissions.user_id AND tm.manager_id = auth.uid()
  ));

CREATE POLICY "HRD manage company submissions"
  ON public.career_step_submissions FOR ALL
  USING (public.has_role(auth.uid(), 'hrd') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin manage submissions"
  ON public.career_step_submissions FOR ALL
  USING (public.has_role(auth.uid(), 'company_admin') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin manage all submissions"
  ON public.career_step_submissions FOR ALL
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER trg_step_submissions_updated
  BEFORE UPDATE ON public.career_step_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Файлы заявок
CREATE TABLE IF NOT EXISTS public.career_step_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.career_step_submissions(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  file_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_files ON public.career_step_submission_files(submission_id);

ALTER TABLE public.career_step_submission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View submission files via submission"
  ON public.career_step_submission_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.career_step_submissions s
    WHERE s.id = submission_id AND (
      s.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.employee_id = s.user_id AND tm.manager_id = auth.uid())
      OR (public.has_role(auth.uid(),'hrd') AND s.company_id = public.get_user_company_id(auth.uid()))
      OR (public.has_role(auth.uid(),'company_admin') AND s.company_id = public.get_user_company_id(auth.uid()))
      OR public.has_role(auth.uid(),'superadmin')
    )
  ));

CREATE POLICY "Owner inserts submission files"
  ON public.career_step_submission_files FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.career_step_submissions s
    WHERE s.id = submission_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Owner deletes submission files"
  ON public.career_step_submission_files FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.career_step_submissions s
    WHERE s.id = submission_id AND s.user_id = auth.uid() AND s.status = 'pending_review'
  ));

-- 5. Storage bucket для файлов сценариев
INSERT INTO storage.buckets (id, name, public)
VALUES ('career-submissions', 'career-submissions', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner upload career submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'career-submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner read career submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'career-submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Manager read team career submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'career-submissions' AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.manager_id = auth.uid()
        AND tm.employee_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "HRD read company career submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'career-submissions' AND public.has_role(auth.uid(),'hrd') AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Owner delete career submissions"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'career-submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 6. Функция: подача заявки на проверку этапа
CREATE OR REPLACE FUNCTION public.submit_career_step(
  _assignment_id uuid,
  _comment text DEFAULT NULL,
  _test_attempt_id uuid DEFAULT NULL,
  _file_urls jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assignment RECORD;
  v_template RECORD;
  v_profile RECORD;
  v_attempt_no integer;
  v_reinforced boolean;
  v_submission_id uuid;
  v_file jsonb;
  v_desc text;
BEGIN
  SELECT * INTO v_assignment FROM public.employee_career_assignments WHERE id = _assignment_id;
  IF v_assignment IS NULL THEN RAISE EXCEPTION 'Назначение не найдено'; END IF;
  IF v_assignment.user_id <> auth.uid() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;

  SELECT * INTO v_template FROM public.career_track_templates WHERE id = v_assignment.template_id;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = auth.uid();

  SELECT COALESCE(MAX(attempt_no),0) + 1 INTO v_attempt_no
  FROM public.career_step_submissions
  WHERE assignment_id = _assignment_id AND step_order = v_assignment.current_step;

  v_reinforced := v_attempt_no > 1;

  INSERT INTO public.career_step_submissions(
    assignment_id, template_id, step_order, user_id, company_id,
    attempt_no, is_reinforced, comment, test_attempt_id, status
  ) VALUES (
    _assignment_id, v_assignment.template_id, v_assignment.current_step, auth.uid(), v_assignment.company_id,
    v_attempt_no, v_reinforced, _comment, _test_attempt_id, 'pending_review'
  ) RETURNING id INTO v_submission_id;

  FOR v_file IN SELECT * FROM jsonb_array_elements(_file_urls) LOOP
    INSERT INTO public.career_step_submission_files(submission_id, file_url, file_name)
    VALUES (v_submission_id, v_file->>'url', v_file->>'name');
  END LOOP;

  v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' отправил материалы по этапу ' ||
            (v_assignment.current_step + 1) || ' трека "' || COALESCE(v_template.title,'') ||
            '" (попытка ' || v_attempt_no || CASE WHEN v_reinforced THEN ', усиленный сценарий' ELSE '' END || ').';

  PERFORM public.notify_career_event(auth.uid(), v_assignment.company_id,
    'Этап на проверке', v_desc, 'career_step_review');

  RETURN v_submission_id;
END;
$$;

-- 7. Функция: проверка/отклонение заявки
CREATE OR REPLACE FUNCTION public.review_career_step(
  _submission_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_assignment RECORD;
  v_is_manager boolean;
  v_is_hrd boolean;
  v_is_admin boolean;
  v_template RECORD;
  v_steps jsonb;
  v_total_steps integer;
  v_profile RECORD;
  v_desc text;
BEGIN
  SELECT * INTO v_sub FROM public.career_step_submissions WHERE id = _submission_id;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'Заявка не найдена'; END IF;
  IF v_sub.status <> 'pending_review' THEN RAISE EXCEPTION 'Заявка уже обработана'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.team_members WHERE employee_id = v_sub.user_id AND manager_id = auth.uid()) INTO v_is_manager;
  v_is_hrd := public.has_role(auth.uid(),'hrd') AND v_sub.company_id = public.get_user_company_id(auth.uid());
  v_is_admin := public.has_role(auth.uid(),'company_admin') AND v_sub.company_id = public.get_user_company_id(auth.uid());

  IF NOT (v_is_manager OR v_is_hrd OR v_is_admin OR public.has_role(auth.uid(),'superadmin')) THEN
    RAISE EXCEPTION 'Нет прав для проверки этапа';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_sub.user_id;
  SELECT * INTO v_template FROM public.career_track_templates WHERE id = v_sub.template_id;
  v_steps := COALESCE(v_template.steps, '[]'::jsonb);
  v_total_steps := jsonb_array_length(v_steps);

  UPDATE public.career_step_submissions
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = CASE WHEN _approve THEN NULL ELSE _reason END
  WHERE id = _submission_id;

  IF _approve THEN
    SELECT * INTO v_assignment FROM public.employee_career_assignments WHERE id = v_sub.assignment_id;

    -- Закрываем цели этапа
    UPDATE public.career_goals
    SET status = 'completed', progress = 100, updated_at = now()
    WHERE assignment_id = v_sub.assignment_id AND step_order = v_sub.step_order;

    -- Награды за этап
    PERFORM public.grant_rewards_for_event(v_sub.user_id, v_sub.company_id,
      'career_step_passed', 'Этап ' || (v_sub.step_order + 1) || ' пройден');

    -- Двигаем шаг
    IF v_sub.step_order + 1 >= v_total_steps THEN
      UPDATE public.employee_career_assignments
      SET status = 'completed', current_step = v_sub.step_order + 1, updated_at = now()
      WHERE id = v_sub.assignment_id;
    ELSE
      UPDATE public.employee_career_assignments
      SET current_step = v_sub.step_order + 1, updated_at = now()
      WHERE id = v_sub.assignment_id;
    END IF;

    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ': этап ' || (v_sub.step_order + 1) ||
              ' трека "' || COALESCE(v_template.title,'') || '" подтверждён.';
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_sub.user_id, v_sub.company_id, '✅ Этап подтверждён', v_desc, 'career_step_passed');
  ELSE
    v_desc := 'Этап ' || (v_sub.step_order + 1) || ' трека "' || COALESCE(v_template.title,'') ||
              '" отклонён. Причина: ' || COALESCE(_reason,'не указана') ||
              '. Будет запущен усиленный сценарий повторного прохождения.';
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_sub.user_id, v_sub.company_id, '⚠️ Этап отклонён', v_desc, 'career_step_failed');

    PERFORM public.notify_career_event(v_sub.user_id, v_sub.company_id,
      'Этап отклонён', COALESCE(v_profile.full_name,'Сотрудник') || ': ' || v_desc, 'career_step_failed');
  END IF;
END;
$$;
