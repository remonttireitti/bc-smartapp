-- Portable temperature monitor devices, sessions and readings

CREATE TABLE temp_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'TempMonitor',
  device_key TEXT NOT NULL UNIQUE,
  hardware_id TEXT UNIQUE,
  last_seen_at TIMESTAMPTZ,
  last_temp_c NUMERIC(5, 2),
  firmware_version TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE temp_monitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES temp_devices(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  site_label TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX temp_monitor_sessions_one_active
  ON temp_monitor_sessions (device_id)
  WHERE ended_at IS NULL;

CREATE TABLE temp_readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES temp_devices(id) ON DELETE CASCADE,
  session_id UUID REFERENCES temp_monitor_sessions(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  temp_c NUMERIC(5, 2) NOT NULL,
  UNIQUE (device_id, recorded_at)
);

CREATE INDEX temp_readings_device_recorded_idx
  ON temp_readings (device_id, recorded_at DESC);

CREATE INDEX temp_readings_session_idx
  ON temp_readings (session_id, recorded_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE temp_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_monitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY temp_devices_select ON temp_devices FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_devices_insert ON temp_devices FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_devices_update ON temp_devices FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_devices_delete ON temp_devices FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_sessions_select ON temp_monitor_sessions FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_sessions_insert ON temp_monitor_sessions FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_sessions_update ON temp_monitor_sessions FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_sessions_delete ON temp_monitor_sessions FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY temp_readings_select ON temp_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM temp_devices d
      WHERE d.id = temp_readings.device_id
        AND d.company_id = public.current_company_id()
        AND NOT public.is_customer_user()
    )
  );
