
-- =========================================================
-- TRACKER MODULE — OKR + tasks + 1:1
-- =========================================================

-- ENUMS
CREATE TYPE public.tracker_goal_status AS ENUM ('draft','published','needs_review','archived');
CREATE TYPE public.tracker_task_status AS ENUM ('draft','published','awaiting_checkin','done','orphan','needs_attention','archived');
CREATE TYPE public.tracker_task_urgency AS ENUM ('critical','high','medium','low');
CREATE TYPE public.tracker_meeting_status AS ENUM ('planned','done','cancelled');
CREATE TYPE public.tracker_period_kind AS ENUM ('quarter','half_year','year','custom');

-- Helper: is current user a manager of given employee?
CREATE OR REPLACE FUNCTION public.tracker_is_manager_of(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE manager_id = auth.uid() AND employee_id = _employee_id
  );
$$;

-- Helper: get current user's company_id from profiles
CREATE OR REPLACE FUNCTION public.tracker_current_company()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Generic updated_at trigger (reuse if already exists is fine — CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.tracker_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================================
-- 1) OKR PERIODS
-- =========================================================
CREATE TABLE public.tracker_okr_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.tracker_period_kind NOT NULL DEFAULT 'quarter',
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_okr_periods TO authenticated;
GRANT ALL ON public.tracker_okr_periods TO service_role;
ALTER TABLE public.tracker_okr_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_periods_select" ON public.tracker_okr_periods FOR SELECT TO authenticated
  USING (company_id = public.tracker_current_company() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY "tracker_periods_admin_write" ON public.tracker_okr_periods FOR ALL TO authenticated
  USING (
    (company_id = public.tracker_current_company() AND (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  )
  WITH CHECK (
    (company_id = public.tracker_current_company() AND (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE TRIGGER trg_tracker_periods_updated BEFORE UPDATE ON public.tracker_okr_periods
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- =========================================================
-- 2) GOALS (OKR)
-- =========================================================
CREATE TABLE public.tracker_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.tracker_okr_periods(id) ON DELETE SET NULL,
  holder_id uuid NOT NULL,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  parent_goal_id uuid REFERENCES public.tracker_goals(id) ON DELETE SET NULL,
  team_id uuid,
  title text NOT NULL,
  description text,
  status public.tracker_goal_status NOT NULL DEFAULT 'draft',
  progress numeric(5,2) NOT NULL DEFAULT 0,
  needs_review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  archived_at timestamptz
);
CREATE INDEX idx_tracker_goals_holder ON public.tracker_goals(holder_id);
CREATE INDEX idx_tracker_goals_company ON public.tracker_goals(company_id);
CREATE INDEX idx_tracker_goals_status ON public.tracker_goals(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_goals TO authenticated;
GRANT ALL ON public.tracker_goals TO service_role;
ALTER TABLE public.tracker_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracker_goals_select" ON public.tracker_goals FOR SELECT TO authenticated
  USING (
    holder_id = auth.uid()
    OR author_id = auth.uid()
    OR public.tracker_is_manager_of(holder_id)
    OR (company_id = public.tracker_current_company() AND (
          public.has_role(auth.uid(),'hrd')
          OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  );

CREATE POLICY "tracker_goals_insert" ON public.tracker_goals FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.tracker_current_company()
    AND (
      holder_id = auth.uid()
      OR public.tracker_is_manager_of(holder_id)
      OR public.has_role(auth.uid(),'hrd')
      OR public.has_role(auth.uid(),'company_admin')
      OR public.has_role(auth.uid(),'superadmin')
    )
  );

CREATE POLICY "tracker_goals_update" ON public.tracker_goals FOR UPDATE TO authenticated
  USING (
    holder_id = auth.uid()
    OR author_id = auth.uid()
    OR public.tracker_is_manager_of(holder_id)
    OR public.has_role(auth.uid(),'company_admin')
    OR public.has_role(auth.uid(),'superadmin')
  );

CREATE POLICY "tracker_goals_delete" ON public.tracker_goals FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(),'company_admin')
    OR public.has_role(auth.uid(),'superadmin')
  );

CREATE TRIGGER trg_tracker_goals_updated BEFORE UPDATE ON public.tracker_goals
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- =========================================================
-- 3) KEY RESULTS
-- =========================================================
CREATE TABLE public.tracker_key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.tracker_goals(id) ON DELETE CASCADE,
  title text NOT NULL,
  unit text DEFAULT '%',
  weight numeric(5,2) NOT NULL DEFAULT 1,
  start_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  target_value numeric NOT NULL DEFAULT 100,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_kr_goal ON public.tracker_key_results(goal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_key_results TO authenticated;
GRANT ALL ON public.tracker_key_results TO service_role;
ALTER TABLE public.tracker_key_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracker_kr_select" ON public.tracker_key_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_goals g WHERE g.id = goal_id));
CREATE POLICY "tracker_kr_write" ON public.tracker_key_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_goals g WHERE g.id = goal_id
    AND (g.holder_id = auth.uid() OR g.author_id = auth.uid()
         OR public.tracker_is_manager_of(g.holder_id)
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_goals g WHERE g.id = goal_id
    AND (g.holder_id = auth.uid() OR g.author_id = auth.uid()
         OR public.tracker_is_manager_of(g.holder_id)
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))));
CREATE TRIGGER trg_tracker_kr_updated BEFORE UPDATE ON public.tracker_key_results
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- Recompute goal progress when KR changes
CREATE OR REPLACE FUNCTION public.tracker_recalc_goal_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _goal uuid; _progress numeric;
BEGIN
  _goal := COALESCE(NEW.goal_id, OLD.goal_id);
  SELECT COALESCE(SUM(
    LEAST(100, GREATEST(0,
      CASE WHEN target_value = start_value THEN 0
      ELSE ((current_value - start_value) / (target_value - start_value)) * 100 END
    )) * weight) / NULLIF(SUM(weight),0), 0)
  INTO _progress FROM public.tracker_key_results WHERE goal_id = _goal;
  UPDATE public.tracker_goals SET progress = COALESCE(_progress,0), updated_at = now() WHERE id = _goal;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_tracker_kr_recalc AFTER INSERT OR UPDATE OR DELETE ON public.tracker_key_results
  FOR EACH ROW EXECUTE FUNCTION public.tracker_recalc_goal_progress();

-- =========================================================
-- 4) TASKS
-- =========================================================
CREATE TABLE public.tracker_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  assignee_id uuid NOT NULL,
  parent_task_id uuid REFERENCES public.tracker_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.tracker_task_status NOT NULL DEFAULT 'draft',
  urgency public.tracker_task_urgency NOT NULL DEFAULT 'medium',
  due_at timestamptz,
  jira_key text,
  completed_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_tasks_assignee ON public.tracker_tasks(assignee_id);
CREATE INDEX idx_tracker_tasks_author ON public.tracker_tasks(author_id);
CREATE INDEX idx_tracker_tasks_company_status ON public.tracker_tasks(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_tasks TO authenticated;
GRANT ALL ON public.tracker_tasks TO service_role;
ALTER TABLE public.tracker_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracker_tasks_select" ON public.tracker_tasks FOR SELECT TO authenticated
  USING (
    assignee_id = auth.uid()
    OR author_id = auth.uid()
    OR public.tracker_is_manager_of(assignee_id)
    OR (company_id = public.tracker_current_company() AND (
          public.has_role(auth.uid(),'hrd')
          OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE POLICY "tracker_tasks_insert" ON public.tracker_tasks FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.tracker_current_company()
    AND (
      assignee_id = auth.uid()
      OR public.tracker_is_manager_of(assignee_id)
      OR public.has_role(auth.uid(),'hrd')
      OR public.has_role(auth.uid(),'company_admin')
      OR public.has_role(auth.uid(),'superadmin')
    )
  );
CREATE POLICY "tracker_tasks_update" ON public.tracker_tasks FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR author_id = auth.uid()
    OR public.tracker_is_manager_of(assignee_id)
    OR public.has_role(auth.uid(),'company_admin')
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE POLICY "tracker_tasks_delete" ON public.tracker_tasks FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(),'company_admin')
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE TRIGGER trg_tracker_tasks_updated BEFORE UPDATE ON public.tracker_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- =========================================================
-- 5) TASK <-> GOAL LINKS
-- =========================================================
CREATE TABLE public.tracker_task_goal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tracker_tasks(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.tracker_goals(id) ON DELETE CASCADE,
  key_result_id uuid REFERENCES public.tracker_key_results(id) ON DELETE SET NULL,
  impact_weight numeric(5,2) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE (task_id, goal_id)
);
CREATE INDEX idx_tracker_tgl_task ON public.tracker_task_goal_links(task_id);
CREATE INDEX idx_tracker_tgl_goal ON public.tracker_task_goal_links(goal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_task_goal_links TO authenticated;
GRANT ALL ON public.tracker_task_goal_links TO service_role;
ALTER TABLE public.tracker_task_goal_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_tgl_select" ON public.tracker_task_goal_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_tasks t WHERE t.id = task_id));
CREATE POLICY "tracker_tgl_write" ON public.tracker_task_goal_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_tasks t WHERE t.id = task_id
    AND (t.assignee_id = auth.uid() OR t.author_id = auth.uid()
         OR public.tracker_is_manager_of(t.assignee_id)
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_tasks t WHERE t.id = task_id
    AND (t.assignee_id = auth.uid() OR t.author_id = auth.uid()
         OR public.tracker_is_manager_of(t.assignee_id)
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))));

-- =========================================================
-- 6) TASK CHECK-INS
-- =========================================================
CREATE TABLE public.tracker_task_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tracker_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  note text,
  status_to public.tracker_task_status,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_checkins_task ON public.tracker_task_checkins(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_task_checkins TO authenticated;
GRANT ALL ON public.tracker_task_checkins TO service_role;
ALTER TABLE public.tracker_task_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_checkins_select" ON public.tracker_task_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_tasks t WHERE t.id = task_id));
CREATE POLICY "tracker_checkins_insert" ON public.tracker_task_checkins FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_tasks t WHERE t.id = task_id
    AND (t.assignee_id = auth.uid() OR t.author_id = auth.uid()
         OR public.tracker_is_manager_of(t.assignee_id))));

-- =========================================================
-- 7) 1:1 MEETINGS
-- =========================================================
CREATE TABLE public.tracker_one_on_ones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  status public.tracker_meeting_status NOT NULL DEFAULT 'planned',
  notes text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_1on1_mgr ON public.tracker_one_on_ones(manager_id);
CREATE INDEX idx_tracker_1on1_emp ON public.tracker_one_on_ones(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_one_on_ones TO authenticated;
GRANT ALL ON public.tracker_one_on_ones TO service_role;
ALTER TABLE public.tracker_one_on_ones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_1on1_select" ON public.tracker_one_on_ones FOR SELECT TO authenticated
  USING (
    manager_id = auth.uid() OR employee_id = auth.uid()
    OR (company_id = public.tracker_current_company() AND (
          public.has_role(auth.uid(),'hrd')
          OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE POLICY "tracker_1on1_write" ON public.tracker_one_on_ones FOR ALL TO authenticated
  USING (
    manager_id = auth.uid()
    OR public.has_role(auth.uid(),'company_admin')
    OR public.has_role(auth.uid(),'superadmin')
  )
  WITH CHECK (
    company_id = public.tracker_current_company()
    AND (manager_id = auth.uid()
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))
  );
CREATE TRIGGER trg_tracker_1on1_updated BEFORE UPDATE ON public.tracker_one_on_ones
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- =========================================================
-- 8) 1:1 AGENDA
-- =========================================================
CREATE TABLE public.tracker_one_on_one_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.tracker_one_on_ones(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  position int NOT NULL DEFAULT 0,
  linked_task_id uuid REFERENCES public.tracker_tasks(id) ON DELETE SET NULL,
  linked_goal_id uuid REFERENCES public.tracker_goals(id) ON DELETE SET NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_agenda_meeting ON public.tracker_one_on_one_agenda(meeting_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_one_on_one_agenda TO authenticated;
GRANT ALL ON public.tracker_one_on_one_agenda TO service_role;
ALTER TABLE public.tracker_one_on_one_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_agenda_select" ON public.tracker_one_on_one_agenda FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_one_on_ones m WHERE m.id = meeting_id));
CREATE POLICY "tracker_agenda_write" ON public.tracker_one_on_one_agenda FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracker_one_on_ones m WHERE m.id = meeting_id
    AND (m.manager_id = auth.uid() OR m.employee_id = auth.uid()
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_one_on_ones m WHERE m.id = meeting_id
    AND (m.manager_id = auth.uid() OR m.employee_id = auth.uid()
         OR public.has_role(auth.uid(),'company_admin')
         OR public.has_role(auth.uid(),'superadmin'))));
CREATE TRIGGER trg_tracker_agenda_updated BEFORE UPDATE ON public.tracker_one_on_one_agenda
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();

-- =========================================================
-- 9) AUDIT LOG
-- =========================================================
CREATE TABLE public.tracker_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  status_from text,
  status_to text,
  actor_id uuid DEFAULT auth.uid(),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracker_audit_entity ON public.tracker_audit_log(entity_type, entity_id);
GRANT SELECT, INSERT ON public.tracker_audit_log TO authenticated;
GRANT ALL ON public.tracker_audit_log TO service_role;
ALTER TABLE public.tracker_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_audit_select" ON public.tracker_audit_log FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR (company_id = public.tracker_current_company()
        AND (public.has_role(auth.uid(),'hrd')
             OR public.has_role(auth.uid(),'company_admin')))
    OR public.has_role(auth.uid(),'superadmin')
  );
CREATE POLICY "tracker_audit_insert" ON public.tracker_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Status-change audit triggers for goals & tasks
CREATE OR REPLACE FUNCTION public.tracker_log_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.tracker_audit_log(company_id, entity_type, entity_id, action, status_from, status_to, actor_id)
    VALUES (NEW.company_id, TG_ARGV[0], NEW.id, 'status_change', OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tracker_goals_audit AFTER UPDATE ON public.tracker_goals
  FOR EACH ROW EXECUTE FUNCTION public.tracker_log_status_change('goal');
CREATE TRIGGER trg_tracker_tasks_audit AFTER UPDATE ON public.tracker_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tracker_log_status_change('task');
