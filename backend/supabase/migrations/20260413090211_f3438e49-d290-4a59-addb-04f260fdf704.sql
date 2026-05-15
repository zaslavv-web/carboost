
-- Виды наград для геймификации
CREATE TABLE public.gamification_reward_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'achievement', -- tenure, achievement, brand_promotion, custom
  icon TEXT DEFAULT 'award',
  points INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gamification_reward_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view company reward types" ON public.gamification_reward_types
  FOR SELECT TO authenticated USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company reward types" ON public.gamification_reward_types
  FOR ALL USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage reward types" ON public.gamification_reward_types
  FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin can manage all reward types" ON public.gamification_reward_types
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_gamification_reward_types_updated_at
  BEFORE UPDATE ON public.gamification_reward_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Выданные награды сотрудникам
CREATE TABLE public.employee_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reward_type_id UUID NOT NULL REFERENCES public.gamification_reward_types(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_by UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rewards" ON public.employee_rewards
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HRD can manage company rewards" ON public.employee_rewards
  FOR ALL USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage rewards" ON public.employee_rewards
  FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin can manage all rewards" ON public.employee_rewards
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

-- Эталонные карьерные треки
CREATE TABLE public.career_track_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  from_position_id UUID REFERENCES public.positions(id) ON DELETE CASCADE,
  to_position_id UUID REFERENCES public.positions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  motivation_text TEXT, -- мотивация для сотрудника
  estimated_months INTEGER,
  steps JSONB NOT NULL DEFAULT '[]', -- массив шагов [{order, title, description, duration_months}]
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.career_track_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view company templates" ON public.career_track_templates
  FOR SELECT TO authenticated USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "HRD can manage company templates" ON public.career_track_templates
  FOR ALL USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage templates" ON public.career_track_templates
  FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin can manage all templates" ON public.career_track_templates
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_career_track_templates_updated_at
  BEFORE UPDATE ON public.career_track_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Действия для перехода на следующий уровень
CREATE TABLE public.career_level_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.career_track_templates(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  action_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  category TEXT DEFAULT 'skill', -- skill, training, certification, experience
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.career_level_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view actions via template" ON public.career_level_actions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.career_track_templates t WHERE t.id = template_id AND t.company_id = get_user_company_id(auth.uid()))
  );
CREATE POLICY "HRD can manage actions" ON public.career_level_actions
  FOR ALL USING (
    has_role(auth.uid(), 'hrd') AND EXISTS (SELECT 1 FROM public.career_track_templates t WHERE t.id = template_id AND t.company_id = get_user_company_id(auth.uid()))
  );
CREATE POLICY "Company admin can manage actions" ON public.career_level_actions
  FOR ALL USING (
    has_role(auth.uid(), 'company_admin') AND EXISTS (SELECT 1 FROM public.career_track_templates t WHERE t.id = template_id AND t.company_id = get_user_company_id(auth.uid()))
  );
CREATE POLICY "Superadmin can manage all actions" ON public.career_level_actions
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

-- Мотивация сотрудника (привязка к эталонному треку)
CREATE TABLE public.employee_career_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.career_track_templates(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  personal_motivation TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_id)
);

ALTER TABLE public.employee_career_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments" ON public.employee_career_assignments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own assignments" ON public.employee_career_assignments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "HRD can manage company assignments" ON public.employee_career_assignments
  FOR ALL USING (has_role(auth.uid(), 'hrd') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Company admin can manage assignments" ON public.employee_career_assignments
  FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin can manage all assignments" ON public.employee_career_assignments
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_employee_career_assignments_updated_at
  BEFORE UPDATE ON public.employee_career_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
