
-- 1) Жёстко валидируем роль при регистрации:
--    запрещаем 'superadmin' через raw_user_meta_data.requested_role
--    и через сохранённое значение в profiles.requested_role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_allowed text[] := ARRAY['employee','manager','hrd','company_admin'];
BEGIN
  -- Никогда не доверяем superadmin/неизвестной роли из клиентских метаданных
  IF NOT (v_role = ANY (v_allowed)) THEN
    v_role := 'employee';
  END IF;

  SELECT * INTO v_inv
  FROM public.employee_invitations
  WHERE lower(email) = v_email AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_inv IS NOT NULL THEN
    v_company := v_inv.company_id;
    v_position := v_inv.position_id;
    v_department := v_inv.department;
    -- Роль из приглашения — но всё равно через белый список
    IF v_inv.requested_role = ANY (v_allowed) THEN
      v_role := v_inv.requested_role;
    END IF;
    v_full_name := COALESCE(NULLIF(btrim(v_inv.full_name),''), v_full_name);
    v_is_verified := true;

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

  IF v_is_verified THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role::app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

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
        VALUES (NEW.id, v_company, '🎉 Добро пожаловать!',
          'Вам начислен приветственный бонус: ' || v_settings.welcome_bonus_amount || ' монет.', 'reward');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Welcome bonus failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Доп. защита: тригер на profiles запрещает обычным пользователям
--    самим выставлять requested_role='superadmin' (на случай прямой записи).
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- superadmin получает полный доступ
  IF public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Любой не-суперадмин не может присвоить себе или другим requested_role='superadmin'
  IF NEW.requested_role = 'superadmin'
     AND (OLD IS NULL OR OLD.requested_role IS DISTINCT FROM 'superadmin') THEN
    RAISE EXCEPTION 'Запрещено выставлять роль superadmin';
  END IF;

  IF auth.uid() = NEW.user_id THEN
    NEW.is_verified := OLD.is_verified;
    NEW.requested_role := OLD.requested_role;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    NEW.overall_score := OLD.overall_score;
    NEW.role_readiness := OLD.role_readiness;
    IF current_setting('app.allow_profile_position_update', true) IS DISTINCT FROM 'true' THEN
      NEW.position_id := OLD.position_id;
    END IF;
    NEW.pending_position_id := COALESCE(NEW.pending_position_id, OLD.pending_position_id);
  END IF;

  IF public.has_role(auth.uid(), 'company_admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'superadmin'::app_role)
     AND auth.uid() <> NEW.user_id THEN
    NEW.is_verified := OLD.is_verified;
    NEW.requested_role := OLD.requested_role;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    NEW.overall_score := OLD.overall_score;
    NEW.role_readiness := OLD.role_readiness;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) verify_user: бэкстоп — если в profile.requested_role каким-то образом
--    оказался 'superadmin', обычный company_admin не может этим
--    воспользоваться. Только суперадмин выдаёт роль superadmin.
CREATE OR REPLACE FUNCTION public.verify_user(_target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_allowed text[] := ARRAY['employee','manager','hrd','company_admin'];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'company_admin')) THEN
    RAISE EXCEPTION 'Only Superadmin or Company Admin can verify users';
  END IF;
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only verify users within their company';
    END IF;
  END IF;

  SELECT requested_role INTO v_role FROM public.profiles WHERE user_id = _target_user_id;

  -- Только суперадмин может выдать superadmin
  IF v_role = 'superadmin' AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Только Суперадмин может подтверждать пользователя с ролью superadmin';
  END IF;

  -- Белый список ролей (на случай мусора в колонке)
  IF v_role IS NULL OR (v_role <> 'superadmin' AND NOT (v_role = ANY (v_allowed))) THEN
    v_role := 'employee';
  END IF;

  UPDATE public.profiles SET is_verified = true WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, v_role::app_role);
END;
$function$;
