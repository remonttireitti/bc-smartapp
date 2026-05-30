-- Työkirjauksen ajomatkat (reittipätkät, km manuaalisesti).

CREATE TABLE IF NOT EXISTS work_report_daily_trip_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES work_report_daily_logs(id) ON DELETE CASCADE,
  from_label TEXT NOT NULL,
  to_label TEXT NOT NULL,
  distance_km NUMERIC(12,1) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
  bill_to_customer BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_report_daily_trip_legs_daily_log_idx
  ON work_report_daily_trip_legs (daily_log_id);

ALTER TABLE work_report_daily_trip_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_trip_legs_select ON work_report_daily_trip_legs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY daily_trip_legs_insert ON work_report_daily_trip_legs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY daily_trip_legs_update ON work_report_daily_trip_legs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY daily_trip_legs_delete ON work_report_daily_trip_legs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );
