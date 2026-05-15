
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(manager_id, employee_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view own team" ON public.team_members FOR SELECT USING (auth.uid() = manager_id);
CREATE POLICY "Managers can manage own team" ON public.team_members FOR ALL USING (auth.uid() = manager_id);
CREATE POLICY "HRD can view all teams" ON public.team_members FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "HRD can manage all teams" ON public.team_members FOR ALL USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "Superadmin can view all teams" ON public.team_members FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can manage all teams" ON public.team_members FOR ALL USING (public.has_role(auth.uid(), 'superadmin'));
