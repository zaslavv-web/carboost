
-- ============================================================
-- 1. companies: убрать публичный SELECT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view companies" ON public.companies;

CREATE POLICY "Authenticated can view companies list"
ON public.companies FOR SELECT
TO authenticated
USING (true);

-- ============================================================
-- 2. user_roles: защита от privilege escalation
-- ============================================================
-- Ужесточаем assign_role: HRD не может работать с чужой компанией и назначать superadmin
CREATE OR REPLACE FUNCTION public.assign_role(_target_user_id uuid, _new_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- ============================================================
-- 3. email_domain_position_mappings: убрать утечку
-- ============================================================
DROP POLICY IF EXISTS "Anyone authenticated can read mappings for assignment" ON public.email_domain_position_mappings;

-- ============================================================
-- 4. create_shop_order: дедупликация уведомлений
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_shop_order(_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- ============================================================
-- 5. Storage policies: scoping по company_id (первая папка пути)
-- ============================================================
-- shop-products: HRD/admin своей компании могут CUD; SELECT — public (bucket публичный)
DROP POLICY IF EXISTS "shop_products_insert_company" ON storage.objects;
DROP POLICY IF EXISTS "shop_products_update_company" ON storage.objects;
DROP POLICY IF EXISTS "shop_products_delete_company" ON storage.objects;

CREATE POLICY "shop_products_insert_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-products'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "shop_products_update_company"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shop-products'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "shop_products_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shop-products'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

-- reward-images: то же самое (публичное чтение, но запись только своей компании)
DROP POLICY IF EXISTS "reward_images_insert_company" ON storage.objects;
DROP POLICY IF EXISTS "reward_images_update_company" ON storage.objects;
DROP POLICY IF EXISTS "reward_images_delete_company" ON storage.objects;

CREATE POLICY "reward_images_insert_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reward-images'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "reward_images_update_company"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'reward-images'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "reward_images_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reward-images'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

-- hr-documents: приватный bucket — чтение/запись только HRD/admin своей компании
DROP POLICY IF EXISTS "hr_documents_select_company" ON storage.objects;
DROP POLICY IF EXISTS "hr_documents_insert_company" ON storage.objects;
DROP POLICY IF EXISTS "hr_documents_update_company" ON storage.objects;
DROP POLICY IF EXISTS "hr_documents_delete_company" ON storage.objects;

CREATE POLICY "hr_documents_select_company"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "hr_documents_insert_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "hr_documents_update_company"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

CREATE POLICY "hr_documents_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);
