import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-key',
};

type ReadingInput = { t?: number; c?: number; sensor?: number };

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
      .from('temp_devices')
      .select('id, company_id, device_type')
      .eq('device_key', deviceKey)
      .maybeSingle();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: 'Tuntematon laite' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as {
      readings?: ReadingInput[];
      current_temp?: number;
      t1?: number;
      t2?: number;
      ts?: number;
      fw?: string | number;
      firmware?: string;
      hardware_id?: string;
    };

    const { data: activeSession } = await admin
      .from('temp_monitor_sessions')
      .select('id')
      .eq('device_id', device.id)
      .is('ended_at', null)
      .maybeSingle();

    const sessionId = activeSession?.id ?? null;
    const nowIso = new Date().toISOString();
    const sampleIso =
      typeof body.ts === 'number' && body.ts > 1_000_000_000
        ? new Date(body.ts * 1000).toISOString()
        : nowIso;

    let latestT1: number | null = null;
    let latestT2: number | null = null;
    const inserts: Array<{
      device_id: string;
      session_id: string | null;
      recorded_at: string;
      temp_c: number;
      sensor_channel: number;
    }> = [];

    function pushReading(temp: number, sensorChannel: number, recordedAt: string) {
      if (temp < -100 || temp > 125) return;
      const rounded = Math.round(temp * 100) / 100;
      if (sensorChannel === 1) latestT1 = rounded;
      if (sensorChannel === 2) latestT2 = rounded;
      inserts.push({
        device_id: device.id,
        session_id: sessionId,
        recorded_at: recordedAt,
        temp_c: rounded,
        sensor_channel: sensorChannel,
      });
    }

    if (typeof body.t1 === 'number') {
      pushReading(body.t1, 1, sampleIso);
    }
    if (typeof body.t2 === 'number') {
      pushReading(body.t2, 2, sampleIso);
    }

    const rows = Array.isArray(body.readings) ? body.readings : [];
    for (const row of rows) {
      const temp = typeof row.c === 'number' ? row.c : null;
      if (temp === null) continue;
      const sensorChannel = typeof row.sensor === 'number' && row.sensor >= 1 && row.sensor <= 2
        ? row.sensor
        : 0;
      const ts =
        typeof row.t === 'number' && row.t > 1_000_000_000
          ? new Date(row.t * 1000).toISOString()
          : nowIso;
      pushReading(temp, sensorChannel, ts);
    }

    if (inserts.length > 0) {
      const { error: insertError } = await admin
        .from('temp_readings')
        .upsert(inserts, {
          onConflict: 'device_id,recorded_at,sensor_channel',
          ignoreDuplicates: true,
        });
      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (typeof body.current_temp === 'number') {
      latestT1 = body.current_temp;
    }

    const devicePatch: Record<string, unknown> = {
      last_seen_at: nowIso,
      device_type: device.device_type === 'esp32_ds18b20' ? 'esp32_ds18b20' : device.device_type,
    };
    if (latestT1 !== null) {
      devicePatch.last_temp_c = latestT1;
    }
    if (latestT2 !== null) {
      devicePatch.last_temp_c2 = latestT2;
    }
    const fwRaw = body.firmware ?? body.fw;
    if (fwRaw != null && String(fwRaw).trim()) {
      devicePatch.firmware_version = String(fwRaw).trim().slice(0, 64);
    }
    if (typeof body.hardware_id === 'string' && body.hardware_id.trim()) {
      devicePatch.hardware_id = body.hardware_id.trim().slice(0, 64);
    }

    await admin.from('temp_devices').update(devicePatch).eq('id', device.id);

    return new Response(JSON.stringify({ ok: true, session_id: sessionId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Virhe';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
