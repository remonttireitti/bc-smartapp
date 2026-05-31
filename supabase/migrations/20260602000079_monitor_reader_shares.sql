-- Lukuoikeus jaettuun etäseurantaan (VRF + lämpötila)

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'monitor_viewer';

CREATE TYPE monitor_share_kind AS ENUM ('vrf', 'temp');

CREATE TABLE monitor_reader_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind monitor_share_kind NOT NULL,
  vrf_device_id UUID REFERENCES vrf_devices(id) ON DELETE CASCADE,
  temp_device_id UUID REFERENCES temp_devices(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  label TEXT,
  viewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT monitor_reader_shares_device_check CHECK (
    (kind = 'vrf' AND vrf_device_id IS NOT NULL AND temp_device_id IS NULL)
    OR (kind = 'temp' AND temp_device_id IS NOT NULL AND vrf_device_id IS NULL)
  )
);

CREATE INDEX monitor_reader_shares_company_idx ON monitor_reader_shares (company_id, created_at DESC);
CREATE INDEX monitor_reader_shares_vrf_device_idx ON monitor_reader_shares (vrf_device_id) WHERE vrf_device_id IS NOT NULL;
CREATE INDEX monitor_reader_shares_temp_device_idx ON monitor_reader_shares (temp_device_id) WHERE temp_device_id IS NOT NULL;
CREATE INDEX monitor_reader_shares_viewer_idx ON monitor_reader_shares (viewer_user_id) WHERE viewer_user_id IS NOT NULL;
CREATE INDEX monitor_reader_shares_token_idx ON monitor_reader_shares (access_token) WHERE enabled;

COMMENT ON TABLE monitor_reader_shares IS 'Jaetut lukuoikeuslinkit etäseurantaan; valinnainen kirjautuva lukijakäyttäjä';

CREATE OR REPLACE FUNCTION public.is_monitor_viewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'monitor_viewer'::user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.monitor_viewer_can_read_vrf(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM monitor_reader_shares s
    WHERE s.viewer_user_id = auth.uid()
      AND s.kind = 'vrf'
      AND s.vrf_device_id = p_device_id
      AND s.enabled
      AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.monitor_viewer_can_read_temp(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM monitor_reader_shares s
    WHERE s.viewer_user_id = auth.uid()
      AND s.kind = 'temp'
      AND s.temp_device_id = p_device_id
      AND s.enabled
      AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

ALTER TABLE monitor_reader_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitor_reader_shares_staff_select ON monitor_reader_shares FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY monitor_reader_shares_staff_insert ON monitor_reader_shares FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY monitor_reader_shares_staff_update ON monitor_reader_shares FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY monitor_reader_shares_staff_delete ON monitor_reader_shares FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY monitor_reader_shares_viewer_select ON monitor_reader_shares FOR SELECT
  USING (
    public.is_monitor_viewer()
    AND viewer_user_id = auth.uid()
    AND enabled
  );

-- VRF: estä lukijaa näkemästä koko yrityksen laitteita
DROP POLICY IF EXISTS vrf_devices_select ON vrf_devices;
CREATE POLICY vrf_devices_select ON vrf_devices FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY vrf_devices_monitor_viewer_select ON vrf_devices FOR SELECT
  USING (public.monitor_viewer_can_read_vrf(id));

DROP POLICY IF EXISTS vrf_devices_insert ON vrf_devices;
CREATE POLICY vrf_devices_insert ON vrf_devices FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS vrf_devices_update ON vrf_devices;
CREATE POLICY vrf_devices_update ON vrf_devices FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS vrf_devices_delete ON vrf_devices;
CREATE POLICY vrf_devices_delete ON vrf_devices FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS vrf_readings_select ON vrf_readings;
CREATE POLICY vrf_readings_select ON vrf_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vrf_devices d
      WHERE d.id = vrf_readings.device_id
        AND d.company_id = public.current_company_id()
        AND NOT public.is_customer_user()
        AND NOT public.is_monitor_viewer()
    )
  );

CREATE POLICY vrf_readings_monitor_viewer_select ON vrf_readings FOR SELECT
  USING (public.monitor_viewer_can_read_vrf(device_id));

-- Lämpötilaseuranta: sama malli
DROP POLICY IF EXISTS temp_devices_select ON temp_devices;
CREATE POLICY temp_devices_select ON temp_devices FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

CREATE POLICY temp_devices_monitor_viewer_select ON temp_devices FOR SELECT
  USING (public.monitor_viewer_can_read_temp(id));

DROP POLICY IF EXISTS temp_devices_insert ON temp_devices;
CREATE POLICY temp_devices_insert ON temp_devices FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS temp_devices_update ON temp_devices;
CREATE POLICY temp_devices_update ON temp_devices FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS temp_devices_delete ON temp_devices;
CREATE POLICY temp_devices_delete ON temp_devices FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_monitor_viewer()
  );

DROP POLICY IF EXISTS temp_readings_select ON temp_readings;
CREATE POLICY temp_readings_select ON temp_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM temp_devices d
      WHERE d.id = temp_readings.device_id
        AND d.company_id = public.current_company_id()
        AND NOT public.is_customer_user()
        AND NOT public.is_monitor_viewer()
    )
  );

CREATE POLICY temp_readings_monitor_viewer_select ON temp_readings FOR SELECT
  USING (public.monitor_viewer_can_read_temp(device_id));
