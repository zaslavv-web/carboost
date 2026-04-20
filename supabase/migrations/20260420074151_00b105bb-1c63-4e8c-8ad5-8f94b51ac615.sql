-- ============= 1. CURRENCY SETTINGS =============
CREATE TABLE public.company_currency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  currency_name text NOT NULL DEFAULT 'Монеты',
  currency_icon text NOT NULL DEFAULT '🪙',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_currency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users view currency settings" ON public.company_currency_settings
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "HRD manage currency settings" ON public.company_currency_settings
  FOR ALL USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company admin manage currency settings" ON public.company_currency_settings
  FOR ALL USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin manage currency settings" ON public.company_currency_settings
  FOR ALL USING (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_currency_settings_updated BEFORE UPDATE ON public.company_currency_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 2. CURRENCY BALANCES =============
CREATE TABLE public.currency_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);
ALTER TABLE public.currency_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own balance" ON public.currency_balances
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HRD view company balances" ON public.currency_balances
  FOR SELECT USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company admin view company balances" ON public.currency_balances
  FOR SELECT USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin view all balances" ON public.currency_balances
  FOR SELECT USING (public.has_role(auth.uid(),'superadmin'));

-- ============= 3. CURRENCY TRANSACTIONS =============
CREATE TABLE public.currency_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  amount integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('earn_event','earn_reward','purchase','refund','manual','adjustment')),
  reference_id uuid,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_currency_tx_user ON public.currency_transactions(user_id, created_at DESC);
CREATE INDEX idx_currency_tx_company ON public.currency_transactions(company_id, created_at DESC);
ALTER TABLE public.currency_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transactions" ON public.currency_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HRD view company transactions" ON public.currency_transactions
  FOR SELECT USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company admin view company transactions" ON public.currency_transactions
  FOR SELECT USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin view all transactions" ON public.currency_transactions
  FOR SELECT USING (public.has_role(auth.uid(),'superadmin'));

-- ============= 4. CORE FUNCTION: award_currency =============
CREATE OR REPLACE FUNCTION public.award_currency(
  _user_id uuid, _company_id uuid, _amount integer,
  _kind text, _description text DEFAULT NULL, _reference_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ============= 5. AUTO-AWARD ON REWARD GRANT =============
CREATE OR REPLACE FUNCTION public.on_reward_grant_award_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
DROP TRIGGER IF EXISTS trg_reward_award_currency ON public.employee_rewards;
CREATE TRIGGER trg_reward_award_currency AFTER INSERT ON public.employee_rewards
  FOR EACH ROW EXECUTE FUNCTION public.on_reward_grant_award_currency();

-- ============= 6. SHOP PRODUCTS =============
CREATE TABLE public.shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  title text NOT NULL,
  description text CHECK (char_length(description) <= 200),
  price integer NOT NULL CHECK (price > 0),
  image_url text,
  stock integer,
  max_per_user integer,
  max_per_period integer,
  period_kind text NOT NULL DEFAULT 'none' CHECK (period_kind IN ('none','month','quarter','year')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_products_company ON public.shop_products(company_id, is_active);
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users view active products" ON public.shop_products
  FOR SELECT TO authenticated USING (is_active = true AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "HRD manage products" ON public.shop_products
  FOR ALL USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company admin manage products" ON public.shop_products
  FOR ALL USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin manage all products" ON public.shop_products
  FOR ALL USING (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_shop_products_updated BEFORE UPDATE ON public.shop_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 7. SHOP ORDERS / ITEMS =============
CREATE TABLE public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  total_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending_fulfillment' CHECK (status IN ('pending_fulfillment','fulfilled','cancelled')),
  cancel_reason text,
  fulfilled_by uuid,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_orders_user ON public.shop_orders(user_id, created_at DESC);
CREATE INDEX idx_shop_orders_company ON public.shop_orders(company_id, status);
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own orders" ON public.shop_orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HRD manage company orders" ON public.shop_orders
  FOR ALL USING (public.has_role(auth.uid(),'hrd') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company admin manage orders" ON public.shop_orders
  FOR ALL USING (public.has_role(auth.uid(),'company_admin') AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Superadmin manage all orders" ON public.shop_orders
  FOR ALL USING (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_shop_orders_updated BEFORE UPDATE ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.shop_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL,
  subtotal integer NOT NULL,
  product_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_order_items_order ON public.shop_order_items(order_id);
CREATE INDEX idx_shop_order_items_product_user ON public.shop_order_items(product_id);
ALTER TABLE public.shop_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View order items via order" ON public.shop_order_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shop_orders o WHERE o.id = order_id
      AND (o.user_id = auth.uid()
        OR (public.has_role(auth.uid(),'hrd') AND o.company_id = public.get_user_company_id(auth.uid()))
        OR (public.has_role(auth.uid(),'company_admin') AND o.company_id = public.get_user_company_id(auth.uid()))
        OR public.has_role(auth.uid(),'superadmin'))
  ));

-- ============= 8. CART =============
CREATE TABLE public.shop_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.shop_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
ALTER TABLE public.shop_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cart" ON public.shop_cart_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_shop_cart_updated BEFORE UPDATE ON public.shop_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 9. CREATE ORDER FUNCTION =============
CREATE OR REPLACE FUNCTION public.create_shop_order(_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Validate items + compute total + check limits
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Некорректное количество'; END IF;

    SELECT * INTO v_product FROM public.shop_products
    WHERE id = (v_item->>'product_id')::uuid AND is_active = true AND company_id = v_company;
    IF v_product IS NULL THEN RAISE EXCEPTION 'Товар недоступен'; END IF;

    -- Check max_per_user (lifetime)
    IF v_product.max_per_user IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0) INTO v_purchased_total
      FROM public.shop_order_items oi
      JOIN public.shop_orders o ON o.id = oi.order_id
      WHERE o.user_id = v_user AND oi.product_id = v_product.id AND o.status <> 'cancelled';
      IF v_purchased_total + v_qty > v_product.max_per_user THEN
        RAISE EXCEPTION 'Превышен лимит "%" на этот товар (всего %)', v_product.title, v_product.max_per_user;
      END IF;
    END IF;

    -- Check max_per_period
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

  -- Check balance
  SELECT COALESCE(balance,0) INTO v_balance FROM public.currency_balances
  WHERE user_id = v_user AND company_id = v_company;
  IF COALESCE(v_balance,0) < v_total THEN
    RAISE EXCEPTION 'Недостаточно средств: нужно %, доступно %', v_total, COALESCE(v_balance,0);
  END IF;

  -- Create order
  INSERT INTO public.shop_orders(user_id, company_id, total_amount, status)
  VALUES (v_user, v_company, v_total, 'pending_fulfillment')
  RETURNING id INTO v_order_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_product FROM public.shop_products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.shop_order_items(order_id, product_id, quantity, unit_price, subtotal, product_title)
    VALUES (v_order_id, v_product.id, v_qty, v_product.price, v_product.price * v_qty, v_product.title);
    -- remove from cart
    DELETE FROM public.shop_cart_items WHERE user_id = v_user AND product_id = v_product.id;
  END LOOP;

  -- Debit currency
  PERFORM public.award_currency(v_user, v_company, -v_total, 'purchase',
    'Заказ #' || substring(v_order_id::text,1,8), v_order_id);

  -- Notify HRD/admins
  INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
  SELECT p.user_id, v_company, '🛍️ Новый заказ в магазине',
    'Сотрудник оформил заказ на ' || v_total || ' монет. Требуется выдача.', 'shop_order'
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.company_id = v_company AND ur.role IN ('hrd','company_admin');

  -- Notify user
  INSERT INTO public.notifications(user_id, company_id, title, description, notification_type)
  VALUES (v_user, v_company, '✅ Заказ оформлен',
    'Ваш заказ на ' || v_total || ' монет ожидает выдачи HRD.', 'shop_order');

  RETURN v_order_id;
END;
$$;

-- ============= 10. FULFILL ORDER =============
CREATE OR REPLACE FUNCTION public.fulfill_shop_order(_order_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ============= 11. STORAGE BUCKET =============
INSERT INTO storage.buckets (id, name, public) VALUES ('shop-products','shop-products',true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read shop products" ON storage.objects
  FOR SELECT USING (bucket_id = 'shop-products');
CREATE POLICY "HRD upload shop products" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'shop-products' AND
    (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'superadmin')));
CREATE POLICY "HRD update shop products" ON storage.objects
  FOR UPDATE USING (bucket_id = 'shop-products' AND
    (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'superadmin')));
CREATE POLICY "HRD delete shop products" ON storage.objects
  FOR DELETE USING (bucket_id = 'shop-products' AND
    (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'superadmin')));

-- ============= 12. SEED currency settings for existing companies =============
INSERT INTO public.company_currency_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;