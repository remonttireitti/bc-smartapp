-- Files and images attached directly to a work report (e.g. at creation time)

CREATE TABLE work_report_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_report_attachments_report ON work_report_attachments(work_report_id);

ALTER TABLE work_report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_attachments_select ON work_report_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY work_report_attachments_insert ON work_report_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_attachments_delete ON work_report_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE OR REPLACE FUNCTION public.can_access_work_report_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := public.storage_report_id(object_name);
  segment TEXT := split_part(object_name, '/', 2);
  lid UUID;
BEGIN
  IF rid IS NULL OR segment IS NULL OR segment = '' THEN
    RETURN false;
  END IF;

  IF segment = 'attachments' THEN
    RETURN EXISTS (
      SELECT 1
      FROM work_reports w
      WHERE w.id = rid
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
        AND NOT public.is_customer_user()
    );
  END IF;

  lid := segment::uuid;

  RETURN EXISTS (
    SELECT 1
    FROM work_report_daily_logs dl
    JOIN work_reports w ON w.id = dl.work_report_id
    WHERE dl.id = lid
      AND w.id = rid
      AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
      AND NOT public.is_customer_user()
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;
