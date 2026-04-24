-- 1) user_roles SELECT — только authenticated
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) notifications INSERT — только authenticated
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3) employee_invitations — добавляем колонку с хешем токена + триггер
ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS token_hash text;

-- Заполняем хеши для существующих токенов (для обратной совместимости)
UPDATE public.employee_invitations
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hash_invitation_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.token IS NOT NULL THEN
    NEW.token_hash := encode(digest(NEW.token, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_invitation_token ON public.employee_invitations;
CREATE TRIGGER trg_hash_invitation_token
BEFORE INSERT OR UPDATE OF token ON public.employee_invitations
FOR EACH ROW EXECUTE FUNCTION public.hash_invitation_token();

CREATE INDEX IF NOT EXISTS idx_employee_invitations_token_hash
  ON public.employee_invitations(token_hash);