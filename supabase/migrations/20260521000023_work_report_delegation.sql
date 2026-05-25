-- Work report delegation: owner sends order to partner company for assignment

ALTER TYPE work_status ADD VALUE IF NOT EXISTS 'delegated';

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS delegate_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delegated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_work_reports_delegate
  ON work_reports(delegate_company_id)
  WHERE delegate_company_id IS NOT NULL;

DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      ELSE
        owner_company_id = public.current_company_id()
        OR created_by_company_id = public.current_company_id()
        OR delegate_company_id = public.current_company_id()
        OR public.can_read_module(owner_company_id, 'work_reports')
    END
  );

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'work_reports')
      )
      OR delegate_company_id = public.current_company_id()
    )
  );
