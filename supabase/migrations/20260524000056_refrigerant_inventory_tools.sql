-- Varasto: kylmäainepullojen seuranta (sarjanumero), työraportin kylmäainekirjaukset, liikkeet.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'material';

CREATE TABLE IF NOT EXISTS refrigerant_cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  refrigerant_type TEXT NOT NULL,
  purchased_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (purchased_kg >= 0),
  remaining_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (remaining_kg >= 0),
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_stock',
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, serial_number)
);

CREATE TRIGGER refrigerant_cylinders_updated_at
  BEFORE UPDATE ON refrigerant_cylinders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS work_report_refrigerant_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES work_report_daily_logs(id) ON DELETE CASCADE,
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('warehouse', 'supplier')),
  cylinder_id UUID REFERENCES refrigerant_cylinders(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  supplier_name TEXT,
  refrigerant_type TEXT NOT NULL,
  qty_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_kg >= 0),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_report_refrigerant_lines_daily_log_idx
  ON work_report_refrigerant_lines (daily_log_id);

CREATE INDEX IF NOT EXISTS refrigerant_cylinders_company_idx
  ON refrigerant_cylinders (company_id);

ALTER TABLE refrigerant_cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_refrigerant_lines ENABLE ROW LEVEL SECURITY;

-- Kylmäainepullot: yrityksen tai kumppanuusluvan kautta
CREATE POLICY refrigerant_cylinders_select ON refrigerant_cylinders FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      company_id = public.current_company_id()
      OR public.can_read_module(company_id, 'inventory')
    )
  );

CREATE POLICY refrigerant_cylinders_write ON refrigerant_cylinders FOR ALL
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'inventory')
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'inventory')
  );

-- Kylmäainerivit: sama kuin työraportin päiväkirja
CREATE POLICY work_report_refrigerant_lines_select ON work_report_refrigerant_lines FOR SELECT
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

CREATE POLICY work_report_refrigerant_lines_write ON work_report_refrigerant_lines FOR ALL
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

-- Varastoliikkeiden kirjoitus
DROP POLICY IF EXISTS inventory_movements_write ON inventory_movements;
CREATE POLICY inventory_movements_write ON inventory_movements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inventory_items i
      WHERE i.id = item_id
        AND public.can_write_module(i.company_id, 'inventory')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_items i
      WHERE i.id = item_id
        AND public.can_write_module(i.company_id, 'inventory')
    )
  );

-- Työkalulainat: luku erikseen
DROP POLICY IF EXISTS tool_loans_all ON tool_loans;
CREATE POLICY tool_loans_select ON tool_loans FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM tools t
      WHERE t.id = tool_id
        AND (
          t.company_id = public.current_company_id()
          OR public.can_read_module(t.company_id, 'tools')
        )
    )
  );

CREATE POLICY tool_loans_write ON tool_loans FOR ALL
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM tools t
      WHERE t.id = tool_id
        AND public.can_write_module(t.company_id, 'tools')
    )
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM tools t
      WHERE t.id = tool_id
        AND public.can_write_module(t.company_id, 'tools')
    )
  );
