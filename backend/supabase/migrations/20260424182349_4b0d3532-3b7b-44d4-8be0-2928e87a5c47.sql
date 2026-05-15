-- HR Tasks table
CREATE TABLE public.hr_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'collaboration',
  reward_coins integer NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','completed','rejected','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hr_tasks_company ON public.hr_tasks(company_id, status);
CREATE INDEX idx_hr_tasks_created_by ON public.hr_tasks(created_by);

-- Assignees (many-to-many)
CREATE TABLE public.hr_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.hr_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  individual_status text NOT NULL DEFAULT 'open' CHECK (individual_status IN ('open','in_review','completed','rejected')),
  reward_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_hr_task_assignees_user ON public.hr_task_assignees(user_id);
CREATE INDEX idx_hr_task_assignees_task ON public.hr_task_assignees(task_id);

-- Trigger to update updated_at
CREATE TRIGGER trg_hr_tasks_updated
BEFORE UPDATE ON public.hr_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.hr_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_task_assignees ENABLE ROW LEVEL SECURITY;

-- HR Tasks policies
CREATE POLICY "HRD manage company hr_tasks" ON public.hr_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'hrd'::app_role) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'hrd'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company admin manage company hr_tasks" ON public.hr_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin manage all hr_tasks" ON public.hr_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Author can view own hr_tasks" ON public.hr_tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Assignees can view their hr_tasks" ON public.hr_tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hr_task_assignees a
    WHERE a.task_id = hr_tasks.id AND a.user_id = auth.uid()
  ));

-- Assignees policies
CREATE POLICY "HRD manage company hr_task_assignees" ON public.hr_task_assignees
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_tasks t WHERE t.id = hr_task_assignees.task_id
    AND has_role(auth.uid(), 'hrd'::app_role) AND t.company_id = get_user_company_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_tasks t WHERE t.id = hr_task_assignees.task_id
    AND has_role(auth.uid(), 'hrd'::app_role) AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Company admin manage hr_task_assignees" ON public.hr_task_assignees
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_tasks t WHERE t.id = hr_task_assignees.task_id
    AND has_role(auth.uid(), 'company_admin'::app_role) AND t.company_id = get_user_company_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_tasks t WHERE t.id = hr_task_assignees.task_id
    AND has_role(auth.uid(), 'company_admin'::app_role) AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Superadmin manage all hr_task_assignees" ON public.hr_task_assignees
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Assignee view own assignment" ON public.hr_task_assignees
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Assignee can mark own as in_review" ON public.hr_task_assignees
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND individual_status IN ('open','in_review'));

CREATE POLICY "Author view assignees" ON public.hr_task_assignees
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_tasks t WHERE t.id = hr_task_assignees.task_id AND t.created_by = auth.uid()));

-- Auto-payout function: when hr_task moves to 'completed', pay all assignees
CREATE OR REPLACE FUNCTION public.payout_hr_task_rewards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.reward_coins > 0 THEN
    FOR rec IN
      SELECT id, user_id FROM public.hr_task_assignees
      WHERE task_id = NEW.id AND reward_paid = false
    LOOP
      INSERT INTO public.currency_transactions(user_id, company_id, kind, amount, reference_id, description, created_by)
      VALUES (rec.user_id, NEW.company_id, 'hr_task_reward', NEW.reward_coins, NEW.id,
              'Награда за HR-задачу: ' || NEW.title, NEW.reviewed_by);

      INSERT INTO public.currency_balances(user_id, company_id, balance)
      VALUES (rec.user_id, NEW.company_id, NEW.reward_coins)
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET balance = currency_balances.balance + NEW.reward_coins, updated_at = now();

      UPDATE public.hr_task_assignees
      SET reward_paid = true, individual_status = 'completed'
      WHERE id = rec.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure currency_balances has the unique constraint we rely on
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'currency_balances_user_company_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.currency_balances
        ADD CONSTRAINT currency_balances_user_company_unique UNIQUE (user_id, company_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

CREATE TRIGGER trg_hr_task_payout
AFTER UPDATE ON public.hr_tasks
FOR EACH ROW EXECUTE FUNCTION public.payout_hr_task_rewards();