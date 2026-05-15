-- 1) hr-documents bucket — удаляем «широкие» политики
DROP POLICY IF EXISTS "HRD can view hr docs" ON storage.objects;
DROP POLICY IF EXISTS "HRD can upload hr docs" ON storage.objects;
DROP POLICY IF EXISTS "HRD can delete hr docs" ON storage.objects;
DROP POLICY IF EXISTS "HRD can update hr docs" ON storage.objects;

-- 2) hrd-tests bucket — удаляем дубликаты без company-scope
DROP POLICY IF EXISTS "HRD can upload company test files" ON storage.objects;
DROP POLICY IF EXISTS "HRD can delete company test files" ON storage.objects;
DROP POLICY IF EXISTS "HRD can update company test files" ON storage.objects;
DROP POLICY IF EXISTS "HRD can view company test files" ON storage.objects;

-- 3) user_roles — HRD видит только своих
DROP POLICY IF EXISTS "HRD can view all roles" ON public.user_roles;

CREATE POLICY "HRD view company user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'hrd'::app_role)
    AND public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid())
  );