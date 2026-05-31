-- VRF heat pump monitor devices and telemetry (Supabase ingest from ESP32)

CREATE TABLE vrf_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_key TEXT NOT NULL UNIQUE,
  external_device_id TEXT,
  hardware_id TEXT UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ,
  last_recorded_at TIMESTAMPTZ,
  firmware_version TEXT,
  heat_enabled BOOLEAN,
  operating_state TEXT,
  any_alarm BOOLEAN NOT NULL DEFAULT false,
  outdoor_c NUMERIC(5, 2),
  latest_payload JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX vrf_devices_company_idx ON vrf_devices (company_id, name);
CREATE UNIQUE INDEX vrf_devices_company_external_id_idx
  ON vrf_devices (company_id, external_device_id)
  WHERE external_device_id IS NOT NULL;

CREATE TABLE vrf_readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES vrf_devices(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  outdoor_c NUMERIC(5, 2),
  heat_enabled BOOLEAN,
  operating_state TEXT,
  any_alarm BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (device_id, recorded_at)
);

CREATE INDEX vrf_readings_device_recorded_idx
  ON vrf_readings (device_id, recorded_at DESC);

ALTER TABLE vrf_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrf_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY vrf_devices_select ON vrf_devices FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY vrf_devices_insert ON vrf_devices FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY vrf_devices_update ON vrf_devices FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY vrf_devices_delete ON vrf_devices FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY vrf_readings_select ON vrf_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vrf_devices d
      WHERE d.id = vrf_readings.device_id
        AND d.company_id = public.current_company_id()
        AND NOT public.is_customer_user()
    )
  );

COMMENT ON TABLE vrf_devices IS 'VRF-lämpöpumppujen etäseurantalaitteet';
COMMENT ON TABLE vrf_readings IS 'VRF-telemetrian historiapisteet (harvennettu ingestissä)';
COMMENT ON COLUMN vrf_devices.latest_payload IS 'Viimeisin täysi telemetria-JSON laitteelta';
COMMENT ON COLUMN vrf_devices.external_device_id IS 'Laitteen oma tunniste, esim. vrf-heating-01';
