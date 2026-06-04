-- ESP32 dual-sensor temp monitor + shared demo device for trial tenants.

ALTER TABLE public.temp_devices
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'jc3248',
  ADD COLUMN IF NOT EXISTS is_shared_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zone_config JSONB,
  ADD COLUMN IF NOT EXISTS last_temp_c2 NUMERIC(5, 2);

ALTER TABLE public.temp_readings
  ADD COLUMN IF NOT EXISTS sensor_channel SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.temp_readings
  DROP CONSTRAINT IF EXISTS temp_readings_device_id_recorded_at_key;

CREATE UNIQUE INDEX IF NOT EXISTS temp_readings_device_recorded_sensor_uidx
  ON public.temp_readings (device_id, recorded_at, sensor_channel);

CREATE OR REPLACE FUNCTION public.company_may_view_shared_temp_demo()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_license JSONB;
  v_status TEXT;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL OR public.is_customer_user() THEN
    RETURN false;
  END IF;

  v_license := public.company_license_settings(v_company_id);
  IF COALESCE(v_license ->> 'enrollment', 'subscription') = 'legacy' THEN
    RETURN true;
  END IF;

  v_status := public.effective_company_license_status(v_license);
  RETURN v_status IN ('trial', 'active')
    AND public.company_module_allowed(v_license, v_status, 'remote_monitoring');
END;
$$;

DROP POLICY IF EXISTS temp_devices_select ON public.temp_devices;
CREATE POLICY temp_devices_select ON public.temp_devices FOR SELECT
  USING (
    (company_id = public.current_company_id() AND NOT public.is_customer_user())
    OR (is_shared_demo = true AND public.company_may_view_shared_temp_demo())
  );

DROP POLICY IF EXISTS temp_readings_select ON public.temp_readings;
CREATE POLICY temp_readings_select ON public.temp_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.temp_devices d
      WHERE d.id = temp_readings.device_id
        AND (
          (d.company_id = public.current_company_id() AND NOT public.is_customer_user())
          OR (d.is_shared_demo = true AND public.company_may_view_shared_temp_demo())
        )
    )
  );

DROP POLICY IF EXISTS temp_sessions_select ON public.temp_monitor_sessions;
CREATE POLICY temp_sessions_select ON public.temp_monitor_sessions FOR SELECT
  USING (
    (company_id = public.current_company_id() AND NOT public.is_customer_user())
    OR EXISTS (
      SELECT 1
      FROM public.temp_devices d
      WHERE d.id = temp_monitor_sessions.device_id
        AND d.is_shared_demo = true
        AND public.company_may_view_shared_temp_demo()
    )
  );

-- Shared demo device (physical ESP32 at platform admin site). Device key for firmware secrets.
INSERT INTO public.temp_devices (
  company_id,
  name,
  device_key,
  hardware_id,
  device_type,
  is_shared_demo,
  notes,
  zone_config
)
SELECT
  c.id,
  'Demo: Kylmiö & pakastin (ESP32)',
  '886644220011',
  'esp32_xiao_c3_demo',
  'esp32_ds18b20',
  true,
  'Oikea laite ja oikea mittaus — ylläpitäjän kylmiöstä ja pakastimesta. Näkyy kaikille kokeilujakson yrityksille.',
  jsonb_build_object(
    'k1', jsonb_build_object(
      'label', 'Kylmiö',
      'contents', 'Ylläpitäjän kylmiö (oikea mittaus)',
      'min', 0,
      'max', 6,
      'sensor', 2,
      'kind', 'chilled'
    ),
    'k2', jsonb_build_object(
      'label', 'Kylmiö 2',
      'contents', '',
      'min', 0,
      'max', 6,
      'sensor', 0,
      'kind', 'chilled'
    ),
    'k3', jsonb_build_object(
      'label', 'Kylmiö 3',
      'contents', '',
      'min', 0,
      'max', 6,
      'sensor', 0,
      'kind', 'chilled'
    ),
    'pakastin', jsonb_build_object(
      'label', 'Pakastin',
      'contents', 'Ylläpitäjän pakastin (oikea mittaus)',
      'min', -35,
      'max', -18,
      'sensor', 1,
      'kind', 'freezer'
    )
  )
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.temp_devices d WHERE d.is_shared_demo = true
)
ORDER BY c.created_at
LIMIT 1;

REVOKE ALL ON FUNCTION public.company_may_view_shared_temp_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_may_view_shared_temp_demo() TO authenticated;
