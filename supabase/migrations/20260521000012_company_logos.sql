-- Company logo uploads (path: companyId/logo.ext)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.storage_company_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_read_company_logo(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.storage_company_id(object_name);
BEGIN
  IF cid IS NULL OR public.is_customer_user() THEN
    RETURN false;
  END IF;

  IF cid = public.current_company_id() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM company_partnerships cp
    WHERE cp.status = 'active'
      AND (
        (cp.company_a_id = public.current_company_id() AND cp.company_b_id = cid)
        OR (cp.company_b_id = public.current_company_id() AND cp.company_a_id = cid)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company_logo(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_admin()
    AND public.storage_company_id(object_name) = public.admin_company_id();
$$;

CREATE POLICY company_logos_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'company-logos'
    AND public.can_read_company_logo(name)
  );

CREATE POLICY company_logos_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND auth.uid() IS NOT NULL
    AND public.can_manage_company_logo(name)
  );

CREATE POLICY company_logos_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND public.can_manage_company_logo(name)
  );

CREATE POLICY company_logos_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-logos'
    AND public.can_manage_company_logo(name)
  );
