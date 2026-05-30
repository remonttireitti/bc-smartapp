-- Saved temperature monitoring reports with print/export support

CREATE TABLE temp_monitor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES temp_devices(id) ON DELETE CASCADE,
  session_id UUID REFERENCES temp_monitor_sessions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  monitor_label TEXT,
  site_label TEXT,
  purpose_notes TEXT,
  notes TEXT,
  target_temp_min NUMERIC(5, 2),
  target_temp_max NUMERIC(5, 2),
  allowed_deviation_c NUMERIC(4, 2),
  allowed_deviation_minutes INTEGER,
  summary JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT temp_monitor_reports_period_check CHECK (period_end > period_start)
);

CREATE INDEX temp_monitor_reports_device_idx ON temp_monitor_reports (device_id, created_at DESC);
CREATE INDEX temp_monitor_reports_customer_idx ON temp_monitor_reports (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX temp_monitor_reports_owner_idx ON temp_monitor_reports (owner_company_id, created_at DESC);

ALTER TABLE temp_monitor_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY temp_monitor_reports_select ON temp_monitor_reports FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      public.can_read_partner_report(
        owner_company_id,
        created_by_company_id,
        customer_id,
        'customers'
      )
      OR (
        customer_id IS NULL
        AND (
          owner_company_id = public.current_company_id()
          OR created_by_company_id = public.current_company_id()
        )
      )
    )
  );

CREATE POLICY temp_monitor_reports_insert ON temp_monitor_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1
      FROM temp_devices d
      WHERE d.id = temp_monitor_reports.device_id
        AND d.company_id = public.current_company_id()
    )
    AND (
      customer_id IS NULL
      AND owner_company_id = public.current_company_id()
      OR (
        customer_id IS NOT NULL
        AND public.can_read_customer(customer_id)
        AND owner_company_id = (
          SELECT c.owner_company_id
          FROM customers c
          WHERE c.id = temp_monitor_reports.customer_id
        )
      )
    )
  );

CREATE POLICY temp_monitor_reports_update ON temp_monitor_reports FOR UPDATE
  USING (
    created_by_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  )
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_monitor_reports_delete ON temp_monitor_reports FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      created_by_company_id = public.current_company_id()
      OR owner_company_id = public.current_company_id()
    )
  );

COMMENT ON TABLE temp_monitor_reports IS 'Tallennetut lämpötilaseurannan raportit tulostusta varten';
