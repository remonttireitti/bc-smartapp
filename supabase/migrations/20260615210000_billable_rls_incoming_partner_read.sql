-- Omistaja saa lukea kumppanin laskelman saapuvissa kumppaniraporteissa (ei kirjoitusoikeutta).

DROP POLICY IF EXISTS work_report_billable_select ON work_report_billable;
CREATE POLICY work_report_billable_select ON work_report_billable FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (
          w.created_by_company_id = public.current_company_id()
          OR (
            w.owner_company_id = public.current_company_id()
            AND w.created_by_company_id = w.owner_company_id
          )
          OR (
            w.owner_company_id = public.current_company_id()
            AND w.created_by_company_id <> w.owner_company_id
          )
        )
    )
  );
