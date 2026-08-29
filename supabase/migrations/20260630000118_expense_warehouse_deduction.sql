-- Työkalu/varaosa-osto kumppanin varastosta: vähennys kumppanilaskutuksesta (kuten kylmäaineosto).

ALTER TABLE work_report_daily_expense_lines
  ADD COLUMN IF NOT EXISTS warehouse_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_cost_deducted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN work_report_daily_expense_lines.warehouse_company_id IS
  'Kumppanin varasto, josta työkalu/varaosa on ostettu. Käytetään vähennykseen kumppanilaskutuksessa.';
COMMENT ON COLUMN work_report_daily_expense_lines.warehouse_cost_deducted IS
  'Onko varasto-oston kustannus vähennetty seuraavasta kumppanilaskutuksesta.';

CREATE INDEX IF NOT EXISTS work_report_daily_expense_lines_warehouse_company_idx
  ON work_report_daily_expense_lines (warehouse_company_id)
  WHERE warehouse_company_id IS NOT NULL;
