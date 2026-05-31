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
  /** @deprecated Käytä di3_trigger_raw_level — säilytetty yhteensopivuuden vuoksi. */
  alarm_input_trigger_raw_level: number;
  /** 0 = aktiivinen matalalla, 1 = aktiivinen korkealla (+12 V PNP). */
  di2_trigger_raw_level?: number;
  di3_trigger_raw_level?: number;
  di4_trigger_raw_level?: number;
  notify_on_delay_s?: number;
  notify_off_delay_s?: number;
  notify_min_interval_s?: number;
  alarm_limits: {
    hot_gas_high_c: number;
    refrigerant_return_low_c: number;
    refrigerant_delta_high_c: number;
    refrigerant_delta_low_c: number;
  };
  /** Pilvikomenno: hälytyslockin nollaus (nonce kasvaa jokaisella pyynnöllä). */
  alarm_shutdown_reset?: { nonce: number };
};

export type VrfDigitalInputs = {
  di4_unit_ready: boolean | null;
  di2_compressor_running: boolean | null;
  di3_alarm: boolean | null;
  di2_raw?: number | null;
  di3_raw?: number | null;
  di4_raw?: number | null;
};

export type VrfTelemetry = {
  temperatures: Record<string, number | null>;
  control: { enabled: boolean | null; permit_requested_enabled?: boolean | null };
  status: {
    operating_state: string | null;
    operating_text: string | null;
    outdoor_safety_lock_active: boolean;
    outdoor_auto_stop_signal_c: number | null;
    alarm_shutdown_active: boolean;
    alarm_shutdown_remaining_s: number | null;
    alarm_shutdown_waiting_di_clear: boolean;
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
  { key: 'outdoor_coil_c', label: 'Ulkoyks. kenno', color: '#84cc16' },
  { key: 'refrigerant_supply_c', label: 'Kylmäaine meno', color: '#14b8a6' },
  { key: 'refrigerant_return_c', label: 'Kylmäaine paluu', color: '#6366f1' },
  { key: 'hot_gas_c', label: 'Kuumakaasu', color: '#f97316' },
] as const;

export const VRF_TREND_HOUR_OPTIONS = [
  { hours: 1, label: '1 h' },
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 168, label: '7 pv' },
  { hours: 720, label: '1 kk' },
  { hours: 2160, label: '3 kk' },
] as const;

export type VrfTrendHours = (typeof VRF_TREND_HOUR_OPTIONS)[number]['hours'];

export const VRF_TREND_MAX_HOURS = 2160;
export const VRF_READING_QUERY_MAX = 50_000;

export type VrfSchematicClickKey =
  | 'outdoor_c'
  | 'outdoor_coil_c'
  | 'refrigerant_supply_c'
  | 'refrigerant_return_c'
  | 'hot_gas_c'
  | 'delta';

export type VrfTrendSeriesKey = (typeof VRF_TREND_SERIES)[number]['key'];

export function defaultTrendSeriesForHotspot(key: VrfSchematicClickKey): Set<VrfTrendSeriesKey> {
  if (key === 'delta') {
    return new Set(['refrigerant_supply_c', 'refrigerant_return_c']);
  }
  return new Set([key]);
}

export function filterVrfReadingsByPeriod(
  readings: VrfReading[],
  startIso: string,
  endIso: string,
): VrfReading[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  return readings.filter((reading) => {
    const t = new Date(reading.recorded_at).getTime();
    return t >= start && t <= end;
  });
}

export type VrfTrendPeriod = {
  startMs: number;
  endMs: number;
  span: number;
  startIso: string;
  endIso: string;
};

/** Valitun trendi-ikkunan rajat (nykyhetkestä taaksepäin). */
export function vrfTrendPeriodFromHours(hours: number, nowMs = Date.now()): VrfTrendPeriod {
  const endMs = nowMs;
  const startMs = nowMs - hours * 3600_000;
  return {
    startMs,
    endMs,
    span: Math.max(endMs - startMs, 1),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

export function vrfTrendPeriodFromIso(startIso: string, endIso: string): VrfTrendPeriod | null {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return {
    startMs,
    endMs,
    span: endMs - startMs,
    startIso,
    endIso,
  };
}

export function readingsInTrendPeriod(readings: VrfReading[], period: VrfTrendPeriod): VrfReading[] {
  return sortReadingsByTime(
    readings.filter((reading) => {
      const t = new Date(reading.recorded_at).getTime();
      return t >= period.startMs && t <= period.endMs;
    }),
  );
}

/** Firmware-oletukset (config.h) — sulatusheuristiikka historiatrendissä. */
export const VRF_DEFROST_COIL_RISE_C = 0.85;
export const VRF_DEFROST_SUPPLY_FALL_C = 0.55;
export const VRF_DEFROST_WINDOW_SAMPLES = 3;

export type VrfBinaryLaneKey = 'control' | 'compressor' | 'defrost' | 'alarm' | 'unit_ready';

export const VRF_BINARY_LANES: {
  key: VrfBinaryLaneKey;
  label: string;
  color: string;
  glow: string;
}[] = [
  { key: 'control', label: 'Käyntilupa', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.45)' },
  { key: 'compressor', label: 'Kompressori DI2', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.45)' },
  { key: 'defrost', label: 'Sulatus', color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.45)' },
  { key: 'alarm', label: 'Hälytys DI3', color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.45)' },
  { key: 'unit_ready', label: 'Käyntitieto DI4', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.45)' },
];

/** PNP (+12 V = ON): trigger 1. Käänteinen: trigger 0. */
export function vrfDiTriggerFromInverted(inverted: boolean): 0 | 1 {
  return inverted ? 0 : 1;
}

export function vrfDiInvertedFromTrigger(level: number | null | undefined, fallback = 1): boolean {
  const v = level ?? fallback;
  return v === 0;
}

export function vrfDiTriggerDefault(
  key: 'di2_trigger_raw_level' | 'di3_trigger_raw_level' | 'di4_trigger_raw_level',
): 0 | 1 {
  return key === 'di3_trigger_raw_level' ? 0 : 1;
}

/** Selite DI-asetuksille: VRF +12 V PNP -kytkentä. */
export function vrfDiLogicDescription(
  key: 'di2_trigger_raw_level' | 'di3_trigger_raw_level' | 'di4_trigger_raw_level',
  inverted: boolean,
): string {
  if (key === 'di3_trigger_raw_level') {
    return inverted
      ? '+12 V tulossa = normaali (ei hälytystä). Hälytys kun signaali putoaa (0 V).'
      : '+12 V tulossa = hälytys aktiivinen (käänteinen logiikka — ei suositella).';
  }
  return inverted
    ? 'Päällä kun tulo on matalalla (0 V).'
    : 'Päällä kun tulo on korkealla (+12 V, PNP).';
}

export function defaultVrfSettings(): VrfDeviceSettings {
  return {
    auto_stop_enabled: true,
    auto_stop_below_outdoor_c: -15,
    auto_stop_outdoor_hysteresis_c: 2,
    auto_stop_outdoor_smooth_tau_min: 0,
    compressor_alarm_enable_after_s: 300,
    alarm_input_trigger_raw_level: 0,
    di2_trigger_raw_level: 1,
    di3_trigger_raw_level: 0,
    di4_trigger_raw_level: 1,
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
    di2_trigger_raw_level: readNumber(row.di2_trigger_raw_level) ?? base.di2_trigger_raw_level,
    di3_trigger_raw_level:
      readNumber(row.di3_trigger_raw_level) ??
      readNumber(row.alarm_input_trigger_raw_level) ??
      base.di3_trigger_raw_level,
    di4_trigger_raw_level: readNumber(row.di4_trigger_raw_level) ?? base.di4_trigger_raw_level,
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
    di4_unit_ready: readBoolean(raw.di4_unit_ready) ?? readBoolean(raw.di1_unit_ready),
    di2_compressor_running: readBoolean(raw.di2_compressor_running),
    di3_alarm: readBoolean(raw.di3_alarm),
    di2_raw: readNumber(raw.di2_raw),
    di3_raw: readNumber(raw.di3_raw),
    di4_raw: readNumber(raw.di4_raw),
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
      outdoor_auto_stop_signal_c: readNumber(statusRaw?.outdoor_auto_stop_signal_c),
      alarm_shutdown_active: readBoolean(statusRaw?.alarm_shutdown_active) ?? false,
      alarm_shutdown_remaining_s: readNumber(statusRaw?.alarm_shutdown_remaining_s),
      alarm_shutdown_waiting_di_clear: readBoolean(statusRaw?.alarm_shutdown_waiting_di_clear) ?? false,
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
      return 'Sammutettu';
    case 'defrost':
      return 'Sulattaa';
    case 'permit_on':
      return 'Lämmittää';
    case 'idle':
      return 'Valmiustila';
    case 'alarm':
    case 'alarm_shutdown':
      return 'Hälytyksessä';
    default:
      return state ?? '—';
  }
}

export type VrfPermitTone = 'on' | 'off' | 'blocked' | 'unknown';

export type VrfPermitPresentation = {
  isOn: boolean | null;
  actualOn: boolean | null;
  requestedOn: boolean | null;
  label: string;
  reason: string | null;
  tone: VrfPermitTone;
};

export type VrfActivityTone = 'heat' | 'defrost' | 'idle' | 'off' | 'alarm' | 'wait' | 'unknown';

export type VrfActivityPresentation = {
  headline: string;
  detail: string | null;
  tone: VrfActivityTone;
};

function isAlarmLikeOperatingText(text: string | null | undefined) {
  const t = String(text ?? '').toLowerCase();
  return t.includes('halyty') || t.includes('hälyty');
}

function formatShutdownRemaining(remainingS: number) {
  if (remainingS >= 120) {
    const mins = Math.ceil(remainingS / 60);
    return `Uudelleenkäynnistys noin ${mins} min kuluttua`;
  }
  return `Uudelleenkäynnistys noin ${remainingS} s kuluttua`;
}

export type VrfAlarmDelayResetState = {
  canReset: boolean;
  canForceReset: boolean;
  blockedReason: string | null;
};

/** Voiko hälytyksen jälkeisen minimiviiveen nollata sovelluksesta. */
export function vrfAlarmDelayResetState(
  telemetry: VrfTelemetry | null,
  externalAlarm: boolean,
): VrfAlarmDelayResetState {
  const alarmShutdown = telemetry?.status.alarm_shutdown_active ?? false;
  if (!alarmShutdown) {
    return { canReset: false, canForceReset: false, blockedReason: null };
  }
  if (externalAlarm) {
    return {
      canReset: false,
      canForceReset: true,
      blockedReason: 'DI3-hälytys on vielä aktiivinen — tarkista kytkentä tai käytä pakotettua nollausta',
    };
  }
  const remainingS = telemetry?.status.alarm_shutdown_remaining_s;
  if (typeof remainingS === 'number' && remainingS > 0) {
    return { canReset: true, canForceReset: true, blockedReason: null };
  }
  if (telemetry?.status.alarm_shutdown_waiting_di_clear) {
    return {
      canReset: false,
      canForceReset: true,
      blockedReason: 'Odottaa DI3-signaalin poistumista',
    };
  }
  return { canReset: true, canForceReset: true, blockedReason: null };
}

export function formatVrfDiRaw(raw: number | null | undefined): string {
  if (raw == null) return '—';
  return raw ? 'HIGH (+12 V)' : 'LOW (0 V)';
}

/** FDC400KXZE2 / KX-sarjan ulostulot vs nykyinen DI-kytkentä. */
export function vrfDiWiringHint(
  inputs: VrfDigitalInputs | null,
  settings: VrfDeviceSettings | null | undefined,
): string | null {
  if (!inputs) return null;
  const di3Inverted = vrfDiInvertedFromTrigger(
    settings?.di3_trigger_raw_level ?? settings?.alarm_input_trigger_raw_level,
    0,
  );
  if (inputs.di3_alarm && inputs.di3_raw === 0 && di3Inverted) {
    return 'DI3 lukee jatkuvasti 0 V (INV = hälytys). Jos kytketty CnT-5 / Error-ulostuloon, vaihda DI3-asetus PNP:ksi — error antaa +12 V vain vian sattuessa.';
  }
  if (!inputs.di3_alarm && inputs.di3_raw === 1 && di3Inverted) {
    return 'DI3 lukee +12 V (INV = normaali). Kytkentä näyttää oikealta fail-safe -logiikalla.';
  }
  return null;
}

/** Nonce that fits ESP32 int32 JSON parsing (epoch seconds, not Date.now() ms). */
export function vrfSettingsNonce(): number {
  return Math.floor(Date.now() / 1000);
}

export function buildAlarmShutdownResetSettings(
  current: VrfDeviceSettings | Record<string, unknown> | null | undefined,
  options?: { force?: boolean },
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return {
    ...base,
    alarm_shutdown_reset: { nonce: vrfSettingsNonce(), force: options?.force === true },
  };
}

export function buildOtaRequestSettings(
  current: VrfDeviceSettings | Record<string, unknown> | null | undefined,
  url = 'https://bc-smartapp.vercel.app/vrf-firmware/firmware.bin',
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return {
    ...base,
    ota_request: { nonce: vrfSettingsNonce(), url },
  };
}

export function vrfResolvePermitStatus(params: {
  telemetry: VrfTelemetry | null;
  requestedEnabled: boolean | null | undefined;
  online: boolean;
  stale: boolean;
}): VrfPermitPresentation {
  const { telemetry, requestedEnabled, online, stale } = params;
  const alarmShutdown = telemetry?.status.alarm_shutdown_active ?? false;
  const rawActualOn = telemetry?.control.enabled ?? null;
  // Firmware pitää heatEnabled-arvon hälytyslockin ajan — RO1 on silti pois.
  const actualOn = alarmShutdown ? false : rawActualOn;
  const requestedOn = requestedEnabled ?? telemetry?.control.permit_requested_enabled ?? null;
  const outdoorLock = telemetry?.status.outdoor_safety_lock_active ?? false;
  const remainingS = telemetry?.status.alarm_shutdown_remaining_s;
  const waitingDi = telemetry?.status.alarm_shutdown_waiting_di_clear ?? false;

  if (!online) {
    const fallbackOn = actualOn ?? requestedOn;
    return {
      isOn: fallbackOn,
      actualOn,
      requestedOn,
      label: fallbackOn == null ? '—' : fallbackOn ? 'Päällä' : 'Pois',
      reason: 'Laite ei ole yhteydessä',
      tone: 'unknown',
    };
  }

  if (stale) {
    const fallbackOn = actualOn ?? requestedOn;
    return {
      isOn: fallbackOn,
      actualOn,
      requestedOn,
      label: fallbackOn == null ? '—' : fallbackOn ? 'Päällä' : 'Pois',
      reason: 'Ei tuoretta dataa — ohjaus lukittu',
      tone: 'unknown',
    };
  }

  if (actualOn === true) {
    return {
      isOn: true,
      actualOn,
      requestedOn,
      label: 'Päällä',
      reason: outdoorLock ? 'RO1 aktiivinen — ulkoraja estää uuden kytkemisen päälle' : 'RO1 antaa lämmitysluvan',
      tone: 'on',
    };
  }

  let reason: string | null = null;
  let tone: VrfPermitTone = 'off';

  if (alarmShutdown) {
    tone = 'blocked';
    if (requestedOn === true) {
      if (typeof remainingS === 'number' && remainingS > 0) {
        reason = `Pyydetty päälle — RO1 estetty hälytyksen jälkeen (${formatShutdownRemaining(remainingS).toLowerCase()})`;
      } else if (waitingDi) {
        reason = 'Pyydetty päälle — odottaa hälytyksen (DI3) poistumista';
      } else {
        reason = 'Pyydetty päälle — RO1 estetty hälytyksen takia';
      }
    } else if (typeof remainingS === 'number' && remainingS > 0) {
      reason = `Hälytyksen jälkeinen tauko — ${formatShutdownRemaining(remainingS).toLowerCase()}`;
    } else if (waitingDi) {
      reason = 'Odottaa hälytyksen (DI3) poistumista';
    } else {
      reason = 'Käynti estetty hälytyksen takia';
    }
  } else if (outdoorLock) {
    tone = 'blocked';
    const signal = telemetry?.status.outdoor_auto_stop_signal_c;
    const limit = telemetry?.settings.auto_stop_below_outdoor_c;
    const limitText =
      signal != null && limit != null
        ? `mittaus ${signal.toFixed(1)} °C, raja ${limit} °C`
        : 'ulkolämpötilaraja';
    reason =
      requestedOn === true
        ? `Pyydetty päälle — ${limitText} estää lämmityksen`
        : `Ulkolämpötilaraja (${limitText})`;
  } else if (requestedOn === false) {
    reason = 'Kytketty pois käsin';
  } else if (requestedOn === true && actualOn === false) {
    reason = 'Pyydetty päälle — laite ei vielä vastannut';
  } else {
    reason = 'Käyntilupa poissa';
  }

  return {
    isOn: false,
    actualOn,
    requestedOn,
    label: 'Pois',
    reason,
    tone,
  };
}

export function vrfResolveDeviceActivity(params: {
  telemetry: VrfTelemetry | null;
  online: boolean;
  stale: boolean;
  defrostLikely: boolean;
  compressorRunning: boolean;
  externalAlarm: boolean;
  activeAlarmLabels?: string[];
}): VrfActivityPresentation {
  const {
    telemetry,
    online,
    stale,
    defrostLikely,
    compressorRunning,
    externalAlarm,
    activeAlarmLabels = [],
  } = params;

  if (!online) {
    return {
      headline: 'Ei yhteyttä',
      detail: 'Laite ei raportoi verkkoon',
      tone: 'unknown',
    };
  }

  const permitOn = telemetry?.control.enabled === true;
  const unitReady = telemetry?.digital_inputs?.di4_unit_ready === true;
  const alarmShutdown = telemetry?.status.alarm_shutdown_active ?? false;
  const remainingS = telemetry?.status.alarm_shutdown_remaining_s;
  const waitingDi = telemetry?.status.alarm_shutdown_waiting_di_clear ?? false;
  const outdoorLock = telemetry?.status.outdoor_safety_lock_active ?? false;
  const defrostActive = telemetry?.defrost?.active === true || defrostLikely;
  const opState = telemetry?.status.operating_state;
  const opText = telemetry?.status.operating_text?.trim() ?? null;

  const staleNote = stale ? 'Mittaus ei ole tuore' : null;

  if (alarmShutdown) {
    let detail: string | null = null;
    if (typeof remainingS === 'number' && remainingS > 0) {
      detail = formatShutdownRemaining(remainingS);
    } else if (waitingDi) {
      detail = 'Odottaa hälytyksen (DI3) poistumista ennen uudelleenkäynnistystä';
    } else {
      detail = 'Lämmitys estetty hälytyksen jälkeen';
    }
    return {
      headline: 'Käynnistys estetty hälytyksen jälkeen',
      detail: staleNote ? `${detail} · ${staleNote}` : detail,
      tone: 'wait',
    };
  }

  if (externalAlarm || activeAlarmLabels.length > 0) {
    const detail =
      activeAlarmLabels.length > 0
        ? activeAlarmLabels.join(' · ')
        : 'Ulkoinen hälytys (DI3) aktiivinen';
    return {
      headline: 'Hälytyksessä',
      detail: staleNote ? `${detail} · ${staleNote}` : detail,
      tone: 'alarm',
    };
  }

  if (defrostActive) {
    return {
      headline: 'Sulattaa',
      detail: staleNote ?? 'Sulatus arvioitu lämpötiloista',
      tone: 'defrost',
    };
  }

  if (!permitOn) {
    let detail: string | null = null;
    if (outdoorLock) {
      const signal = telemetry?.status.outdoor_auto_stop_signal_c;
      detail =
        signal != null
          ? `Ulkolämpöraja — mittaus ${signal.toFixed(1)} °C`
          : 'Ulkolämpötilaraja estää lämmityksen';
    } else if (telemetry?.control.permit_requested_enabled === false) {
      detail = 'Käyntilupa kytketty pois';
    } else {
      detail = 'Käyntilupa poissa';
    }
    return {
      headline: 'Sammutettu',
      detail: staleNote ? `${detail} · ${staleNote}` : detail,
      tone: 'off',
    };
  }

  if (compressorRunning) {
    const diDetail = telemetry?.digital_inputs?.di2_compressor_running === true ? 'DI2 vahvistaa' : 'Arvio lämpötiloista';
    return {
      headline: 'Lämmittää',
      detail: staleNote ?? `Kompressori käy — ${diDetail}`,
      tone: 'heat',
    };
  }

  if (permitOn) {
    let detail = 'Lämmityslupa päällä — odottaa lämmitystarvetta';
    if (unitReady) {
      detail = 'VRF valmiustilassa — odottaa lämmitystarvetta';
    } else if (
      opText &&
      !isAlarmLikeOperatingText(opText) &&
      !/^k[aä]y[nnt]tilupa/i.test(opText)
    ) {
      detail = opText;
    }
    return {
      headline: 'Valmiustila',
      detail: staleNote ? `${detail} · ${staleNote}` : detail,
      tone: 'idle',
    };
  }

  if (opState === 'idle') {
    const detail =
      opText && !isAlarmLikeOperatingText(opText)
        ? opText
        : staleNote ?? 'Odottaa lämmitystarvetta';
    return {
      headline: 'Valmiustila',
      detail: staleNote && detail !== staleNote ? `${detail} · ${staleNote}` : detail,
      tone: 'idle',
    };
  }

  if (opText && !isAlarmLikeOperatingText(opText)) {
    return {
      headline: vrfOperatingStateLabel(opState),
      detail: staleNote ? `${opText} · ${staleNote}` : opText,
      tone: 'idle',
    };
  }

  return {
    headline: vrfOperatingStateLabel(opState),
    detail: staleNote ?? (permitOn ? 'Lämmityslupa päällä' : 'Odottaa tietoa'),
    tone: permitOn ? 'idle' : 'unknown',
  };
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

export function readingTelemetry(reading: VrfReading): VrfTelemetry | null {
  const payload = asRecord(reading.payload);
  if (!payload) return null;
  return parseVrfTelemetry(payload);
}

export function readingHeatPermit(reading: VrfReading): boolean {
  const telemetry = readingTelemetry(reading);
  if (telemetry?.control.enabled != null) return telemetry.control.enabled === true;
  return reading.heat_enabled === true;
}

export function readingCompressorOn(reading: VrfReading): boolean {
  const telemetry = readingTelemetry(reading);
  if (telemetry) return vrfCompressorRunning(telemetry);
  return false;
}

export function readingAlarmActive(reading: VrfReading): boolean {
  const telemetry = readingTelemetry(reading);
  if (telemetry?.digital_inputs?.di3_alarm != null) return telemetry.digital_inputs.di3_alarm;
  if (telemetry?.alarms.external_alarm_input === true) return true;
  return reading.any_alarm;
}

export function readingUnitReady(reading: VrfReading): boolean {
  const telemetry = readingTelemetry(reading);
  return telemetry?.digital_inputs?.di4_unit_ready === true;
}

export function readingFirmwareDefrost(reading: VrfReading): boolean {
  const telemetry = readingTelemetry(reading);
  return readBoolean(telemetry?.defrost?.active) === true;
}

/** Sulatus: firmware-lippu tai heuristiikka (kompressori + kenno nousee + meno laskee). */
export function inferDefrostLikely(readings: VrfReading[], index: number): boolean {
  const reading = readings[index];
  if (readingFirmwareDefrost(reading)) return true;
  if (index < VRF_DEFROST_WINDOW_SAMPLES - 1) return false;
  if (!readingHeatPermit(reading) || !readingCompressorOn(reading)) return false;

  const startIdx = index - (VRF_DEFROST_WINDOW_SAMPLES - 1);
  const coilStart = readingTemp(readings[startIdx], 'outdoor_coil_c');
  const coilEnd = readingTemp(reading, 'outdoor_coil_c');
  const supplyStart = readingTemp(readings[startIdx], 'refrigerant_supply_c');
  const supplyEnd = readingTemp(reading, 'refrigerant_supply_c');
  if (coilStart == null || coilEnd == null || supplyStart == null || supplyEnd == null) return false;

  const dCoil = coilEnd - coilStart;
  const dSupply = supplyEnd - supplyStart;
  return dCoil >= VRF_DEFROST_COIL_RISE_C && dSupply <= -VRF_DEFROST_SUPPLY_FALL_C;
}

export function buildBinaryLaneFlags(
  readings: VrfReading[],
  key: VrfBinaryLaneKey,
): boolean[] {
  return readings.map((reading, index) => {
    switch (key) {
      case 'control':
        return readingHeatPermit(reading);
      case 'compressor':
        return readingCompressorOn(reading);
      case 'defrost':
        return inferDefrostLikely(readings, index);
      case 'alarm':
        return readingAlarmActive(reading);
      case 'unit_ready':
        return readingUnitReady(reading);
      default:
        return false;
    }
  });
}

export type BinaryLaneSegment = { startPct: number; widthPct: number };

function timeRangeToSegment(
  startT: number,
  endT: number,
  periodStartMs: number,
  span: number,
): BinaryLaneSegment {
  const startPct = ((startT - periodStartMs) / span) * 100;
  const endPct = ((endT - periodStartMs) / span) * 100;
  return {
    startPct: Math.max(0, startPct),
    widthPct: Math.max(0.4, endPct - startPct),
  };
}

/** Mittausvälien mediaani → raja, milloin jakson väliä pidetään datattomana. */
export function readingGapThresholdMs(sorted: VrfReading[], spanMs: number): number {
  const minGap = 15 * 60_000;
  const maxGap = Math.max(spanMs / 20, minGap);
  if (sorted.length < 2) return Math.min(Math.max(spanMs / 200, minGap), maxGap);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    intervals.push(
      new Date(sorted[i].recorded_at).getTime() - new Date(sorted[i - 1].recorded_at).getTime(),
    );
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return Math.min(Math.max(median * 3, minGap), maxGap);
}

/** Jaksot joilla ei ole mittauksia valitulla aikavälillä. */
export function buildReadingCoverageGaps(
  readings: VrfReading[],
  period: VrfTrendPeriod,
): BinaryLaneSegment[] {
  const sorted = readingsInTrendPeriod(readings, period);
  const { startMs, endMs, span } = period;
  if (sorted.length === 0) return [{ startPct: 0, widthPct: 100 }];

  const gapThreshold = readingGapThresholdMs(sorted, span);
  const gaps: BinaryLaneSegment[] = [];

  const firstT = new Date(sorted[0].recorded_at).getTime();
  if (firstT - startMs > gapThreshold) {
    gaps.push(timeRangeToSegment(startMs, firstT, startMs, span));
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t1 = new Date(sorted[i].recorded_at).getTime();
    const t2 = new Date(sorted[i + 1].recorded_at).getTime();
    if (t2 - t1 > gapThreshold) {
      gaps.push(timeRangeToSegment(t1, t2, startMs, span));
    }
  }

  const lastT = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  if (endMs - lastT > gapThreshold) {
    gaps.push(timeRangeToSegment(lastT, endMs, startMs, span));
  }

  return gaps;
}

/** Mittausryhmät, joita ei erota dataton aukko. */
export function splitReadingsByCoverageGaps(
  readings: VrfReading[],
  period: VrfTrendPeriod,
): VrfReading[][] {
  const sorted = readingsInTrendPeriod(readings, period);
  if (sorted.length === 0) return [];
  const gapThreshold = readingGapThresholdMs(sorted, period.span);
  const groups: VrfReading[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prevT = new Date(sorted[i - 1].recorded_at).getTime();
    const currT = new Date(sorted[i].recorded_at).getTime();
    if (currT - prevT > gapThreshold) {
      groups.push([sorted[i]]);
    } else {
      groups[groups.length - 1].push(sorted[i]);
    }
  }
  return groups;
}

/** ON-jaksot prosentteina aikavälillä (Gantt-tyylinen tilatrendi). */
export function buildBinaryLaneSegments(
  readings: VrfReading[],
  flags: boolean[],
  minTime: number,
  span: number,
): BinaryLaneSegment[] {
  if (readings.length === 0 || span <= 0) return [];
  const segments: BinaryLaneSegment[] = [];
  let startT: number | null = null;

  readings.forEach((reading, i) => {
    const on = flags[i];
    const t = new Date(reading.recorded_at).getTime();
    if (on && startT == null) startT = t;
    const isLast = i === readings.length - 1;
    if ((!on || isLast) && startT != null) {
      const endT = on && isLast ? t : new Date(readings[i - 1].recorded_at).getTime();
      const startPct = ((startT - minTime) / span) * 100;
      const endPct = ((endT - minTime) / span) * 100;
      const minWidth = Math.min(1.2, (100 / readings.length) * 0.85);
      segments.push({
        startPct: Math.max(0, startPct),
        widthPct: Math.max(minWidth, endPct - startPct + minWidth * 0.35),
      });
      startT = null;
    }
  });

  return segments;
}

export function trendReadingLimit(hours: number): number {
  const estimated = hours * 60 + 30;
  return Math.min(Math.max(estimated, 120), VRF_READING_QUERY_MAX);
}

export function hoursBetweenIso(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.min((end - start) / 3600_000, VRF_TREND_MAX_HOURS);
}

export function sortReadingsByTime(readings: VrfReading[]): VrfReading[] {
  return [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

export function formatTrendTimeLabel(ms: number, spanMs: number): string {
  const date = new Date(ms);
  if (spanMs <= 6 * 3600_000) {
    return date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 48 * 3600_000) {
    return date.toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit' });
}
