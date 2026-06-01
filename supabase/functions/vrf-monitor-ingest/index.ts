import { createClient } from 'npm:@supabase/supabase-js@2';
import { processVrfAlarmEmail } from '../_shared/vrfAlarmNotify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-key',
};

const HISTORY_MIN_INTERVAL_MS = 60_000;

type JsonRecord = Record<string, unknown>;

type SnapshotSummary = {
  recordedAt: string;
  outdoorC: number | null;
  heatEnabled: boolean | null;
  operatingState: string | null;
  anyAlarm: boolean;
  firmwareVersion: string | null;
  externalDeviceId: string | null;
  hardwareId: string | null;
  payload: JsonRecord;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
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
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveRecordedAt(payload: JsonRecord): string {
  const timestampMs = readNumber(payload.timestamp_ms);
  if (timestampMs != null && timestampMs > 1_000_000_000_000) {
    return new Date(timestampMs).toISOString();
  }
  if (timestampMs != null && timestampMs > 1_000_000_000) {
    return new Date(timestampMs * 1000).toISOString();
  }
  return new Date().toISOString();
}

function di3TriggerLevel(payload: JsonRecord, deviceSettings: JsonRecord | null): 0 | 1 {
  const settings = asRecord(payload.settings);
  const level =
    readNumber(settings?.di3_trigger_raw_level) ??
    readNumber(settings?.alarm_input_trigger_raw_level) ??
    readNumber(deviceSettings?.di3_trigger_raw_level) ??
    readNumber(deviceSettings?.alarm_input_trigger_raw_level) ??
    0;
  return level === 1 ? 1 : 0;
}

function di3AlarmActive(payload: JsonRecord, deviceSettings: JsonRecord | null): boolean {
  const di = asRecord(payload.digital_inputs);
  const raw = readNumber(di?.di3_raw);
  if (raw != null) {
    return raw === di3TriggerLevel(payload, deviceSettings);
  }
  const di3Alarm = readBoolean(di?.di3_alarm);
  if (di3Alarm != null) return di3Alarm;
  const alarms = asRecord(payload.alarms);
  return readBoolean(alarms?.external_alarm_input) === true;
}

function summarizeSnapshot(payload: JsonRecord, deviceSettings: JsonRecord | null = null): SnapshotSummary {
  const temperatures = asRecord(payload.temperatures);
  const control = asRecord(payload.control);
  const status = asRecord(payload.status);
  const alarms = asRecord(payload.alarms);
  const diagnostics = asRecord(payload.diagnostics);
  const firmwareAnyAlarm = readBoolean(alarms?.any_alarm) ?? false;
  const externalAlarm = di3AlarmActive(payload, deviceSettings);

  return {
    recordedAt: resolveRecordedAt(payload),
    outdoorC: readNumber(temperatures?.outdoor_c),
    heatEnabled: readBoolean(control?.enabled),
    operatingState: readString(status?.operating_state),
    anyAlarm: firmwareAnyAlarm || externalAlarm,
    firmwareVersion: readString(diagnostics?.firmware_version),
    externalDeviceId: readString(payload.device_id),
    hardwareId: null,
    payload,
  };
}

function collectSnapshots(body: unknown): JsonRecord[] {
  const root = asRecord(body);
  if (!root) return [];

  if (Array.isArray(root.readings)) {
    return root.readings
      .map((entry) => {
        const row = asRecord(entry);
        if (!row) return null;
        const nested = asRecord(row.payload);
        if (nested) return nested;
        return row;
      })
      .filter((row): row is JsonRecord => row != null);
  }

  const nestedPayload = asRecord(root.payload);
  if (nestedPayload) return [nestedPayload];

  if (readString(root.device_id)) return [root];

  return [];
}

function summaryChanged(
  previous: JsonRecord | null,
  next: SnapshotSummary,
  deviceSettings: JsonRecord | null,
): boolean {
  if (!previous) return true;
  const prevSummary = summarizeSnapshot(previous, deviceSettings);
  return (
    prevSummary.heatEnabled !== next.heatEnabled ||
    prevSummary.operatingState !== next.operatingState ||
    prevSummary.anyAlarm !== next.anyAlarm
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Vain POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const deviceKey =
      req.headers.get('x-device-key')?.trim() ||
      req.headers.get('X-Device-Key')?.trim() ||
      '';

    if (!deviceKey) {
      return new Response(JSON.stringify({ error: 'Puuttuva X-Device-Key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: device, error: deviceError } = await admin
      .from('vrf_devices')
      .select('id, company_id, name, any_alarm, latest_payload, settings')
      .eq('device_key', deviceKey)
      .maybeSingle();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: 'Tuntematon laite' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const snapshots = collectSnapshots(body);

    if (snapshots.length === 0) {
      return new Response(JSON.stringify({ error: 'Tyhjä telemetria' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deviceSettings = asRecord(device.settings);
    const summaries = snapshots.map((payload) => summarizeSnapshot(payload, deviceSettings));
    const latest = summaries[summaries.length - 1];
    const nowIso = new Date().toISOString();

    const { data: lastReading } = await admin
      .from('vrf_readings')
      .select('recorded_at')
      .eq('device_id', device.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousPayload = asRecord(device.latest_payload);
    const lastReadingMs = lastReading?.recorded_at
      ? new Date(lastReading.recorded_at).getTime()
      : 0;
    const latestRecordedMs = new Date(latest.recordedAt).getTime();
    const shouldStoreHistory =
      !lastReading ||
      latestRecordedMs - lastReadingMs >= HISTORY_MIN_INTERVAL_MS ||
      summaryChanged(previousPayload, latest, deviceSettings);

    if (shouldStoreHistory) {
      const { error: insertError } = await admin.from('vrf_readings').upsert(
        {
          device_id: device.id,
          recorded_at: latest.recordedAt,
          payload: latest.payload,
          outdoor_c: latest.outdoorC,
          heat_enabled: latest.heatEnabled,
          operating_state: latest.operatingState,
          any_alarm: latest.anyAlarm,
        },
        { onConflict: 'device_id,recorded_at', ignoreDuplicates: true },
      );

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const devicePatch: Record<string, unknown> = {
      last_seen_at: nowIso,
      last_recorded_at: latest.recordedAt,
      latest_payload: latest.payload,
      any_alarm: latest.anyAlarm,
      outdoor_c: latest.outdoorC,
      heat_enabled: latest.heatEnabled,
      operating_state: latest.operatingState,
    };

    if (latest.firmwareVersion) {
      devicePatch.firmware_version = latest.firmwareVersion.slice(0, 64);
    }
    if (latest.externalDeviceId) {
      devicePatch.external_device_id = latest.externalDeviceId.slice(0, 128);
    }
    if (latest.hardwareId) {
      devicePatch.hardware_id = latest.hardwareId.slice(0, 64);
    }

    let notifyEmailsSent = 0;
    let notifySettingsPatch: JsonRecord | null = null;

    try {
      const notifyResult = await processVrfAlarmEmail({
        deviceName: typeof device.name === 'string' ? device.name : 'VRF-laite',
        deviceId: device.id,
        settings: deviceSettings,
        wasAlarm: device.any_alarm === true,
        nowAlarm: latest.anyAlarm,
        recordedAtIso: latest.recordedAt,
        outdoorC: latest.outdoorC,
      });
      notifyEmailsSent = notifyResult.emailsSent;
      notifySettingsPatch = notifyResult.settingsPatch;
    } catch (notifyErr) {
      console.error(
        '[vrf-notify]',
        notifyErr instanceof Error ? notifyErr.message : notifyErr,
      );
    }

    if (notifySettingsPatch) {
      devicePatch.settings = notifySettingsPatch;
      devicePatch.settings_updated_at = nowIso;
    }

    await admin.from('vrf_devices').update(devicePatch).eq('id', device.id);

    return new Response(
      JSON.stringify({
        ok: true,
        stored_history: shouldStoreHistory,
        recorded_at: latest.recordedAt,
        notify_emails_sent: notifyEmailsSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Virhe';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
