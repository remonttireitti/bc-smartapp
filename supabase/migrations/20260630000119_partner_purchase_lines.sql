-- Työkalu/varaosa-osto kumppanin piikkiin (tukkurilta): erillinen rivi, vähennys kumppanilaskutuksesta.

CREATE TABLE IF NOT EXISTS work_report_partner_purchase_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES work_report_daily_logs(id) ON DELETE CASCADE,
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  partner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  supplier_name TEXT,
  description TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  partner_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (partner_margin_percent >= 0 AND partner_margin_percent < 100),
  cost_deducted BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_report_partner_purchase_lines_daily_log_idx
  ON work_report_partner_purchase_lines (daily_log_id);

CREATE INDEX IF NOT EXISTS work_report_partner_purchase_lines_work_report_idx
  ON work_report_partner_purchase_lines (work_report_id);

COMMENT ON TABLE work_report_partner_purchase_lines IS
  'Työkalu/varaosa-ostot kumppanin piikkiin. Ei asiakaslaskutusta — vähennetään kumppanilaskutuksesta.';
COMMENT ON COLUMN work_report_partner_purchase_lines.unit_price IS 'Veroton ostohinta €/kpl.';
COMMENT ON COLUMN work_report_partner_purchase_lines.partner_margin_percent IS 'Kumppanin välityspalkkio-% ostohinnasta.';
COMMENT ON COLUMN work_report_partner_purchase_lines.cost_deducted IS
  'Onko summa vähennetty seuraavasta kumppanilaskutuksesta.';

ALTER TABLE work_report_partner_purchase_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_partner_purchase_lines_select ON work_report_partner_purchase_lines FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_read_partner_report(
          w.owner_company_id,
          w.created_by_company_id,
          w.customer_id,
          'work_reports'
        )
    )
  );

CREATE POLICY work_report_partner_purchase_lines_write ON work_report_partner_purchase_lines FOR ALL
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (
          w.owner_company_id = public.current_company_id()
          OR w.created_by_company_id = public.current_company_id()
          OR w.delegate_company_id = public.current_company_id()
        )
    )
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (
          w.owner_company_id = public.current_company_id()
          OR w.created_by_company_id = public.current_company_id()
          OR w.delegate_company_id = public.current_company_id()
        )
    )
  );

DROP TRIGGER IF EXISTS work_report_partner_purchase_lines_mark_partner_billable_recalc ON work_report_partner_purchase_lines;
CREATE TRIGGER work_report_partner_purchase_lines_mark_partner_billable_recalc
  AFTER INSERT OR UPDATE OR DELETE ON work_report_partner_purchase_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log_child();
