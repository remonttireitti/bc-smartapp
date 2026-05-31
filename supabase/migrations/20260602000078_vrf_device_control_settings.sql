-- VRF device control and settings (UI → device poll via vrf-device-config)

ALTER TABLE vrf_devices
  ADD COLUMN IF NOT EXISTS control_requested_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS control_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN vrf_devices.control_requested_enabled IS 'Käyntilupa — UI asettaa, laite pollaa';
COMMENT ON COLUMN vrf_devices.settings IS 'Laiteasetukset (auto-stop, hälytyrajat jne.)';
