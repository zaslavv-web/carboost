
CREATE OR REPLACE FUNCTION public.assign_role(_target_user_id UUID, _new_role app_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only HRD can assign roles
  IF NOT public.has_role(auth.uid(), 'hrd') THEN
    RAISE EXCEPTION 'Only HRD can assign roles';
  END IF;

  -- Remove existing roles for target user
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  -- Insert new role
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
END;
$$;
