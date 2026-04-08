
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('employee', 'manager', 'hrd');

-- Create user_roles table FIRST
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HRD can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "HRD can manage roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "HRD can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "HRD can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'hrd'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  avatar_url TEXT,
  hire_date DATE,
  overall_score INTEGER DEFAULT 0,
  role_readiness INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "HRD can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));

-- Competencies
CREATE TABLE public.competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  skill_value INTEGER NOT NULL DEFAULT 0 CHECK (skill_value >= 0 AND skill_value <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own competencies" ON public.competencies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own competencies" ON public.competencies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "HRD can view all competencies" ON public.competencies FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));

-- Achievements
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  achievement_date DATE,
  icon TEXT DEFAULT 'award',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own achievements" ON public.achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own achievements" ON public.achievements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "HRD can view all achievements" ON public.achievements FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));

-- Assessments
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'ai',
  score INTEGER DEFAULT 0,
  change_value TEXT,
  assessment_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assessments" ON public.assessments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own assessments" ON public.assessments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "HRD can view all assessments" ON public.assessments FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));

-- Career goals
CREATE TABLE public.career_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('completed', 'in_progress', 'at_risk')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.career_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own goals" ON public.career_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own goals" ON public.career_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "HRD can view all goals" ON public.career_goals FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "HRD can manage all goals" ON public.career_goals FOR ALL USING (public.has_role(auth.uid(), 'hrd'));

-- Goal checklist items
CREATE TABLE public.goal_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES public.career_goals(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goal_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own checklist" ON public.goal_checklist_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.career_goals WHERE id = goal_id AND user_id = auth.uid())
);
CREATE POLICY "Users can manage own checklist" ON public.goal_checklist_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.career_goals WHERE id = goal_id AND user_id = auth.uid())
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  notification_type TEXT NOT NULL DEFAULT 'info' CHECK (notification_type IN ('info', 'success', 'warning', 'achievement')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_competencies_updated_at BEFORE UPDATE ON public.competencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_career_goals_updated_at BEFORE UPDATE ON public.career_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
