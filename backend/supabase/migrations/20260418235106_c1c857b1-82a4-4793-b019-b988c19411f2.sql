-- Function: sync goals of current step into personal career_goals
CREATE OR REPLACE FUNCTION public.sync_step_goals_to_personal(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_template RECORD;
  v_step jsonb;
  v_goal jsonb;
  v_goal_text text;
  v_duration_months int;
  v_deadline date;
  v_step_title text;
BEGIN
  SELECT * INTO v_assignment FROM public.employee_career_assignments WHERE id = _assignment_id;
  IF v_assignment IS NULL OR v_assignment.status <> 'active' THEN RETURN; END IF;

  SELECT * INTO v_template FROM public.career_track_templates WHERE id = v_assignment.template_id;
  IF v_template IS NULL THEN RETURN; END IF;

  v_step := v_template.steps -> v_assignment.current_step;
  IF v_step IS NULL THEN RETURN; END IF;

  v_step_title := COALESCE(v_step->>'title', 'Этап ' || (v_assignment.current_step + 1));
  v_duration_months := COALESCE((v_step->>'duration_months')::int, 3);
  v_deadline := (now() + (v_duration_months || ' months')::interval)::date;

  IF v_step ? 'goals' AND jsonb_typeof(v_step->'goals') = 'array' THEN
    FOR v_goal IN SELECT * FROM jsonb_array_elements(v_step->'goals') LOOP
      v_goal_text := COALESCE(v_goal #>> '{}', '');
      IF length(btrim(v_goal_text)) = 0 THEN CONTINUE; END IF;

      -- skip if already exists for this assignment+step+title
      IF EXISTS (
        SELECT 1 FROM public.career_goals
        WHERE assignment_id = _assignment_id
          AND step_order = v_assignment.current_step
          AND title = v_goal_text
      ) THEN CONTINUE; END IF;

      INSERT INTO public.career_goals(
        user_id, company_id, assignment_id, step_order,
        title, description, status, progress, deadline, auto_generated
      ) VALUES (
        v_assignment.user_id, v_assignment.company_id, _assignment_id, v_assignment.current_step,
        v_goal_text, 'Цель этапа: ' || v_step_title, 'in_progress', 0, v_deadline, true
      );
    END LOOP;
  END IF;
END;
$$;

-- Trigger function: on INSERT or step change
CREATE OR REPLACE FUNCTION public.on_career_assignment_step_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_step_goals_to_personal(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.current_step IS DISTINCT FROM OLD.current_step AND NEW.status = 'active' THEN
    PERFORM public.sync_step_goals_to_personal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_step_goals ON public.employee_career_assignments;
CREATE TRIGGER trg_sync_step_goals
AFTER INSERT OR UPDATE OF current_step ON public.employee_career_assignments
FOR EACH ROW EXECUTE FUNCTION public.on_career_assignment_step_sync();

-- Backfill for all active assignments
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.employee_career_assignments WHERE status = 'active' LOOP
    PERFORM public.sync_step_goals_to_personal(r.id);
  END LOOP;
END $$;