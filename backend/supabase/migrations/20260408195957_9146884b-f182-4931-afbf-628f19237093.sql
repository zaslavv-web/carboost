
-- Support tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own tickets" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own tickets" ON public.support_tickets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can view all tickets" ON public.support_tickets FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can update all tickets" ON public.support_tickets FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "HRD can view all tickets" ON public.support_tickets FOR SELECT USING (public.has_role(auth.uid(), 'hrd'));

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assessment scenarios table
CREATE TABLE public.assessment_scenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scenario_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_url TEXT,
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active scenarios" ON public.assessment_scenarios FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "HRD can manage scenarios" ON public.assessment_scenarios FOR ALL USING (public.has_role(auth.uid(), 'hrd'));
CREATE POLICY "Superadmin can manage scenarios" ON public.assessment_scenarios FOR ALL USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_assessment_scenarios_updated_at BEFORE UPDATE ON public.assessment_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
