-- 1) demo_requests: отключаем прямой INSERT клиентами, оставляем только через SECURITY DEFINER функцию
DROP POLICY IF EXISTS "Anyone can submit demo requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Public can submit demo requests" ON public.demo_requests;
-- На случай явных INSERT-политик: создаём блокирующую политику
CREATE POLICY "Block direct insert demo_requests" ON public.demo_requests
  FOR INSERT TO public, authenticated, anon
  WITH CHECK (false);

-- Разрешаем функции submit_demo_request быть вызванной анонимно
GRANT EXECUTE ON FUNCTION public.submit_demo_request(text, text, text, integer, text) TO anon, authenticated;

-- 2) profiles: убираем «широкий» UPDATE company_admin, заменяем на ограниченный по колонкам
DROP POLICY IF EXISTS "Company admin can update company profiles" ON public.profiles;

CREATE POLICY "Company admin update non-sensitive profile fields" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Триггер защиты чувствительных полей от смены через UPDATE (кроме superadmin)
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Superadmin может всё
  IF public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Сам пользователь не может менять чувствительные поля
  IF auth.uid() = NEW.user_id THEN
    NEW.is_verified := OLD.is_verified;
    NEW.requested_role := OLD.requested_role;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    NEW.overall_score := OLD.overall_score;
    NEW.role_readiness := OLD.role_readiness;
    NEW.position_id := OLD.position_id;
    NEW.pending_position_id := COALESCE(NEW.pending_position_id, OLD.pending_position_id);
  END IF;

  -- Company admin — нельзя менять привилегированные поля даже у других
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

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- 3) Storage: hrd-tests — добавляем проверку company_id в пути
DROP POLICY IF EXISTS "HRD test files restricted read" ON storage.objects;
DROP POLICY IF EXISTS "HRD can upload test files" ON storage.objects;
DROP POLICY IF EXISTS "HRD can delete test files" ON storage.objects;
DROP POLICY IF EXISTS "HRD can update test files" ON storage.objects;

CREATE POLICY "HRD test files company-scoped read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'superadmin'::app_role)
      OR (
        (public.has_role(auth.uid(),'hrd'::app_role) OR public.has_role(auth.uid(),'company_admin'::app_role))
        AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
      )
    )
  );

CREATE POLICY "HRD test files company-scoped insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'superadmin'::app_role)
      OR (
        (public.has_role(auth.uid(),'hrd'::app_role) OR public.has_role(auth.uid(),'company_admin'::app_role))
        AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
      )
    )
  );

CREATE POLICY "HRD test files company-scoped delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'superadmin'::app_role)
      OR (
        (public.has_role(auth.uid(),'hrd'::app_role) OR public.has_role(auth.uid(),'company_admin'::app_role))
        AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
      )
    )
  );

CREATE POLICY "HRD test files company-scoped update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hrd-tests'
    AND (
      public.has_role(auth.uid(),'superadmin'::app_role)
      OR (
        (public.has_role(auth.uid(),'hrd'::app_role) OR public.has_role(auth.uid(),'company_admin'::app_role))
        AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
      )
    )
  );

-- 4) employee_invitations: HRD/admin видят все поля КРОМЕ token. Создаём защищённое представление и закрываем чтение колонки token.
-- Сначала отзовём права на колонку token у обычных ролей
REVOKE SELECT (token) ON public.employee_invitations FROM authenticated;
GRANT SELECT (
  id, company_id, email, full_name, position_id, requested_role,
  status, invited_by, claimed_at, claimed_user_id, department,
  created_at, updated_at
) ON public.employee_invitations TO authenticated;