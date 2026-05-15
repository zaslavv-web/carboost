DROP POLICY IF EXISTS "career_submissions_insert" ON storage.objects;

CREATE POLICY "career_submissions_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'career-submissions'
  AND public.has_role(auth.uid(), 'employee'::public.app_role)
  AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND lower(storage.extension(name)) IN ('docx', 'pdf', 'jpg', 'jpeg', 'png')
  AND (
    metadata IS NULL
    OR metadata->>'mimetype' IS NULL
    OR lower(metadata->>'mimetype') IN (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'image/jpeg',
      'image/png'
    )
  )
);