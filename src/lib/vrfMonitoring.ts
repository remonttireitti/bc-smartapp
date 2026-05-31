export type VrfDevice = {
  id: string;
  company_id: string;
  name: string;
  device_key: string;
  external_device_id: string | null;
  hardware_id: string | null;
  customer_id: string | null;
  equipment_id: string | null;
  last_seen_at: string | null;
  last_recorded_at: string | null;
  firmware_version: string | null;
  heat_enabled: boolean | null;
  operating_state: string | null;
  any_alarm: boolean;
  outdoor_c: number | null;
  latest_payload: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
};

export const VRF_DEVICE_SELECT =
  'id, company_id, name, device_key, external_device_id, hardware_id, customer_id, equipment_id, last_seen_at, last_recorded_at, firmware_version, heat_enabled, operating_state, any_alarm, outdoor_c, latest_payload, notes, created_at';

export const VRF_ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
export const VRF_DEVICE_KEY_DIGITS = 12;

export function isVrfDeviceOnline(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) return false;
  return nowMs - new Date(lastSeenAt).getTime() <= VRF_ONLINE_THRESHOLD_MS;
}

export function generateVrfDeviceKey() {
  const bytes = new Uint8Array(VRF_DEVICE_KEY_DIGITS);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join('');
}

export function formatTempC(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} °C`;
}

export function formatRelativeTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return 'juuri nyt';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} min sitten`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3600_000)} h sitten`;
  return new Date(iso).toLocaleString('fi-FI');
}

export function vrfIngestFunctionUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/vrf-monitor-ingest`;
}

export function vrfOperatingStateLabel(state: string | null | undefined) {
  switch (state) {
    case 'off':
      return 'Pois';
    case 'defrost':
      return 'Sulatus';
    case 'permit_on':
      return 'Lämpö päällä';
    case 'idle':
      return 'Valmiustila';
    default:
      return state ?? '—';
  }
}
