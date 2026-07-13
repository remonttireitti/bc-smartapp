-- Korjaus: storage-lataus ennen metadata-riviä (huomiot / tiiveyskoe / tyhjiointi).
-- can_access_maintenance_report_image vaatii maintenance_report_images-rivin → INSERT epäonnistui.
-- Luku: metadata-rivin kautta (sama kuin maintenance_report_images SELECT).
-- Kirjoitus: suora huoltoraportin oikeus ennen metadata-riviä.

CREATE OR REPLACE FUNCTION public.can_upload_maintenance_report_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := public.storage_maintenance_report_id(object_name);
  sec TEXT := public.storage_maintenance_report_section(object_name);
BEGIN
  IF rid IS NULL OR sec IS NULL OR sec NOT IN ('tiiveyskoe', 'tyhjiointi', 'huomiot') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM maintenance_reports mr
    WHERE mr.id = rid
      AND public.can_see_company_row(mr.owner_company_id, mr.created_by_company_id)
      AND NOT public.is_customer_user()
  );
END;
$$;

DROP POLICY IF EXISTS maintenance_report_images_storage_insert ON storage.objects;
CREATE POLICY maintenance_report_images_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'maintenance-report-images'
    AND auth.uid() IS NOT NULL
    AND public.can_upload_maintenance_report_image(name)
  );
