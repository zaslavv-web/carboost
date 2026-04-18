DROP POLICY IF EXISTS "HRD can read company test files" ON storage.objects;

CREATE POLICY "HRD test files restricted read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hrd-tests'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(),'hrd'::app_role)
      OR public.has_role(auth.uid(),'company_admin'::app_role)
      OR public.has_role(auth.uid(),'superadmin'::app_role)
    )
  );