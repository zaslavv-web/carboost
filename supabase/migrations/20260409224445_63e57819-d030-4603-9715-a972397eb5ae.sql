
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add company_id to all tables
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.departments ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.positions ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.assessments ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.competencies ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.achievements ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.career_goals ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.hr_documents ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.assessment_scenarios ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.notifications ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.support_tickets ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.team_members ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.position_career_paths ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.goal_checklist_items ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 3. Create helper function
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 4. Companies RLS
CREATE POLICY "Superadmin can manage all companies"
  ON public.companies FOR ALL
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Authenticated can view own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (id = get_user_company_id(auth.uid()));

-- 5. Profiles policies
DROP POLICY IF EXISTS "HRD can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Superadmin can view all profiles"
  ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can update all profiles"
  ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Company admin can view company profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can update company profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can view company profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Departments policies
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
DROP POLICY IF EXISTS "HRD can manage departments" ON public.departments;
DROP POLICY IF EXISTS "Superadmin can manage departments" ON public.departments;

CREATE POLICY "Superadmin can manage departments"
  ON public.departments FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Company users can view own company departments"
  ON public.departments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company departments"
  ON public.departments FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage company departments"
  ON public.departments FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));

-- 7. Positions policies
DROP POLICY IF EXISTS "Authenticated can view positions" ON public.positions;
DROP POLICY IF EXISTS "HRD can manage positions" ON public.positions;
DROP POLICY IF EXISTS "Superadmin can manage positions" ON public.positions;

CREATE POLICY "Superadmin can manage positions"
  ON public.positions FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Company users can view own company positions"
  ON public.positions FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company positions"
  ON public.positions FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage company positions"
  ON public.positions FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));

-- 8. Assessments policies
DROP POLICY IF EXISTS "HRD can view all assessments" ON public.assessments;
DROP POLICY IF EXISTS "Superadmin can view all assessments" ON public.assessments;
DROP POLICY IF EXISTS "Users can create own assessments" ON public.assessments;
DROP POLICY IF EXISTS "Users can view own assessments" ON public.assessments;

CREATE POLICY "Superadmin can view all assessments"
  ON public.assessments FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view company assessments"
  ON public.assessments FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own assessments"
  ON public.assessments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own assessments"
  ON public.assessments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Competencies policies
DROP POLICY IF EXISTS "HRD can view all competencies" ON public.competencies;
DROP POLICY IF EXISTS "Superadmin can view all competencies" ON public.competencies;
DROP POLICY IF EXISTS "Users can manage own competencies" ON public.competencies;
DROP POLICY IF EXISTS "Users can view own competencies" ON public.competencies;

CREATE POLICY "Superadmin can view all competencies"
  ON public.competencies FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view company competencies"
  ON public.competencies FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own competencies"
  ON public.competencies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own competencies"
  ON public.competencies FOR ALL USING (auth.uid() = user_id);

-- 10. Achievements policies
DROP POLICY IF EXISTS "HRD can view all achievements" ON public.achievements;
DROP POLICY IF EXISTS "Superadmin can view all achievements" ON public.achievements;
DROP POLICY IF EXISTS "Users can manage own achievements" ON public.achievements;
DROP POLICY IF EXISTS "Users can view own achievements" ON public.achievements;

CREATE POLICY "Superadmin can view all achievements"
  ON public.achievements FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view company achievements"
  ON public.achievements FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own achievements"
  ON public.achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own achievements"
  ON public.achievements FOR ALL USING (auth.uid() = user_id);

-- 11. Career goals policies
DROP POLICY IF EXISTS "HRD can manage all goals" ON public.career_goals;
DROP POLICY IF EXISTS "HRD can view all goals" ON public.career_goals;
DROP POLICY IF EXISTS "Superadmin can view all goals" ON public.career_goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON public.career_goals;
DROP POLICY IF EXISTS "Users can view own goals" ON public.career_goals;

CREATE POLICY "Superadmin can view all goals"
  ON public.career_goals FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view company goals"
  ON public.career_goals FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company goals"
  ON public.career_goals FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own goals"
  ON public.career_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own goals"
  ON public.career_goals FOR ALL USING (auth.uid() = user_id);

-- 12. HR documents policies
DROP POLICY IF EXISTS "HRD can manage hr_documents" ON public.hr_documents;
DROP POLICY IF EXISTS "Superadmin can manage hr_documents" ON public.hr_documents;

CREATE POLICY "Superadmin can manage hr_documents"
  ON public.hr_documents FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can manage company hr_documents"
  ON public.hr_documents FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage company hr_documents"
  ON public.hr_documents FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));

-- 13. Assessment scenarios policies
DROP POLICY IF EXISTS "Authenticated can read active scenarios" ON public.assessment_scenarios;
DROP POLICY IF EXISTS "HRD can manage scenarios" ON public.assessment_scenarios;
DROP POLICY IF EXISTS "Superadmin can manage scenarios" ON public.assessment_scenarios;

CREATE POLICY "Superadmin can manage scenarios"
  ON public.assessment_scenarios FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Company users can view active company scenarios"
  ON public.assessment_scenarios FOR SELECT TO authenticated
  USING (is_active = true AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company scenarios"
  ON public.assessment_scenarios FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));

-- 14. Team members policies
DROP POLICY IF EXISTS "HRD can manage all teams" ON public.team_members;
DROP POLICY IF EXISTS "HRD can view all teams" ON public.team_members;
DROP POLICY IF EXISTS "Managers can manage own team" ON public.team_members;
DROP POLICY IF EXISTS "Managers can view own team" ON public.team_members;
DROP POLICY IF EXISTS "Superadmin can manage all teams" ON public.team_members;
DROP POLICY IF EXISTS "Superadmin can view all teams" ON public.team_members;

CREATE POLICY "Superadmin can manage all teams"
  ON public.team_members FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can manage company teams"
  ON public.team_members FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Managers can manage own team"
  ON public.team_members FOR ALL USING (auth.uid() = manager_id);
CREATE POLICY "Managers can view own team"
  ON public.team_members FOR SELECT USING (auth.uid() = manager_id);

-- 15. Position career paths policies
DROP POLICY IF EXISTS "Authenticated can view career paths" ON public.position_career_paths;
DROP POLICY IF EXISTS "HRD can manage career paths" ON public.position_career_paths;
DROP POLICY IF EXISTS "Superadmin can manage career paths" ON public.position_career_paths;

CREATE POLICY "Superadmin can manage career paths"
  ON public.position_career_paths FOR ALL USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Company users can view company career paths"
  ON public.position_career_paths FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company career paths"
  ON public.position_career_paths FOR ALL
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));

-- 16. Notifications policies (user-scoped, no change needed for company)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 17. Support tickets policies
DROP POLICY IF EXISTS "HRD can view all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Superadmin can update all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Superadmin can view all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can create own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can update own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;

CREATE POLICY "Superadmin can view all tickets"
  ON public.support_tickets FOR SELECT USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can update all tickets"
  ON public.support_tickets FOR UPDATE USING (has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view company tickets"
  ON public.support_tickets FOR SELECT
  USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Users can view own tickets"
  ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own tickets"
  ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tickets"
  ON public.support_tickets FOR UPDATE USING (auth.uid() = user_id);

-- 18. Update functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, is_verified, requested_role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false,
    COALESCE(NEW.raw_user_meta_data->>'requested_role', 'employee'),
    (NEW.raw_user_meta_data->>'company_id')::uuid
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_role(_target_user_id uuid, _new_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'hrd')
    OR public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'company_admin')
  ) THEN
    RAISE EXCEPTION 'Only HRD, Company Admin or Superadmin can assign roles';
  END IF;
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only assign roles within their company';
    END IF;
    IF _new_role = 'superadmin' THEN
      RAISE EXCEPTION 'Company Admin cannot assign superadmin role';
    END IF;
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_user(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'company_admin')) THEN
    RAISE EXCEPTION 'Only Superadmin or Company Admin can verify users';
  END IF;
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only verify users within their company';
    END IF;
  END IF;
  UPDATE public.profiles SET is_verified = true WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, (SELECT requested_role FROM public.profiles WHERE user_id = _target_user_id)::app_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_user(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'company_admin')) THEN
    RAISE EXCEPTION 'Only Superadmin or Company Admin can reject users';
  END IF;
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only reject users within their company';
    END IF;
  END IF;
  DELETE FROM public.profiles WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
END;
$$;

-- 19. Indexes
CREATE INDEX idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX idx_departments_company_id ON public.departments(company_id);
CREATE INDEX idx_positions_company_id ON public.positions(company_id);
CREATE INDEX idx_assessments_company_id ON public.assessments(company_id);
CREATE INDEX idx_competencies_company_id ON public.competencies(company_id);
CREATE INDEX idx_achievements_company_id ON public.achievements(company_id);
CREATE INDEX idx_career_goals_company_id ON public.career_goals(company_id);
CREATE INDEX idx_hr_documents_company_id ON public.hr_documents(company_id);
CREATE INDEX idx_assessment_scenarios_company_id ON public.assessment_scenarios(company_id);
CREATE INDEX idx_team_members_company_id ON public.team_members(company_id);
