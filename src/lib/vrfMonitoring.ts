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
  control_requested_enabled: boolean | null;
  control_updated_at: string | null;
  settings: VrfDeviceSettings | null;
  settings_updated_at: string | null;
  notes: string | null;
  created_at: string;
};

export type VrfReading = {
  id: number;
  device_id: string;
  recorded_at: string;
  payload: Record<string, unknown>;
  outdoor_c: number | null;
  heat_enabled: boolean | null;
  operating_state: string | null;
  any_alarm: boolean;
};

export type VrfDeviceSettings = {
  auto_stop_enabled: boolean;
  auto_stop_below_outdoor_c: number;
  auto_stop_outdoor_hysteresis_c: number;
  auto_stop_outdoor_smooth_tau_min: number;
  compressor_alarm_enable_after_s: number;
  alarm_input_trigger_raw_level: number;
  notify_on_delay_s?: number;
  notify_off_delay_s?: number;
  notify_min_interval_s?: number;
  alarm_limits: {
    hot_gas_high_c: number;
    refrigerant_return_low_c: number;
    refrigerant_delta_high_c: number;
    refrigerant_delta_low_c: number;
  };
};

export type VrfDigitalInputs = {
  di1_unit_ready: boolean | null;
  di2_compressor_running: boolean | null;
  di3_alarm: boolean | null;
};

export type VrfTelemetry = {
  temperatures: Record<string, number | null>;
  control: { enabled: boolean | null; permit_requested_enabled?: boolean | null };
  status: {
    operating_state: string | null;
    operating_text: string | null;
    outdoor_safety_lock_active: boolean;
    compressor_likely_running: boolean;
    data_online: boolean;
  };
  digital_inputs: VrfDigitalInputs | null;
  alarms: Record<string, boolean | null>;
  defrost: Record<string, unknown>;
  network: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  settings: Partial<VrfDeviceSettings>;
  timestamp_ms: number | null;
};

export const VRF_DEVICE_SELECT =
  'id, company_id, name, device_key, external_device_id, hardware_id, customer_id, equipment_id, last_seen_at, last_recorded_at, firmware_version, heat_enabled, operating_state, any_alarm, outdoor_c, latest_payload, control_requested_enabled, control_updated_at, settings, settings_updated_at, notes, created_at';

export const VRF_READING_SELECT =
  'id, device_id, recorded_at, payload, outdoor_c, heat_enabled, operating_state, any_alarm';

export const VRF_ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
export const VRF_STALE_THRESHOLD_MS = 90 * 1000;
export const VRF_DEVICE_KEY_DIGITS = 12;

export const VRF_SENSOR_KEYS = [
  'outdoor_c',
  'outdoor_coil_c',
  'refrigerant_supply_c',
  'refrigerant_return_c',
  'hot_gas_c',
  'outdoor_tent_c',
] as const;

export const VRF_SENSOR_LABELS: Record<string, string> = {
  outdoor_c: 'Ulkoilma',
  outdoor_coil_c: 'Ulkoyks. kenno',
  refrigerant_supply_c: 'Kylmäaine meno',
  refrigerant_return_c: 'Kylmäaine paluu',
  hot_gas_c: 'Kuumakaasu',
  outdoor_tent_c: 'Teltta / suoja',
};

export const VRF_ALARM_LABELS: Record<string, string> = {
  external_alarm_input: 'Ulkoinen hälytys (DI3)',
  sensor_disconnected: 'Anturivika',
  hot_gas_high: 'Kuumakaasu korkea',
  refrigerant_return_low: 'Paluu liian kylmä',
  refrigerant_delta_high: 'Meno/paluu-ero suuri',
  refrigerant_delta_low: 'Meno/paluu-ero pieni',
  any_alarm: 'Hälytys aktiivinen',
};

export const VRF_TREND_SERIES = [
  { key: 'outdoor_c', label: 'Ulkoilma', color: '#0ea5e9' },
  { key: 'refrigerant_supply_c', label: 'Kylmäaine meno', color: '#14b8a6' },
  { key: 'refrigerant_return_c', label: 'Kylmäaine paluu', color: '#6366f1' },
  { key: 'hot_gas_c', label: 'Kuumakaasu', color: '#f97316' },
] as const;

export function defaultVrfSettings(): VrfDeviceSettings {
  return {
    auto_stop_enabled: true,
    auto_stop_below_outdoor_c: -15,
    auto_stop_outdoor_hysteresis_c: 2,
    auto_stop_outdoor_smooth_tau_min: 0,
    compressor_alarm_enable_after_s: 300,
    alarm_input_trigger_raw_level: 0,
    notify_on_delay_s: 60,
    notify_off_delay_s: 180,
    notify_min_interval_s: 300,
    alarm_limits: {
      hot_gas_high_c: 110,
      refrigerant_return_low_c: -20,
      refrigerant_delta_high_c: 25,
      refrigerant_delta_low_c: 1,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'nan') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
}

export function parseVrfSettings(raw: unknown): VrfDeviceSettings {
  const base = defaultVrfSettings();
  const row = asRecord(raw);
  if (!row) return base;
  const limits = asRecord(row.alarm_limits);
  return {
    ...base,
    auto_stop_enabled: readBoolean(row.auto_stop_enabled) ?? base.auto_stop_enabled,
    auto_stop_below_outdoor_c: readNumber(row.auto_stop_below_outdoor_c) ?? base.auto_stop_below_outdoor_c,
    auto_stop_outdoor_hysteresis_c:
      readNumber(row.auto_stop_outdoor_hysteresis_c) ?? base.auto_stop_outdoor_hysteresis_c,
    auto_stop_outdoor_smooth_tau_min:
      readNumber(row.auto_stop_outdoor_smooth_tau_min) ?? base.auto_stop_outdoor_smooth_tau_min,
    compressor_alarm_enable_after_s:
      readNumber(row.compressor_alarm_enable_after_s) ?? base.compressor_alarm_enable_after_s,
    alarm_input_trigger_raw_level:
      readNumber(row.alarm_input_trigger_raw_level) ?? base.alarm_input_trigger_raw_level,
    notify_on_delay_s: readNumber(row.notify_on_delay_s) ?? base.notify_on_delay_s,
    notify_off_delay_s: readNumber(row.notify_off_delay_s) ?? base.notify_off_delay_s,
    notify_min_interval_s: readNumber(row.notify_min_interval_s) ?? base.notify_min_interval_s,
    alarm_limits: {
      hot_gas_high_c: readNumber(limits?.hot_gas_high_c) ?? base.alarm_limits.hot_gas_high_c,
      refrigerant_return_low_c:
        readNumber(limits?.refrigerant_return_low_c) ?? base.alarm_limits.refrigerant_return_low_c,
      refrigerant_delta_high_c:
        readNumber(limits?.refrigerant_delta_high_c) ?? base.alarm_limits.refrigerant_delta_high_c,
      refrigerant_delta_low_c:
        readNumber(limits?.refrigerant_delta_low_c) ?? base.alarm_limits.refrigerant_delta_low_c,
    },
  };
}

export function parseVrfDigitalInputs(payload: Record<string, unknown> | null | undefined): VrfDigitalInputs | null {
  const raw = asRecord(payload?.digital_inputs) ?? asRecord(asRecord(payload)?.digital_inputs);
  if (!raw) return null;
  return {
    di1_unit_ready: readBoolean(raw.di1_unit_ready),
    di2_compressor_running: readBoolean(raw.di2_compressor_running),
    di3_alarm: readBoolean(raw.di3_alarm),
  };
}

export function vrfCompressorRunning(telemetry: VrfTelemetry | null): boolean {
  if (telemetry?.digital_inputs?.di2_compressor_running != null) {
    return telemetry.digital_inputs.di2_compressor_running;
  }
  return telemetry?.status.compressor_likely_running ?? false;
}

export function parseVrfTelemetry(payload: Record<string, unknown> | null | undefined): VrfTelemetry | null {
  if (!payload) return null;
  const temperaturesRaw = asRecord(payload.temperatures);
  const temperatures: Record<string, number | null> = {};
  for (const key of VRF_SENSOR_KEYS) {
    temperatures[key] = readNumber(temperaturesRaw?.[key]);
  }
  const controlRaw = asRecord(payload.control);
  const statusRaw = asRecord(payload.status);
  const alarmsRaw = asRecord(payload.alarms);
  const alarms: Record<string, boolean | null> = {};
  if (alarmsRaw) {
    for (const [key, value] of Object.entries(alarmsRaw)) {
      alarms[key] = readBoolean(value);
    }
  }
  return {
    temperatures,
    control: {
      enabled: readBoolean(controlRaw?.enabled),
      permit_requested_enabled: readBoolean(controlRaw?.permit_requested_enabled),
    },
    status: {
      operating_state: typeof statusRaw?.operating_state === 'string' ? statusRaw.operating_state : null,
      operating_text: typeof statusRaw?.operating_text === 'string' ? statusRaw.operating_text : null,
      outdoor_safety_lock_active: readBoolean(statusRaw?.outdoor_safety_lock_active) ?? false,
      compressor_likely_running: readBoolean(statusRaw?.compressor_likely_running) ?? false,
      data_online: readBoolean(statusRaw?.data_online) ?? false,
    },
    digital_inputs: parseVrfDigitalInputs(payload),
    alarms,
    defrost: asRecord(payload.defrost) ?? {},
    network: asRecord(payload.network) ?? {},
    diagnostics: asRecord(payload.diagnostics) ?? {},
    settings: parseVrfSettings(payload.settings),
    timestamp_ms: readNumber(payload.timestamp_ms),
  };
}

export function isVrfDeviceOnline(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) return false;
  return nowMs - new Date(lastSeenAt).getTime() <= VRF_ONLINE_THRESHOLD_MS;
}

export function isVrfTelemetryStale(payload: Record<string, unknown> | null | undefined, nowMs = Date.now()) {
  const telemetry = parseVrfTelemetry(payload);
  if (!telemetry?.timestamp_ms) return true;
  return nowMs - telemetry.timestamp_ms > VRF_STALE_THRESHOLD_MS;
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

export function vrfDeviceConfigUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/vrf-device-config`;
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

export function activeVrfAlarms(alarms: Record<string, boolean | null>) {
  return Object.entries(VRF_ALARM_LABELS)
    .filter(([key]) => key !== 'any_alarm')
    .filter(([key]) => alarms[key] === true)
    .map(([key, label]) => ({ key, label }));
}

export function readingTemp(reading: VrfReading, key: string): number | null {
  const payloadTemps = asRecord(reading.payload?.temperatures) ?? asRecord(asRecord(reading.payload)?.temperatures);
  if (payloadTemps) return readNumber(payloadTemps[key]);
  return null;
}
