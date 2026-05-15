
-- ============================================================
-- AVATARS (public bucket): owner-scoped запись по companyId/userId
-- ============================================================
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

-- Публичное чтение (bucket публичный — нужно явное правило)
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = COALESCE(public.get_user_company_id(auth.uid())::text, auth.uid()::text)
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "avatars_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "avatars_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- ============================================================
-- CAREER-SUBMISSIONS (private bucket): scoping по companyId
-- ============================================================
DROP POLICY IF EXISTS "career_submissions_select" ON storage.objects;
DROP POLICY IF EXISTS "career_submissions_insert" ON storage.objects;
DROP POLICY IF EXISTS "career_submissions_update" ON storage.objects;
DROP POLICY IF EXISTS "career_submissions_delete" ON storage.objects;

-- Чтение: superadmin / HRD / Company Admin своей компании / владелец / его линейный руководитель
CREATE POLICY "career_submissions_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'career-submissions'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.manager_id = auth.uid()
        AND tm.employee_id::text = (storage.foldername(name))[2]
    )
  )
);

-- Запись: только владелец в путь companyId/userId/...
CREATE POLICY "career_submissions_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'career-submissions'
  AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "career_submissions_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'career-submissions'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "career_submissions_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'career-submissions'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (
      (public.has_role(auth.uid(),'hrd') OR public.has_role(auth.uid(),'company_admin'))
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);
