-- Maintenance report evidence images + equipment huolto snapshot fields

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS huolto_technical_snapshot JSONB;

CREATE TABLE maintenance_report_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_report_id UUID NOT NULL REFERENCES maintenance_reports(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('tiiveyskoe', 'tyhjiointi', 'huomiot')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_report_images_report ON maintenance_report_images(maintenance_report_id);
CREATE INDEX idx_maintenance_report_images_section ON maintenance_report_images(maintenance_report_id, section);

ALTER TABLE maintenance_report_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY maintenance_report_images_select ON maintenance_report_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_reports mr
      WHERE mr.id = maintenance_report_id
        AND public.can_see_company_row(mr.owner_company_id, mr.created_by_company_id)
    )
  );

CREATE POLICY maintenance_report_images_insert ON maintenance_report_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maintenance_reports mr
      WHERE mr.id = maintenance_report_id
        AND public.can_see_company_row(mr.owner_company_id, mr.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY maintenance_report_images_delete ON maintenance_report_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_reports mr
      WHERE mr.id = maintenance_report_id
        AND public.can_see_company_row(mr.owner_company_id, mr.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

-- Storage bucket for maintenance report images (path: reportId/section/filename)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-report-images',
  'maintenance-report-images',
  false,
  819200,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.storage_maintenance_report_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_maintenance_report_section(object_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '');
$$;

CREATE OR REPLACE FUNCTION public.can_access_maintenance_report_image(object_name TEXT)
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

CREATE POLICY maintenance_report_images_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'maintenance-report-images'
    AND public.can_access_maintenance_report_image(name)
  );

CREATE POLICY maintenance_report_images_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'maintenance-report-images'
    AND auth.uid() IS NOT NULL
    AND public.can_access_maintenance_report_image(name)
  );

CREATE POLICY maintenance_report_images_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'maintenance-report-images'
    AND public.can_access_maintenance_report_image(name)
  );
