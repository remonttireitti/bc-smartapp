-- Fix company logo storage policies: use current_company_id consistently.

CREATE OR REPLACE FUNCTION public.can_manage_company_logo(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_admin()
    AND public.storage_company_id(object_name) = public.current_company_id();
$$;

DROP POLICY IF EXISTS company_logos_update ON storage.objects;
CREATE POLICY company_logos_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND public.can_manage_company_logo(name)
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND public.can_manage_company_logo(name)
  );
