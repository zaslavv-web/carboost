
-- Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, is_verified, requested_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false,
    COALESCE(NEW.raw_user_meta_data->>'requested_role', 'employee')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  RETURN NEW;
END;
$$;

-- Update assign_role
CREATE OR REPLACE FUNCTION public.assign_role(_target_user_id uuid, _new_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'hrd') OR public.has_role(auth.uid(), 'superadmin')) THEN
    RAISE EXCEPTION 'Only HRD or Superadmin can assign roles';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
END;
$$;

-- Create verify_user function
CREATE OR REPLACE FUNCTION public.verify_user(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Only Superadmin can verify users';
  END IF;
  UPDATE public.profiles SET is_verified = true WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, (SELECT requested_role FROM public.profiles WHERE user_id = _target_user_id)::app_role);
END;
$$;

-- Create reject_user function
CREATE OR REPLACE FUNCTION public.reject_user(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Only Superadmin can reject users';
  END IF;
  DELETE FROM public.profiles WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
END;
$$;

-- Superadmin RLS policies
CREATE POLICY "Superadmin can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can manage roles insert" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can view all achievements" ON public.achievements FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can view all assessments" ON public.assessments FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can view all competencies" ON public.competencies FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin can view all goals" ON public.career_goals FOR SELECT USING (public.has_role(auth.uid(), 'superadmin'));
