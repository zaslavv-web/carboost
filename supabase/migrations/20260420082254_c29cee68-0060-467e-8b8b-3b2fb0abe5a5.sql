
-- ============================================================
-- 1) company_onboarding_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_onboarding_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  auto_assign_tests boolean NOT NULL DEFAULT true,
  auto_assign_tracks boolean NOT NULL DEFAULT true,
  welcome_bonus_enabled boolean NOT NULL DEFAULT true,
  welcome_bonus_amount integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_onboarding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users view onboarding settings"
ON public.company_onboarding_settings FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "HRD manage onboarding settings"
ON public.company_onboarding_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin manage onboarding settings"
ON public.company_onboarding_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin manage onboarding settings"
ON public.company_onboarding_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'superadmin'))
WITH CHECK (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_onboarding_settings_updated
BEFORE UPDATE ON public.company_onboarding_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Сидим настройки для уже существующих компаний
INSERT INTO public.company_onboarding_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- ============================================================
-- 2) employee_invitations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  position_id uuid,
  department text,
  requested_role text NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'pending', -- pending | claimed | cancelled
  invited_by uuid NOT NULL,
  claimed_user_id uuid,
  claimed_at timestamptz,
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_company_email_pending
ON public.employee_invitations (company_id, lower(email))
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_email_lower
ON public.employee_invitations (lower(email));

ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HRD manage company invitations"
ON public.employee_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admin manage company invitations"
ON public.employee_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Superadmin manage all invitations"
ON public.employee_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'superadmin'))
WITH CHECK (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_invitations_updated
BEFORE UPDATE ON public.employee_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) RPC: bulk_invite_employees
-- ============================================================
CREATE OR REPLACE FUNCTION public.bulk_invite_employees(_invites jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_invite jsonb;
  v_email text;
  v_created int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'hrd')
       OR public.has_role(auth.uid(),'company_admin')
       OR public.has_role(auth.uid(),'superadmin')) THEN
    RAISE EXCEPTION 'Только HRD или администратор могут массово приглашать';
  END IF;

  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN RAISE EXCEPTION 'Не определена компания'; END IF;

  IF jsonb_typeof(_invites) <> 'array' THEN
    RAISE EXCEPTION 'Список должен быть массивом';
  END IF;

  FOR v_invite IN SELECT * FROM jsonb_array_elements(_invites) LOOP
    v_email := lower(btrim(COALESCE(v_invite->>'email','')));
    IF v_email = '' OR position('@' in v_email) = 0 THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', 'invalid_email');
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.employee_invitations(
        company_id, email, full_name, position_id, department, requested_role, invited_by
      ) VALUES (
        v_company,
        v_email,
        NULLIF(btrim(COALESCE(v_invite->>'full_name','')),''),
        NULLIF(v_invite->>'position_id','')::uuid,
        NULLIF(btrim(COALESCE(v_invite->>'department','')),''),
        COALESCE(NULLIF(v_invite->>'requested_role',''),'employee'),
        auth.uid()
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', 'already_invited');
    WHEN others THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

-- ============================================================
-- 4) handle_new_user: claim invitation + welcome bonus
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(NEW.email,'')));
  v_meta_company uuid := NULLIF(NEW.raw_user_meta_data->>'company_id','')::uuid;
  v_inv RECORD;
  v_company uuid;
  v_position uuid;
  v_department text;
  v_role text := COALESCE(NEW.raw_user_meta_data->>'requested_role','employee');
  v_full_name text := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_settings RECORD;
  v_is_verified boolean := false;
BEGIN
  -- 1) Ищем pending-приглашение по email (если несколько — берём самое свежее)
  SELECT * INTO v_inv
  FROM public.employee_invitations
  WHERE lower(email) = v_email AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_inv IS NOT NULL THEN
    v_company := v_inv.company_id;
    v_position := v_inv.position_id;
    v_department := v_inv.department;
    v_role := COALESCE(v_inv.requested_role, v_role);
    v_full_name := COALESCE(NULLIF(btrim(v_inv.full_name),''), v_full_name);
    v_is_verified := true; -- приглашённые сотрудники сразу верифицированы

    UPDATE public.employee_invitations
    SET status = 'claimed', claimed_user_id = NEW.id, claimed_at = now()
    WHERE id = v_inv.id;
  ELSE
    v_company := v_meta_company;
  END IF;

  INSERT INTO public.profiles (
    user_id, full_name, is_verified, requested_role, company_id, position_id, department
  ) VALUES (
    NEW.id, v_full_name, v_is_verified, v_role, v_company, v_position, COALESCE(v_department,'')
  );

  -- Роль: для приглашённого ставим сразу запрошенную, иначе employee до верификации
  IF v_is_verified THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_role::app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

  -- Welcome-бонус, если включён в настройках компании
  IF v_company IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.company_onboarding_settings WHERE company_id = v_company;
    IF v_settings IS NULL THEN
      INSERT INTO public.company_onboarding_settings(company_id) VALUES (v_company)
      ON CONFLICT (company_id) DO NOTHING;
      SELECT * INTO v_settings FROM public.company_onboarding_settings WHERE company_id = v_company;
    END IF;

    IF v_settings.welcome_bonus_enabled AND v_settings.welcome_bonus_amount > 0 AND v_is_verified THEN
      BEGIN
        PERFORM public.award_currency(NEW.id, v_company, v_settings.welcome_bonus_amount,
          'welcome_bonus', 'Приветственный бонус', NULL);

        INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
        VALUES (NEW.id, v_company,
          '🎉 Добро пожаловать!',
          'Вам начислен приветственный бонус: ' || v_settings.welcome_bonus_amount || ' монет.',
          'reward');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Welcome bonus failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5) on_test_attempt_created: учитывать настройку auto_assign_tracks
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_test_attempt_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pct numeric;
  v_position_id uuid;
  v_template_id uuid;
  v_auto boolean := true;
BEGIN
  BEGIN
    IF NEW.total > 0 THEN
      pct := (NEW.score::numeric / NEW.total::numeric) * 100;
      IF pct >= 80 THEN
        PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_passed_high',
          'Тест пройден на ' || round(pct) || '%');
      END IF;
      PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'test_completed', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Reward grant failed for user %: %', NEW.user_id, SQLERRM;
  END;

  -- Проверяем настройку компании на автоназначение трека
  IF NEW.company_id IS NOT NULL THEN
    SELECT auto_assign_tracks INTO v_auto FROM public.company_onboarding_settings
    WHERE company_id = NEW.company_id;
    v_auto := COALESCE(v_auto, true);
  END IF;

  IF v_auto THEN
    BEGIN
      SELECT position_id INTO v_position_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;

      IF v_position_id IS NOT NULL AND NEW.company_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.employee_career_assignments
           WHERE user_id = NEW.user_id AND status = 'active'
         )
      THEN
        SELECT id INTO v_template_id
        FROM public.career_track_templates
        WHERE company_id = NEW.company_id
          AND is_active = true
          AND from_position_id = v_position_id
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_template_id IS NOT NULL THEN
          INSERT INTO public.employee_career_assignments
            (user_id, company_id, template_id, status, current_step, assigned_at, assigned_by)
          VALUES
            (NEW.user_id, NEW.company_id, v_template_id, 'active', 0, now(), NULL);

          INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
          VALUES (NEW.user_id, NEW.company_id,
                  'Назначен карьерный трек',
                  'По результатам теста вам автоматически назначен подходящий карьерный трек.',
                  'career_track');
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Career track auto-assign failed for user %: %', NEW.user_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
