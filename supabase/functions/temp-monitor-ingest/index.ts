import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-key',
};

type ReadingInput = { t?: number; c?: number };

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
      .select('id, company_id')
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
    let latestTemp: number | null = null;

    const rows = Array.isArray(body.readings) ? body.readings : [];
    if (rows.length > 0) {
      const inserts = rows
        .map((row) => {
          const temp = typeof row.c === 'number' ? row.c : null;
          if (temp === null || temp < -100 || temp > 125) return null;
          const ts =
            typeof row.t === 'number' && row.t > 1_000_000_000
              ? new Date(row.t * 1000).toISOString()
              : nowIso;
          latestTemp = temp;
          return {
            device_id: device.id,
            session_id: sessionId,
            recorded_at: ts,
            temp_c: Math.round(temp * 100) / 100,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (inserts.length > 0) {
        const { error: insertError } = await admin
          .from('temp_readings')
          .upsert(inserts, { onConflict: 'device_id,recorded_at', ignoreDuplicates: true });
        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (typeof body.current_temp === 'number') {
      latestTemp = body.current_temp;
    }

    const devicePatch: Record<string, unknown> = {
      last_seen_at: nowIso,
    };
    if (latestTemp !== null) {
      devicePatch.last_temp_c = Math.round(latestTemp * 100) / 100;
    }
    if (typeof body.firmware === 'string' && body.firmware.trim()) {
      devicePatch.firmware_version = body.firmware.trim().slice(0, 64);
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
