export type TempDevice = {
  id: string;
  company_id: string;
  name: string;
  device_key: string;
  hardware_id: string | null;
  last_seen_at: string | null;
  last_temp_c: number | null;
  firmware_version: string | null;
  notes: string | null;
  created_at: string;
};

export type TempMonitorSession = {
  id: string;
  company_id: string;
  device_id: string;
  customer_id: string | null;
  site_label: string | null;
  notes: string | null;
  monitor_label: string | null;
  target_temp_min: number | null;
  target_temp_max: number | null;
  allowed_deviation_c: number | null;
  allowed_deviation_minutes: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  customer?: { id: string; name: string } | null;
};

export type TempSessionSettingsInput = {
  monitor_label: string;
  target_temp_min: string;
  target_temp_max: string;
  allowed_deviation_c: string;
  allowed_deviation_minutes: string;
};

export type TempEffectiveLimits = {
  targetMin: number;
  targetMax: number;
  acceptableMin: number;
  acceptableMax: number;
  allowedDeviationMinutes: number;
};

export type TempComplianceStatus = 'ok' | 'warning' | 'alert' | 'unknown';

export const TEMP_MONITOR_LABEL_PRESETS = [
  'Kylmiön lämpötila',
  'Pakastimen lämpötila',
  'Kuumakaasun lämpötila',
  'Huoneen lämpötila',
  'Kuljetuslämpötila',
] as const;

export type TempReading = {
  id: number;
  device_id: string;
  session_id: string | null;
  recorded_at: string;
  temp_c: number;
};

export const TEMP_DEVICE_SELECT =
  'id, company_id, name, device_key, hardware_id, last_seen_at, last_temp_c, firmware_version, notes, created_at';

export const TEMP_SESSION_SELECT =
  'id, company_id, device_id, customer_id, site_label, notes, monitor_label, target_temp_min, target_temp_max, allowed_deviation_c, allowed_deviation_minutes, started_at, ended_at, created_at, customer:customers(id, name)';

export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
export const TEMP_DEVICE_KEY_DIGITS = 12;

export function isTempDeviceOnline(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) return false;
  return nowMs - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS;
}

export function generateDeviceKey() {
  const bytes = new Uint8Array(TEMP_DEVICE_KEY_DIGITS);
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

export function ingestFunctionUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/temp-monitor-ingest`;
}

export function emptySessionSettings(): TempSessionSettingsInput {
  return {
    monitor_label: '',
    target_temp_min: '',
    target_temp_max: '',
    allowed_deviation_c: '0.5',
    allowed_deviation_minutes: '15',
  };
}

export function sessionSettingsFromRow(session: TempMonitorSession): TempSessionSettingsInput {
  return {
    monitor_label: session.monitor_label ?? '',
    target_temp_min: session.target_temp_min != null ? String(session.target_temp_min) : '',
    target_temp_max: session.target_temp_max != null ? String(session.target_temp_max) : '',
    allowed_deviation_c:
      session.allowed_deviation_c != null ? String(session.allowed_deviation_c) : '0.5',
    allowed_deviation_minutes:
      session.allowed_deviation_minutes != null ? String(session.allowed_deviation_minutes) : '15',
  };
}

export function sessionSettingsToPayload(input: TempSessionSettingsInput) {
  const targetMin = input.target_temp_min.trim() === '' ? null : Number(input.target_temp_min);
  const targetMax = input.target_temp_max.trim() === '' ? null : Number(input.target_temp_max);
  const deviation =
    input.allowed_deviation_c.trim() === '' ? null : Number(input.allowed_deviation_c);
  const deviationMinutes =
    input.allowed_deviation_minutes.trim() === ''
      ? null
      : Math.round(Number(input.allowed_deviation_minutes));

  return {
    monitor_label: input.monitor_label.trim() || null,
    target_temp_min: Number.isFinite(targetMin) ? targetMin : null,
    target_temp_max: Number.isFinite(targetMax) ? targetMax : null,
    allowed_deviation_c: Number.isFinite(deviation) ? deviation : null,
    allowed_deviation_minutes: Number.isFinite(deviationMinutes) ? deviationMinutes : null,
  };
}

export function getEffectiveLimits(session: TempMonitorSession): TempEffectiveLimits | null {
  if (session.target_temp_min == null || session.target_temp_max == null) return null;
  const targetMin = Number(session.target_temp_min);
  const targetMax = Number(session.target_temp_max);
  if (!Number.isFinite(targetMin) || !Number.isFinite(targetMax)) return null;
  const deviation = Number(session.allowed_deviation_c ?? 0);
  const allowedDeviationMinutes = Math.max(0, Number(session.allowed_deviation_minutes ?? 0));
  return {
    targetMin,
    targetMax,
    acceptableMin: targetMin - deviation,
    acceptableMax: targetMax + deviation,
    allowedDeviationMinutes,
  };
}

export function isTempWithinLimits(temp: number, limits: TempEffectiveLimits) {
  return temp >= limits.acceptableMin && temp <= limits.acceptableMax;
}

export function continuousOutOfRangeMinutes(
  readings: TempReading[],
  limits: TempEffectiveLimits,
): number {
  if (readings.length === 0) return 0;
  const sorted = [...readings].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  );
  let streakStart: number | null = null;
  for (const row of sorted) {
    const temp = Number(row.temp_c);
    if (isTempWithinLimits(temp, limits)) break;
    const ts = new Date(row.recorded_at).getTime();
    streakStart = streakStart ?? ts;
  }
  if (streakStart == null) return 0;
  return Math.max(0, Math.round((Date.now() - streakStart) / 60_000));
}

export function evaluateTempCompliance(
  currentTemp: number | null | undefined,
  readings: TempReading[],
  session: TempMonitorSession | null,
): TempComplianceStatus {
  if (currentTemp == null || !session) return 'unknown';
  const limits = getEffectiveLimits(session);
  if (!limits) return 'unknown';
  if (isTempWithinLimits(currentTemp, limits)) return 'ok';
  const outMinutes = continuousOutOfRangeMinutes(readings, limits);
  if (limits.allowedDeviationMinutes > 0 && outMinutes >= limits.allowedDeviationMinutes) {
    return 'alert';
  }
  return 'warning';
}

export function complianceLabel(status: TempComplianceStatus) {
  switch (status) {
    case 'ok':
      return 'Alueella';
    case 'warning':
      return 'Poikkeamassa';
    case 'alert':
      return 'Poikkeama ylittynyt';
    default:
      return 'Ei rajoja';
  }
}
