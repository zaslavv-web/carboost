CREATE TABLE public.demo_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  headcount INTEGER,
  source TEXT NOT NULL DEFAULT 'landing',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a demo request"
ON public.demo_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Superadmins view demo requests"
ON public.demo_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins update demo requests"
ON public.demo_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER demo_requests_updated_at
BEFORE UPDATE ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_demo_requests_status ON public.demo_requests(status, created_at DESC);