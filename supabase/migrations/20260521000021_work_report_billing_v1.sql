-- Work report partner billing: per-user flags, calculated amounts (creator-only), partner summary sharing

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bill_hours_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bill_expenses_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE work_report_billing
  ADD COLUMN IF NOT EXISTS partner_summary_shared BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS work_report_billable (
  work_report_id UUID PRIMARY KEY REFERENCES work_reports(id) ON DELETE CASCADE,
  partner_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  calculation JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER work_report_billable_updated_at
  BEFORE UPDATE ON work_report_billable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE work_report_billable ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_billable_select ON work_report_billable FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND w.created_by_company_id = public.current_company_id()
    )
  );

CREATE POLICY work_report_billable_all ON work_report_billable FOR ALL
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND w.created_by_company_id = public.current_company_id()
    )
  );

-- Partner (owner) must not see creator billing unless explicitly shared
DROP POLICY IF EXISTS work_report_billing_select ON work_report_billing;
CREATE POLICY work_report_billing_select ON work_report_billing FOR SELECT
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
            AND work_report_billing.partner_summary_shared = true
          )
        )
    )
  );
