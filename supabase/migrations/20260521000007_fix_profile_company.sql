-- Fix profile creation: update company on conflict from metadata

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.raw_user_meta_data ->> 'company_id') IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, email, display_name, role)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'company_id')::uuid,
      NEW.email,
      coalesce(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
      coalesce((NEW.raw_user_meta_data ->> 'role')::user_role, 'technician')
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Allow users to set their own company_id once (dev / invite flow)
DROP POLICY IF EXISTS profiles_update_self ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;

CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_insert_own ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());
