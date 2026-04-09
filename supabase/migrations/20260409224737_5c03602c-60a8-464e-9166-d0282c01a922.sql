
-- Allow anyone to read companies (needed for signup form)
CREATE POLICY "Anyone can view companies"
  ON public.companies FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow superadmin to delete companies
CREATE POLICY "Superadmin can delete companies"
  ON public.companies FOR DELETE
  USING (has_role(auth.uid(), 'superadmin'));
