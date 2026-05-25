-- Images attached to daily work logs

CREATE TABLE work_report_daily_log_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES work_report_daily_logs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_log_images_log ON work_report_daily_log_images(daily_log_id);

ALTER TABLE work_report_daily_log_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_log_images_select ON work_report_daily_log_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY daily_log_images_insert ON work_report_daily_log_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY daily_log_images_delete ON work_report_daily_log_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

-- Storage bucket for work report images (path: reportId/logId/filename)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-report-images',
  'work-report-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.storage_report_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_daily_log_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_access_work_report_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := public.storage_report_id(object_name);
  lid UUID := public.storage_daily_log_id(object_name);
BEGIN
  IF rid IS NULL OR lid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM work_report_daily_logs dl
    JOIN work_reports w ON w.id = dl.work_report_id
    WHERE dl.id = lid
      AND w.id = rid
      AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
      AND NOT public.is_customer_user()
  );
END;
$$;

CREATE POLICY work_report_images_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'work-report-images'
    AND public.can_access_work_report_image(name)
  );

CREATE POLICY work_report_images_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'work-report-images'
    AND auth.uid() IS NOT NULL
    AND public.can_access_work_report_image(name)
  );

CREATE POLICY work_report_images_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'work-report-images'
    AND public.can_access_work_report_image(name)
  );
