
-- ============================================================
-- 1. PRIVILEGE ESCALATION FIX: user_roles
-- ============================================================

-- Drop overly-permissive HRD policies
DROP POLICY IF EXISTS "HRD can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "HRD can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "HRD can delete roles" ON public.user_roles;

-- HRD: INSERT only non-privileged roles (employee, manager) for users in same company
CREATE POLICY "HRD can insert non-privileged roles in own company"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'hrd')
  AND role IN ('employee', 'manager')
  AND public.get_user_company_id(user_id) IS NOT NULL
  AND public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid())
);

-- HRD: DELETE only non-privileged roles for users in same company
CREATE POLICY "HRD can delete non-privileged roles in own company"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'hrd')
  AND role IN ('employee', 'manager')
  AND public.get_user_company_id(user_id) IS NOT NULL
  AND public.get_user_company_id(user_id) = public.get_user_company_id(auth.uid())
);

-- Note: UPDATE intentionally not granted to HRD.
-- Role changes must go through public.assign_role() (SECURITY DEFINER with checks)
-- which performs DELETE + INSERT and validates target role/company.

-- ============================================================
-- 2. COMPANIES DATA EXPOSURE FIX
-- ============================================================

DROP POLICY IF EXISTS "Authenticated can view companies list" ON public.companies;
-- "Authenticated can view own company" already exists and is sufficient
-- "Superadmin can manage all companies" covers superadmin SELECT

-- ============================================================
-- 3. STORAGE: remove broad listing policies on public buckets
-- ============================================================

-- avatars: drop legacy duplicates and public listing
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
-- Direct file access via signed/public URL still works (handled by storage layer using bucket.public flag).
-- Listing via storage.objects API is now blocked.

-- reward-images: drop broad listing
DROP POLICY IF EXISTS "Authenticated can list reward images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload reward images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update reward images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete reward images" ON storage.objects;
-- company-scoped policies (reward_images_*_company) remain in effect

-- shop-products: drop legacy broad upload/update/delete policies
DROP POLICY IF EXISTS "HRD upload shop products" ON storage.objects;
DROP POLICY IF EXISTS "HRD update shop products" ON storage.objects;
DROP POLICY IF EXISTS "HRD delete shop products" ON storage.objects;
-- company-scoped policies (shop_products_*_company) remain in effect
