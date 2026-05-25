-- Company admin helpers + profile management rules

CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.count_company_admins(target_company UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM profiles WHERE company_id = target_company AND role = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' AND NEW.role <> 'admin' AND OLD.company_id IS NOT NULL THEN
    IF public.count_company_admins(OLD.company_id) <= 1 THEN
      RAISE EXCEPTION 'Yrityksellä pitää olla vähintään yksi ylläpitäjä';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_last_admin ON profiles;
CREATE TRIGGER profiles_prevent_last_admin
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_demotion();

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = public.current_company_id() AND public.is_company_admin());

DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_update ON profiles;
CREATE POLICY profiles_admin_update ON profiles FOR UPDATE
  USING (
    company_id = public.admin_company_id()
    AND public.is_company_admin()
  )
  WITH CHECK (
    company_id = public.admin_company_id()
    AND public.is_company_admin()
  );

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    company_id = public.current_company_id()
    OR id = auth.uid()
  );
