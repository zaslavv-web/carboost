ALTER TABLE public.support_tickets 
ADD COLUMN admin_response TEXT,
ADD COLUMN responded_by UUID,
ADD COLUMN responded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN ai_suggestion TEXT;

-- HRD can update company tickets
CREATE POLICY "HRD can update company tickets"
ON public.support_tickets
FOR UPDATE
USING (has_role(auth.uid(), 'hrd'::app_role) AND company_id = get_user_company_id(auth.uid()));
