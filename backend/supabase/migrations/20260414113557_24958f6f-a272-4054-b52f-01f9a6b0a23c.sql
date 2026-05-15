
CREATE OR REPLACE FUNCTION public.delete_user(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
