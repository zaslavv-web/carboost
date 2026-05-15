-- ============================================
-- Peer recognitions (благодарности коллег)
-- ============================================
CREATE TABLE IF NOT EXISTS public.peer_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'thanks',
  message TEXT NOT NULL,
  coin_reward INTEGER NOT NULL DEFAULT 0 CHECK (coin_reward >= 0 AND coin_reward <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_peer_recognitions_company ON public.peer_recognitions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_recognitions_to ON public.peer_recognitions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_peer_recognitions_from ON public.peer_recognitions(from_user_id);

ALTER TABLE public.peer_recognitions ENABLE ROW LEVEL SECURITY;

-- View: any authenticated user in same company
CREATE POLICY "Members of same company can view recognitions"
ON public.peer_recognitions FOR SELECT
TO authenticated
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- Insert: must be from current user, recipient must be in same company, cannot self-thank
CREATE POLICY "Users can create recognitions for colleagues"
ON public.peer_recognitions FOR INSERT
TO authenticated
WITH CHECK (
  from_user_id = auth.uid()
  AND from_user_id <> to_user_id
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = to_user_id LIMIT 1)
);

-- Delete: author, HRD/admin, superadmin
CREATE POLICY "Author or admins can delete recognition"
ON public.peer_recognitions FOR DELETE
TO authenticated
USING (
  from_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'hrd')
  OR public.has_role(auth.uid(), 'company_admin')
  OR public.has_role(auth.uid(), 'superadmin')
);

-- ============================================
-- Reactions (likes) on recognitions
-- ============================================
CREATE TABLE IF NOT EXISTS public.peer_recognition_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id UUID NOT NULL REFERENCES public.peer_recognitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recognition_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_recognition_reactions_rec ON public.peer_recognition_reactions(recognition_id);

ALTER TABLE public.peer_recognition_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions in same company"
ON public.peer_recognition_reactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.peer_recognitions pr
    WHERE pr.id = recognition_id
      AND pr.company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "User can react"
ON public.peer_recognition_reactions FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.peer_recognitions pr
    WHERE pr.id = recognition_id
      AND pr.company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "User can remove own reaction"
ON public.peer_recognition_reactions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- Trigger: pay out recognition coins automatically
-- ============================================
CREATE OR REPLACE FUNCTION public.payout_peer_recognition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_balance INTEGER;
BEGIN
  IF NEW.coin_reward IS NULL OR NEW.coin_reward = 0 THEN
    RETURN NEW;
  END IF;

  SELECT balance INTO sender_balance
  FROM public.currency_balances
  WHERE user_id = NEW.from_user_id
  LIMIT 1;

  IF sender_balance IS NULL OR sender_balance < NEW.coin_reward THEN
    RAISE EXCEPTION 'Недостаточно средств для перевода (баланс: %, требуется: %)', COALESCE(sender_balance, 0), NEW.coin_reward;
  END IF;

  UPDATE public.currency_balances
  SET balance = balance - NEW.coin_reward,
      updated_at = now()
  WHERE user_id = NEW.from_user_id;

  INSERT INTO public.currency_balances (user_id, balance, total_earned)
  VALUES (NEW.to_user_id, NEW.coin_reward, NEW.coin_reward)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.currency_balances.balance + NEW.coin_reward,
      total_earned = public.currency_balances.total_earned + NEW.coin_reward,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payout_peer_recognition ON public.peer_recognitions;
CREATE TRIGGER trg_payout_peer_recognition
AFTER INSERT ON public.peer_recognitions
FOR EACH ROW
EXECUTE FUNCTION public.payout_peer_recognition();

-- ============================================
-- Employee risk scores (predictive analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS public.employee_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  company_id UUID NOT NULL,
  attrition_risk INTEGER NOT NULL DEFAULT 0 CHECK (attrition_risk BETWEEN 0 AND 100),
  burnout_risk INTEGER NOT NULL DEFAULT 0 CHECK (burnout_risk BETWEEN 0 AND 100),
  engagement_score INTEGER NOT NULL DEFAULT 50 CHECK (engagement_score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_company ON public.employee_risk_scores(company_id, risk_level);

ALTER TABLE public.employee_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HRD/admin/superadmin can view risk in company"
ON public.employee_risk_scores FOR SELECT
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'hrd')
    OR public.has_role(auth.uid(), 'company_admin')
  )
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  OR public.has_role(auth.uid(), 'superadmin')
);

CREATE POLICY "HRD/admin can upsert risk in company"
ON public.employee_risk_scores FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'hrd') OR public.has_role(auth.uid(), 'company_admin'))
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "HRD/admin can update risk in company"
ON public.employee_risk_scores FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'hrd') OR public.has_role(auth.uid(), 'company_admin'))
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

CREATE TRIGGER update_employee_risk_scores_updated_at
BEFORE UPDATE ON public.employee_risk_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();