import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VRF_DEVICE_SELECT =
  'id, name, external_device_id, last_seen_at, last_recorded_at, firmware_version, heat_enabled, operating_state, any_alarm, outdoor_c, latest_payload, control_requested_enabled';

const VRF_READING_SELECT = 'id, device_id, recorded_at, payload, outdoor_c, heat_enabled, operating_state, any_alarm';

const TEMP_DEVICE_SELECT = 'id, name, last_seen_at, last_temp_c, firmware_version, notes';

const TEMP_READING_SELECT = 'id, device_id, session_id, recorded_at, temp_c';

function readingLimit(hours: number) {
  const estimated = hours * 60 + 30;
  return Math.min(Math.max(estimated, 120), 10_000);
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
    const body = await req.json();
    const token = String(body.token ?? '').trim();
    const hours = Math.min(Math.max(Number(body.hours ?? 24) || 24, 1), 168);

    if (!token) {
      return new Response(JSON.stringify({ error: 'Puuttuva jakotunnus' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: share, error: shareError } = await admin
      .from('monitor_reader_shares')
      .select('id, kind, label, enabled, expires_at, vrf_device_id, temp_device_id, company_id')
      .eq('access_token', token)
      .maybeSingle();

    if (shareError || !share) {
      return new Response(JSON.stringify({ error: 'Jakolinkki ei ole voimassa' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!share.enabled) {
      return new Response(JSON.stringify({ error: 'Jakolinkki on poistettu käytöstä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Jakolinkki on vanhentunut' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const limit = readingLimit(hours);

    if (share.kind === 'vrf' && share.vrf_device_id) {
      const [deviceRes, readingsRes] = await Promise.all([
        admin.from('vrf_devices').select(VRF_DEVICE_SELECT).eq('id', share.vrf_device_id).maybeSingle(),
        admin
          .from('vrf_readings')
          .select(VRF_READING_SELECT)
          .eq('device_id', share.vrf_device_id)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
          .limit(limit),
      ]);

      if (deviceRes.error || !deviceRes.data) {
        return new Response(JSON.stringify({ error: 'Laitetta ei löydy' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          share: {
            id: share.id,
            kind: share.kind,
            label: share.label,
          },
          device: deviceRes.data,
          readings: readingsRes.data ?? [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (share.kind === 'temp' && share.temp_device_id) {
      const [deviceRes, readingsRes] = await Promise.all([
        admin.from('temp_devices').select(TEMP_DEVICE_SELECT).eq('id', share.temp_device_id).maybeSingle(),
        admin
          .from('temp_readings')
          .select(TEMP_READING_SELECT)
          .eq('device_id', share.temp_device_id)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
          .limit(limit),
      ]);

      if (deviceRes.error || !deviceRes.data) {
        return new Response(JSON.stringify({ error: 'Laitetta ei löydy' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          share: {
            id: share.id,
            kind: share.kind,
            label: share.label,
          },
          device: deviceRes.data,
          readings: readingsRes.data ?? [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ error: 'Virheellinen jako' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Virhe' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
