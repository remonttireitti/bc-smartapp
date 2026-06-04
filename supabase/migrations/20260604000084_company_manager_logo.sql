-- Allow company managers (esimies) to upload and set company logo.

CREATE OR REPLACE FUNCTION public.is_company_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'manager'
      AND company_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company_logo(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
      public.is_company_admin()
      OR public.is_company_manager()
    )
    AND public.storage_company_id(object_name) = public.current_company_id();
$$;

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies FOR UPDATE
  USING (
    id = public.current_company_id()
    AND (public.is_company_admin() OR public.is_company_manager())
  )
  WITH CHECK (
    id = public.current_company_id()
    AND (public.is_company_admin() OR public.is_company_manager())
  );

REVOKE ALL ON FUNCTION public.is_company_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_manager() TO authenticated;
