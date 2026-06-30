-- Kommentti työkirjauksen kuvalle (näkyy listassa ja tulosteessa)

ALTER TABLE work_report_daily_log_images
  ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '';

CREATE POLICY daily_log_images_update ON work_report_daily_log_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );
