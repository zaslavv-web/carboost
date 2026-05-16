--
-- PostgreSQL database dump
--

\restrict JHlO2Rfq9geiRc5Vaf4kktMkI74nqll3JWqVFpNV6gJxOM4eRqd3s0U0wijle6C

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'employee',
    'manager',
    'hrd',
    'superadmin',
    'company_admin'
);


--
-- Name: assign_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_role(_target_user_id uuid, _new_role public.app_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_target_company uuid;
  v_actor_company uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'hrd')
    OR public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'company_admin')
  ) THEN
    RAISE EXCEPTION 'Только HRD, Администратор компании или Суперадмин могут назначать роли';
  END IF;

  -- Только superadmin может назначать superadmin
  IF _new_role = 'superadmin' AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Только Суперадмин может назначать роль superadmin';
  END IF;

  -- HRD и Company Admin ограничены своей компанией
  IF NOT public.has_role(auth.uid(), 'superadmin') THEN
    SELECT company_id INTO v_target_company FROM public.profiles WHERE user_id = _target_user_id;
    v_actor_company := public.get_user_company_id(auth.uid());
    IF v_target_company IS DISTINCT FROM v_actor_company OR v_actor_company IS NULL THEN
      RAISE EXCEPTION 'Можно изменять роли только в своей компании';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
END;
$$;


--
-- Name: award_currency(uuid, uuid, integer, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_currency(_user_id uuid, _company_id uuid, _amount integer, _kind text, _description text DEFAULT NULL::text, _reference_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tx_id uuid;
  v_new_balance integer;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL OR _amount IS NULL OR _amount = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.currency_balances(user_id, company_id, balance)
  VALUES (_user_id, _company_id, GREATEST(_amount, 0))
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET balance = public.currency_balances.balance + _amount,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Недостаточно средств на балансе';
  END IF;

  INSERT INTO public.currency_transactions(user_id, company_id, amount, kind, description, reference_id, created_by)
  VALUES (_user_id, _company_id, _amount, _kind, _description, _reference_id, auth.uid())
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;


--
-- Name: build_employee_artifacts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_employee_artifacts(_user_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_attempt RECORD;
  v_rewards text;
  v_text text := '';
BEGIN
  SELECT score, total, created_at INTO v_attempt
  FROM public.test_attempts
  WHERE user_id = _user_id
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_attempt IS NOT NULL THEN
    v_text := v_text || '📊 Последний тест: ' || v_attempt.score || '/' || v_attempt.total
              || ' (' || to_char(v_attempt.created_at, 'DD.MM.YYYY') || '). ';
  END IF;

  SELECT string_agg(rt.title, ', ') INTO v_rewards
  FROM public.employee_rewards er
  JOIN public.gamification_reward_types rt ON rt.id = er.reward_type_id
  WHERE er.user_id = _user_id AND er.awarded_at > now() - interval '30 days';
  IF v_rewards IS NOT NULL THEN
    v_text := v_text || '🏆 Награды (30д): ' || v_rewards || '.';
  END IF;

  RETURN v_text;
END;
$$;


--
-- Name: bulk_invite_employees(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_invite_employees(_invites jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: create_shop_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_shop_order(_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_item jsonb;
  v_product RECORD;
  v_qty integer;
  v_total integer := 0;
  v_order_id uuid;
  v_purchased_total integer;
  v_purchased_period integer;
  v_period_start timestamptz;
  v_balance integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Не авторизован'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Корзина пуста';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL THEN RAISE EXCEPTION 'У пользователя нет компании'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Некорректное количество'; END IF;

    SELECT * INTO v_product FROM public.shop_products
    WHERE id = (v_item->>'product_id')::uuid AND is_active = true AND company_id = v_company;
    IF v_product IS NULL THEN RAISE EXCEPTION 'Товар недоступен'; END IF;

    IF v_product.max_per_user IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0) INTO v_purchased_total
      FROM public.shop_order_items oi
      JOIN public.shop_orders o ON o.id = oi.order_id
      WHERE o.user_id = v_user AND oi.product_id = v_product.id AND o.status <> 'cancelled';
      IF v_purchased_total + v_qty > v_product.max_per_user THEN
        RAISE EXCEPTION 'Превышен лимит "%" на этот товар (всего %)', v_product.title, v_product.max_per_user;
      END IF;
    END IF;

    IF v_product.max_per_period IS NOT NULL AND v_product.period_kind <> 'none' THEN
      v_period_start := CASE v_product.period_kind
        WHEN 'month' THEN date_trunc('month', now())
        WHEN 'quarter' THEN date_trunc('quarter', now())
        WHEN 'year' THEN date_trunc('year', now())
      END;
      SELECT COALESCE(SUM(oi.quantity),0) INTO v_purchased_period
      FROM public.shop_order_items oi
      JOIN public.shop_orders o ON o.id = oi.order_id
      WHERE o.user_id = v_user AND oi.product_id = v_product.id
        AND o.status <> 'cancelled' AND o.created_at >= v_period_start;
      IF v_purchased_period + v_qty > v_product.max_per_period THEN
        RAISE EXCEPTION 'Превышен лимит "%" за период (% шт.)', v_product.title, v_product.max_per_period;
      END IF;
    END IF;

    v_total := v_total + (v_product.price * v_qty);
  END LOOP;

  SELECT COALESCE(balance,0) INTO v_balance FROM public.currency_balances
  WHERE user_id = v_user AND company_id = v_company;
  IF COALESCE(v_balance,0) < v_total THEN
    RAISE EXCEPTION 'Недостаточно средств: нужно %, доступно %', v_total, COALESCE(v_balance,0);
  END IF;

  INSERT INTO public.shop_orders(user_id, company_id, total_amount, status)
  VALUES (v_user, v_company, v_total, 'pending_fulfillment')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_product FROM public.shop_products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.shop_order_items(order_id, product_id, quantity, unit_price, subtotal, product_title)
    VALUES (v_order_id, v_product.id, v_qty, v_product.price, v_product.price * v_qty, v_product.title);
    DELETE FROM public.shop_cart_items WHERE user_id = v_user AND product_id = v_product.id;
  END LOOP;

  PERFORM public.award_currency(v_user, v_company, -v_total, 'purchase',
    'Заказ #' || substring(v_order_id::text,1,8), v_order_id);

  -- Дедуплицируем получателей (DISTINCT) — пользователь с несколькими ролями получит одно уведомление
  INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
  SELECT DISTINCT p.user_id, v_company, '🛍️ Новый заказ в магазине',
    'Сотрудник оформил заказ на ' || v_total || ' монет. Требуется выдача.', 'shop_order'
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.company_id = v_company AND ur.role IN ('hrd','company_admin') AND p.user_id <> v_user;

  INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
  VALUES (v_user, v_company, '✅ Заказ оформлен',
    'Ваш заказ на ' || v_total || ' монет ожидает выдачи HRD.', 'shop_order');

  RETURN v_order_id;
END;
$$;


--
-- Name: delete_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user(_target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only superadmin or company_admin can delete users
  IF NOT (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'company_admin')) THEN
    RAISE EXCEPTION 'Only Superadmin or Company Admin can delete users';
  END IF;

  -- Prevent deleting yourself
  IF auth.uid() = _target_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Company admin can only delete users within their company
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only delete users within their company';
    END IF;
  END IF;

  -- Prevent deleting superadmins (only another superadmin could, but extra safety)
  IF public.has_role(_target_user_id, 'superadmin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Cannot delete a superadmin user';
  END IF;

  -- Delete related data (profiles and user_roles have ON DELETE CASCADE from auth.users)
  DELETE FROM public.profiles WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  
  -- Delete from auth.users (cascades to all FK references)
  DELETE FROM auth.users WHERE id = _target_user_id;
END;
$$;


--
-- Name: find_company_by_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_company_by_name(_name text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.companies
  WHERE lower(btrim(name)) = lower(btrim(_name))
  LIMIT 1
$$;


--
-- Name: fulfill_shop_order(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fulfill_shop_order(_order_id uuid, _approve boolean, _reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.shop_orders WHERE id = _order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Заказ не найден'; END IF;
  IF v_order.status <> 'pending_fulfillment' THEN RAISE EXCEPTION 'Заказ уже обработан'; END IF;

  IF NOT (
    (public.has_role(auth.uid(),'hrd') AND v_order.company_id = public.get_user_company_id(auth.uid()))
    OR (public.has_role(auth.uid(),'company_admin') AND v_order.company_id = public.get_user_company_id(auth.uid()))
    OR public.has_role(auth.uid(),'superadmin')
  ) THEN
    RAISE EXCEPTION 'Нет прав на обработку заказа';
  END IF;

  IF _approve THEN
    UPDATE public.shop_orders
    SET status = 'fulfilled', fulfilled_by = auth.uid(), fulfilled_at = now(), updated_at = now()
    WHERE id = _order_id;
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_order.user_id, v_order.company_id, '🎁 Заказ выдан',
      'Ваш заказ на ' || v_order.total_amount || ' монет выдан.', 'shop_order');
  ELSE
    UPDATE public.shop_orders
    SET status = 'cancelled', cancel_reason = _reason, fulfilled_by = auth.uid(),
        fulfilled_at = now(), updated_at = now()
    WHERE id = _order_id;
    -- Refund
    PERFORM public.award_currency(v_order.user_id, v_order.company_id, v_order.total_amount,
      'refund', 'Возврат за отменённый заказ #' || substring(_order_id::text,1,8), _order_id);
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_order.user_id, v_order.company_id, '⚠️ Заказ отменён',
      'Заказ отменён: ' || COALESCE(_reason,'без указания причины') || '. Средства возвращены.', 'shop_order');
  END IF;
END;
$$;


--
-- Name: get_user_company_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_company_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;


--
-- Name: grant_rewards_for_event(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_rewards_for_event(_user_id uuid, _company_id uuid, _event_code text, _description text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rt RECORD;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN RETURN; END IF;
  FOR rt IN
    SELECT id FROM public.gamification_reward_types
    WHERE company_id = _company_id
      AND is_active = true
      AND trigger_mode = 'auto'
      AND trigger_events ? _event_code
  LOOP
    -- Avoid duplicate grant on same day for same event
    IF NOT EXISTS (
      SELECT 1 FROM public.employee_rewards
      WHERE reward_type_id = rt.id
        AND user_id = _user_id
        AND awarded_at::date = now()::date
    ) THEN
      INSERT INTO public.employee_rewards (reward_type_id, user_id, company_id, description)
      VALUES (rt.id, _user_id, _company_id, COALESCE(_description, 'Авто: ' || _event_code));
    END IF;
  END LOOP;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: hash_invitation_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_invitation_token() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.token IS NOT NULL THEN
    NEW.token_hash := encode(digest(NEW.token, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_career_event(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_career_event(_user_id uuid, _company_id uuid, _title text, _description text, _ntype text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_dept text;
  v_head uuid;
  v_manager uuid;
  v_hrd RECORD;
BEGIN
  -- сотруднику
  INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
  VALUES (_user_id, _company_id, _title, _description, _ntype);

  -- линейному руководителю
  SELECT manager_id INTO v_manager FROM public.team_members
  WHERE employee_id = _user_id LIMIT 1;
  IF v_manager IS NOT NULL AND v_manager <> _user_id THEN
    INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
    VALUES (v_manager, _company_id,
            'Сотрудник: ' || _title,
            _description, _ntype);
  END IF;

  -- head отдела (если отличается от manager)
  SELECT department INTO v_employee_dept FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  IF v_employee_dept IS NOT NULL THEN
    SELECT head_user_id INTO v_head FROM public.departments
    WHERE company_id = _company_id AND name = v_employee_dept LIMIT 1;
    IF v_head IS NOT NULL AND v_head <> _user_id AND v_head IS DISTINCT FROM v_manager THEN
      INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
      VALUES (v_head, _company_id,
              'Сотрудник отдела: ' || _title,
              _description, _ntype);
    END IF;
  END IF;

  -- всем HRD компании
  FOR v_hrd IN
    SELECT p.user_id FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.company_id = _company_id AND ur.role = 'hrd' AND p.user_id <> _user_id
  LOOP
    INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
    VALUES (v_hrd.user_id, _company_id,
            'HR-событие: ' || _title,
            _description, _ntype);
  END LOOP;
END;
$$;


--
-- Name: on_assessment_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_assessment_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'ai_assessment_completed', NULL);
  RETURN NEW;
END;
$$;


--
-- Name: on_career_assignment_step_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_career_assignment_step_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: on_career_assignment_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_career_assignment_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'career_track_completed', NULL);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_career_goal_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_career_goal_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'career_goal_achieved', NEW.title);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_career_step_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_career_step_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile RECORD;
  v_template RECORD;
  v_artifacts text;
  v_desc text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.current_step = OLD.current_step AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_profile FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  SELECT title INTO v_template FROM public.career_track_templates WHERE id = NEW.template_id LIMIT 1;
  v_artifacts := public.build_employee_artifacts(NEW.user_id);

  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status <> 'completed') THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' завершил трек "' ||
              COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Карьерный трек завершён', v_desc, 'career_step_passed');
  ELSIF NEW.status = 'failed' THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' не прошёл этап ' || NEW.current_step ||
              ' трека "' || COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Этап не пройден', v_desc, 'career_step_failed');
  ELSIF NEW.current_step > COALESCE(OLD.current_step, -1) THEN
    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' перешёл на этап ' || NEW.current_step ||
              ' трека "' || COALESCE(v_template.title,'') || '". ' || v_artifacts;
    PERFORM public.notify_career_event(NEW.user_id, NEW.company_id,
      'Этап пройден', v_desc, 'career_step_passed');
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: on_profile_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_profile_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.position_id IS DISTINCT FROM OLD.position_id AND OLD.position_id IS NOT NULL THEN
    PERFORM public.grant_rewards_for_event(NEW.user_id, NEW.company_id, 'position_promotion', 'Повышение должности');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_reward_grant_award_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_reward_grant_award_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_points integer;
BEGIN
  SELECT points INTO v_points FROM public.gamification_reward_types WHERE id = NEW.reward_type_id;
  IF v_points IS NOT NULL AND v_points > 0 AND NEW.company_id IS NOT NULL THEN
    PERFORM public.award_currency(NEW.user_id, NEW.company_id, v_points, 'earn_reward',
      'Награда: ' || COALESCE(NEW.description,''), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_reward_granted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_reward_granted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rt RECORD;
  ach_title text;
  ach_desc text;
BEGIN
  SELECT * INTO rt FROM public.gamification_reward_types WHERE id = NEW.reward_type_id;
  IF rt IS NULL THEN RETURN NEW; END IF;

  ach_title := '🏆 ' || rt.title;
  ach_desc := COALESCE(rt.description, '') ||
              CASE
                WHEN rt.reward_kind = 'monetary' THEN ' • Денежное вознаграждение: ' || COALESCE(rt.monetary_amount::text,'0') || ' ' || COALESCE(rt.monetary_currency,'RUB')
                WHEN rt.reward_kind = 'non_monetary' THEN ' • ' || COALESCE(rt.non_monetary_title,'')
                WHEN rt.reward_kind = 'digital_gift' THEN ' • Цифровой подарок'
                ELSE ''
              END;

  INSERT INTO public.achievements (user_id, company_id, title, description, icon, achievement_date)
  VALUES (NEW.user_id, NEW.company_id, ach_title, ach_desc, COALESCE(rt.icon,'award'), NEW.awarded_at::date);

  INSERT INTO public.notifications (user_id, company_id, title, description, notification_type)
  VALUES (NEW.user_id, NEW.company_id, 'Вы получили награду: ' || rt.title,
          COALESCE(NEW.description, rt.description, ''), 'reward');

  RETURN NEW;
END;
$$;


--
-- Name: on_test_attempt_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_test_attempt_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: payout_hr_task_rewards(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payout_hr_task_rewards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: payout_peer_recognition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payout_peer_recognition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: protect_profile_sensitive_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_sensitive_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: register_company(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_company(_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clean text := btrim(_name);
  v_id uuid;
BEGIN
  IF v_clean IS NULL OR length(v_clean) < 2 THEN
    RAISE EXCEPTION 'Название компании должно содержать минимум 2 символа';
  END IF;
  IF length(v_clean) > 120 THEN
    RAISE EXCEPTION 'Название компании слишком длинное (максимум 120 символов)';
  END IF;

  SELECT id INTO v_id FROM public.companies WHERE lower(btrim(name)) = lower(v_clean) LIMIT 1;
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'Компания с таким названием уже зарегистрирована';
  END IF;

  INSERT INTO public.companies (name) VALUES (v_clean) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: reject_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_user(_target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'company_admin')) THEN
    RAISE EXCEPTION 'Only Superadmin or Company Admin can reject users';
  END IF;
  IF public.has_role(auth.uid(), 'company_admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    IF (SELECT company_id FROM public.profiles WHERE user_id = _target_user_id)
       != public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Company Admin can only reject users within their company';
    END IF;
  END IF;
  DELETE FROM public.profiles WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
END;
$$;


--
-- Name: review_career_step(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_career_step(_submission_id uuid, _approve boolean, _reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sub RECORD;
  v_assignment RECORD;
  v_is_manager boolean;
  v_is_hrd boolean;
  v_is_admin boolean;
  v_template RECORD;
  v_steps jsonb;
  v_total_steps integer;
  v_profile RECORD;
  v_desc text;
BEGIN
  SELECT * INTO v_sub FROM public.career_step_submissions WHERE id = _submission_id;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'Заявка не найдена'; END IF;
  IF v_sub.status <> 'pending_review' THEN RAISE EXCEPTION 'Заявка уже обработана'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.team_members WHERE employee_id = v_sub.user_id AND manager_id = auth.uid()) INTO v_is_manager;
  v_is_hrd := public.has_role(auth.uid(),'hrd') AND v_sub.company_id = public.get_user_company_id(auth.uid());
  v_is_admin := public.has_role(auth.uid(),'company_admin') AND v_sub.company_id = public.get_user_company_id(auth.uid());

  IF NOT (v_is_manager OR v_is_hrd OR v_is_admin OR public.has_role(auth.uid(),'superadmin')) THEN
    RAISE EXCEPTION 'Нет прав для проверки этапа';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_sub.user_id;
  SELECT * INTO v_template FROM public.career_track_templates WHERE id = v_sub.template_id;
  v_steps := COALESCE(v_template.steps, '[]'::jsonb);
  v_total_steps := jsonb_array_length(v_steps);

  UPDATE public.career_step_submissions
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = CASE WHEN _approve THEN NULL ELSE _reason END
  WHERE id = _submission_id;

  IF _approve THEN
    SELECT * INTO v_assignment FROM public.employee_career_assignments WHERE id = v_sub.assignment_id;

    -- Закрываем цели этапа
    UPDATE public.career_goals
    SET status = 'completed', progress = 100, updated_at = now()
    WHERE assignment_id = v_sub.assignment_id AND step_order = v_sub.step_order;

    -- Награды за этап
    PERFORM public.grant_rewards_for_event(v_sub.user_id, v_sub.company_id,
      'career_step_passed', 'Этап ' || (v_sub.step_order + 1) || ' пройден');

    -- Двигаем шаг
    IF v_sub.step_order + 1 >= v_total_steps THEN
      UPDATE public.employee_career_assignments
      SET status = 'completed', current_step = v_sub.step_order + 1, updated_at = now()
      WHERE id = v_sub.assignment_id;
    ELSE
      UPDATE public.employee_career_assignments
      SET current_step = v_sub.step_order + 1, updated_at = now()
      WHERE id = v_sub.assignment_id;
    END IF;

    v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ': этап ' || (v_sub.step_order + 1) ||
              ' трека "' || COALESCE(v_template.title,'') || '" подтверждён.';
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_sub.user_id, v_sub.company_id, '✅ Этап подтверждён', v_desc, 'career_step_passed');
  ELSE
    v_desc := 'Этап ' || (v_sub.step_order + 1) || ' трека "' || COALESCE(v_template.title,'') ||
              '" отклонён. Причина: ' || COALESCE(_reason,'не указана') ||
              '. Будет запущен усиленный сценарий повторного прохождения.';
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_sub.user_id, v_sub.company_id, '⚠️ Этап отклонён', v_desc, 'career_step_failed');

    PERFORM public.notify_career_event(v_sub.user_id, v_sub.company_id,
      'Этап отклонён', COALESCE(v_profile.full_name,'Сотрудник') || ': ' || v_desc, 'career_step_failed');
  END IF;
END;
$$;


--
-- Name: submit_career_step(uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_career_step(_assignment_id uuid, _comment text DEFAULT NULL::text, _test_attempt_id uuid DEFAULT NULL::uuid, _file_urls jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_assignment RECORD;
  v_template RECORD;
  v_profile RECORD;
  v_attempt_no integer;
  v_reinforced boolean;
  v_submission_id uuid;
  v_file jsonb;
  v_desc text;
BEGIN
  SELECT * INTO v_assignment FROM public.employee_career_assignments WHERE id = _assignment_id;
  IF v_assignment IS NULL THEN RAISE EXCEPTION 'Назначение не найдено'; END IF;
  IF v_assignment.user_id <> auth.uid() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;

  SELECT * INTO v_template FROM public.career_track_templates WHERE id = v_assignment.template_id;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = auth.uid();

  SELECT COALESCE(MAX(attempt_no),0) + 1 INTO v_attempt_no
  FROM public.career_step_submissions
  WHERE assignment_id = _assignment_id AND step_order = v_assignment.current_step;

  v_reinforced := v_attempt_no > 1;

  INSERT INTO public.career_step_submissions(
    assignment_id, template_id, step_order, user_id, company_id,
    attempt_no, is_reinforced, comment, test_attempt_id, status
  ) VALUES (
    _assignment_id, v_assignment.template_id, v_assignment.current_step, auth.uid(), v_assignment.company_id,
    v_attempt_no, v_reinforced, _comment, _test_attempt_id, 'pending_review'
  ) RETURNING id INTO v_submission_id;

  FOR v_file IN SELECT * FROM jsonb_array_elements(_file_urls) LOOP
    INSERT INTO public.career_step_submission_files(submission_id, file_url, file_name)
    VALUES (v_submission_id, v_file->>'url', v_file->>'name');
  END LOOP;

  v_desc := COALESCE(v_profile.full_name,'Сотрудник') || ' отправил материалы по этапу ' ||
            (v_assignment.current_step + 1) || ' трека "' || COALESCE(v_template.title,'') ||
            '" (попытка ' || v_attempt_no || CASE WHEN v_reinforced THEN ', усиленный сценарий' ELSE '' END || ').';

  PERFORM public.notify_career_event(auth.uid(), v_assignment.company_id,
    'Этап на проверке', v_desc, 'career_step_review');

  RETURN v_submission_id;
END;
$$;


--
-- Name: submit_demo_request(text, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_demo_request(_name text, _email text, _company text DEFAULT NULL::text, _headcount integer DEFAULT NULL::integer, _source text DEFAULT 'landing'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  _id UUID;
  _name_trim TEXT := btrim(_name);
  _email_trim TEXT := lower(btrim(_email));
BEGIN
  IF _name_trim IS NULL OR length(_name_trim) < 2 OR length(_name_trim) > 120 THEN
    RAISE EXCEPTION 'Имя должно быть от 2 до 120 символов';
  END IF;
  IF _email_trim !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Некорректный email';
  END IF;
  IF _company IS NOT NULL AND length(btrim(_company)) > 200 THEN
    RAISE EXCEPTION 'Слишком длинное название компании';
  END IF;
  IF _headcount IS NOT NULL AND (_headcount < 1 OR _headcount > 1000000) THEN
    RAISE EXCEPTION 'Некорректный размер команды';
  END IF;

  INSERT INTO public.demo_requests (name, email, company, headcount, source)
  VALUES (_name_trim, _email_trim, NULLIF(btrim(_company), ''), _headcount, COALESCE(NULLIF(btrim(_source), ''), 'landing'))
  RETURNING id INTO _id;

  RETURN _id;
END;
$_$;


--
-- Name: submit_employee_questionnaire(uuid, uuid, text, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_employee_questionnaire(_questionnaire_id uuid, _position_id uuid, _other_position_title text, _answers jsonb, _skill_gaps jsonb, _status text DEFAULT 'submitted'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_questionnaire_id uuid := _questionnaire_id;
  v_position_title text;
  v_full_name text;
  v_department text;
  v_comp jsonb;
  v_score integer := 0;
  v_hr uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT company_id, full_name, department INTO v_company_id, v_full_name, v_department
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User company is required';
  END IF;

  IF _position_id IS NOT NULL THEN
    SELECT title INTO v_position_title
    FROM public.positions
    WHERE id = _position_id AND company_id = v_company_id
    LIMIT 1;
    IF v_position_title IS NULL THEN
      RAISE EXCEPTION 'Position is not available for this company';
    END IF;
  ELSE
    v_position_title := NULLIF(trim(COALESCE(_other_position_title, '')), '');
    IF v_position_title IS NULL THEN
      RAISE EXCEPTION 'Position is required';
    END IF;
  END IF;

  IF _status NOT IN ('draft', 'submitted', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid questionnaire status';
  END IF;

  IF v_questionnaire_id IS NULL THEN
    INSERT INTO public.employee_questionnaires(user_id, company_id, position_id, other_position_title, answers, skill_gaps, status)
    VALUES (v_user_id, v_company_id, _position_id, NULLIF(trim(COALESCE(_other_position_title, '')), ''), COALESCE(_answers, '{}'::jsonb), COALESCE(_skill_gaps, '[]'::jsonb), _status)
    RETURNING id INTO v_questionnaire_id;
  ELSE
    UPDATE public.employee_questionnaires
    SET position_id = _position_id,
        other_position_title = NULLIF(trim(COALESCE(_other_position_title, '')), ''),
        answers = COALESCE(_answers, '{}'::jsonb),
        skill_gaps = COALESCE(_skill_gaps, '[]'::jsonb),
        status = _status,
        version = version + CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END
    WHERE id = v_questionnaire_id AND user_id = v_user_id
    RETURNING id INTO v_questionnaire_id;

    IF v_questionnaire_id IS NULL THEN
      RAISE EXCEPTION 'Questionnaire not found';
    END IF;
  END IF;

  PERFORM set_config('app.allow_profile_position_update', 'true', true);

  UPDATE public.profiles
  SET position_id = COALESCE(_position_id, position_id),
      position = COALESCE(v_position_title, position),
      department = COALESCE(NULLIF((_answers->'basic'->>'department'), ''), department)
  WHERE user_id = v_user_id;

  PERFORM set_config('app.allow_profile_position_update', 'false', true);

  DELETE FROM public.competencies WHERE user_id = v_user_id AND company_id = v_company_id;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(_answers->'competencies', '[]'::jsonb))
  LOOP
    IF NULLIF(trim(COALESCE(v_comp->>'name', '')), '') IS NOT NULL THEN
      INSERT INTO public.competencies(user_id, company_id, skill_name, skill_value)
      VALUES (
        v_user_id,
        v_company_id,
        v_comp->>'name',
        LEAST(100, GREATEST(0, COALESCE((v_comp->>'level')::integer, 1) * 25))
      );
    END IF;
  END LOOP;

  SELECT COALESCE(round(avg(LEAST(100, GREATEST(0, COALESCE((c->>'level')::integer, 1) * 25))))::integer, 0)
  INTO v_score
  FROM jsonb_array_elements(COALESCE(_answers->'competencies', '[]'::jsonb)) c;

  IF _status IN ('submitted', 'confirmed') THEN
    INSERT INTO public.assessments(user_id, company_id, assessment_type, score, assessment_data, change_value)
    VALUES (v_user_id, v_company_id, 'onboarding_questionnaire', v_score, jsonb_build_object('questionnaire_id', v_questionnaire_id, 'skill_gaps', COALESCE(_skill_gaps, '[]'::jsonb)), null);
  END IF;

  IF _position_id IS NULL THEN
    SELECT ur.user_id INTO v_hr
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role IN ('hrd'::app_role, 'company_admin'::app_role)
      AND p.company_id = v_company_id
    LIMIT 1;

    IF v_hr IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
      VALUES (v_hr, v_company_id, 'Новая должность на проверку', COALESCE(v_full_name, 'Сотрудник') || ' указал(а) должность: ' || v_position_title, 'position_review');
    END IF;
  END IF;

  RETURN v_questionnaire_id;
END;
$$;


--
-- Name: submit_pricing_inquiry(text, text, text, text, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_pricing_inquiry(_name text, _email text, _plan text, _company text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _headcount integer DEFAULT NULL::integer, _message text DEFAULT NULL::text, _source text DEFAULT 'pricing_page'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(_name,''));
  v_email text := lower(btrim(COALESCE(_email,'')));
  v_admin RECORD;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Имя должно быть от 2 до 120 символов';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Некорректный email';
  END IF;
  IF _plan NOT IN ('cloud','on_premise') THEN
    RAISE EXCEPTION 'Неверный тариф';
  END IF;
  IF _company IS NOT NULL AND length(btrim(_company)) > 200 THEN
    RAISE EXCEPTION 'Слишком длинное название компании';
  END IF;
  IF _headcount IS NOT NULL AND (_headcount < 1 OR _headcount > 1000000) THEN
    RAISE EXCEPTION 'Некорректный размер команды';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 4000 THEN
    RAISE EXCEPTION 'Слишком длинный комментарий';
  END IF;

  INSERT INTO public.pricing_inquiries(name,email,company,phone,plan,headcount,message,source)
  VALUES (v_name, v_email, NULLIF(btrim(COALESCE(_company,'')),''),
          NULLIF(btrim(COALESCE(_phone,'')),''), _plan, _headcount,
          NULLIF(btrim(COALESCE(_message,'')),''),
          COALESCE(NULLIF(btrim(COALESCE(_source,'')),''),'pricing_page'))
  RETURNING id INTO v_id;

  -- Уведомить суперадминов
  FOR v_admin IN
    SELECT ur.user_id, p.company_id FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'superadmin'
  LOOP
    INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
    VALUES (v_admin.user_id, v_admin.company_id,
      '💼 Новая заявка на тариф (' || CASE _plan WHEN 'cloud' THEN 'Cloud' ELSE 'On-Premise' END || ')',
      v_name || ' (' || v_email || ')' || COALESCE(' • ' || _company,'') ||
      COALESCE(' • ' || _headcount || ' чел.','') ||
      COALESCE(E'\n' || _message,''),
      'pricing_inquiry');
  END LOOP;

  RETURN v_id;
END;
$_$;


--
-- Name: sync_step_goals_to_personal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_step_goals_to_personal(_assignment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: validate_employee_questionnaire(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_employee_questionnaire() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'submitted', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid questionnaire status: %', NEW.status;
  END IF;
  IF NEW.version < 1 THEN
    RAISE EXCEPTION 'questionnaire version must be positive';
  END IF;
  IF NEW.position_id IS NULL AND NULLIF(trim(COALESCE(NEW.other_position_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Position or other position title is required';
  END IF;
  IF NEW.status IN ('submitted', 'confirmed') AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  IF NEW.next_update_due_at IS NULL AND NEW.status IN ('submitted', 'confirmed') THEN
    NEW.next_update_due_at := now() + interval '6 months';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_position_profile_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_position_profile_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.profile_status NOT IN ('draft', 'review', 'approved', 'archived') THEN
    RAISE EXCEPTION 'Invalid profile_status: %', NEW.profile_status;
  END IF;
  IF NEW.profile_version < 1 THEN
    RAISE EXCEPTION 'profile_version must be positive';
  END IF;
  IF NEW.profile_status = 'approved' AND OLD.profile_template IS DISTINCT FROM NEW.profile_template THEN
    NEW.profile_version := COALESCE(OLD.profile_version, 0) + 1;
  END IF;
  IF NEW.profile_status = 'approved' AND OLD.profile_status IS DISTINCT FROM 'approved' THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_reward_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_reward_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.reward_kind NOT IN ('achievement','digital_gift','non_monetary','monetary') THEN
    RAISE EXCEPTION 'Invalid reward_kind: %', NEW.reward_kind;
  END IF;
  IF NEW.trigger_mode NOT IN ('manual','auto') THEN
    RAISE EXCEPTION 'Invalid trigger_mode: %', NEW.trigger_mode;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: verify_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_user(_target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    achievement_date date,
    icon text DEFAULT 'award'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: assessment_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    scenario_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    file_url text,
    created_by uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    assessment_type text DEFAULT 'ai'::text NOT NULL,
    score integer DEFAULT 0,
    change_value text,
    assessment_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: career_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'in_progress'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    deadline date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    assignment_id uuid,
    step_order integer,
    auto_generated boolean DEFAULT false NOT NULL,
    CONSTRAINT career_goals_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT career_goals_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'in_progress'::text, 'at_risk'::text])))
);


--
-- Name: career_level_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_level_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    action_text text NOT NULL,
    action_order integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    category text DEFAULT 'skill'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: career_step_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_step_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    step_order integer NOT NULL,
    company_id uuid,
    requires_test boolean DEFAULT true NOT NULL,
    test_id uuid,
    min_test_score integer DEFAULT 80 NOT NULL,
    requires_files boolean DEFAULT true NOT NULL,
    min_files integer DEFAULT 1 NOT NULL,
    requires_comment boolean DEFAULT true NOT NULL,
    instructions text,
    reinforced_instructions text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: career_step_submission_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_step_submission_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name text,
    file_size integer,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: career_step_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_step_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    template_id uuid NOT NULL,
    step_order integer NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    attempt_no integer DEFAULT 1 NOT NULL,
    is_reinforced boolean DEFAULT false NOT NULL,
    comment text,
    test_attempt_id uuid,
    status text DEFAULT 'pending_review'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT career_step_submissions_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: career_track_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_track_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    from_position_id uuid,
    to_position_id uuid,
    title text NOT NULL,
    description text,
    motivation_text text,
    estimated_months integer,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: closed_question_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.closed_question_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    position_id uuid,
    title text NOT NULL,
    description text,
    source_file_url text,
    source_file_name text,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_currency_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_currency_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    currency_name text DEFAULT 'Монеты'::text NOT NULL,
    currency_icon text DEFAULT '🪙'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_onboarding_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_onboarding_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    auto_assign_tests boolean DEFAULT true NOT NULL,
    auto_assign_tracks boolean DEFAULT true NOT NULL,
    welcome_bonus_enabled boolean DEFAULT true NOT NULL,
    welcome_bonus_amount integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_name text NOT NULL,
    skill_value integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT competencies_skill_value_check CHECK (((skill_value >= 0) AND (skill_value <= 100)))
);


--
-- Name: currency_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT currency_balances_balance_check CHECK ((balance >= 0))
);


--
-- Name: currency_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    amount integer NOT NULL,
    kind text NOT NULL,
    reference_id uuid,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT currency_transactions_kind_check CHECK ((kind = ANY (ARRAY['earn_event'::text, 'earn_reward'::text, 'purchase'::text, 'refund'::text, 'manual'::text, 'adjustment'::text])))
);


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    headcount integer,
    source text DEFAULT 'landing'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    parent_id uuid,
    head_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: email_domain_position_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_domain_position_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    email_domain text NOT NULL,
    position_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_career_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_career_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid NOT NULL,
    template_id uuid NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    personal_motivation text,
    status text DEFAULT 'active'::text NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    position_id uuid,
    department text,
    requested_role text DEFAULT 'employee'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid NOT NULL,
    claimed_user_id uuid,
    claimed_at timestamp with time zone,
    token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token_hash text
);


--
-- Name: employee_questionnaire_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_questionnaire_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    questionnaire_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size integer,
    file_type text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_questionnaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_questionnaires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    position_id uuid,
    other_position_title text,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    skill_gaps jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_interpretation jsonb,
    submitted_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    next_update_due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid NOT NULL,
    reward_type_id uuid NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL,
    awarded_by uuid,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_risk_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_risk_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    attrition_risk integer DEFAULT 0 NOT NULL,
    burnout_risk integer DEFAULT 0 NOT NULL,
    engagement_score integer DEFAULT 50 NOT NULL,
    risk_level text DEFAULT 'low'::text NOT NULL,
    factors jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommendations jsonb DEFAULT '[]'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_risk_scores_attrition_risk_check CHECK (((attrition_risk >= 0) AND (attrition_risk <= 100))),
    CONSTRAINT employee_risk_scores_burnout_risk_check CHECK (((burnout_risk >= 0) AND (burnout_risk <= 100))),
    CONSTRAINT employee_risk_scores_engagement_score_check CHECK (((engagement_score >= 0) AND (engagement_score <= 100))),
    CONSTRAINT employee_risk_scores_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: gamification_reward_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamification_reward_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    title text NOT NULL,
    description text,
    category text DEFAULT 'achievement'::text NOT NULL,
    icon text DEFAULT 'award'::text,
    points integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reward_kind text DEFAULT 'achievement'::text NOT NULL,
    image_url text,
    trigger_mode text DEFAULT 'manual'::text NOT NULL,
    trigger_events jsonb DEFAULT '[]'::jsonb NOT NULL,
    gift_content text,
    non_monetary_title text,
    non_monetary_description text,
    monetary_amount numeric(12,2),
    monetary_currency text DEFAULT 'RUB'::text
);


--
-- Name: goal_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    text text NOT NULL,
    is_done boolean DEFAULT false NOT NULL,
    deadline date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: hr_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_type text NOT NULL,
    title text NOT NULL,
    description text,
    file_url text,
    file_name text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    extracted_data jsonb,
    scenario_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT hr_documents_document_type_check CHECK ((document_type = ANY (ARRAY['talent_management'::text, 'hr_strategy'::text, 'motivation_strategy'::text]))),
    CONSTRAINT hr_documents_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: hr_task_assignees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_task_assignees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    individual_status text DEFAULT 'open'::text NOT NULL,
    reward_paid boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_task_assignees_individual_status_check CHECK ((individual_status = ANY (ARRAY['open'::text, 'in_review'::text, 'completed'::text, 'rejected'::text])))
);


--
-- Name: hr_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'collaboration'::text NOT NULL,
    reward_coins integer DEFAULT 0 NOT NULL,
    deadline date,
    status text DEFAULT 'open'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_tasks_reward_coins_check CHECK ((reward_coins >= 0)),
    CONSTRAINT hr_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    notification_type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['info'::text, 'reward'::text, 'assignment'::text, 'system'::text, 'career_track'::text, 'career_step_passed'::text, 'career_step_failed'::text, 'test_assigned'::text, 'new_employee'::text])))
);


--
-- Name: peer_recognition_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_recognition_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recognition_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: peer_recognitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_recognitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    category text DEFAULT 'thanks'::text NOT NULL,
    message text NOT NULL,
    coin_reward integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT peer_recognitions_coin_reward_check CHECK (((coin_reward >= 0) AND (coin_reward <= 500)))
);


--
-- Name: position_career_paths; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.position_career_paths (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_position_id uuid NOT NULL,
    to_position_id uuid NOT NULL,
    strategy_description text,
    requirements jsonb DEFAULT '[]'::jsonb,
    estimated_months integer,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    department text,
    psychological_profile jsonb DEFAULT '{}'::jsonb,
    competency_profile jsonb DEFAULT '[]'::jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    profile_status text DEFAULT 'draft'::text NOT NULL,
    profile_version integer DEFAULT 1 NOT NULL,
    profile_template jsonb DEFAULT '{}'::jsonb NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone
);


--
-- Name: pricing_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    phone text,
    plan text NOT NULL,
    headcount integer,
    message text,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    source text DEFAULT 'pricing_page'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_inquiries_plan_check CHECK ((plan = ANY (ARRAY['cloud'::text, 'on_premise'::text]))),
    CONSTRAINT pricing_inquiries_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    "position" text DEFAULT ''::text,
    department text DEFAULT ''::text,
    avatar_url text,
    hire_date date,
    overall_score integer DEFAULT 0,
    role_readiness integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    requested_role text DEFAULT 'employee'::text NOT NULL,
    position_id uuid,
    company_id uuid,
    pending_position_id uuid
);


--
-- Name: shop_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_cart_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: shop_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL,
    subtotal integer NOT NULL,
    product_title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: shop_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    total_amount integer NOT NULL,
    status text DEFAULT 'pending_fulfillment'::text NOT NULL,
    cancel_reason text,
    fulfilled_by uuid,
    fulfilled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_orders_status_check CHECK ((status = ANY (ARRAY['pending_fulfillment'::text, 'fulfilled'::text, 'cancelled'::text])))
);


--
-- Name: shop_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    price integer NOT NULL,
    image_url text,
    stock integer,
    max_per_user integer,
    max_per_period integer,
    period_kind text DEFAULT 'none'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_products_description_check CHECK ((char_length(description) <= 200)),
    CONSTRAINT shop_products_period_kind_check CHECK ((period_kind = ANY (ARRAY['none'::text, 'month'::text, 'quarter'::text, 'year'::text]))),
    CONSTRAINT shop_products_price_check CHECK ((price > 0))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    admin_response text,
    responded_by uuid,
    responded_at timestamp with time zone,
    ai_suggestion text
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    manager_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid NOT NULL,
    test_id uuid,
    test_source text DEFAULT 'hrd'::text NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    competency_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.achievements (id, user_id, title, description, achievement_date, icon, created_at, company_id) FROM stdin;
519f0f6f-3934-4c4b-a712-fd3b58fdb28f	26c99015-c462-4057-950a-64bb9e988226	Завершил курс по TypeScript	Получил сертификат с отличием	2026-04-08	award	2026-04-08 18:29:54.783337+00	\N
6cdfc979-a08a-4677-945c-e6722b316aa1	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Уволил одного	вчера	2026-04-20	award	2026-04-20 15:13:22.632698+00	\N
\.


--
-- Data for Name: assessment_scenarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assessment_scenarios (id, title, description, scenario_data, file_url, created_by, is_active, created_at, updated_at, company_id) FROM stdin;
bd4bc832-d969-4381-aa71-55b19d122bac	ПОлитика _по_управлению талантами.docx		{"title": "Сценарий оценки кандидата на позицию 'Менеджер по развитию продуктов' на основе Политики по управлению талантами", "questions": [{"criteria": "Понимание терминологии Talent Management, опыт работы с его компонентами (привлечение, развитие, удержание, оценка), способность приводить примеры из личного опыта. Отражение понимания связи управления талантами с бизнес-целями.", "question": "Опишите ваш опыт работы с концепцией управления талантами (Talent Management). Как вы понимаете ее ключевые элементы и практическое применение?", "max_score": 10}, {"criteria": "Наличие конкретного примера. Описание применяемых стратегий привлечения/развития. Оценка личностного вклада и результата. Способность к самоанализу и извлечению уроков.", "question": "Приведите пример ситуации, когда вам удалось успешно привлечь или развить высокопотенциального сотрудника. Какие методы и подходы вы использовали?", "max_score": 10}, {"criteria": "Понимание важности культуры. Предложение конкретных инициатив и подходов (менторство, коучинг, кросс-функциональное взаимодействие, программы обучения). Способность мотивировать и вовлекать других.", "question": "Как вы видите свою роль в создании культуры, способствующей обмену знаниями, развитию лидерства и постоянному обучению в команде?", "max_score": 10}, {"criteria": "Знание и понимание различных методов оценки (KPI, 360 градусов, Performance Review, потенциал и т.д.). Обоснование выбора методов. Способность использовать результаты оценки для развития сотрудников.", "question": "Как вы подходите к оценке производительности и потенциала сотрудников? Какие инструменты или методики вы предпочитаете использовать, чтобы выявить 'таланты' в команде?", "max_score": 10}, {"criteria": "Понимание понятия 'преемственность'. Предложение конкретных механизмов (идентификация преемников, создание индивидуальных планов развития, ротация). Способность видеть долгосрочную перспективу.", "question": "В 'Политике по управлению талантами' подчеркивается важность 'преемственности'. Как бы вы обеспечили создание кадрового резерва и преемственность на ключевых позициях внутри вашей зоны ответственности?", "max_score": 10}, {"criteria": "Понимание ключевых факторов удержания (мотивация, развитие, компенсация, культура). Предложение конкретных стратегий (индивидуальный подход, гибкие условия, программы признания).", "question": "Как вы считаете, какие факторы наиболее сильно влияют на удержание 'ключевых' сотрудников в компании? Какие меры вы бы предприняли для их удержания?", "max_score": 10}, {"criteria": "Демонстрация понимания ценности обратной связи. Умение давать конструктивную обратную связь. Способность воспринимать и использовать обратную связь для собственного развития.", "question": "Как вы относитесь к обратной связи? Приведите пример, когда вы давали сложную обратную связь сотруднику и какой был результат. Как вы сами работаете с обратной связью?", "max_score": 10}, {"criteria": "Демонстрация приверженности к саморазвитию и непрерывному обучению. Наличие конкретных примеров применения новых знаний.", "question": "Как вы поддерживаете свои и развиваете компетенции? Приведите пример, как вы применяли новые знания/навыки для решения рабочих задач.", "max_score": 10}], "description": "Данный сценарий предназначен для оценки кандидатов на руководящие или ключевые экспертные позиции, в частности, 'Менеджера по развитию продуктов', с фокусом на соответствие компетенциям, ценностям компании и потенциалу развития, согласно 'Политике по управлению талантами'.", "competencies": ["Стратегическое мышление", "Развитие сотрудников", "Лидерство", "Управление изменениями", "Инициативность", "Коммуникация", "Управление эффективностью", "Принятие решений", "Саморазвитие"]}	\N	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	t	2026-04-13 08:27:49.941136+00	2026-04-13 08:27:49.941136+00	\N
32ed9ac5-76aa-4e83-9e1c-4698e864dc16	Оценка вовлеченности и мотивации персонала в соответствии с Политикой вознаграждения	Данный сценарий предназначен для оценки понимания сотрудниками политики вознаграждения, их соответствия ее принципам, а также выявления уровня мотивации и удовлетворенности системой вознаграждения. Оценка проводится в формате структурированных вопросов, позволяющих опередить степень вовлеченности персонала и его готовность к развитию в рамках компании. Результаты оценки могут быть использованы для корректировки мотивационных программ и повышения эффективности HR-стратегии.	{"title": "Оценка вовлеченности и мотивации персонала в соответствии с Политикой вознаграждения", "questions": [{"criteria": "Оценка глубины понимания сотрудником целей политики вознаграждения, выявление конкретных примеров или предложений по улучшению.", "question": "Как, по вашему мнению, текущая система вознаграждения компании способствует привлечению и удержанию высококвалифицированных сотрудников?", "max_score": 10}, {"criteria": "Способность сотрудника аргументировать свою позицию, выявление уровня удовлетворенности и наличия конструктивных предложений по повышению справедливости.", "question": "Насколько справедливо, по вашей оценке, распределяется переменная часть вознаграждения (премии, бонусы), учитывая ваши личные достижения и вклад в командные цели?", "max_score": 10}, {"criteria": "Оценка понимания сотрудником связи между квалификацией/развитием и вознаграждением. Выявление потребностей в обучении и развитии для увеличения потенциала.", "question": "Как вы считаете, насколько полно система вознаграждения учитывает ваш профессиональный опыт, квалификацию и развитие компетенций?", "max_score": 10}, {"criteria": "Оценка осведомленности сотрудника о предоставляемом социальном пакете и его значимости для личной мотивации.", "question": "Какие элементы социального пакета (ДМС, обучение, корпоративные мероприятия) вы считаете наиболее ценными для себя и почему?", "max_score": 5}, {"criteria": "Выявление нефинансовых мотиваторов, оценка соответствия ценностей сотрудника корпоративной культуре.", "question": "Какие факторы (помимо финансового вознаграждения) являются для вас ключевыми в мотивации к эффективной работе и развитию в компании?", "max_score": 10}, {"criteria": "Оценка лидерских качеств, стратегического мышления и способности применять принципы политики на практике.", "question": "Представьте, что вы руководитель подразделения. Как бы вы использовали Политику вознаграждения для мотивации своей команды и достижения стратегических целей компании?", "max_score": 10}, {"criteria": "Оценка критического мышления, инициативности и способности генерировать конструктивные идеи. Анализ соответствия предложений целям и принципам политики.", "question": "Какие изменения или дополнения вы бы предложили внести в текущую Политику вознаграждения, чтобы сделать ее более эффективной и конкурентоспособной?", "max_score": 15}], "description": "Данный сценарий предназначен для оценки понимания сотрудниками политики вознаграждения, их соответствия ее принципам, а также выявления уровня мотивации и удовлетворенности системой вознаграждения. Оценка проводится в формате структурированных вопросов, позволяющих опередить степень вовлеченности персонала и его готовность к развитию в рамках компании. Результаты оценки могут быть использованы для корректировки мотивационных программ и повышения эффективности HR-стратегии.", "competencies": ["Понимание корпоративных политик", "Мотивация и вовлеченность", "Аналитическое мышление", "Коммуникативные навыки", "Принятие решений", "Стратегическое мышление", "Инновационность"]}	\N	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	t	2026-04-13 08:47:10.502996+00	2026-04-13 08:47:10.502996+00	\N
1ed87fc6-d1d8-4ea6-8455-45d9c544feba	ПОлитика _по_управлению талантами.docx		{"title": "Сценарий комплексной оценки сотрудника на основе Политики по управлению талантами", "questions": [{"criteria": "Соответствие KPI, качество выполнения задач, сроки выполнения, проактивность, самостоятельность в решении проблем.", "question": "Оцените, насколько текущие результаты сотрудника соотносятся с поставленными целями и KPI. Приведите конкретные примеры проектов или задач, где сотрудник проявил себя наилучшим образом, и те, где были сложности.", "max_score": 10}, {"criteria": "Навыки коммуникации, командная работа, конфликтность, инициативность в общении, способность к конструктивной критике.", "question": "Как сотрудник взаимодействует с коллегами, руководителями и подчиненными? Опишите примеры эффективного и неэффективного взаимодействия.", "max_score": 10}, {"criteria": "Соответствие профессиональным и корпоративным компетенциям, способность к обучению, применение новых знаний, инновационный подход.", "question": "Какие компетенции, указанные в профиле должности, сотрудник демонстрирует на высоком уровне? Какие компетенции требуют развития? Приведите конкретные примеры.", "max_score": 10}, {"criteria": "Инициативность, инновационное мышление, принятие решений, готовность брать на себя ответственность, влияние на бизнес-процессы.", "question": "Какие инициативы или предложения сотрудник внедрял/выдвигал в своей работе за последний период? Насколько они были эффективны?", "max_score": 10}, {"criteria": "Релевантность предложений, реалистичность, учитывание интересов сотрудника и стратегических целей компании, потенциал для горизонтального/вертикального роста.", "question": "Предложите не менее трех вариантов развития для данного сотрудника (например, обучение, участие в проектах, наставничество). Обоснуйте свой выбор, исходя из его потенциала и потребностей компании.", "max_score": 10}, {"criteria": "Конструктивность обратной связи, фокусировка на развитии, мотивационный аспект, конкретность и адресность.", "question": "Какую обратную связь вы бы дали сотруднику по итогам его работы за последний период, чтобы мотивировать его к дальнейшему развитию и достижению более высоких результатов?", "max_score": 5}, {"criteria": "Гибкость, адаптивность, стрессоустойчивость, открытость к новому, принятие изменений.", "question": "Как сотрудник относится к изменениям в компании и внешнему рынку? Может ли он быстро адаптироваться к новым условиям?", "max_score": 5}, {"criteria": "Четкость обоснования соответствия критериям категорий талантов, наличие примеров.", "question": "Насколько сотрудник соответствует критериям категории 'HiPo', 'HiPer' или 'Ключевой специалист' в соответствии с Политикой по управлению талантами? Обоснуйте ваш выбор.", "max_score": 10}], "description": "Данный сценарий предназначен для проведения комплексной оценки сотрудника с целью выявления его потенциала, определения потребностей в развитии и планирования дальнейшего карьерного роста в соответствии с «Политикой по управлению талантами». Оценка проводится регулярно, не реже одного раза в год, и основывается на принципах объективности, открытости и взаимной ответственности.", "competencies": ["Профессиональная компетентность", "Эффективность коммуникаций", "Командная работа", "Инициативность и инновационность", "Принятие решений и ответственность", "Ориентация на результат", "Адаптивность и гибкость", "Потенциал к развитию"]}	\N	856bd219-bc77-4d90-980d-2e1f3f105851	t	2026-04-14 11:41:11.654804+00	2026-04-14 11:41:11.654804+00	a0000000-0000-0000-0000-000000000001
e44b0df5-77e8-4d8b-836c-f35ac3af2958	Сценарий оценки сотрудника: Эффективность и Адаптивность в Цифровой HR-Трансформации	Данный сценарий предназначен для оценки эффективности сотрудников в контексте реализации новой HR-стратегии, с акцентом на их адаптивность к цифровым инструментам, способность к развитию и вклад в создание поддерживающей корпоративной культуры. Оценка проводится в формате полуструктурированного интервью с элементами самооценки и оценки 360 градусов.	{"title": "Сценарий оценки сотрудника: Эффективность и Адаптивность в Цифровой HR-Трансформации", "questions": [{"criteria": "Оценка: 0-3 балла за каждый используемый инструмент (не используются/используются формально/используются регулярно/используются для оптимизации). 0-4 балла за конкретные примеры и объяснения (отсутствуют/поверхностные/удовлетворительные/детальные и вдохновляющие).", "question": "Как вы использовали новые цифровые HR-инструменты (например, платформы для обучения, системы управления проектами, аналитические дашборды) в своей работе за последний год? Приведите конкретные примеры и опишите, как они помогли вам повысить эффективность.", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за инициативность и проактивность. 0-4 балла за описание процесса обучения и адаптации. 0-3 балла за достигнутые результаты и их влияние на работу/команду.", "question": "Опишите ситуацию, когда вам потребовалось быстро освоить новый навык или адаптироваться к изменяющимся требованиям работы. Какие шаги вы предприняли для этого, и каков был результат?", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за понимание принципов инклюзивности. 0-4 балла за конкретные примеры инициатив/действий. 0-3 балла за видимое влияние на командную динамику и вовлеченность.", "question": "Как вы способствуете созданию инклюзивной и поддерживающей рабочей среды в вашей команде? Приведите примеры ваших действий и их влияния.", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за демонстрацию инициативы. 0-4 балла за описание лидерских действий (наставничество, координация, мотивация). 0-3 балла за достигнутый результат и признание со стороны коллег.", "question": "Расскажите о проекте или задаче, где вам пришлось проявить лидерские качества, даже если вы не занимаете формальную руководящую должность. Что было вашей ролью и каким был результат?", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за регулярность и качество обратной связи. 0-4 балла за демонстрацию активного слушания и конструктивной обратной связи. 0-3 балла за примеры изменений в поведении/работе на основе обратной связи.", "question": "Какую обратную связь (как позитивную, так и развивающую) вы давали или получали за последний год? Как вы использовали эту обратную связь для профессионального роста?", "max_score": 10}], "description": "Данный сценарий предназначен для оценки эффективности сотрудников в контексте реализации новой HR-стратегии, с акцентом на их адаптивность к цифровым инструментам, способность к развитию и вклад в создание поддерживающей корпоративной культуры. Оценка проводится в формате полуструктурированного интервью с элементами самооценки и оценки 360 градусов.", "competencies": ["Адаптивность и гибкость", "Обучаемость и развитие", "Использование цифровых инструментов", "Лидерство и влияние", "Коллаборация и инклюзивность", "Проактивность и инициативность", "Управление производительностью"]}	\N	856bd219-bc77-4d90-980d-2e1f3f105851	t	2026-04-14 11:43:25.82628+00	2026-04-14 11:43:25.82628+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: assessments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assessments (id, user_id, assessment_type, score, change_value, assessment_data, created_at, company_id) FROM stdin;
029e5a81-0da2-40d1-90c8-15ab9703e0b0	8b990271-2396-4c2b-89a2-2c6851a93130	ai	100	\N	{"summary": "Вы продемонстрировали исключительный уровень владения всеми ключевыми компетенциями. Ваши ответы свидетельствуют о глубоком понимании процессов, умении действовать в критических ситуациях и способности вести за собой команду, достигая результатов, превосходящих ожидания. Вы обладаете потенциалом стратегического лидера мирового масштаба.", "strengths": ["Абсолютная уверенность в принятии решений любой сложности.", "Способность сохранять продуктивность в условиях глобальной неопределенности.", "Безупречные навыки убеждения и коммуникации на высшем уровне.", "Мастерство управления ресурсами и рисками."], "competencies": [{"skill_name": "Лидерство", "skill_value": 100}, {"skill_name": "Технические навыки", "skill_value": 100}, {"skill_name": "Коммуникация", "skill_value": 100}, {"skill_name": "Аналитика", "skill_value": 100}, {"skill_name": "Управление проектами", "skill_value": 100}, {"skill_name": "Адаптивность", "skill_value": 100}], "growth_areas": ["Поиск новых, еще более масштабных вызовов, соответствующих вашему уровню влияния.", "Тиражирование вашего уникального опыта на всю индустрию через менторство высшего уровня."], "overall_score": 100}	2026-04-17 07:31:05.624231+00	\N
642f5b5c-d68d-429d-bc45-3173a50862a4	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	ai	88	\N	{"summary": "Пользователь продемонстрировал исключительное знание теоретических основ менеджмента, аналитики и проектного управления. Вместо субъективных ответов был сделан акцент на поиске эталонных бизнес-практик. Это свидетельствует о высоком интеллекте, умении быстро находить лучшие решения на рынке и стремлении к совершенству (перфекционизме). Для дальнейшего карьерного роста рекомендуется больше внимания уделять развитию личного бренда и демонстрации практических кейсов из собственной практики.", "strengths": ["Глубокое понимание профессиональных стандартов и методологий.", "Высокая системность мышления и умение структурировать информацию.", "Ориентация на результат и поиск максимально эффективных решений.", "Настойчивость и умение следовать выбранной стратегии."], "competencies": [{"skill_name": "Лидерство", "skill_value": 85}, {"skill_name": "Технические навыки (Теория)", "skill_value": 90}, {"skill_name": "Коммуникация", "skill_value": 80}, {"skill_name": "Аналитика и логика", "skill_value": 95}, {"skill_name": "Управление проектами", "skill_value": 90}, {"skill_name": "Адаптивность", "skill_value": 85}], "growth_areas": ["Переход от теоретических моделей к практическому применению собственного опыта.", "Развитие аутентичного стиля лидерства (не только «как правильно», но и «как я это делаю»).", "Готовность проявлять уязвимость и рассказывать о собственных ошибках для извлечения уроков."], "overall_score": 88}	2026-04-17 08:39:06.342103+00	\N
679679d1-141e-4d14-9c94-1916999e6a6f	8b990271-2396-4c2b-89a2-2c6851a93130	closed_test_ai	25	\N	{"title": "Тест: Менеджер проекта", "breakdown": [{"score": 67, "total": 3, "competency": "Коммуникация"}, {"score": 0, "total": 3, "competency": "Аналитическое мышление"}, {"score": 0, "total": 2, "competency": "Командная работа"}, {"score": 50, "total": 2, "competency": "Решение проблем"}, {"score": 0, "total": 2, "competency": "Адаптивность"}]}	2026-04-18 22:14:58.339942+00	a0000000-0000-0000-0000-000000000001
09489dd6-0896-491b-ac98-edba5d50ad63	8b990271-2396-4c2b-89a2-2c6851a93130	closed_test_ai	75	\N	{"title": "Тест: Менеджер проекта", "breakdown": [{"score": 50, "total": 2, "competency": "Коммуникация"}, {"score": 33, "total": 3, "competency": "Аналитическое мышление"}, {"score": 100, "total": 3, "competency": "Командная работа"}, {"score": 100, "total": 2, "competency": "Решение проблем"}, {"score": 100, "total": 2, "competency": "Адаптивность"}]}	2026-04-18 22:56:47.952328+00	a0000000-0000-0000-0000-000000000001
6fc62b41-ccc8-42bb-a82b-0ecda6e76e10	2356547d-926a-41e6-9159-f258d1b05f2e	closed_test_ai	100	\N	{"title": "Тест: Сотрудник", "breakdown": [{"score": 100, "total": 3, "competency": "Командная работа"}, {"score": 100, "total": 2, "competency": "Коммуникация"}, {"score": 100, "total": 3, "competency": "Решение проблем"}, {"score": 100, "total": 2, "competency": "Адаптивность"}, {"score": 100, "total": 2, "competency": "Аналитическое мышление"}]}	2026-04-20 14:13:02.06529+00	a0000000-0000-0000-0000-000000000001
3f8d0662-12de-4e6e-b848-05fe5f9c4c6d	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	closed_test_ai	33	\N	{"title": "Тест: Сотрудник", "breakdown": [{"score": 0, "total": 3, "competency": "Коммуникация"}, {"score": 33, "total": 3, "competency": "Аналитическое мышление"}, {"score": 50, "total": 2, "competency": "Командная работа"}, {"score": 50, "total": 2, "competency": "Решение проблем"}, {"score": 50, "total": 2, "competency": "Адаптивность"}]}	2026-04-20 15:11:15.303643+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: career_goals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_goals (id, user_id, title, description, status, progress, deadline, created_at, updated_at, company_id, assignment_id, step_order, auto_generated) FROM stdin;
b8a2a5ef-30f7-4b39-8020-2d3091a70467	26c99015-c462-4057-950a-64bb9e988226	Изучить React Advanced Patterns	Пройти курс и применить на проекте	in_progress	50	\N	2026-04-08 18:27:57.891228+00	2026-04-08 18:28:59.960494+00	\N	\N	\N	f
513f5008-7d13-468f-9617-c1e2bd3433d9	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	суперруководитель суперотдела	\N	in_progress	0	2026-04-20	2026-04-18 21:35:44.728495+00	2026-04-18 21:35:44.728495+00	\N	\N	\N	f
5479fddf-608b-49e3-a83a-2e8261c004b8	8b990271-2396-4c2b-89a2-2c6851a93130	Изучить регламенты и инструменты целевой роли	Цель этапа: Адаптация и базовые знания	in_progress	0	2026-09-18	2026-04-18 23:51:03.220425+00	2026-04-18 23:51:03.220425+00	a0000000-0000-0000-0000-000000000001	5c7ad79c-317c-47a0-bd3f-002d11702ec7	0	t
32edda79-d35a-4c3a-b20e-c9846c7dd938	8b990271-2396-4c2b-89a2-2c6851a93130	Сдать вводный тест	Цель этапа: Адаптация и базовые знания	in_progress	0	2026-09-18	2026-04-18 23:51:03.220425+00	2026-04-18 23:51:03.220425+00	a0000000-0000-0000-0000-000000000001	5c7ad79c-317c-47a0-bd3f-002d11702ec7	0	t
3245617f-d845-45f9-8c92-0bb64e507703	8b990271-2396-4c2b-89a2-2c6851a93130	Познакомиться с командой и зонами ответственности	Цель этапа: Адаптация и базовые знания	in_progress	0	2026-09-18	2026-04-18 23:51:03.220425+00	2026-04-18 23:51:03.220425+00	a0000000-0000-0000-0000-000000000001	5c7ad79c-317c-47a0-bd3f-002d11702ec7	0	t
7d415f9e-3c45-4858-b7ca-f2dd2e50ccfc	2356547d-926a-41e6-9159-f258d1b05f2e	Тест	Тест	in_progress	0	2026-04-24	2026-04-20 14:14:08.819991+00	2026-04-20 14:14:08.819991+00	\N	\N	\N	f
fcf11685-463c-4fc5-b43e-1c5d8fa8a57c	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	уволить всех	рлюыстрее	in_progress	0	2026-04-24	2026-04-20 15:12:12.059916+00	2026-04-20 15:12:12.059916+00	\N	\N	\N	f
\.


--
-- Data for Name: career_level_actions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_level_actions (id, template_id, action_text, action_order, is_required, category, created_at) FROM stdin;
\.


--
-- Data for Name: career_step_scenarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_step_scenarios (id, template_id, step_order, company_id, requires_test, test_id, min_test_score, requires_files, min_files, requires_comment, instructions, reinforced_instructions, created_at, updated_at) FROM stdin;
c8e0c45d-dd1a-4115-a6e5-3e4375633c5b	ef612712-7989-4e25-85ce-ed3978395dcf	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
b82be2e0-c3bd-4429-afaf-a10abb100268	ef612712-7989-4e25-85ce-ed3978395dcf	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
8c078d80-fae0-40cb-a803-7451702bca40	ef612712-7989-4e25-85ce-ed3978395dcf	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
4986738b-4279-4f61-a19c-af80b81df610	ef612712-7989-4e25-85ce-ed3978395dcf	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
630b2c3e-3657-44b4-8cc1-473926e9103c	f1a58309-c4cf-4ae0-8106-b210e7886514	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
0d2c8e57-0a50-45eb-8df2-2d75f9753f66	f1a58309-c4cf-4ae0-8106-b210e7886514	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
3af4da45-a5e8-44a2-bc2d-432f791c9365	f1a58309-c4cf-4ae0-8106-b210e7886514	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
2fbbdb9f-56ec-45d0-9f98-d86ca26accd5	f1a58309-c4cf-4ae0-8106-b210e7886514	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
b8c24233-9aad-4dbd-b1ac-1f9bda0144af	9d2099b2-9cc8-40da-bab3-2fb055ae95aa	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
4d28584c-2414-4c4b-8790-799557220c28	9d2099b2-9cc8-40da-bab3-2fb055ae95aa	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
caa1ba82-e053-4e90-b647-89d20e5fc4ab	9d2099b2-9cc8-40da-bab3-2fb055ae95aa	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
adde3f2a-0aa4-4122-bddb-fe0152788d60	9d2099b2-9cc8-40da-bab3-2fb055ae95aa	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
0b5ccd77-ac7f-4811-99a4-2d0f8ed7d015	6f7f31d4-2aed-48cd-916f-5b2bdb6be57d	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
9b518022-6105-4e80-9e6d-4035f9d4085a	6f7f31d4-2aed-48cd-916f-5b2bdb6be57d	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
b0d79065-2cad-455b-b5dd-b7cbc5c75f97	6f7f31d4-2aed-48cd-916f-5b2bdb6be57d	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
d37e7ca2-9f19-4ce3-b1c7-0bfa66657076	6f7f31d4-2aed-48cd-916f-5b2bdb6be57d	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
0c7d545f-8c87-4b9c-81bf-09f494e801d4	8acf5a2c-c553-41dc-8cb8-3529811bd4f8	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
4c7acdd4-db02-46a5-9769-4526a8ca27d3	8acf5a2c-c553-41dc-8cb8-3529811bd4f8	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
444b0ba5-5f21-4e3f-ae9b-59fd59c65372	8acf5a2c-c553-41dc-8cb8-3529811bd4f8	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
f120c470-82b6-450f-91a8-3feb2b0729d2	8acf5a2c-c553-41dc-8cb8-3529811bd4f8	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
b2dba29d-6753-4572-b56e-00fad1f2736a	b3034c39-e395-490a-a339-354907c6514d	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
ed5ed93c-b747-42bb-879c-d329b2a92c05	b3034c39-e395-490a-a339-354907c6514d	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
c8aa417d-d82c-432e-945a-4962436c4230	b3034c39-e395-490a-a339-354907c6514d	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
f0d7807b-b0f4-4671-91ba-25d21265aa4d	b3034c39-e395-490a-a339-354907c6514d	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
962962f7-63ff-42ee-8d56-0bd44122a0da	8cef2a06-d80b-475d-bb7b-7a5c0ef2fd91	0	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Адаптация и базовые знания" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Адаптация и базовые знания": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
93d41be7-35dd-4321-bb49-e0235de4780e	8cef2a06-d80b-475d-bb7b-7a5c0ef2fd91	1	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Освоение функций целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Освоение функций целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
6a52ab63-7fdf-430e-a9c9-62ac2ce607ab	8cef2a06-d80b-475d-bb7b-7a5c0ef2fd91	2	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Расширение зоны ответственности" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Расширение зоны ответственности": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
571b5128-1e54-4dab-996e-43b13fbe456c	8cef2a06-d80b-475d-bb7b-7a5c0ef2fd91	3	a0000000-0000-0000-0000-000000000001	t	\N	80	t	1	t	Для подтверждения этапа "Готовность к целевой роли" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.	Усиленный сценарий повторного прохождения этапа "Готовность к целевой роли": пройдите тест ещё раз (≥85%), загрузите минимум 2 подтверждающих файла и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.	2026-04-18 23:43:16.796059+00	2026-04-18 23:43:16.796059+00
\.


--
-- Data for Name: career_step_submission_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_step_submission_files (id, submission_id, file_url, file_name, file_size, uploaded_at) FROM stdin;
\.


--
-- Data for Name: career_step_submissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_step_submissions (id, assignment_id, template_id, step_order, user_id, company_id, attempt_no, is_reinforced, comment, test_attempt_id, status, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_track_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.career_track_templates (id, company_id, from_position_id, to_position_id, title, description, motivation_text, estimated_months, steps, is_active, created_by, created_at, updated_at) FROM stdin;
ef612712-7989-4e25-85ce-ed3978395dcf	a0000000-0000-0000-0000-000000000001	9ccff0aa-8e21-4f90-8da1-2bad3791a05a	107611ad-bc75-4db1-9194-c98e7bf63dfc	Менеджер по продажам → Линейный руководитель	Базовый карьерный трек: рост от менеджера по продажам до линейного руководителя коммерческого блока.	Развивайте лидерские навыки и наставничество — следующий шаг это управление командой продаж.	18	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Менеджер по продажам» к должности «Линейный руководитель».", "duration_months": 5, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 5, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 5, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 5, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
f1a58309-c4cf-4ae0-8106-b210e7886514	a0000000-0000-0000-0000-000000000001	5cd4eb9a-90d9-4829-80ee-419ec03a7bcb	107611ad-bc75-4db1-9194-c98e7bf63dfc	Менеджер проекта → Линейный руководитель	Базовый карьерный трек: переход от управления проектами к управлению командой/направлением.	Усиливайте навыки управления людьми и стратегического планирования.	18	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Менеджер проекта» к должности «Линейный руководитель».", "duration_months": 5, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 5, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 5, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 5, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
9d2099b2-9cc8-40da-bab3-2fb055ae95aa	a0000000-0000-0000-0000-000000000001	583fd82b-21bf-4f84-82be-ca7ecd8694ff	107611ad-bc75-4db1-9194-c98e7bf63dfc	Специалист тех. поддержки → Линейный руководитель	Базовый карьерный трек: рост от технического специалиста до руководителя группы поддержки.	Углубляйте экспертизу и берите на себя координацию команды.	24	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Специалист технической поддержки» к должности «Линейный руководитель».", "duration_months": 6, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 6, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 6, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 6, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
6f7f31d4-2aed-48cd-916f-5b2bdb6be57d	a0000000-0000-0000-0000-000000000001	cf62e14d-f1fa-43e6-b2f7-8d45709779a9	107611ad-bc75-4db1-9194-c98e7bf63dfc	HR-специалист → Линейный руководитель	Базовый карьерный трек: переход от HR-специалиста к руководителю HR-направления.	Расширяйте зону ответственности и развивайте управленческие компетенции.	18	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «HR-специалист» к должности «Линейный руководитель».", "duration_months": 5, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 5, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 5, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 5, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
8acf5a2c-c553-41dc-8cb8-3529811bd4f8	a0000000-0000-0000-0000-000000000001	a612b68b-84f5-4743-800b-d27a8e6b469f	107611ad-bc75-4db1-9194-c98e7bf63dfc	Сотрудник бэк-офиса → Линейный руководитель	Базовый карьерный трек: рост от сотрудника бэк-офиса до руководителя группы.	Осваивайте процессы и берите на себя ответственность за команду.	24	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Сотрудник бэк-офиса» к должности «Линейный руководитель».", "duration_months": 6, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 6, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 6, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 6, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
b3034c39-e395-490a-a339-354907c6514d	a0000000-0000-0000-0000-000000000001	40f1195d-ece7-4b98-a790-a28615c51791	107611ad-bc75-4db1-9194-c98e7bf63dfc	Аналитик → Линейный руководитель	Базовый карьерный трек: переход от аналитика к руководителю аналитической команды.	Развивайте лидерство и навык постановки задач.	18	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Аналитик» к должности «Линейный руководитель».", "duration_months": 5, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 5, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 5, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 5, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
8cef2a06-d80b-475d-bb7b-7a5c0ef2fd91	a0000000-0000-0000-0000-000000000001	107611ad-bc75-4db1-9194-c98e7bf63dfc	cd512374-7332-4705-8e29-6904a6c23751	Линейный руководитель → Руководитель	Базовый карьерный трек: переход с линейного управления на уровень руководителя направления.	Стратегическое мышление и масштабирование команды — ключ к следующему шагу.	24	[{"goals": ["Изучить регламенты и инструменты целевой роли", "Сдать вводный тест", "Познакомиться с командой и зонами ответственности"], "order": 0, "title": "Адаптация и базовые знания", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт", "Очки лояльности"], "description": "Освоение базовых знаний, инструментов и регламентов, необходимых для перехода с должности «Линейный руководитель» к должности «Руководитель».", "duration_months": 6, "pass_conditions": ["Завершить онбординг", "Вводный тест ≥ 70%"], "success_metrics": ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"]}, {"goals": ["Выполнить 3 типовые задачи целевой роли", "Получить положительную обратную связь от наставника", "Закрыть профильный мини-тест"], "order": 1, "title": "Освоение функций целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Очки лояльности", "Достижение «Уверенный исполнитель»"], "description": "Самостоятельное выполнение типовых задач целевой должности под наставничеством.", "duration_months": 6, "pass_conditions": ["Закрыть KPI этапа ≥ 80%", "Оценка наставника ≥ 4/5"], "success_metrics": ["KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"]}, {"goals": ["Возглавить мини-проект", "Менторить нового сотрудника", "Принять участие в кросс-функциональной задаче"], "order": 2, "title": "Расширение зоны ответственности", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Достижение «Лидер мини-проекта»", "Очки лояльности", "Публичное признание"], "description": "Решение нестандартных задач, работа в команде, первые управленческие задачи.", "duration_months": 6, "pass_conditions": ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"], "success_metrics": ["Оценка 360° ≥ 4/5", "Успешное завершение мини-проекта"]}, {"goals": ["Пройти финальную ассессмент-сессию", "Подготовить персональный план развития на 6 месяцев", "Защитить кейс перед HRD/руководителем"], "order": 3, "title": "Готовность к целевой роли", "penalty": "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.", "rewards": ["Перевод на целевую должность", "Премия / нематериальная награда", "Достижение «Готов к роли»"], "description": "Подтверждение готовности к целевой должности, финальный ассессмент и план развития.", "duration_months": 6, "pass_conditions": ["Финальный ассессмент ≥ 85%", "Согласование перевода с HRD"], "success_metrics": ["Финальный ассессмент ≥ 85%", "Подтверждение готовности от HRD", "Утверждённый план развития"]}]	t	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-18 22:24:12.622858+00	2026-04-18 23:26:27.495599+00
\.


--
-- Data for Name: closed_question_tests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.closed_question_tests (id, company_id, position_id, title, description, source_file_url, source_file_name, questions, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.companies (id, name, description, logo_url, created_at, updated_at) FROM stdin;
a0000000-0000-0000-0000-000000000001	Компания (по умолчанию)	Автоматически созданная компания	\N	2026-04-13 10:07:23.599728+00	2026-04-13 10:07:23.599728+00
1dcfe3f1-5edc-445c-867d-5d58806510df	ИП Рубан	тестовая компания	\N	2026-05-13 13:34:23.257493+00	2026-05-13 13:34:23.257493+00
\.


--
-- Data for Name: company_currency_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_currency_settings (id, company_id, currency_name, currency_icon, created_at, updated_at) FROM stdin;
bf443dc2-2392-468f-b333-1bf8a9dff4c2	a0000000-0000-0000-0000-000000000001	Монеты	🪙	2026-04-20 07:41:50.339402+00	2026-04-20 07:41:50.339402+00
\.


--
-- Data for Name: company_onboarding_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_onboarding_settings (id, company_id, auto_assign_tests, auto_assign_tracks, welcome_bonus_enabled, welcome_bonus_amount, created_at, updated_at) FROM stdin;
10e2f502-8c74-47b0-9945-2641f9656e37	a0000000-0000-0000-0000-000000000001	t	t	t	100	2026-04-20 08:22:54.202732+00	2026-04-20 08:22:54.202732+00
dcd84577-fda8-4412-9e4e-c51c8c20d1f2	1dcfe3f1-5edc-445c-867d-5d58806510df	t	t	t	100	2026-05-13 13:36:17.89848+00	2026-05-13 13:36:17.89848+00
\.


--
-- Data for Name: competencies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.competencies (id, user_id, skill_name, skill_value, created_at, updated_at, company_id) FROM stdin;
62f23cd2-c102-4bb7-815f-b9bade859344	8b990271-2396-4c2b-89a2-2c6851a93130	Лидерство	100	2026-04-17 07:31:06.212075+00	2026-04-17 07:31:06.212075+00	\N
401b7d52-a9a0-4e14-8534-6945624bb086	8b990271-2396-4c2b-89a2-2c6851a93130	Технические навыки	100	2026-04-17 07:31:06.864652+00	2026-04-17 07:31:06.864652+00	\N
3489fa32-e0c4-493c-9ea5-311144e792d5	8b990271-2396-4c2b-89a2-2c6851a93130	Аналитика	100	2026-04-17 07:31:07.677517+00	2026-04-17 07:31:07.677517+00	\N
25b4ed90-70b5-4388-aab6-97e1f3b3eb3d	8b990271-2396-4c2b-89a2-2c6851a93130	Управление проектами	100	2026-04-17 07:31:08.045695+00	2026-04-17 07:31:08.045695+00	\N
5e9c787b-f660-4e21-9170-8956d829bef8	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Лидерство	85	2026-04-17 08:39:06.766352+00	2026-04-17 08:39:06.766352+00	\N
73dabd0c-23ac-4303-9b5f-46947a4a34df	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Технические навыки (Теория)	90	2026-04-17 08:39:07.129911+00	2026-04-17 08:39:07.129911+00	\N
38410a40-24a3-4f2a-a2b1-34a430f35f67	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Коммуникация	80	2026-04-17 08:39:07.432412+00	2026-04-17 08:39:07.432412+00	\N
2bf87d43-2afd-424f-bc7d-69bae29d503d	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Аналитика и логика	95	2026-04-17 08:39:07.722703+00	2026-04-17 08:39:07.722703+00	\N
e924e146-0720-4e55-b086-7c792f0d6b13	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Управление проектами	90	2026-04-17 08:39:08.051074+00	2026-04-17 08:39:08.051074+00	\N
536d4d2a-f666-48d5-bd42-44442f427928	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	Адаптивность	85	2026-04-17 08:39:08.361852+00	2026-04-17 08:39:08.361852+00	\N
0c60197c-633a-43f5-843a-954f85cbe30f	8b990271-2396-4c2b-89a2-2c6851a93130	Коммуникация	50	2026-04-17 07:31:07.264476+00	2026-04-18 22:56:48.29562+00	\N
1194725e-5285-4bae-8f4b-4e1d193471f0	8b990271-2396-4c2b-89a2-2c6851a93130	Аналитическое мышление	33	2026-04-18 22:14:59.416589+00	2026-04-18 22:56:48.662398+00	a0000000-0000-0000-0000-000000000001
8390d2c7-69e8-46c1-b058-d271554aa341	8b990271-2396-4c2b-89a2-2c6851a93130	Командная работа	100	2026-04-18 22:14:59.822299+00	2026-04-18 22:56:49.060947+00	a0000000-0000-0000-0000-000000000001
6c258dd9-bcf2-4673-b2fc-b185402ba209	8b990271-2396-4c2b-89a2-2c6851a93130	Решение проблем	100	2026-04-18 22:15:00.222879+00	2026-04-18 22:56:49.416853+00	a0000000-0000-0000-0000-000000000001
4a2eb589-05f8-4311-b18d-c0161c831934	8b990271-2396-4c2b-89a2-2c6851a93130	Адаптивность	100	2026-04-17 07:31:08.409688+00	2026-04-18 22:56:49.7064+00	\N
c18ea55a-b6e7-4d2f-b069-98710354582a	2356547d-926a-41e6-9159-f258d1b05f2e	Командная работа	100	2026-04-20 14:13:03.697122+00	2026-04-20 14:13:03.697122+00	a0000000-0000-0000-0000-000000000001
32304d5d-8534-45ce-bce1-855351275c40	2356547d-926a-41e6-9159-f258d1b05f2e	Коммуникация	100	2026-04-20 14:13:04.942064+00	2026-04-20 14:13:04.942064+00	a0000000-0000-0000-0000-000000000001
14ae98bd-f2ea-48bd-a00c-2792196ea262	2356547d-926a-41e6-9159-f258d1b05f2e	Решение проблем	100	2026-04-20 14:13:05.954978+00	2026-04-20 14:13:05.954978+00	a0000000-0000-0000-0000-000000000001
d09474d8-8467-4ed9-ae71-9b6b89c99386	2356547d-926a-41e6-9159-f258d1b05f2e	Адаптивность	100	2026-04-20 14:13:06.9262+00	2026-04-20 14:13:06.9262+00	a0000000-0000-0000-0000-000000000001
a906d287-5919-4611-aea4-011ce1d79f2e	2356547d-926a-41e6-9159-f258d1b05f2e	Аналитическое мышление	100	2026-04-20 14:13:07.901174+00	2026-04-20 14:13:07.901174+00	a0000000-0000-0000-0000-000000000001
2baa7110-e019-45eb-8b87-7fec06a16289	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Коммуникация	0	2026-04-20 15:11:15.816577+00	2026-04-20 15:11:15.816577+00	a0000000-0000-0000-0000-000000000001
adec2743-0c54-4940-962a-04a938b7f639	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Аналитическое мышление	33	2026-04-20 15:11:16.271024+00	2026-04-20 15:11:16.271024+00	a0000000-0000-0000-0000-000000000001
10e8cb81-1586-4a5e-b6b6-d6a7da4b5781	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Командная работа	50	2026-04-20 15:11:16.687578+00	2026-04-20 15:11:16.687578+00	a0000000-0000-0000-0000-000000000001
8b8fb04d-a6ff-442f-b7f7-c81e77b3e38b	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Решение проблем	50	2026-04-20 15:11:17.101232+00	2026-04-20 15:11:17.101232+00	a0000000-0000-0000-0000-000000000001
1269babc-9ff3-4845-aebf-136ab472bcaa	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Адаптивность	50	2026-04-20 15:11:17.456915+00	2026-04-20 15:11:17.456915+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: currency_balances; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.currency_balances (id, user_id, company_id, balance, updated_at) FROM stdin;
\.


--
-- Data for Name: currency_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.currency_transactions (id, user_id, company_id, amount, kind, reference_id, description, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: demo_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.demo_requests (id, name, email, company, headcount, source, status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.departments (id, name, description, parent_id, head_user_id, created_at, updated_at, company_id) FROM stdin;
4f76c19b-6e8f-4569-a01c-c78472fc73b4	Организационная структура (не отдел)	Описание общей организационной структуры компании ЭР-Телеком.	\N	\N	2026-04-13 08:31:26.217579+00	2026-04-13 08:31:26.217579+00	\N
866070d9-c6f4-4510-ad4a-d67e67f6df46	Генеральный директор	Высшее должностное лицо компании, ответственное за стратегическое управление и общую эффективность.	\N	\N	2026-04-13 08:31:26.358358+00	2026-04-13 08:31:26.358358+00	\N
c51df212-4a20-416e-a5d6-f3279c5c3043	Члены Правления	Коллегиальный орган управления, подчиняющийся Генеральному директору и участвующий в принятии ключевых решений.	866070d9-c6f4-4510-ad4a-d67e67f6df46	\N	2026-04-13 08:31:26.487638+00	2026-04-13 08:31:27.634233+00	\N
1d10ac44-e234-42f8-9d2b-23c3618cd1e2	Функциональные руководители	Руководители различных функциональных направлений деятельности компании.	866070d9-c6f4-4510-ad4a-d67e67f6df46	\N	2026-04-13 08:31:26.626376+00	2026-04-13 08:31:27.842536+00	\N
e78b60c5-f480-46ea-b929-65ad739df5cc	Функциональные блоки	Группы подразделений, объединенные по функциональному признаку.	1d10ac44-e234-42f8-9d2b-23c3618cd1e2	\N	2026-04-13 08:31:26.760477+00	2026-04-13 08:31:28.020697+00	\N
4d635fd9-dfee-46c9-8b34-482448a5ee23	Команды	Многофункциональные группы сотрудников, работающие над конкретными задачами или проектами.	e78b60c5-f480-46ea-b929-65ad739df5cc	\N	2026-04-13 08:31:26.906567+00	2026-04-13 08:31:28.190144+00	\N
f7e0162e-3a07-41a6-bb0b-bfce74cb8202	Руководитель функционального блока	Ответственный за управление и координацию деятельности своего функционального блока.	e78b60c5-f480-46ea-b929-65ad739df5cc	\N	2026-04-13 08:31:27.08814+00	2026-04-13 08:31:28.376479+00	\N
a2bfaabd-f21e-4b9a-a370-ec810e3b5a2b	Команды функционального блока	Команды внутри функционального блока, выполняющие специализированные задачи.	e78b60c5-f480-46ea-b929-65ad739df5cc	\N	2026-04-13 08:31:27.215148+00	2026-04-13 08:31:28.568817+00	\N
5912d29a-bd6a-46c0-a587-0d38357a7267	Лидер команды	Руководитель конкретной команды, отвечающий за ее работу и достижение целей.	4d635fd9-dfee-46c9-8b34-482448a5ee23	\N	2026-04-13 08:31:27.324936+00	2026-04-13 08:31:28.781879+00	\N
6fa095d4-65c6-494f-9c89-ff69de10eb50	Члены команды	Рядовые сотрудники, входящие в состав команды.	4d635fd9-dfee-46c9-8b34-482448a5ee23	\N	2026-04-13 08:31:27.439743+00	2026-04-13 08:31:28.983091+00	\N
998100c0-1603-488f-aa2a-caa2cf4378e2	ЭР-Телеком	Телекоммуникационная компания	\N	\N	2026-04-13 10:21:58.718897+00	2026-04-13 10:21:58.718897+00	a0000000-0000-0000-0000-000000000001
49127d72-e51a-4cc5-9dfe-375d4c1cf44e	Функциональные подразделения	Подразделения, обеспечивающие общие функции компании.	998100c0-1603-488f-aa2a-caa2cf4378e2	\N	2026-04-13 10:21:58.82712+00	2026-04-13 10:21:59.413248+00	a0000000-0000-0000-0000-000000000001
a541c725-286b-446e-968a-68fa1765d8ab	Коммерческие подразделения	Подразделения, отвечающие за продажи и маркетинг.	998100c0-1603-488f-aa2a-caa2cf4378e2	\N	2026-04-13 10:21:58.928197+00	2026-04-13 10:21:59.573529+00	a0000000-0000-0000-0000-000000000001
0286d0b6-1dc0-46db-8528-53c0f72a82b6	Технические подразделения	Подразделения, отвечающие за техническую реализацию и поддержку.	998100c0-1603-488f-aa2a-caa2cf4378e2	\N	2026-04-13 10:21:59.032167+00	2026-04-13 10:21:59.724924+00	a0000000-0000-0000-0000-000000000001
522680e4-0109-41b6-95a6-bbbb7b02071c	Подразделения развития	Подразделения, отвечающие за стратегическое развитие и инновации.	998100c0-1603-488f-aa2a-caa2cf4378e2	\N	2026-04-13 10:21:59.157444+00	2026-04-13 10:21:59.879567+00	a0000000-0000-0000-0000-000000000001
9b34db4c-8a5c-44ea-bb58-e2d896516c4f	Региональные филиалы	Филиалы, расположенные в различных регионах.	998100c0-1603-488f-aa2a-caa2cf4378e2	\N	2026-04-13 10:21:59.264247+00	2026-04-13 10:22:00.053983+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: email_domain_position_mappings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_domain_position_mappings (id, company_id, email_domain, position_id, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_career_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_career_assignments (id, company_id, user_id, template_id, current_step, personal_motivation, status, assigned_by, assigned_at, updated_at) FROM stdin;
5c7ad79c-317c-47a0-bd3f-002d11702ec7	a0000000-0000-0000-0000-000000000001	8b990271-2396-4c2b-89a2-2c6851a93130	f1a58309-c4cf-4ae0-8106-b210e7886514	0	\N	active	\N	2026-04-18 22:58:37.450721+00	2026-04-18 22:58:37.450721+00
\.


--
-- Data for Name: employee_invitations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_invitations (id, company_id, email, full_name, position_id, department, requested_role, status, invited_by, claimed_user_id, claimed_at, token, created_at, updated_at, token_hash) FROM stdin;
\.


--
-- Data for Name: employee_questionnaire_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_questionnaire_files (id, questionnaire_id, file_path, file_name, file_size, file_type, uploaded_at) FROM stdin;
\.


--
-- Data for Name: employee_questionnaires; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_questionnaires (id, user_id, company_id, position_id, other_position_title, status, version, answers, skill_gaps, ai_interpretation, submitted_at, confirmed_at, next_update_due_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_rewards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_rewards (id, company_id, user_id, reward_type_id, awarded_at, awarded_by, description, created_at) FROM stdin;
\.


--
-- Data for Name: employee_risk_scores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_risk_scores (id, user_id, company_id, attrition_risk, burnout_risk, engagement_score, risk_level, factors, recommendations, computed_at, updated_at) FROM stdin;
af3b5eb1-d2e2-45f9-bc1d-cb95732ee586	f35d0adc-cc55-4e4e-96a1-e81f89d471b8	a0000000-0000-0000-0000-000000000001	67	61	36	medium	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
18a496d6-4afd-4d94-9d0f-a77badf3bee0	c7360db3-ef1f-4983-984b-46f9f24152c2	a0000000-0000-0000-0000-000000000001	58	64	39	medium	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
fd59b4e1-4878-45c5-8d01-776b97a0ac6f	2356547d-926a-41e6-9159-f258d1b05f2e	a0000000-0000-0000-0000-000000000001	87	81	16	high	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["1:1 с руководителем", "Пересмотр карьерных целей", "Снизить нагрузку"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
2301c787-5360-4e69-be98-ad64121c5994	515a6b77-209b-48f9-ab92-af33dbc099de	a0000000-0000-0000-0000-000000000001	6	12	91	low	["Стабильное продвижение", "Нагрузка в норме", "Хорошая вовлечённость"]	["Поддерживать текущий темп"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
e5ededaa-2cb9-49fd-bb7f-5afe2bf5106c	856bd219-bc77-4d90-980d-2e1f3f105851	a0000000-0000-0000-0000-000000000001	46	52	51	medium	["Стабильное продвижение", "Высокая нагрузка по HR-задачам", "Хорошая вовлечённость"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
d914f636-7a80-446e-844c-e8aab21dff60	22e3f6e3-76e5-4c8a-83eb-14726dd903e5	a0000000-0000-0000-0000-000000000001	48	42	55	medium	["Стабильное продвижение", "Нагрузка в норме", "Хорошая вовлечённость"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
18b47b2a-5122-485c-bcf8-08822cec1d03	26c99015-c462-4057-950a-64bb9e988226	a0000000-0000-0000-0000-000000000001	21	15	82	low	["Стабильное продвижение", "Нагрузка в норме", "Хорошая вовлечённость"]	["Поддерживать текущий темп"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
2ba51b6f-52b9-4ccd-9fee-201208f97c63	0fda566b-3ca0-41ae-be23-10c551985fe1	a0000000-0000-0000-0000-000000000001	70	64	33	high	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["1:1 с руководителем", "Пересмотр карьерных целей", "Снизить нагрузку"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
30c80aed-c876-4ca3-85ff-57af47d9498e	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	a0000000-0000-0000-0000-000000000001	19	13	84	low	["Стабильное продвижение", "Нагрузка в норме", "Хорошая вовлечённость"]	["Поддерживать текущий темп"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
47148c1c-437d-46cd-9789-4eac0df3b59e	8b990271-2396-4c2b-89a2-2c6851a93130	a0000000-0000-0000-0000-000000000001	90	84	13	high	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["1:1 с руководителем", "Пересмотр карьерных целей", "Снизить нагрузку"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
315d8f4d-0e9b-4c31-bb9b-44cc29ab2487	82c3428f-edad-412e-8f44-40070830ecfd	a0000000-0000-0000-0000-000000000001	67	61	36	medium	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
f32b397d-cdfe-4ec5-a973-8793b33df25a	fba3fb4a-d201-4bae-8a0a-7c827d51dfa6	a0000000-0000-0000-0000-000000000001	37	43	60	medium	["Стабильное продвижение", "Нагрузка в норме", "Хорошая вовлечённость"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
43d39831-8a92-4b84-975f-1cf3c43c16bf	d62c9f8d-060a-4bbb-8ce4-689b410384ac	a0000000-0000-0000-0000-000000000001	67	61	36	medium	["Низкая активность в карьерном треке", "Высокая нагрузка по HR-задачам", "Низкое участие в социальных активностях"]	["Запланировать ревью", "Подключить ментора"]	2026-05-04 15:03:41.193145+00	2026-05-04 15:03:41.193145+00
\.


--
-- Data for Name: gamification_reward_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gamification_reward_types (id, company_id, title, description, category, icon, points, is_active, created_by, created_at, updated_at, reward_kind, image_url, trigger_mode, trigger_events, gift_content, non_monetary_title, non_monetary_description, monetary_amount, monetary_currency) FROM stdin;
\.


--
-- Data for Name: goal_checklist_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.goal_checklist_items (id, goal_id, text, is_done, deadline, created_at, company_id) FROM stdin;
4de4b540-c227-40cf-be38-18de6b1e6e64	b8a2a5ef-30f7-4b39-8020-2d3091a70467	Написать демо-проект с паттернами	f	\N	2026-04-08 18:28:43.290022+00	\N
5df7e826-a56b-4fc1-a358-6f81d02bc5c1	b8a2a5ef-30f7-4b39-8020-2d3091a70467	Пройти модуль по HOC и Render Props	t	\N	2026-04-08 18:28:30.26431+00	\N
\.


--
-- Data for Name: hr_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hr_documents (id, document_type, title, description, file_url, file_name, processing_status, extracted_data, scenario_id, created_by, created_at, updated_at, company_id) FROM stdin;
ffc2da9e-862f-4c29-a9d9-0f4141b4479a	motivation_strategy	Политика в области вознагараждения персонала 03.09.2023 1	\N	https://wwmdzrzguicinvxibbqv.supabase.co/storage/v1/object/sign/hr-documents/motivation_strategy/1776069981635______________________________________________03.09.2023_1.docx?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xYTU5Y2E4YS1jYWRjLTRmZGUtYWZmOC1hMDEwNjM2ODM4OTQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJoci1kb2N1bWVudHMvbW90aXZhdGlvbl9zdHJhdGVneS8xNzc2MDY5OTgxNjM1X19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fXzAzLjA5LjIwMjNfMS5kb2N4IiwiaWF0IjoxNzc2MDY5OTgyLCJleHAiOjE3NzYwNzA1ODJ9.4gYRW8j9ZeEHU5sS7TsywgL2_l_GV4yg1nMC_JgqKm4	Политика в области вознагараждения персонала 03.09.2023 1.docx	completed	{"summary": "Документ представляет собой политику компании в области вознаграждения персонала, разработанную для привлечения, мотивации и удержания высококвалифицированных сотрудников. Он описывает принципы, цели, структуру системы вознаграждения, включая базовую заработную плату, переменный доход, премии, доплаты, надбавки и социальный пакет. Особое внимание уделено связи вознаграждения с результативностью труда, квалификацией и рыночной ситуацией. Документ также охватывает аспекты планирования фонда оплаты труда, конфиденциальности и ответственности за реализацию политики.", "scenario": {"title": "Оценка вовлеченности и мотивации персонала в соответствии с Политикой вознаграждения", "questions": [{"criteria": "Оценка глубины понимания сотрудником целей политики вознаграждения, выявление конкретных примеров или предложений по улучшению.", "question": "Как, по вашему мнению, текущая система вознаграждения компании способствует привлечению и удержанию высококвалифицированных сотрудников?", "max_score": 10}, {"criteria": "Способность сотрудника аргументировать свою позицию, выявление уровня удовлетворенности и наличия конструктивных предложений по повышению справедливости.", "question": "Насколько справедливо, по вашей оценке, распределяется переменная часть вознаграждения (премии, бонусы), учитывая ваши личные достижения и вклад в командные цели?", "max_score": 10}, {"criteria": "Оценка понимания сотрудником связи между квалификацией/развитием и вознаграждением. Выявление потребностей в обучении и развитии для увеличения потенциала.", "question": "Как вы считаете, насколько полно система вознаграждения учитывает ваш профессиональный опыт, квалификацию и развитие компетенций?", "max_score": 10}, {"criteria": "Оценка осведомленности сотрудника о предоставляемом социальном пакете и его значимости для личной мотивации.", "question": "Какие элементы социального пакета (ДМС, обучение, корпоративные мероприятия) вы считаете наиболее ценными для себя и почему?", "max_score": 5}, {"criteria": "Выявление нефинансовых мотиваторов, оценка соответствия ценностей сотрудника корпоративной культуре.", "question": "Какие факторы (помимо финансового вознаграждения) являются для вас ключевыми в мотивации к эффективной работе и развитию в компании?", "max_score": 10}, {"criteria": "Оценка лидерских качеств, стратегического мышления и способности применять принципы политики на практике.", "question": "Представьте, что вы руководитель подразделения. Как бы вы использовали Политику вознаграждения для мотивации своей команды и достижения стратегических целей компании?", "max_score": 10}, {"criteria": "Оценка критического мышления, инициативности и способности генерировать конструктивные идеи. Анализ соответствия предложений целям и принципам политики.", "question": "Какие изменения или дополнения вы бы предложили внести в текущую Политику вознаграждения, чтобы сделать ее более эффективной и конкурентоспособной?", "max_score": 15}], "description": "Данный сценарий предназначен для оценки понимания сотрудниками политики вознаграждения, их соответствия ее принципам, а также выявления уровня мотивации и удовлетворенности системой вознаграждения. Оценка проводится в формате структурированных вопросов, позволяющих опередить степень вовлеченности персонала и его готовность к развитию в рамках компании. Результаты оценки могут быть использованы для корректировки мотивационных программ и повышения эффективности HR-стратегии.", "competencies": ["Понимание корпоративных политик", "Мотивация и вовлеченность", "Аналитическое мышление", "Коммуникативные навыки", "Принятие решений", "Стратегическое мышление", "Инновационность"]}, "key_points": ["Привлечение, мотивация и удержание высококвалифицированных сотрудников.", "Справедливая и конкурентоспособная система вознаграждения.", "Связь вознаграждения с результативностью труда, квалификацией и опытом.", "Прозрачность, законность и конфиденциальность в вопросах вознаграждения.", "Включение базовой заработной платы, переменного дохода, доплат, надбавок и социального пакета.", "Формирование фонда оплаты труда на основе среднесрочных планов и бюджетов.", "Регулярная актуализация политики с учетом изменений рынка и законодательства."]}	32ed9ac5-76aa-4e83-9e1c-4698e864dc16	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:46:22.752227+00	2026-04-13 08:47:10.842883+00	\N
65378dea-1c4c-458a-8e3a-fb88059c738b	motivation_strategy	Политика в области вознагараждения персонала 03.09.2023 1	\N	https://wwmdzrzguicinvxibbqv.supabase.co/storage/v1/object/sign/hr-documents/motivation_strategy/1776166958541______________________________________________03.09.2023_1.docx?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xYTU5Y2E4YS1jYWRjLTRmZGUtYWZmOC1hMDEwNjM2ODM4OTQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJoci1kb2N1bWVudHMvbW90aXZhdGlvbl9zdHJhdGVneS8xNzc2MTY2OTU4NTQxX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fXzAzLjA5LjIwMjNfMS5kb2N4IiwiaWF0IjoxNzc2MTY2OTU5LCJleHAiOjE3NzYxNjc1NTl9.WdOa8luxgjzRTWgi-YzNskvu_Ijzg333FTmRCFlWqD0	Политика в области вознагараждения персонала 03.09.2023 1.docx	completed	{"summary": "Документ представляет собой Положение о системе вознаграждения персонала, разработанное в целях повышения мотивации сотрудников, роста производительности труда и достижения стратегических целей компании. В нем описывается общая философия вознаграждения, структура заработной платы, принципы формирования переменной части, критерии ежегодной оценки для целей вознаграждения, а также особенности оплаты труда различных категорий персонала и порядок пересмотра окладов. Основной акцент делается на справедливости, прозрачности, гибкости и соответствии системы вознаграждения рыночным условиям.", "scenario": {"title": "Сценарий ежегодной оценки сотрудников для целей вознаграждения", "questions": [{"criteria": "Оценка результативности на основе достижения KPI, выполнения планов, участия в проектах. Подтверждение конкретными, измеримыми результатами. Соответствие п. 3.2.1 и 3.2.2 документа.", "question": "Насколько эффективно вы достигали поставленных индивидуальных целей и KPI за отчетный период? Приведите конкретные примеры и результаты.", "max_score": 10}, {"criteria": "Оценка вовлеченности в командную работу, инициативы по улучшению общих процессов, вклад в успех компании. Соответствие п. 3.2.1 и 3.2.2 документа.", "question": "Как вы способствовали достижению командных и корпоративных целей? Опишите свой вклад в коллективные результаты.", "max_score": 10}, {"criteria": "Оценка демонстрации корпоративных и профессиональных компетенций, соответствующих стратегическим целям компании. Соответствие п. 3.2.2 документа.", "question": "Какие из ключевых компетенций, необходимых для вашей должности и развития компании, вы проявили наиболее ярко в течение года? Приведите примеры поведения.", "max_score": 10}, {"criteria": "Выявление исключительной производительности, инновационных решений, или значимого вклада, выходящего за рамки обычных обязанностей. Соответствие п. 3.2.1 и разделу 4 (виды премий).", "question": "Опишите ситуации, в которых вы превзошли ожидания или продемонстрировали выдающиеся результаты. Какие были достигнуты ключевые показатели?", "max_score": 10}, {"criteria": "Оценка самоанализа, осознания зон роста и наличия плана развития. Соответствие п. 3.2.2 (оценка для выявления областей для развития и обучения).", "question": "Какие области для развития вы определили для себя на следующий отчетный период? Какие шаги планируете предпринять для улучшения своих навыков и повышения эффективности?", "max_score": 10}, {"criteria": "Оценка понимания сотрудником принципов системы вознаграждения, сбор обратной связи для дальнейшего улучшения системы. Соответствие п. 2.2 и 2.3 документа.", "question": "Как вы оцениваете справедливость и прозрачность системы вознаграждения в компании? Предложите, если есть, идеи по её улучшению.", "max_score": 5}], "description": "Данный сценарий предназначен для проведения ежегодной оценки эффективности сотрудников в соответствии с Положением о системе вознаграждения, с целью определения переменной части заработной платы и выявления областей для развития. Оценка основывается на достижении личных, командных и корпоративных целей, а также на демонстрации ключевых компетенций.", "competencies": ["Достижение результата", "Работа в команде", "Инициативность", "Коммуникабельность", "Профессионализм", "Саморазвитие", "Аналитическое мышление (для руководящих позиций)", "Лидерство (для руководящих позиций)"]}, "key_points": ["Система вознаграждения направлена на мотивацию, рост производительности и достижение стратегических целей.", "Вознаграждение состоит из постоянной (оклад) и переменной (премии, бонусы) частей.", "Переменная часть зависит от личных, командных и корпоративных результатов, а также от ежегодной оценки сотрудников.", "Принципы системы: справедливость, прозрачность, гибкость, конкурентоспособность, регулярный пересмотр.", "Ежегодная оценка персонала проводится с целью определения ключевых показателей индивидуальной эффективности (KPI) и уровня достижения целей.", "Документ регламентирует порядок начисления различных видов премий, доплат и компенсаций.", "Система оплаты труда ориентирована на рыночную привлекательность и внутреннюю справедливость."]}	\N	856bd219-bc77-4d90-980d-2e1f3f105851	2026-04-14 11:42:39.606336+00	2026-04-14 11:42:49.34987+00	a0000000-0000-0000-0000-000000000001
c87cf7ac-4895-444a-ac12-d71c3b0bf10f	talent_management	ПОлитика _по_управлению талантами	\N	https://wwmdzrzguicinvxibbqv.supabase.co/storage/v1/object/sign/hr-documents/talent_management/1776166910812__________________________________.docx?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xYTU5Y2E4YS1jYWRjLTRmZGUtYWZmOC1hMDEwNjM2ODM4OTQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJoci1kb2N1bWVudHMvdGFsZW50X21hbmFnZW1lbnQvMTc3NjE2NjkxMDgxMl9fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX18uZG9jeCIsImlhdCI6MTc3NjE2NjkxMSwiZXhwIjoxNzc2MTY3NTExfQ.LuLdbz5SE11GhZNonho0mahcxYpi8IoYOyIP8fSeDrI	ПОлитика _по_управлению талантами.docx	completed	{"summary": "Документ представляет собой политику по управлению талантами, охватывающую четыре ключевых направления: привлечение, развитие, удержание и стратегическое планирование. Основная цель политики – создание эффективной системы привлечения, развития, удержания и мотивации высококвалифицированных сотрудников, а также обеспечение устойчивого роста и развития компании.", "scenario": {"title": "Сценарий оценки сотрудника в рамках политики управления талантами", "questions": [{"criteria": "Оценивается понимание сотрудником своей значимости и вклада в стратегические цели. Насколько его роль отражает принципы эффективности и развития компании.", "question": "Какую роль в вашем текущем проекте вы считаете наиболее значимой для достижения общих целей компании?", "max_score": 10}, {"criteria": "Оценивается инициативность сотрудника в саморазвитии. Наличие конкретных примеров обучения (курсы, менторство, коучинг), применения новых знаний на практике.", "question": "Какие методы вы используете для повышения своих профессиональных навыков и знаний в соответствии с требованиями вашей должности и стратегическими целями компании?", "max_score": 10}, {"criteria": "Оцениваются аналитические способности, умение применять знания на практике, способность к решению проблем, инициативность и стремление к улучшениям.", "question": "Опишите ситуацию, когда вы успешно применили свои знания и навыки для решения сложной задачи или улучшения рабочего процесса. Что стало ключевым фактором успеха?", "max_score": 10}, {"criteria": "Оценивается амбициозность, стремление к развитию, соответствие карьерных планов возможностям компании, наличие конкретных шагов по достижению целей.", "question": "Как вы видите свой карьерный рост в компании в ближайшие 3-5 лет? Какие шаги вы предпринимаете для достижения этих целей?", "max_score": 10}, {"criteria": "Оценивается осознанность сотрудником корпоративных ценностей, их интеграция в работу. Наличие конкретных примеров, иллюстрирующих применение ценностей на практике.", "question": "Какие из наших корпоративных ценностей вы считаете наиболее важными для вашей работы и как вы их реализуете в повседневной деятельности?", "max_score": 10}, {"criteria": "Оценивается вклад сотрудника в командную работу, коммуникативные навыки, способности к сотрудничеству, проявление инициативы в создании позитивной атмосферы.", "question": "Как вы способствуете формированию благоприятного рабочего климата и развитию командного взаимодействия?", "max_score": 10}, {"criteria": "Оценивается уровень саморефлексии, осознание своих мотивирующих факторов, конструктивность предложений по улучшению рабочей среды.", "question": "Какие факторы, по вашему мнению, наиболее сильно влияют на вашу мотивацию в текущей работе? Что можно улучшить для повышения вашей вовлеченности?", "max_score": 10}, {"criteria": "Оценивается способность сотрудника воспринимать и использовать обратную связь (позитивная открытость к критике, умение трансформировать ее в план развития).", "question": "Опишите, как вы используете обратную связь от коллег и руководителей для своего развития.", "max_score": 10}, {"criteria": "Оценивается проактивность сотрудника, его готовность брать на себя новые обязанности, желание обучаться и расти внутри компании.", "question": "Какие новые задачи или проекты вы бы хотели попробовать в ближайшее время, чтобы расширить свой опыт?", "max_score": 10}], "description": "Данный сценарий предназначен для оценки сотрудников с целью выявления их потенциала, определения потребностей в развитии и планирования карьерного роста в соответствии с политикой управления талантами компании. Оценка проводится ежегодно и включает самооценку, оценку непосредственным руководителем и последующее обсуждение.", "competencies": ["Профессиональное развитие и обучение", "Решение проблем и инновации", "Карьерное планирование и амбиции", "Корпоративные ценности и этика", "Командная работа и коммуникация", "Мотивация и вовлеченность", "Открытость к обратной связи", "Проактивность и инициативность"]}, "key_points": ["Комплексный подход к управлению талантами, включающий привлечение, развитие, удержание и стратегическое планирование.", "Важность внутренних и внешних источников привлечения талантов при условии соблюдения прозрачности и объективности.", "Непрерывное развитие сотрудников через обучение, коучинг, менторство, ротацию и программы развития лидеров.", "Удержание талантов через конкурентное вознаграждение, создание благоприятного рабочего климата, возможности карьерного роста и признание достижений.", "Стратегическое планирование для выявления будущих потребностей в талантах и создания кадрового резерва.", "Важность обратной связи, регулярной оценки и развития сотрудников.", "Акцент на создании культуры открытости, доверия и взаимного уважения."]}	\N	856bd219-bc77-4d90-980d-2e1f3f105851	2026-04-14 11:41:52.200283+00	2026-04-14 11:42:04.862063+00	a0000000-0000-0000-0000-000000000001
7ca8ce6f-baa9-483a-90a5-e43d24f7c205	hr_strategy	HR Strategy_20251114_vF	\N	https://wwmdzrzguicinvxibbqv.supabase.co/storage/v1/object/sign/hr-documents/hr_strategy/1776166945709_HR_Strategy_20251114_vF.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xYTU5Y2E4YS1jYWRjLTRmZGUtYWZmOC1hMDEwNjM2ODM4OTQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJoci1kb2N1bWVudHMvaHJfc3RyYXRlZ3kvMTc3NjE2Njk0NTcwOV9IUl9TdHJhdGVneV8yMDI1MTExNF92Ri5wZGYiLCJpYXQiOjE3NzYxNjY5NTIsImV4cCI6MTc3NjE2NzU1Mn0.jSTFYGZgU1wlcEHAGVX12QgkN_dv1aRKJy5SDApE0sg	HR Strategy_20251114_vF.pdf	completed	{"summary": "Документ представляет собой HR-стратегию, скорее всего, для крупной международной компании, судя по упомянутым характеристикам и широкому спектру тем. Документ делает акцент на трансформацию HR-функции, развитие персонала, поддержание вовлеченности и создания адаптивной корпоративной культуры. Ключевые аспекты включают цифровизацию HR, стратегическое планирование талантов, управление производительностью и создание инклюзивной среды. Цель стратегии - усилить конкурентные преимущества компании через эффективное управление человеческим капиталом.", "scenario": {"title": "Сценарий оценки сотрудника: Эффективность и Адаптивность в Цифровой HR-Трансформации", "questions": [{"criteria": "Оценка: 0-3 балла за каждый используемый инструмент (не используются/используются формально/используются регулярно/используются для оптимизации). 0-4 балла за конкретные примеры и объяснения (отсутствуют/поверхностные/удовлетворительные/детальные и вдохновляющие).", "question": "Как вы использовали новые цифровые HR-инструменты (например, платформы для обучения, системы управления проектами, аналитические дашборды) в своей работе за последний год? Приведите конкретные примеры и опишите, как они помогли вам повысить эффективность.", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за инициативность и проактивность. 0-4 балла за описание процесса обучения и адаптации. 0-3 балла за достигнутые результаты и их влияние на работу/команду.", "question": "Опишите ситуацию, когда вам потребовалось быстро освоить новый навык или адаптироваться к изменяющимся требованиям работы. Какие шаги вы предприняли для этого, и каков был результат?", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за понимание принципов инклюзивности. 0-4 балла за конкретные примеры инициатив/действий. 0-3 балла за видимое влияние на командную динамику и вовлеченность.", "question": "Как вы способствуете созданию инклюзивной и поддерживающей рабочей среды в вашей команде? Приведите примеры ваших действий и их влияния.", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за демонстрацию инициативы. 0-4 балла за описание лидерских действий (наставничество, координация, мотивация). 0-3 балла за достигнутый результат и признание со стороны коллег.", "question": "Расскажите о проекте или задаче, где вам пришлось проявить лидерские качества, даже если вы не занимаете формальную руководящую должность. Что было вашей ролью и каким был результат?", "max_score": 10}, {"criteria": "Оценка: 0-3 балла за регулярность и качество обратной связи. 0-4 балла за демонстрацию активного слушания и конструктивной обратной связи. 0-3 балла за примеры изменений в поведении/работе на основе обратной связи.", "question": "Какую обратную связь (как позитивную, так и развивающую) вы давали или получали за последний год? Как вы использовали эту обратную связь для профессионального роста?", "max_score": 10}], "description": "Данный сценарий предназначен для оценки эффективности сотрудников в контексте реализации новой HR-стратегии, с акцентом на их адаптивность к цифровым инструментам, способность к развитию и вклад в создание поддерживающей корпоративной культуры. Оценка проводится в формате полуструктурированного интервью с элементами самооценки и оценки 360 градусов.", "competencies": ["Адаптивность и гибкость", "Обучаемость и развитие", "Использование цифровых инструментов", "Лидерство и влияние", "Коллаборация и инклюзивность", "Проактивность и инициативность", "Управление производительностью"]}, "key_points": ["HR-трансформация и цифровизация: внедрение новых технологий (AI, машинное обучение) для оптимизации HR-процессов, таких как рекрутинг, онбординг, обучение и управление производительностью. Развитие аналитики данных для принятия более обоснованных решений.", "Стратегическое планирование талантов и развитие навыков: обеспечение наличия необходимых талантов для будущих потребностей бизнеса. Фокус на развитии новых навыков, переквалификации и повышении квалификации сотрудников.", "Культура вовлеченности и благополучия: создание позитивной и инклюзивной рабочей среды, поддержание благополучия сотрудников, усиление коммуникации и признания.", "Управление производительностью и эффективность: переосмысление подходов к оценке и управлению производительностью, сосредоточение на постоянном развитии и обратной связи.", "Лидерство и организационное развитие: развитие лидерских качеств, способствующих изменениям и инновациям. Построение гибкой и адаптивной организационной структуры."]}	e44b0df5-77e8-4d8b-836c-f35ac3af2958	856bd219-bc77-4d90-980d-2e1f3f105851	2026-04-14 11:42:32.935731+00	2026-04-14 11:43:26.188243+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: hr_task_assignees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hr_task_assignees (id, task_id, user_id, individual_status, reward_paid, created_at) FROM stdin;
\.


--
-- Data for Name: hr_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hr_tasks (id, company_id, created_by, title, description, category, reward_coins, deadline, status, reviewed_by, reviewed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, title, description, notification_type, is_read, created_at, company_id) FROM stdin;
6e2bf8d8-48e0-41f4-be26-3a28e10db1d0	8b990271-2396-4c2b-89a2-2c6851a93130	Назначен карьерный трек	По результатам пройденного теста вам автоматически назначен подходящий карьерный трек.	career_track	f	2026-04-18 22:58:37.450721+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: peer_recognition_reactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.peer_recognition_reactions (id, recognition_id, user_id, reaction, created_at) FROM stdin;
\.


--
-- Data for Name: peer_recognitions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.peer_recognitions (id, company_id, from_user_id, to_user_id, category, message, coin_reward, created_at) FROM stdin;
\.


--
-- Data for Name: position_career_paths; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.position_career_paths (id, from_position_id, to_position_id, strategy_description, requirements, estimated_months, created_by, created_at, updated_at, company_id) FROM stdin;
6d21752f-7639-4d73-9895-49ca384454f9	a612b68b-84f5-4743-800b-d27a8e6b469f	cf62e14d-f1fa-43e6-b2f7-8d45709779a9	Развитие навыков работы с персоналом, изучение HR-процессов и получение дополнительного образования в области HR для перехода из бэк-офиса в HR.	[]	24	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
4993d0e7-88bd-4e35-8446-e7e801e6be21	cf62e14d-f1fa-43e6-b2f7-8d45709779a9	107611ad-bc75-4db1-9194-c98e7bf63dfc	Проявление лидерских качеств, участие в проектах по оптимизации HR-процессов, освоение управленческих навыков для повышения до линейного руководителя в функциональных подразделениях.	[]	36	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
8a9bcd7c-2565-4171-b08d-01a2400fe426	9ccff0aa-8e21-4f90-8da1-2bad3791a05a	40f1195d-ece7-4b98-a790-a28615c51791	Развитие аналитических навыков, углубленное изучение рынка и продуктов компании, освоение инструментов анализа данных для горизонтального перехода в роль аналитика.	[]	30	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
d914d0dd-14c4-467b-b698-ee7579934f04	9ccff0aa-8e21-4f90-8da1-2bad3791a05a	107611ad-bc75-4db1-9194-c98e7bf63dfc	Достижение высоких показателей в продажах, развитие управленческих навыков, наставничество младших специалистов для перехода на позицию линейного руководителя в коммерческом подразделении.	[]	36	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
ceb5056e-443e-4553-8395-8b056c89f16c	583fd82b-21bf-4f84-82be-ca7ecd8694ff	5cd4eb9a-90d9-4829-80ee-419ec03a7bcb	Участие в технических проектах, развитие навыков управления, коммуникации с заказчиками и командами для горизонтального перехода в менеджеры проектов.	[]	36	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
c7a9ba9e-4684-4b96-b6ef-a0bc83ab181e	583fd82b-21bf-4f84-82be-ca7ecd8694ff	107611ad-bc75-4db1-9194-c98e7bf63dfc	Демонстрация глубоких технических знаний, эффективное решение сложных проблем, развитие лидерских качеств для повышения до линейного руководителя в технических подразделениях.	[]	36	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
25a87620-55b7-41c7-9ad6-b76b7685be34	5cd4eb9a-90d9-4829-80ee-419ec03a7bcb	107611ad-bc75-4db1-9194-c98e7bf63dfc	Успешное управление крупными и сложными проектами, наставничество младших менеджеров, развитие стратегического мышления для перехода на позицию линейного руководителя в подразделениях развития.	[]	24	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
ce0d2b18-e024-45c6-bbf5-facb02e48037	40f1195d-ece7-4b98-a790-a28615c51791	107611ad-bc75-4db1-9194-c98e7bf63dfc	Углубление аналитической экспертизы, предоставление стратегических рекомендаций, лидерство в проектах по анализу данных для повышения до линейного руководителя с аналитической направленностью.	[]	30	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
72eec530-f6ab-4caf-90dd-f532ca1535aa	107611ad-bc75-4db1-9194-c98e7bf63dfc	cd512374-7332-4705-8e29-6904a6c23751	Успешное управление отделами/проектами, демонстрация стратегического видения, развитие навыков межфункционального взаимодействия и принятия решений на высшем уровне для перехода на позицию руководителя.	[]	48	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:32:05.630931+00	2026-04-13 10:32:05.630931+00	a0000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: positions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.positions (id, title, description, department, psychological_profile, competency_profile, created_by, created_at, updated_at, company_id, profile_status, profile_version, profile_template, approved_by, approved_at) FROM stdin;
68327e63-1aec-4fdb-9e3c-254fcb94ef0c	Генеральный директор	Высшее должностное лицо компании, ответственное за стратегическое планирование, управление всеми направлениями деятельности, обеспечение роста и прибыльности компании, а также представление интересов компании на внешнем уровне.	Высшее руководство	[{"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Инициативность"}, {"level": "высокое", "trait": "Стрессоустойчивость"}, {"level": "выше среднего", "trait": "Амбициозность"}, {"level": "высокое", "trait": "Аналитический склад ума"}]	[{"name": "Стратегическое мышление", "required_level": 10}, {"name": "Лидерство", "required_level": 10}, {"name": "Финансовый менеджмент", "required_level": 9}, {"name": "Управление изменениями", "required_level": 9}, {"name": "Принятие решений", "required_level": 10}, {"name": "Коммуникации", "required_level": 9}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:51.33183+00	2026-04-13 08:39:51.33183+00	\N	draft	1	{}	\N	\N
947df9d0-b03a-478d-9e5e-5ebc66bd4009	Заместитель Генерального директора	Оказывает поддержку Генеральному директору в стратегическом управлении, координирует работу нескольких функциональных блоков, принимает оперативные решения и замещает Генерального директора в его отсутствие.	Высшее руководство	[{"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Ориентация на результат"}, {"level": "выше среднего", "trait": "Гибкость мышления"}, {"level": "выше среднего", "trait": "Коммуникабельность"}, {"level": "высокое", "trait": "Решительность"}]	[{"name": "Стратегическое планирование", "required_level": 9}, {"name": "Межфункциональное взаимодействие", "required_level": 9}, {"name": "Управление проектами", "required_level": 8}, {"name": "Развитие бизнеса", "required_level": 8}, {"name": "Наставничество", "required_level": 7}, {"name": "Ведение переговоров", "required_level": 8}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:51.494852+00	2026-04-13 08:39:51.494852+00	\N	draft	1	{}	\N	\N
694f7f84-5e2a-414e-ad02-065f86ba8f1b	Руководитель функционального блока	Отвечает за стратегическое развитие и операционное управление конкретным функциональным блоком (например, маркетинг, финансы, IT, продажи). Формирует и реализует политику блока, управляет командой и бюджетом.	Функциональные блоки	[{"level": "высокое", "trait": "Системность мышления"}, {"level": "выше среднего", "trait": "Лидерские качества"}, {"level": "высокое", "trait": "Ответственность"}, {"level": "выше среднего", "trait": "Самостоятельность"}, {"level": "среднее", "trait": "Оптимизм"}]	[{"name": "Управленческие навыки", "required_level": 9}, {"name": "Экспертиза в области функционала", "required_level": 9}, {"name": "Бюджетирование", "required_level": 8}, {"name": "Управление командой", "required_level": 8}, {"name": "Анализ данных", "required_level": 7}, {"name": "Решение проблем", "required_level": 8}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:51.608919+00	2026-04-13 08:39:51.608919+00	\N	draft	1	{}	\N	\N
3b2b8ada-323c-440c-9087-4af700999646	Менеджер по развитию функционального блока	Разрабатывает и внедряет инициативы по оптимизации процессов и повышению эффективности в рамках функционального блока. Анализирует тренды рынка и предлагает новые подходы.	Функциональные блоки	[{"level": "выше среднего", "trait": "Инициативность"}, {"level": "высокое", "trait": "Любознательность"}, {"level": "выше среднего", "trait": "Внимательность к деталям"}, {"level": "среднее", "trait": "Упорство"}, {"level": "выше среднего", "trait": "Гибкость"}]	[{"name": "Аналитическое мышление", "required_level": 8}, {"name": "Исследовательские навыки", "required_level": 7}, {"name": "Проектный менеджмент", "required_level": 7}, {"name": "Презентационные навыки", "required_level": 6}, {"name": "Критическое мышление", "required_level": 7}, {"name": "Креативность", "required_level": 7}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:51.747628+00	2026-04-13 08:39:51.747628+00	\N	draft	1	{}	\N	\N
24ac6a7d-5800-4b0c-8381-7d1a58fa017d	Специалист функционального блока	Выполняет специализированные задачи в рамках своего функционального блока, использует профессиональные знания и навыки для решения операционных задач.	Функциональные блоки	[{"level": "выше среднего", "trait": "Аккуратность"}, {"level": "высокое", "trait": "Внимательность"}, {"level": "выше среднего", "trait": "Ответственность"}, {"level": "среднее", "trait": "Самостоятельность"}, {"level": "среднее", "trait": "Спокойствие"}]	[{"name": "Профессиональные знания", "required_level": 7}, {"name": "Исполнительность", "required_level": 8}, {"name": "Работа с информацией", "required_level": 6}, {"name": "Компьютерная грамотность", "required_level": 7}, {"name": "Самоорганизация", "required_level": 6}, {"name": "Деловая переписка", "required_level": 5}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:51.890011+00	2026-04-13 08:39:51.890011+00	\N	draft	1	{}	\N	\N
a4d0fbd7-4d2d-40c4-b2ff-df4a79167501	Лидер команды	Возглавляет конкретную команду в рамках функционального блока, отвечает за координацию работы, распределение задач, мотивацию участников команды и достижение поставленных целей проекта или направления.	Команды функционального блока	[{"level": "высокое", "trait": "Лидерские качества"}, {"level": "выше среднего", "trait": "Эмпатия"}, {"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Коммуникабельность"}, {"level": "выше среднего", "trait": "Целеустремленность"}]	[{"name": "Управление командой", "required_level": 8}, {"name": "Планирование и организация", "required_level": 8}, {"name": "Решение конфликтов", "required_level": 7}, {"name": "Наставничество", "required_level": 7}, {"name": "Мотивация персонала", "required_level": 7}, {"name": "Обратная связь", "required_level": 7}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.011886+00	2026-04-13 08:39:52.011886+00	\N	draft	1	{}	\N	\N
5a794c97-33f8-4356-b3f4-be4b18b2ce0c	Секретарь Правления	Обеспечивает организационную поддержку работы Правления: подготовка повестки дня, ведение протоколов заседаний, рассылка материалов, контроль исполнения решений.	Члены Правления	[{"level": "высокое", "trait": "Аккуратность"}, {"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Пунктуальность"}, {"level": "среднее", "trait": "Консервативность"}, {"level": "выше среднего", "trait": "Стрессоустойчивость"}]	[{"name": "Делопроизводство", "required_level": 8}, {"name": "Организаторские способности", "required_level": 7}, {"name": "Конфиденциальность", "required_level": 9}, {"name": "Владение MS Office", "required_level": 8}, {"name": "Ведение деловой переписки", "required_level": 7}, {"name": "Тайм-менеджмент", "required_level": 7}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.659868+00	2026-04-13 08:39:52.659868+00	\N	draft	1	{}	\N	\N
240cb707-a995-472c-890e-aded5ab8a709	Старший член команды	Оказывает поддержку Лидеру команды, выступает в роли наставника для младших сотрудников, выполняет наиболее сложные задачи, участвует в разработке решений и контроле качества.	Команды функционального блока	[{"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Надежность"}, {"level": "выше среднего", "trait": "Ориентация на качество"}, {"level": "среднее", "trait": "Инициативность"}, {"level": "выше среднего", "trait": "Методичность"}]	[{"name": "Профессиональная экспертиза", "required_level": 8}, {"name": "Самостоятельность", "required_level": 7}, {"name": "Наставничество", "required_level": 6}, {"name": "Решение проблем", "required_level": 7}, {"name": "Анализ задач", "required_level": 7}, {"name": "Декомпозиция задач", "required_level": 7}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.120736+00	2026-04-13 08:39:52.120736+00	\N	draft	1	{}	\N	\N
6b3dcb99-2ca3-4b77-9d1d-ef4ca3a62313	Функциональный руководитель	Отвечает за развитие и операционное управление конкретным функциональным направлением (например, HR, IT, Финансы), разрабатывает и внедряет стандарты, методики и процедуры в своей сфере.	Функциональные руководители	[{"level": "высокое", "trait": "Системность мышления"}, {"level": "высокое", "trait": "Ответственность"}, {"level": "выше среднего", "trait": "Требовательность"}, {"level": "выше среднего", "trait": "Стрессоустойчивость"}, {"level": "выше среднего", "trait": "Коммуникабельность"}]	[{"name": "Экспертиза в функциональной области", "required_level": 9}, {"name": "Управление процессами", "required_level": 8}, {"name": "Развитие персонала", "required_level": 7}, {"name": "Анализ и оптимизация", "required_level": 8}, {"name": "Взаимодействие с внешними партнерами", "required_level": 7}, {"name": "Регулирование", "required_level": 8}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.763768+00	2026-04-13 08:39:52.763768+00	\N	draft	1	{}	\N	\N
c5e2d8ef-a76a-4852-8764-a45f5037b9f3	Член команды	Выполняет поставленные задачи в рамках проекта или направления, активно участвует в командной работе, отчитывается о проделанной работе Лидеру команды.	Команды функционального блока	[{"level": "высокое", "trait": "Дисциплинированность"}, {"level": "выше среднего", "trait": "Ответственность"}, {"level": "среднее", "trait": "Общительность"}, {"level": "выше среднего", "trait": "Усердие"}, {"level": "высокое", "trait": "Пунктуальность"}]	[{"name": "Исполнительность", "required_level": 8}, {"name": "Работа в команде", "required_level": 7}, {"name": "Владение специализированным ПО", "required_level": 6}, {"name": "Обучаемость", "required_level": 7}, {"name": "Тайм-менеджмент", "required_level": 6}, {"name": "Инициативность", "required_level": 5}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.223694+00	2026-04-13 08:39:52.223694+00	\N	draft	1	{}	\N	\N
3714aa00-a2cc-4f42-92c7-818e81c0b6fd	Главный специалист функционального направления	Выполняет ключевые экспертные задачи в рамках функционального направления, разрабатывает сложные решения, консультирует коллег и участвует в стратегическом планировании направления.	Функциональные руководители	[{"level": "высокое", "trait": "Аналитический склад ума"}, {"level": "высокое", "trait": "Внимательность к деталям"}, {"level": "высокое", "trait": "Ответственность"}, {"level": "выше среднего", "trait": "Инициативность"}, {"level": "выше среднего", "trait": "Любознательность"}]	[{"name": "Глубокая профессиональная экспертиза", "required_level": 9}, {"name": "Исследовательские навыки", "required_level": 8}, {"name": "Аналитическое мышление", "required_level": 8}, {"name": "Разработка методологий", "required_level": 8}, {"name": "Консультирование", "required_level": 7}, {"name": "Самостоятельность", "required_level": 8}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.869036+00	2026-04-13 08:39:52.869036+00	\N	draft	1	{}	\N	\N
e22bde0a-3c4e-44ad-b2b5-5e6d9cc4720a	Младший член команды	Выполняет простые задачи под руководством старших коллег, осваивает новые навыки и технологии, активно участвует в процессе обучения и развития.	Команды функционального блока	[{"level": "высокое", "trait": "Любознательность"}, {"level": "выше среднего", "trait": "Усидчивость"}, {"level": "высокое", "trait": "Внимательность"}, {"level": "среднее", "trait": "Ответственность"}, {"level": "среднее", "trait": "Скромность"}]	[{"name": "Обучаемость", "required_level": 8}, {"name": "Исполнительность", "required_level": 7}, {"name": "Внимание к деталям", "required_level": 6}, {"name": "Базовые профессиональные знания", "required_level": 5}, {"name": "Работа с документацией", "required_level": 5}, {"name": "Поиск информации", "required_level": 5}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.361552+00	2026-04-13 08:39:52.361552+00	\N	draft	1	{}	\N	\N
eafb39ba-134b-4eb4-b355-bfeefc67af7f	Специалист функционального направления	Осуществляет операционную деятельность в рамках функционального направления, выполняет задачи в соответствии с установленными процедурами и стандартами, участвует в проектах.	Функциональные руководители	[{"level": "высокое", "trait": "Аккуратность"}, {"level": "выше среднего", "trait": "Ответственность"}, {"level": "выше среднего", "trait": "Самоорганизованность"}, {"level": "высокое", "trait": "Внимательность"}, {"level": "среднее", "trait": "Общительность"}]	[{"name": "Профессиональные знания", "required_level": 7}, {"name": "Исполнительность", "required_level": 8}, {"name": "Работа с данными", "required_level": 7}, {"name": "Соблюдение регламентов", "required_level": 8}, {"name": "Софт скиллы", "required_level": 6}, {"name": "Ориентация на результат", "required_level": 6}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.970558+00	2026-04-13 08:39:52.970558+00	\N	draft	1	{}	\N	\N
ee85833f-7490-40da-9f03-805e3f7ba71b	Председатель Правления	Руководит заседаниями Правления, обеспечивает выработку и принятие стратегических решений, контроль над их исполнением, взаимодействие с Генеральным директором и акционерами.	Члены Правления	[{"level": "высокое", "trait": "Ответственность"}, {"level": "высокое", "trait": "Влиятельность"}, {"level": "высокое", "trait": "Рассудительность"}, {"level": "высокое", "trait": "Уверенность в себе"}, {"level": "выше среднего", "trait": "Беспристрастность"}]	[{"name": "Стратегическое управление", "required_level": 10}, {"name": "Корпоративное управление", "required_level": 9}, {"name": "Принятие решений", "required_level": 10}, {"name": "Ведение переговоров", "required_level": 9}, {"name": "Анализ рисков", "required_level": 9}, {"name": "Публичные выступления", "required_level": 8}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.462084+00	2026-04-13 08:39:52.462084+00	\N	draft	1	{}	\N	\N
8a0abb70-5310-41ae-8479-2897c61b4ca6	Член Правления	Участвует в заседаниях Правления, вносит предложения по развитию бизнеса, оценивает риски, контролирует выполнение ключевых показателей деятельности компании, представляет интересы определенного функционального направления при принятии решений.	Члены Правления	[{"level": "высокое", "trait": "Ответственность"}, {"level": "выше среднего", "trait": "Объективность"}, {"level": "высокое", "trait": "Внимательность к деталям"}, {"level": "среднее", "trait": "Инициативность"}, {"level": "высокое", "trait": "Принципиальность"}]	[{"name": "Экспертиза в своей области", "required_level": 9}, {"name": "Системное мышление", "required_level": 9}, {"name": "Анализ данных", "required_level": 8}, {"name": "Критическое мышление", "required_level": 8}, {"name": "Стратегическое планирование", "required_level": 8}, {"name": "Деловая этика", "required_level": 9}]	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	2026-04-13 08:39:52.562436+00	2026-04-13 08:39:52.562436+00	\N	draft	1	{}	\N	\N
cd512374-7332-4705-8e29-6904a6c23751	Руководитель	Общее руководство	\N	[{"level": "высокое", "trait": "Системное мышление"}, {"level": "высокое", "trait": "Развитие и ориентированность на команду"}, {"level": "высокое", "trait": "Управление изменениями"}, {"level": "высокое", "trait": "Принятие решений"}, {"level": "высокое", "trait": "Нацеленность на результат"}, {"level": "выше среднего", "trait": "Переговорные навыки"}, {"level": "высокое", "trait": "Лидерство"}, {"level": "выше среднего", "trait": "Ориентация на клиента"}, {"level": "выше среднего", "trait": "Профессионализм"}, {"level": "выше среднего", "trait": "Инициативность"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.209289+00	2026-04-13 10:22:00.209289+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
9ccff0aa-8e21-4f90-8da1-2bad3791a05a	Менеджер по продажам	Продажа продуктов и услуг компании.	Коммерческие подразделения	[{"level": "высокое", "trait": "Нацеленность на результат"}, {"level": "высокое", "trait": "Переговорные навыки"}, {"level": "высокое", "trait": "Коммуникабельность"}, {"level": "высокое", "trait": "Ориентация на клиента"}, {"level": "высокое", "trait": "Инициативность"}, {"level": "выше среднего", "trait": "Самоорганизация"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.317425+00	2026-04-13 10:22:00.317425+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
583fd82b-21bf-4f84-82be-ca7ecd8694ff	Специалист технической поддержки	Обеспечение технической поддержки клиентов.	Технические подразделения	[{"level": "высокое", "trait": "Профессионализм"}, {"level": "высокое", "trait": "Ориентация на клиента"}, {"level": "высокое", "trait": "Стрессоустойчивость"}, {"level": "выше среднего", "trait": "Самоорганизация"}, {"level": "выше среднего", "trait": "Системное мышление"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.424974+00	2026-04-13 10:22:00.424974+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
cf62e14d-f1fa-43e6-b2f7-8d45709779a9	HR-специалист	Работа с персоналом, подбор, адаптация, развитие.	Функциональные подразделения	[{"level": "высокое", "trait": "Развитие и ориентированность на команду"}, {"level": "высокое", "trait": "Ориентация на клиента (внутреннего)"}, {"level": "высокое", "trait": "Коммуникабельность"}, {"level": "выше среднего", "trait": "Профессионализм"}, {"level": "выше среднего", "trait": "Инициативность"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.527949+00	2026-04-13 10:22:00.527949+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
5cd4eb9a-90d9-4829-80ee-419ec03a7bcb	Менеджер проекта	Управление проектами в различных сферах.	Подразделения развития	[{"level": "высокое", "trait": "Системное мышление"}, {"level": "высокое", "trait": "Управление изменениями"}, {"level": "высокое", "trait": "Принятие решений"}, {"level": "высокое", "trait": "Нацеленность на результат"}, {"level": "высокое", "trait": "Лидерство"}, {"level": "выше среднего", "trait": "Переговорные навыки"}, {"level": "выше среднего", "trait": "Развитие и ориентированность на команду"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.63155+00	2026-04-13 10:22:00.63155+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
40f1195d-ece7-4b98-a790-a28615c51791	Аналитик	Анализ данных, выработка решений.	\N	[{"level": "высокое", "trait": "Системное мышление"}, {"level": "выше среднего", "trait": "Профессионализм"}, {"level": "выше среднего", "trait": "Нацеленность на результат"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.729893+00	2026-04-13 10:22:00.729893+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
a612b68b-84f5-4743-800b-d27a8e6b469f	Сотрудник бэк-офиса	Административная и операционная поддержка.	Функциональные подразделения	[{"level": "высокое", "trait": "Профессионализм"}, {"level": "выше среднего", "trait": "Самоорганизация"}, {"level": "высокое", "trait": "Исполнительность"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.828457+00	2026-04-13 10:22:00.828457+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
107611ad-bc75-4db1-9194-c98e7bf63dfc	Линейный руководитель	Руководство небольшим подразделением или отделом.	\N	[{"level": "высокое", "trait": "Лидерство"}, {"level": "высокое", "trait": "Развитие и ориентированность на команду"}, {"level": "высокое", "trait": "Нацеленность на результат"}, {"level": "выше среднего", "trait": "Принятие решений"}, {"level": "выше среднего", "trait": "Системное мышление"}, {"level": "выше среднего", "trait": "Ориентация на клиента"}, {"level": "выше среднего", "trait": "Профессионализм"}, {"level": "выше среднего", "trait": "Инициативность"}]	[]	82c3428f-edad-412e-8f44-40070830ecfd	2026-04-13 10:22:00.930846+00	2026-04-13 10:22:00.930846+00	a0000000-0000-0000-0000-000000000001	draft	1	{}	\N	\N
\.


--
-- Data for Name: pricing_inquiries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pricing_inquiries (id, name, email, company, phone, plan, headcount, message, status, admin_notes, source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, user_id, full_name, "position", department, avatar_url, hire_date, overall_score, role_readiness, created_at, updated_at, is_verified, requested_role, position_id, company_id, pending_position_id) FROM stdin;
aaaa48cc-bc9f-457c-a8c8-ef47fbbb6306	d62c9f8d-060a-4bbb-8ce4-689b410384ac	Москвина Екатерина			\N	\N	0	0	2026-05-04 13:32:56.872436+00	2026-05-15 13:15:53.168618+00	t	hrd	\N	a0000000-0000-0000-0000-000000000001	\N
a0bfebcc-03cb-4c2b-957c-9a88f68d3d51	82c3428f-edad-412e-8f44-40070830ecfd	zaslavv@yandex.ru			\N	\N	0	0	2026-04-10 07:33:26.438687+00	2026-04-13 10:07:23.599728+00	t	hrd	\N	a0000000-0000-0000-0000-000000000001	\N
fc9a29dd-77c8-4ba3-ab2b-3ab58e301850	856bd219-bc77-4d90-980d-2e1f3f105851	sofya.levitina@mail.ru			\N	\N	0	0	2026-04-09 10:41:15.723582+00	2026-04-14 10:17:13.931465+00	t	hrd	\N	a0000000-0000-0000-0000-000000000001	\N
842c3f5d-55fa-4ef1-9ac2-c14a0647756a	0fda566b-3ca0-41ae-be23-10c551985fe1	testuser@example.com			\N	\N	0	0	2026-04-08 18:25:29.6749+00	2026-04-14 11:38:51.904575+00	f	employee	\N	a0000000-0000-0000-0000-000000000001	\N
a3fb95de-1b0a-43d2-a838-e0433bd2fd54	22e3f6e3-76e5-4c8a-83eb-14726dd903e5	tester2@example.com			\N	\N	0	0	2026-04-08 18:26:16.734894+00	2026-04-14 11:38:51.904575+00	f	employee	\N	a0000000-0000-0000-0000-000000000001	\N
0d480ccd-4f99-4c24-88c9-2ff25ea93e96	c7360db3-ef1f-4983-984b-46f9f24152c2	czyganovan@list.ru			\N	\N	0	0	2026-04-08 20:12:59.846928+00	2026-04-14 11:38:51.904575+00	t	hrd	\N	a0000000-0000-0000-0000-000000000001	\N
db818463-d4d1-4a74-a8e9-5d3ece8a1a36	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	vzaslav@mail.ru	разработчик работы		\N	\N	88	0	2026-04-08 14:50:46.35357+00	2026-04-18 21:36:36.371247+00	t	employee	\N	\N	\N
d280d3b8-3beb-4465-8038-883f85deaac1	8b990271-2396-4c2b-89a2-2c6851a93130	vzaslav@mail.ru	Менеджер проекта	Подразделения развития	\N	\N	75	0	2026-04-17 07:23:00.877704+00	2026-04-18 22:56:49.857291+00	t	employee	5cd4eb9a-90d9-4829-80ee-419ec03a7bcb	a0000000-0000-0000-0000-000000000001	\N
0ba03843-f47e-4cde-8140-cea708ff4029	26c99015-c462-4057-950a-64bb9e988226	tester3@example.com			\N	\N	0	0	2026-04-08 18:27:09.021659+00	2026-04-20 14:04:11.528675+00	t	employee	\N	a0000000-0000-0000-0000-000000000001	\N
1a39fe26-6e62-4b97-9cde-7f762df0e874	f35d0adc-cc55-4e4e-96a1-e81f89d471b8	Andrey Bogdashev			\N	\N	0	0	2026-04-20 14:03:26.262668+00	2026-04-20 14:04:40.186864+00	t	manager	\N	a0000000-0000-0000-0000-000000000001	\N
d82228dd-63a6-40e6-a65e-675baaff254f	2356547d-926a-41e6-9159-f258d1b05f2e	Maria Goncharova			\N	\N	100	0	2026-04-20 14:05:20.87464+00	2026-04-20 14:13:08.48958+00	t	manager	\N	a0000000-0000-0000-0000-000000000001	\N
85cd663b-a24a-45e0-bc9f-e320654d3093	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	Tony Shipunov			\N	\N	33	0	2026-04-20 15:06:04.383183+00	2026-04-20 15:11:17.680631+00	t	manager	\N	a0000000-0000-0000-0000-000000000001	\N
a3981002-7ead-4afc-8e80-b2dc75b661b3	515a6b77-209b-48f9-ab92-af33dbc099de	natsnn@ya.ru	Линейный руководитель		\N	\N	0	0	2026-04-17 15:52:29.217471+00	2026-04-22 11:20:20.809617+00	t	hrd	107611ad-bc75-4db1-9194-c98e7bf63dfc	a0000000-0000-0000-0000-000000000001	\N
0a24f199-769c-4f4d-a4e1-a74bbbe1ce20	fba3fb4a-d201-4bae-8a0a-7c827d51dfa6	Александр Атцик			\N	\N	0	0	2026-04-23 10:26:25.459623+00	2026-04-23 10:28:18.224881+00	t	manager	\N	a0000000-0000-0000-0000-000000000001	\N
872d5bb3-f612-4de9-8323-47d258cfdadd	b758273d-3c01-4d12-9ac1-8a673f3f4c0e	markeze markeze			\N	\N	0	0	2026-05-04 14:54:52.644266+00	2026-05-04 15:00:03.260865+00	t	employee	\N	\N	\N
054ceb31-7cb9-43c2-9842-75e0f3302913	c457b109-29ea-4004-98b0-ebfe30ff363e	Рубан Алина			\N	\N	0	0	2026-05-13 13:36:17.89848+00	2026-05-13 13:36:18.288576+00	t	hrd	\N	1dcfe3f1-5edc-445c-867d-5d58806510df	\N
\.


--
-- Data for Name: shop_cart_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_cart_items (id, user_id, company_id, product_id, quantity, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: shop_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_order_items (id, order_id, product_id, quantity, unit_price, subtotal, product_title, created_at) FROM stdin;
\.


--
-- Data for Name: shop_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_orders (id, user_id, company_id, total_amount, status, cancel_reason, fulfilled_by, fulfilled_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: shop_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_products (id, company_id, title, description, price, image_url, stock, max_per_user, max_per_period, period_kind, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_tickets (id, user_id, subject, description, priority, status, created_at, updated_at, company_id, admin_response, responded_by, responded_at, ai_suggestion) FROM stdin;
491e3108-66ac-4a6b-b7eb-daa6b2f0b103	856bd219-bc77-4d90-980d-2e1f3f105851	не грузит	Не получается загрузка файлов 	medium	open	2026-04-13 07:06:00.711409+00	2026-04-13 07:06:00.711409+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.team_members (id, manager_id, employee_id, created_at, company_id) FROM stdin;
\.


--
-- Data for Name: test_attempts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.test_attempts (id, company_id, user_id, test_id, test_source, answers, competency_breakdown, score, total, created_at) FROM stdin;
57a38d62-d695-4216-a9bf-c7551c4515eb	a0000000-0000-0000-0000-000000000001	8b990271-2396-4c2b-89a2-2c6851a93130	\N	ai_generated	[{"weight": 1, "competency": "Коммуникация", "is_correct": true, "question_id": "q1", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q2", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Командная работа", "is_correct": false, "question_id": "q3", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Решение проблем", "is_correct": false, "question_id": "q4", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Адаптивность", "is_correct": false, "question_id": "q5", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Коммуникация", "is_correct": true, "question_id": "q6", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q7", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Командная работа", "is_correct": false, "question_id": "q8", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q9", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": false, "question_id": "q10", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Коммуникация", "is_correct": false, "question_id": "q11", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q12", "correct_option_id": "a", "selected_option_id": "b"}]	[{"score": 67, "total": 3, "competency": "Коммуникация"}, {"score": 0, "total": 3, "competency": "Аналитическое мышление"}, {"score": 0, "total": 2, "competency": "Командная работа"}, {"score": 50, "total": 2, "competency": "Решение проблем"}, {"score": 0, "total": 2, "competency": "Адаптивность"}]	25	100	2026-04-18 22:14:58.044754+00
05847fbb-5c48-4487-97c7-a7de000f0f84	a0000000-0000-0000-0000-000000000001	8b990271-2396-4c2b-89a2-2c6851a93130	\N	ai_generated	[{"weight": 1, "competency": "Коммуникация", "is_correct": true, "question_id": "q1", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Коммуникация", "is_correct": false, "question_id": "q2", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q3", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": true, "question_id": "q4", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q5", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q6", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q7", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q8", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": true, "question_id": "q9", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": true, "question_id": "q10", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q11", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q12", "correct_option_id": "a", "selected_option_id": "a"}]	[{"score": 50, "total": 2, "competency": "Коммуникация"}, {"score": 33, "total": 3, "competency": "Аналитическое мышление"}, {"score": 100, "total": 3, "competency": "Командная работа"}, {"score": 100, "total": 2, "competency": "Решение проблем"}, {"score": 100, "total": 2, "competency": "Адаптивность"}]	75	100	2026-04-18 22:56:47.762875+00
8a26aae1-2e13-4704-8640-8ea2b81f18c9	a0000000-0000-0000-0000-000000000001	2356547d-926a-41e6-9159-f258d1b05f2e	\N	ai_generated	[{"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q1", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Коммуникация", "is_correct": true, "question_id": "q2", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q3", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": true, "question_id": "q4", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": true, "question_id": "q5", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Коммуникация", "is_correct": true, "question_id": "q6", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q7", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q8", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q9", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": true, "question_id": "q10", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": true, "question_id": "q11", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q12", "correct_option_id": "a", "selected_option_id": "a"}]	[{"score": 100, "total": 3, "competency": "Командная работа"}, {"score": 100, "total": 2, "competency": "Коммуникация"}, {"score": 100, "total": 3, "competency": "Решение проблем"}, {"score": 100, "total": 2, "competency": "Адаптивность"}, {"score": 100, "total": 2, "competency": "Аналитическое мышление"}]	100	100	2026-04-20 14:13:01.333316+00
644656c5-b132-4cc8-ba88-338356cef828	a0000000-0000-0000-0000-000000000001	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	\N	ai_generated	[{"weight": 1, "competency": "Коммуникация", "is_correct": false, "question_id": "q1", "correct_option_id": "a", "selected_option_id": "c"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q2", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Командная работа", "is_correct": true, "question_id": "q3", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Решение проблем", "is_correct": false, "question_id": "q4", "correct_option_id": "a", "selected_option_id": "c"}, {"weight": 1, "competency": "Адаптивность", "is_correct": false, "question_id": "q5", "correct_option_id": "a", "selected_option_id": "d"}, {"weight": 1, "competency": "Коммуникация", "is_correct": false, "question_id": "q6", "correct_option_id": "a", "selected_option_id": "c"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": true, "question_id": "q7", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Командная работа", "is_correct": false, "question_id": "q8", "correct_option_id": "a", "selected_option_id": "c"}, {"weight": 1, "competency": "Решение проблем", "is_correct": true, "question_id": "q9", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Адаптивность", "is_correct": true, "question_id": "q10", "correct_option_id": "a", "selected_option_id": "a"}, {"weight": 1, "competency": "Коммуникация", "is_correct": false, "question_id": "q11", "correct_option_id": "a", "selected_option_id": "b"}, {"weight": 1, "competency": "Аналитическое мышление", "is_correct": false, "question_id": "q12", "correct_option_id": "a", "selected_option_id": "b"}]	[{"score": 0, "total": 3, "competency": "Коммуникация"}, {"score": 33, "total": 3, "competency": "Аналитическое мышление"}, {"score": 50, "total": 2, "competency": "Командная работа"}, {"score": 50, "total": 2, "competency": "Решение проблем"}, {"score": 50, "total": 2, "competency": "Адаптивность"}]	33	100	2026-04-20 15:11:15.092617+00
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, role) FROM stdin;
625782fa-a7f4-4934-8ff9-378b1995825f	0fda566b-3ca0-41ae-be23-10c551985fe1	employee
a2cb293d-0b26-4ecb-955f-461243a0ea5d	22e3f6e3-76e5-4c8a-83eb-14726dd903e5	employee
bb7082c6-376d-484c-9b08-a5827b1ce5b5	2217c8c3-7907-4dc1-bfc7-9ffb49c66b2f	superadmin
99c35233-ac42-4473-a61d-88c2692aedd6	c7360db3-ef1f-4983-984b-46f9f24152c2	hrd
998e24c5-143f-4827-9822-76bb9ef2f6a9	856bd219-bc77-4d90-980d-2e1f3f105851	hrd
b0ed6888-7b0a-4bd7-bcfb-fe384503c419	8b990271-2396-4c2b-89a2-2c6851a93130	employee
aff37efb-dbb3-4361-8ea6-089b4e0e6a36	515a6b77-209b-48f9-ab92-af33dbc099de	hrd
b204b1e8-85c7-4787-b941-d2175ffc0c6e	f35d0adc-cc55-4e4e-96a1-e81f89d471b8	employee
7f59b23b-8a5d-48f9-9ebc-69789ec7c67c	26c99015-c462-4057-950a-64bb9e988226	employee
f25527c1-96a6-4567-84e1-d28e472eb6fc	2356547d-926a-41e6-9159-f258d1b05f2e	employee
b48015f8-9ac1-4a51-a46b-9ca12e992887	42dd2034-85cc-4b3b-95fb-c5fbe0ab67df	employee
d8a901a4-f0fc-459d-bce0-80fbe71abd5e	fba3fb4a-d201-4bae-8a0a-7c827d51dfa6	employee
01a35718-cb0a-4da0-8faf-e1ad7bb1ceeb	d62c9f8d-060a-4bbb-8ce4-689b410384ac	employee
103e0a51-6b8d-4a42-a528-a1373bc730ac	d62c9f8d-060a-4bbb-8ce4-689b410384ac	hrd
87c26993-2666-4d12-a703-4ab7d49e500b	b758273d-3c01-4d12-9ac1-8a673f3f4c0e	employee
d58a59bc-8d02-4189-99e9-776840c2f9e8	82c3428f-edad-412e-8f44-40070830ecfd	hrd
1157f169-f811-489d-8a61-7e0d2876c9c5	c457b109-29ea-4004-98b0-ebfe30ff363e	employee
4e0d7a4d-717c-4b9a-96aa-1951e12c09b6	c457b109-29ea-4004-98b0-ebfe30ff363e	hrd
\.


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: assessment_scenarios assessment_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scenarios
    ADD CONSTRAINT assessment_scenarios_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);


--
-- Name: career_goals career_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_goals
    ADD CONSTRAINT career_goals_pkey PRIMARY KEY (id);


--
-- Name: career_level_actions career_level_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_level_actions
    ADD CONSTRAINT career_level_actions_pkey PRIMARY KEY (id);


--
-- Name: career_step_scenarios career_step_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_step_scenarios
    ADD CONSTRAINT career_step_scenarios_pkey PRIMARY KEY (id);


--
-- Name: career_step_scenarios career_step_scenarios_template_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_step_scenarios
    ADD CONSTRAINT career_step_scenarios_template_id_step_order_key UNIQUE (template_id, step_order);


--
-- Name: career_step_submission_files career_step_submission_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_step_submission_files
    ADD CONSTRAINT career_step_submission_files_pkey PRIMARY KEY (id);


--
-- Name: career_step_submissions career_step_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_step_submissions
    ADD CONSTRAINT career_step_submissions_pkey PRIMARY KEY (id);


--
-- Name: career_track_templates career_track_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_track_templates
    ADD CONSTRAINT career_track_templates_pkey PRIMARY KEY (id);


--
-- Name: closed_question_tests closed_question_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closed_question_tests
    ADD CONSTRAINT closed_question_tests_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_currency_settings company_currency_settings_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_currency_settings
    ADD CONSTRAINT company_currency_settings_company_id_key UNIQUE (company_id);


--
-- Name: company_currency_settings company_currency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_currency_settings
    ADD CONSTRAINT company_currency_settings_pkey PRIMARY KEY (id);


--
-- Name: company_onboarding_settings company_onboarding_settings_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_onboarding_settings
    ADD CONSTRAINT company_onboarding_settings_company_id_key UNIQUE (company_id);


--
-- Name: company_onboarding_settings company_onboarding_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_onboarding_settings
    ADD CONSTRAINT company_onboarding_settings_pkey PRIMARY KEY (id);


--
-- Name: competencies competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies
    ADD CONSTRAINT competencies_pkey PRIMARY KEY (id);


--
-- Name: currency_balances currency_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_balances
    ADD CONSTRAINT currency_balances_pkey PRIMARY KEY (id);


--
-- Name: currency_balances currency_balances_user_company_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_balances
    ADD CONSTRAINT currency_balances_user_company_unique UNIQUE (user_id, company_id);


--
-- Name: currency_balances currency_balances_user_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_balances
    ADD CONSTRAINT currency_balances_user_id_company_id_key UNIQUE (user_id, company_id);


--
-- Name: currency_transactions currency_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_transactions
    ADD CONSTRAINT currency_transactions_pkey PRIMARY KEY (id);


--
-- Name: demo_requests demo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT demo_requests_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: email_domain_position_mappings email_domain_position_mappings_company_id_email_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_domain_position_mappings
    ADD CONSTRAINT email_domain_position_mappings_company_id_email_domain_key UNIQUE (company_id, email_domain);


--
-- Name: email_domain_position_mappings email_domain_position_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_domain_position_mappings
    ADD CONSTRAINT email_domain_position_mappings_pkey PRIMARY KEY (id);


--
-- Name: employee_career_assignments employee_career_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_career_assignments
    ADD CONSTRAINT employee_career_assignments_pkey PRIMARY KEY (id);


--
-- Name: employee_career_assignments employee_career_assignments_user_id_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_career_assignments
    ADD CONSTRAINT employee_career_assignments_user_id_template_id_key UNIQUE (user_id, template_id);


--
-- Name: employee_invitations employee_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_invitations
    ADD CONSTRAINT employee_invitations_pkey PRIMARY KEY (id);


--
-- Name: employee_questionnaire_files employee_questionnaire_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_questionnaire_files
    ADD CONSTRAINT employee_questionnaire_files_pkey PRIMARY KEY (id);


--
-- Name: employee_questionnaires employee_questionnaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_questionnaires
    ADD CONSTRAINT employee_questionnaires_pkey PRIMARY KEY (id);


--
-- Name: employee_rewards employee_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_rewards
    ADD CONSTRAINT employee_rewards_pkey PRIMARY KEY (id);


--
-- Name: employee_risk_scores employee_risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_risk_scores
    ADD CONSTRAINT employee_risk_scores_pkey PRIMARY KEY (id);


--
-- Name: employee_risk_scores employee_risk_scores_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_risk_scores
    ADD CONSTRAINT employee_risk_scores_user_id_key UNIQUE (user_id);


--
-- Name: gamification_reward_types gamification_reward_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamification_reward_types
    ADD CONSTRAINT gamification_reward_types_pkey PRIMARY KEY (id);


--
-- Name: goal_checklist_items goal_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_checklist_items
    ADD CONSTRAINT goal_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: hr_documents hr_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_documents
    ADD CONSTRAINT hr_documents_pkey PRIMARY KEY (id);


--
-- Name: hr_task_assignees hr_task_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_task_assignees
    ADD CONSTRAINT hr_task_assignees_pkey PRIMARY KEY (id);


--
-- Name: hr_task_assignees hr_task_assignees_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_task_assignees
    ADD CONSTRAINT hr_task_assignees_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: hr_tasks hr_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_tasks
    ADD CONSTRAINT hr_tasks_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: peer_recognition_reactions peer_recognition_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_recognition_reactions
    ADD CONSTRAINT peer_recognition_reactions_pkey PRIMARY KEY (id);


--
-- Name: peer_recognition_reactions peer_recognition_reactions_recognition_id_user_id_reaction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_recognition_reactions
    ADD CONSTRAINT peer_recognition_reactions_recognition_id_user_id_reaction_key UNIQUE (recognition_id, user_id, reaction);


--
-- Name: peer_recognitions peer_recognitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_recognitions
    ADD CONSTRAINT peer_recognitions_pkey PRIMARY KEY (id);


--
-- Name: position_career_paths position_career_paths_from_position_id_to_position_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_career_paths
    ADD CONSTRAINT position_career_paths_from_position_id_to_position_id_key UNIQUE (from_position_id, to_position_id);


--
-- Name: position_career_paths position_career_paths_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_career_paths
    ADD CONSTRAINT position_career_paths_pkey PRIMARY KEY (id);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: pricing_inquiries pricing_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_inquiries
    ADD CONSTRAINT pricing_inquiries_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: shop_cart_items shop_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_cart_items
    ADD CONSTRAINT shop_cart_items_pkey PRIMARY KEY (id);


--
-- Name: shop_cart_items shop_cart_items_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_cart_items
    ADD CONSTRAINT shop_cart_items_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: shop_order_items shop_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_order_items
    ADD CONSTRAINT shop_order_items_pkey PRIMARY KEY (id);


--
-- Name: shop_orders shop_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_pkey PRIMARY KEY (id);


--
-- Name: shop_products shop_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_products
    ADD CONSTRAINT shop_products_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_manager_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_manager_id_employee_id_key UNIQUE (manager_id, employee_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: companies_name_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_name_lower_unique ON public.companies USING btree (lower(btrim(name)));


--
-- Name: idx_achievements_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_achievements_company_id ON public.achievements USING btree (company_id);


--
-- Name: idx_assessment_scenarios_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assessment_scenarios_company_id ON public.assessment_scenarios USING btree (company_id);


--
-- Name: idx_assessments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assessments_company_id ON public.assessments USING btree (company_id);


--
-- Name: idx_career_goals_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_career_goals_assignment ON public.career_goals USING btree (assignment_id, step_order);


--
-- Name: idx_career_goals_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_career_goals_company_id ON public.career_goals USING btree (company_id);


--
-- Name: idx_competencies_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competencies_company_id ON public.competencies USING btree (company_id);


--
-- Name: idx_currency_tx_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_currency_tx_company ON public.currency_transactions USING btree (company_id, created_at DESC);


--
-- Name: idx_currency_tx_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_currency_tx_user ON public.currency_transactions USING btree (user_id, created_at DESC);


--
-- Name: idx_demo_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_requests_status ON public.demo_requests USING btree (status, created_at DESC);


--
-- Name: idx_departments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_company_id ON public.departments USING btree (company_id);


--
-- Name: idx_employee_invitations_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_invitations_token_hash ON public.employee_invitations USING btree (token_hash);


--
-- Name: idx_employee_questionnaire_files_questionnaire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_questionnaire_files_questionnaire ON public.employee_questionnaire_files USING btree (questionnaire_id);


--
-- Name: idx_employee_questionnaires_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_questionnaires_company_status ON public.employee_questionnaires USING btree (company_id, status);


--
-- Name: idx_employee_questionnaires_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_questionnaires_user_created ON public.employee_questionnaires USING btree (user_id, created_at DESC);


--
-- Name: idx_hr_documents_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_documents_company_id ON public.hr_documents USING btree (company_id);


--
-- Name: idx_hr_task_assignees_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_task_assignees_task ON public.hr_task_assignees USING btree (task_id);


--
-- Name: idx_hr_task_assignees_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_task_assignees_user ON public.hr_task_assignees USING btree (user_id);


--
-- Name: idx_hr_tasks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_tasks_company ON public.hr_tasks USING btree (company_id, status);


--
-- Name: idx_hr_tasks_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_tasks_created_by ON public.hr_tasks USING btree (created_by);


--
-- Name: idx_invitations_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_email_lower ON public.employee_invitations USING btree (lower(email));


--
-- Name: idx_peer_recognitions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_recognitions_company ON public.peer_recognitions USING btree (company_id, created_at DESC);


--
-- Name: idx_peer_recognitions_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_recognitions_from ON public.peer_recognitions USING btree (from_user_id);


--
-- Name: idx_peer_recognitions_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_recognitions_to ON public.peer_recognitions USING btree (to_user_id);


--
-- Name: idx_positions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_company_id ON public.positions USING btree (company_id);


--
-- Name: idx_positions_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_company_status ON public.positions USING btree (company_id, profile_status);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);


--
-- Name: idx_recognition_reactions_rec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recognition_reactions_rec ON public.peer_recognition_reactions USING btree (recognition_id);


--
-- Name: idx_risk_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_company ON public.employee_risk_scores USING btree (company_id, risk_level);


--
-- Name: idx_shop_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_order_items_order ON public.shop_order_items USING btree (order_id);


--
-- Name: idx_shop_order_items_product_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_order_items_product_user ON public.shop_order_items USING btree (product_id);


--
-- Name: idx_shop_orders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_orders_company ON public.shop_orders USING btree (company_id, status);


--
-- Name: idx_shop_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_orders_user ON public.shop_orders USING btree (user_id, created_at DESC);


--
-- Name: idx_shop_products_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_products_company ON public.shop_products USING btree (company_id, is_active);


--
-- Name: idx_step_submissions_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_step_submissions_assignment ON public.career_step_submissions USING btree (assignment_id, step_order);


--
-- Name: idx_step_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_step_submissions_status ON public.career_step_submissions USING btree (status, company_id);


--
-- Name: idx_submission_files; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submission_files ON public.career_step_submission_files USING btree (submission_id);


--
-- Name: idx_team_members_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_company_id ON public.team_members USING btree (company_id);


--
-- Name: uq_invitations_company_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_invitations_company_email_pending ON public.employee_invitations USING btree (company_id, lower(email)) WHERE (status = 'pending'::text);


--
-- Name: assessments auto_reward_assessment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_reward_assessment AFTER INSERT ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.on_assessment_created();


--
-- Name: employee_career_assignments auto_reward_career_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_reward_career_assignment AFTER INSERT OR UPDATE ON public.employee_career_assignments FOR EACH ROW EXECUTE FUNCTION public.on_career_assignment_updated();


--
-- Name: career_goals auto_reward_career_goal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_reward_career_goal AFTER INSERT OR UPDATE ON public.career_goals FOR EACH ROW EXECUTE FUNCTION public.on_career_goal_updated();


--
-- Name: profiles auto_reward_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_reward_profile AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.on_profile_updated();


--
-- Name: demo_requests demo_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER demo_requests_updated_at BEFORE UPDATE ON public.demo_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_rewards on_reward_granted_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_reward_granted_trigger AFTER INSERT ON public.employee_rewards FOR EACH ROW EXECUTE FUNCTION public.on_reward_granted();


--
-- Name: closed_question_tests set_closed_question_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_closed_question_tests_updated_at BEFORE UPDATE ON public.closed_question_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_domain_position_mappings set_email_domain_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_email_domain_mappings_updated_at BEFORE UPDATE ON public.email_domain_position_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_currency_settings trg_currency_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_currency_settings_updated BEFORE UPDATE ON public.company_currency_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_invitations trg_hash_invitation_token; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hash_invitation_token BEFORE INSERT OR UPDATE OF token ON public.employee_invitations FOR EACH ROW EXECUTE FUNCTION public.hash_invitation_token();


--
-- Name: hr_tasks trg_hr_task_payout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hr_task_payout AFTER UPDATE ON public.hr_tasks FOR EACH ROW EXECUTE FUNCTION public.payout_hr_task_rewards();


--
-- Name: hr_tasks trg_hr_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hr_tasks_updated BEFORE UPDATE ON public.hr_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_invitations trg_invitations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invitations_updated BEFORE UPDATE ON public.employee_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_career_assignments trg_on_career_step_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_on_career_step_changed AFTER INSERT OR UPDATE ON public.employee_career_assignments FOR EACH ROW EXECUTE FUNCTION public.on_career_step_changed();


--
-- Name: test_attempts trg_on_test_attempt_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_on_test_attempt_created AFTER INSERT ON public.test_attempts FOR EACH ROW EXECUTE FUNCTION public.on_test_attempt_created();


--
-- Name: company_onboarding_settings trg_onboarding_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_onboarding_settings_updated BEFORE UPDATE ON public.company_onboarding_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: peer_recognitions trg_payout_peer_recognition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payout_peer_recognition AFTER INSERT ON public.peer_recognitions FOR EACH ROW EXECUTE FUNCTION public.payout_peer_recognition();


--
-- Name: pricing_inquiries trg_pricing_inquiries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pricing_inquiries_updated_at BEFORE UPDATE ON public.pricing_inquiries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles trg_protect_profile_sensitive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_profile_sensitive BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();


--
-- Name: employee_rewards trg_reward_award_currency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reward_award_currency AFTER INSERT ON public.employee_rewards FOR EACH ROW EXECUTE FUNCTION public.on_reward_grant_award_currency();


--
-- Name: shop_cart_items trg_shop_cart_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shop_cart_updated BEFORE UPDATE ON public.shop_cart_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shop_orders trg_shop_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shop_orders_updated BEFORE UPDATE ON public.shop_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shop_products trg_shop_products_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shop_products_updated BEFORE UPDATE ON public.shop_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: career_step_scenarios trg_step_scenarios_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_step_scenarios_updated BEFORE UPDATE ON public.career_step_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: career_step_submissions trg_step_submissions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_step_submissions_updated BEFORE UPDATE ON public.career_step_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_career_assignments trg_sync_step_goals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_step_goals AFTER INSERT OR UPDATE OF current_step ON public.employee_career_assignments FOR EACH ROW EXECUTE FUNCTION public.on_career_assignment_step_sync();


--
-- Name: employee_questionnaires trg_validate_employee_questionnaire; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_employee_questionnaire BEFORE INSERT OR UPDATE ON public.employee_questionnaires FOR EACH ROW EXECUTE FUNCTION public.validate_employee_questionnaire();


--
-- Name: positions trg_validate_position_profile_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_position_profile_status BEFORE INSERT OR UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.validate_position_profile_status();


--
-- Name: assessment_scenarios update_assessment_scenarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assessment_scenarios_updated_at BEFORE UPDATE ON public.assessment_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: career_goals update_career_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_career_goals_updated_at BEFORE UPDATE ON public.career_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: position_career_paths update_career_paths_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_career_paths_updated_at BEFORE UPDATE ON public.position_career_paths FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: career_track_templates update_career_track_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_career_track_templates_updated_at BEFORE UPDATE ON public.career_track_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: companies update_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: competencies update_competencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_competencies_updated_at BEFORE UPDATE ON public.competencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: departments update_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_career_assignments update_employee_career_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employee_career_assignments_updated_at BEFORE UPDATE ON public.employee_career_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_risk_scores update_employee_risk_scores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employee_risk_scores_updated_at BEFORE UPDATE ON public.employee_risk_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gamification_reward_types update_gamification_reward_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gamification_reward_types_updated_at BEFORE UPDATE ON public.gamification_reward_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hr_documents update_hr_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hr_documents_updated_at BEFORE UPDATE ON public.hr_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: positions update_positions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_tickets update_support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gamification_reward_types validate_reward_type_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_reward_type_trigger BEFORE INSERT OR UPDATE ON public.gamification_reward_types FOR EACH ROW EXECUTE FUNCTION public.validate_reward_type();


--
-- Name: achievements achievements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: achievements achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessment_scenarios assessment_scenarios_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scenarios
    ADD CONSTRAINT assessment_scenarios_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: assessments assessments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: assessments assessments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_goals career_goals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_goals
    ADD CONSTRAINT career_goals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: career_goals career_goals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_goals
    ADD CONSTRAINT career_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_level_actions career_level_actions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_level_actions
    ADD CONSTRAINT career_level_actions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.career_track_templates(id) ON DELETE CASCADE;


--
-- Name: career_step_submission_files career_step_submission_files_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_step_submission_files
    ADD CONSTRAINT career_step_submission_files_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.career_step_submissions(id) ON DELETE CASCADE;


--
-- Name: career_track_templates career_track_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_track_templates
    ADD CONSTRAINT career_track_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: career_track_templates career_track_templates_from_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_track_templates
    ADD CONSTRAINT career_track_templates_from_position_id_fkey FOREIGN KEY (from_position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: career_track_templates career_track_templates_to_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_track_templates
    ADD CONSTRAINT career_track_templates_to_position_id_fkey FOREIGN KEY (to_position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: closed_question_tests closed_question_tests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closed_question_tests
    ADD CONSTRAINT closed_question_tests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: closed_question_tests closed_question_tests_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closed_question_tests
    ADD CONSTRAINT closed_question_tests_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE SET NULL;


--
-- Name: competencies competencies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies
    ADD CONSTRAINT competencies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: competencies competencies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies
    ADD CONSTRAINT competencies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: departments departments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: departments departments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: email_domain_position_mappings email_domain_position_mappings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_domain_position_mappings
    ADD CONSTRAINT email_domain_position_mappings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: email_domain_position_mappings email_domain_position_mappings_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_domain_position_mappings
    ADD CONSTRAINT email_domain_position_mappings_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: employee_career_assignments employee_career_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_career_assignments
    ADD CONSTRAINT employee_career_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_career_assignments employee_career_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_career_assignments
    ADD CONSTRAINT employee_career_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.career_track_templates(id) ON DELETE CASCADE;


--
-- Name: employee_rewards employee_rewards_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_rewards
    ADD CONSTRAINT employee_rewards_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_rewards employee_rewards_reward_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_rewards
    ADD CONSTRAINT employee_rewards_reward_type_id_fkey FOREIGN KEY (reward_type_id) REFERENCES public.gamification_reward_types(id) ON DELETE CASCADE;


--
-- Name: gamification_reward_types gamification_reward_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamification_reward_types
    ADD CONSTRAINT gamification_reward_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: goal_checklist_items goal_checklist_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_checklist_items
    ADD CONSTRAINT goal_checklist_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: goal_checklist_items goal_checklist_items_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_checklist_items
    ADD CONSTRAINT goal_checklist_items_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.career_goals(id) ON DELETE CASCADE;


--
-- Name: hr_documents hr_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_documents
    ADD CONSTRAINT hr_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hr_documents hr_documents_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_documents
    ADD CONSTRAINT hr_documents_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.assessment_scenarios(id) ON DELETE SET NULL;


--
-- Name: hr_task_assignees hr_task_assignees_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_task_assignees
    ADD CONSTRAINT hr_task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.hr_tasks(id) ON DELETE CASCADE;


--
-- Name: hr_tasks hr_tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_tasks
    ADD CONSTRAINT hr_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: peer_recognition_reactions peer_recognition_reactions_recognition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_recognition_reactions
    ADD CONSTRAINT peer_recognition_reactions_recognition_id_fkey FOREIGN KEY (recognition_id) REFERENCES public.peer_recognitions(id) ON DELETE CASCADE;


--
-- Name: position_career_paths position_career_paths_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_career_paths
    ADD CONSTRAINT position_career_paths_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: position_career_paths position_career_paths_from_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_career_paths
    ADD CONSTRAINT position_career_paths_from_position_id_fkey FOREIGN KEY (from_position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: position_career_paths position_career_paths_to_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_career_paths
    ADD CONSTRAINT position_career_paths_to_position_id_fkey FOREIGN KEY (to_position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: positions positions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: profiles profiles_pending_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pending_position_id_fkey FOREIGN KEY (pending_position_id) REFERENCES public.positions(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shop_cart_items shop_cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_cart_items
    ADD CONSTRAINT shop_cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.shop_products(id) ON DELETE CASCADE;


--
-- Name: shop_order_items shop_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_order_items
    ADD CONSTRAINT shop_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.shop_orders(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: team_members team_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: test_attempts test_attempts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.closed_question_tests(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hr_task_assignees Assignee can mark own as in_review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignee can mark own as in_review" ON public.hr_task_assignees FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK (((auth.uid() = user_id) AND (individual_status = ANY (ARRAY['open'::text, 'in_review'::text]))));


--
-- Name: hr_task_assignees Assignee view own assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignee view own assignment" ON public.hr_task_assignees FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: hr_tasks Assignees can view their hr_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignees can view their hr_tasks" ON public.hr_tasks FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_task_assignees a
  WHERE ((a.task_id = hr_tasks.id) AND (a.user_id = auth.uid())))));


--
-- Name: companies Authenticated can view own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view own company" ON public.companies FOR SELECT TO authenticated USING ((id = public.get_user_company_id(auth.uid())));


--
-- Name: hr_tasks Author can view own hr_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Author can view own hr_tasks" ON public.hr_tasks FOR SELECT TO authenticated USING ((auth.uid() = created_by));


--
-- Name: peer_recognitions Author or admins can delete recognition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Author or admins can delete recognition" ON public.peer_recognitions FOR DELETE TO authenticated USING (((from_user_id = auth.uid()) OR public.has_role(auth.uid(), 'hrd'::public.app_role) OR public.has_role(auth.uid(), 'company_admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role)));


--
-- Name: hr_task_assignees Author view assignees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Author view assignees" ON public.hr_task_assignees FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_tasks t
  WHERE ((t.id = hr_task_assignees.task_id) AND (t.created_by = auth.uid())))));


--
-- Name: demo_requests Block direct insert demo_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block direct insert demo_requests" ON public.demo_requests FOR INSERT WITH CHECK (false);


--
-- Name: career_level_actions Company admin can manage actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage actions" ON public.career_level_actions USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.career_track_templates t
  WHERE ((t.id = career_level_actions.template_id) AND (t.company_id = public.get_user_company_id(auth.uid())))))));


--
-- Name: employee_career_assignments Company admin can manage assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage assignments" ON public.employee_career_assignments USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: departments Company admin can manage company departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage company departments" ON public.departments USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: hr_documents Company admin can manage company hr_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage company hr_documents" ON public.hr_documents USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: email_domain_position_mappings Company admin can manage company mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage company mappings" ON public.email_domain_position_mappings USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: positions Company admin can manage company positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage company positions" ON public.positions USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: closed_question_tests Company admin can manage company tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage company tests" ON public.closed_question_tests USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: gamification_reward_types Company admin can manage reward types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage reward types" ON public.gamification_reward_types USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_rewards Company admin can manage rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage rewards" ON public.employee_rewards USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_step_scenarios Company admin can manage step scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage step scenarios" ON public.career_step_scenarios USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_track_templates Company admin can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can manage templates" ON public.career_track_templates USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: test_attempts Company admin can view company attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can view company attempts" ON public.test_attempts FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: profiles Company admin can view company profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin can view company profiles" ON public.profiles FOR SELECT USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: hr_tasks Company admin manage company hr_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage company hr_tasks" ON public.hr_tasks TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_invitations Company admin manage company invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage company invitations" ON public.employee_invitations TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: company_currency_settings Company admin manage currency settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage currency settings" ON public.company_currency_settings USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: hr_task_assignees Company admin manage hr_task_assignees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage hr_task_assignees" ON public.hr_task_assignees TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_tasks t
  WHERE ((t.id = hr_task_assignees.task_id) AND public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (t.company_id = public.get_user_company_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hr_tasks t
  WHERE ((t.id = hr_task_assignees.task_id) AND public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (t.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: company_onboarding_settings Company admin manage onboarding settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage onboarding settings" ON public.company_onboarding_settings TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: shop_orders Company admin manage orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage orders" ON public.shop_orders USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: shop_products Company admin manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage products" ON public.shop_products USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_step_submissions Company admin manage submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin manage submissions" ON public.career_step_submissions USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: profiles Company admin update non-sensitive profile fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin update non-sensitive profile fields" ON public.profiles FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: currency_balances Company admin view company balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin view company balances" ON public.currency_balances FOR SELECT USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_questionnaires Company admin view company questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin view company questionnaires" ON public.employee_questionnaires FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: currency_transactions Company admin view company transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company admin view company transactions" ON public.currency_transactions FOR SELECT USING ((public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: assessment_scenarios Company users can view active company scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view active company scenarios" ON public.assessment_scenarios FOR SELECT TO authenticated USING (((is_active = true) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: closed_question_tests Company users can view active company tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view active company tests" ON public.closed_question_tests FOR SELECT TO authenticated USING (((is_active = true) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: position_career_paths Company users can view company career paths; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view company career paths" ON public.position_career_paths FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: email_domain_position_mappings Company users can view company mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view company mappings" ON public.email_domain_position_mappings FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: gamification_reward_types Company users can view company reward types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view company reward types" ON public.gamification_reward_types FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: career_track_templates Company users can view company templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view company templates" ON public.career_track_templates FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: departments Company users can view own company departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view own company departments" ON public.departments FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: positions Company users can view own company positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view own company positions" ON public.positions FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: career_step_scenarios Company users can view step scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users can view step scenarios" ON public.career_step_scenarios FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: shop_products Company users view active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users view active products" ON public.shop_products FOR SELECT TO authenticated USING (((is_active = true) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: company_currency_settings Company users view currency settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users view currency settings" ON public.company_currency_settings FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: company_onboarding_settings Company users view onboarding settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company users view onboarding settings" ON public.company_onboarding_settings FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: employee_questionnaire_files Delete own draft questionnaire files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete own draft questionnaire files" ON public.employee_questionnaire_files FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employee_questionnaires q
  WHERE ((q.id = employee_questionnaire_files.questionnaire_id) AND (q.user_id = auth.uid()) AND (q.status = ANY (ARRAY['draft'::text, 'submitted'::text]))))));


--
-- Name: employee_questionnaires Employees create own questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees create own questionnaires" ON public.employee_questionnaires FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_questionnaires Employees update own draft questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees update own draft questionnaires" ON public.employee_questionnaires FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])))) WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_questionnaires Employees view own questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees view own questionnaires" ON public.employee_questionnaires FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_roles HRD can delete non-privileged roles in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can delete non-privileged roles in own company" ON public.user_roles FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (role = ANY (ARRAY['employee'::public.app_role, 'manager'::public.app_role])) AND (public.get_user_company_id(user_id) IS NOT NULL) AND (public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid()))));


--
-- Name: user_roles HRD can insert non-privileged roles in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can insert non-privileged roles in own company" ON public.user_roles FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (role = ANY (ARRAY['employee'::public.app_role, 'manager'::public.app_role])) AND (public.get_user_company_id(user_id) IS NOT NULL) AND (public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid()))));


--
-- Name: career_level_actions HRD can manage actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage actions" ON public.career_level_actions USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.career_track_templates t
  WHERE ((t.id = career_level_actions.template_id) AND (t.company_id = public.get_user_company_id(auth.uid())))))));


--
-- Name: employee_career_assignments HRD can manage company assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company assignments" ON public.employee_career_assignments USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: position_career_paths HRD can manage company career paths; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company career paths" ON public.position_career_paths USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: departments HRD can manage company departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company departments" ON public.departments USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_goals HRD can manage company goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company goals" ON public.career_goals USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: hr_documents HRD can manage company hr_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company hr_documents" ON public.hr_documents USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: email_domain_position_mappings HRD can manage company mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company mappings" ON public.email_domain_position_mappings USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: positions HRD can manage company positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company positions" ON public.positions USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: gamification_reward_types HRD can manage company reward types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company reward types" ON public.gamification_reward_types USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_rewards HRD can manage company rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company rewards" ON public.employee_rewards USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: assessment_scenarios HRD can manage company scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company scenarios" ON public.assessment_scenarios USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: team_members HRD can manage company teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company teams" ON public.team_members USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_track_templates HRD can manage company templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company templates" ON public.career_track_templates USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: closed_question_tests HRD can manage company tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage company tests" ON public.closed_question_tests USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_step_scenarios HRD can manage step scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can manage step scenarios" ON public.career_step_scenarios USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: support_tickets HRD can update company tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can update company tickets" ON public.support_tickets FOR UPDATE USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: achievements HRD can view company achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company achievements" ON public.achievements FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: assessments HRD can view company assessments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company assessments" ON public.assessments FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: test_attempts HRD can view company attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company attempts" ON public.test_attempts FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: competencies HRD can view company competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company competencies" ON public.competencies FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_goals HRD can view company goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company goals" ON public.career_goals FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: profiles HRD can view company profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company profiles" ON public.profiles FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: support_tickets HRD can view company tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD can view company tickets" ON public.support_tickets FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: hr_task_assignees HRD manage company hr_task_assignees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage company hr_task_assignees" ON public.hr_task_assignees TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hr_tasks t
  WHERE ((t.id = hr_task_assignees.task_id) AND public.has_role(auth.uid(), 'hrd'::public.app_role) AND (t.company_id = public.get_user_company_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hr_tasks t
  WHERE ((t.id = hr_task_assignees.task_id) AND public.has_role(auth.uid(), 'hrd'::public.app_role) AND (t.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: hr_tasks HRD manage company hr_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage company hr_tasks" ON public.hr_tasks TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_invitations HRD manage company invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage company invitations" ON public.employee_invitations TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: shop_orders HRD manage company orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage company orders" ON public.shop_orders USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: career_step_submissions HRD manage company submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage company submissions" ON public.career_step_submissions USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: company_currency_settings HRD manage currency settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage currency settings" ON public.company_currency_settings USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: company_onboarding_settings HRD manage onboarding settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage onboarding settings" ON public.company_onboarding_settings TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: shop_products HRD manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD manage products" ON public.shop_products USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: currency_balances HRD view company balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD view company balances" ON public.currency_balances FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_questionnaires HRD view company questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD view company questionnaires" ON public.employee_questionnaires FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: currency_transactions HRD view company transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD view company transactions" ON public.currency_transactions FOR SELECT USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: user_roles HRD view company user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD view company user_roles" ON public.user_roles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'hrd'::public.app_role) AND (public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid()))));


--
-- Name: employee_risk_scores HRD/admin can update risk in company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD/admin can update risk in company" ON public.employee_risk_scores FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'hrd'::public.app_role) OR public.has_role(auth.uid(), 'company_admin'::public.app_role)) AND (company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: employee_risk_scores HRD/admin can upsert risk in company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD/admin can upsert risk in company" ON public.employee_risk_scores FOR INSERT TO authenticated WITH CHECK (((public.has_role(auth.uid(), 'hrd'::public.app_role) OR public.has_role(auth.uid(), 'company_admin'::public.app_role)) AND (company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: employee_risk_scores HRD/admin/superadmin can view risk in company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HRD/admin/superadmin can view risk in company" ON public.employee_risk_scores FOR SELECT TO authenticated USING ((((public.has_role(auth.uid(), 'hrd'::public.app_role) OR public.has_role(auth.uid(), 'company_admin'::public.app_role)) AND (company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))) OR public.has_role(auth.uid(), 'superadmin'::public.app_role)));


--
-- Name: employee_questionnaire_files Insert own questionnaire files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert own questionnaire files" ON public.employee_questionnaire_files FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employee_questionnaires q
  WHERE ((q.id = employee_questionnaire_files.questionnaire_id) AND (q.user_id = auth.uid())))));


--
-- Name: career_step_submissions Manager update team submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manager update team submissions" ON public.career_step_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.employee_id = career_step_submissions.user_id) AND (tm.manager_id = auth.uid())))));


--
-- Name: career_step_submissions Manager view team submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manager view team submissions" ON public.career_step_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.employee_id = career_step_submissions.user_id) AND (tm.manager_id = auth.uid())))));


--
-- Name: team_members Managers can manage own team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can manage own team" ON public.team_members USING ((auth.uid() = manager_id));


--
-- Name: team_members Managers can view own team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view own team" ON public.team_members FOR SELECT USING ((auth.uid() = manager_id));


--
-- Name: peer_recognition_reactions Members can view reactions in same company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view reactions in same company" ON public.peer_recognition_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.peer_recognitions pr
  WHERE ((pr.id = peer_recognition_reactions.recognition_id) AND (pr.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));


--
-- Name: peer_recognitions Members of same company can view recognitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members of same company can view recognitions" ON public.peer_recognitions FOR SELECT TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: career_step_submission_files Owner deletes submission files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner deletes submission files" ON public.career_step_submission_files FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.career_step_submissions s
  WHERE ((s.id = career_step_submission_files.submission_id) AND (s.user_id = auth.uid()) AND (s.status = 'pending_review'::text)))));


--
-- Name: career_step_submission_files Owner inserts submission files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner inserts submission files" ON public.career_step_submission_files FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.career_step_submissions s
  WHERE ((s.id = career_step_submission_files.submission_id) AND (s.user_id = auth.uid())))));


--
-- Name: companies Superadmin can delete companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can delete companies" ON public.companies FOR DELETE USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: pricing_inquiries Superadmin can delete pricing inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can delete pricing inquiries" ON public.pricing_inquiries FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: user_roles Superadmin can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: career_level_actions Superadmin can manage all actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all actions" ON public.career_level_actions USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: employee_career_assignments Superadmin can manage all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all assignments" ON public.employee_career_assignments USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: companies Superadmin can manage all companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all companies" ON public.companies USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: email_domain_position_mappings Superadmin can manage all mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all mappings" ON public.email_domain_position_mappings USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: gamification_reward_types Superadmin can manage all reward types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all reward types" ON public.gamification_reward_types USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: employee_rewards Superadmin can manage all rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all rewards" ON public.employee_rewards USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: career_step_scenarios Superadmin can manage all step scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all step scenarios" ON public.career_step_scenarios USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: team_members Superadmin can manage all teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all teams" ON public.team_members USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: career_track_templates Superadmin can manage all templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all templates" ON public.career_track_templates USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: closed_question_tests Superadmin can manage all tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage all tests" ON public.closed_question_tests USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: position_career_paths Superadmin can manage career paths; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage career paths" ON public.position_career_paths USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: departments Superadmin can manage departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage departments" ON public.departments USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: hr_documents Superadmin can manage hr_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage hr_documents" ON public.hr_documents USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: positions Superadmin can manage positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage positions" ON public.positions USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: user_roles Superadmin can manage roles insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage roles insert" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: assessment_scenarios Superadmin can manage scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage scenarios" ON public.assessment_scenarios USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: pricing_inquiries Superadmin can read pricing inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can read pricing inquiries" ON public.pricing_inquiries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: profiles Superadmin can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: support_tickets Superadmin can update all tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update all tickets" ON public.support_tickets FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: pricing_inquiries Superadmin can update pricing inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update pricing inquiries" ON public.pricing_inquiries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: user_roles Superadmin can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: achievements Superadmin can view all achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all achievements" ON public.achievements FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: assessments Superadmin can view all assessments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all assessments" ON public.assessments FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: test_attempts Superadmin can view all attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all attempts" ON public.test_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: competencies Superadmin can view all competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all competencies" ON public.competencies FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: career_goals Superadmin can view all goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all goals" ON public.career_goals FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: profiles Superadmin can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: user_roles Superadmin can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: support_tickets Superadmin can view all tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can view all tickets" ON public.support_tickets FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: hr_task_assignees Superadmin manage all hr_task_assignees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all hr_task_assignees" ON public.hr_task_assignees TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: hr_tasks Superadmin manage all hr_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all hr_tasks" ON public.hr_tasks TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: employee_invitations Superadmin manage all invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all invitations" ON public.employee_invitations TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: shop_orders Superadmin manage all orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all orders" ON public.shop_orders USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: shop_products Superadmin manage all products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all products" ON public.shop_products USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: employee_questionnaires Superadmin manage all questionnaires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all questionnaires" ON public.employee_questionnaires TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: career_step_submissions Superadmin manage all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage all submissions" ON public.career_step_submissions USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: company_currency_settings Superadmin manage currency settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage currency settings" ON public.company_currency_settings USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: company_onboarding_settings Superadmin manage onboarding settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin manage onboarding settings" ON public.company_onboarding_settings TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: currency_balances Superadmin view all balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin view all balances" ON public.currency_balances FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: currency_transactions Superadmin view all transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin view all transactions" ON public.currency_transactions FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: demo_requests Superadmins update demo requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins update demo requests" ON public.demo_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: demo_requests Superadmins view demo requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins view demo requests" ON public.demo_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: peer_recognition_reactions User can react; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can react" ON public.peer_recognition_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.peer_recognitions pr
  WHERE ((pr.id = peer_recognition_reactions.recognition_id) AND (pr.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)))))));


--
-- Name: peer_recognition_reactions User can remove own reaction; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can remove own reaction" ON public.peer_recognition_reactions FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: assessments Users can create own assessments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own assessments" ON public.assessments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: test_attempts Users can create own attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own attempts" ON public.test_attempts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: support_tickets Users can create own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own tickets" ON public.support_tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: peer_recognitions Users can create recognitions for colleagues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create recognitions for colleagues" ON public.peer_recognitions FOR INSERT TO authenticated WITH CHECK (((from_user_id = auth.uid()) AND (from_user_id <> to_user_id) AND (company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.user_id = peer_recognitions.to_user_id)
 LIMIT 1))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: achievements Users can manage own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own achievements" ON public.achievements USING ((auth.uid() = user_id));


--
-- Name: goal_checklist_items Users can manage own checklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own checklist" ON public.goal_checklist_items USING ((EXISTS ( SELECT 1
   FROM public.career_goals
  WHERE ((career_goals.id = goal_checklist_items.goal_id) AND (career_goals.user_id = auth.uid())))));


--
-- Name: competencies Users can manage own competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own competencies" ON public.competencies USING ((auth.uid() = user_id));


--
-- Name: career_goals Users can manage own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own goals" ON public.career_goals USING ((auth.uid() = user_id));


--
-- Name: employee_career_assignments Users can update own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own assignments" ON public.employee_career_assignments FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can update own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tickets" ON public.support_tickets FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: career_level_actions Users can view actions via template; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view actions via template" ON public.career_level_actions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.career_track_templates t
  WHERE ((t.id = career_level_actions.template_id) AND (t.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: achievements Users can view own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own achievements" ON public.achievements FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: assessments Users can view own assessments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own assessments" ON public.assessments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: employee_career_assignments Users can view own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own assignments" ON public.employee_career_assignments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: test_attempts Users can view own attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own attempts" ON public.test_attempts FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: goal_checklist_items Users can view own checklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own checklist" ON public.goal_checklist_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.career_goals
  WHERE ((career_goals.id = goal_checklist_items.goal_id) AND (career_goals.user_id = auth.uid())))));


--
-- Name: competencies Users can view own competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own competencies" ON public.competencies FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: career_goals Users can view own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own goals" ON public.career_goals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: employee_rewards Users can view own rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own rewards" ON public.employee_rewards FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can view own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users insert own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: career_step_submissions Users insert own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own submissions" ON public.career_step_submissions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: shop_cart_items Users manage own cart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own cart" ON public.shop_cart_items USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: currency_balances Users view own balance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own balance" ON public.currency_balances FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: shop_orders Users view own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own orders" ON public.shop_orders FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: career_step_submissions Users view own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own submissions" ON public.career_step_submissions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: currency_transactions Users view own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own transactions" ON public.currency_transactions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: shop_order_items View order items via order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View order items via order" ON public.shop_order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.shop_orders o
  WHERE ((o.id = shop_order_items.order_id) AND ((o.user_id = auth.uid()) OR (public.has_role(auth.uid(), 'hrd'::public.app_role) AND (o.company_id = public.get_user_company_id(auth.uid()))) OR (public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (o.company_id = public.get_user_company_id(auth.uid()))) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))))));


--
-- Name: employee_questionnaire_files View questionnaire files via questionnaire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View questionnaire files via questionnaire" ON public.employee_questionnaire_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employee_questionnaires q
  WHERE ((q.id = employee_questionnaire_files.questionnaire_id) AND ((q.user_id = auth.uid()) OR (public.has_role(auth.uid(), 'hrd'::public.app_role) AND (q.company_id = public.get_user_company_id(auth.uid()))) OR (public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (q.company_id = public.get_user_company_id(auth.uid()))) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))))));


--
-- Name: career_step_submission_files View submission files via submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View submission files via submission" ON public.career_step_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.career_step_submissions s
  WHERE ((s.id = career_step_submission_files.submission_id) AND ((s.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.employee_id = s.user_id) AND (tm.manager_id = auth.uid())))) OR (public.has_role(auth.uid(), 'hrd'::public.app_role) AND (s.company_id = public.get_user_company_id(auth.uid()))) OR (public.has_role(auth.uid(), 'company_admin'::public.app_role) AND (s.company_id = public.get_user_company_id(auth.uid()))) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))))));


--
-- Name: achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessment_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: career_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: career_level_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_level_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: career_step_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_step_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: career_step_submission_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_step_submission_files ENABLE ROW LEVEL SECURITY;

--
-- Name: career_step_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_step_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: career_track_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_track_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: closed_question_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.closed_question_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_currency_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_currency_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_onboarding_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_onboarding_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currency_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currency_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: email_domain_position_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_domain_position_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_career_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_career_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_questionnaire_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_questionnaire_files ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_questionnaires; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_questionnaires ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_risk_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_risk_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: gamification_reward_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamification_reward_types ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_checklist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_task_assignees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_task_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_recognition_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.peer_recognition_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_recognitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.peer_recognitions ENABLE ROW LEVEL SECURITY;

--
-- Name: position_career_paths; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.position_career_paths ENABLE ROW LEVEL SECURITY;

--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict JHlO2Rfq9geiRc5Vaf4kktMkI74nqll3JWqVFpNV6gJxOM4eRqd3s0U0wijle6C

