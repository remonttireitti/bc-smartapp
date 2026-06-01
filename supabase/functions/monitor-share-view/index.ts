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

const MAX_SHARE_HOURS = 2160;
const MAX_READINGS = 50_000;
const READ_PAGE_SIZE = 1000;

function readingLimit(hours: number) {
  const estimated = hours * 60 + 30;
  return Math.min(Math.max(estimated, 120), MAX_READINGS);
}

async function fetchVrfReadingsInWindow(
  admin: ReturnType<typeof createClient>,
  deviceId: string,
  since: string,
  until: string,
  maxRows: number,
) {
  const sinceMs = new Date(since).getTime();
  const collected: Record<string, unknown>[] = [];

  for (let page = 0; collected.length < maxRows; page += 1) {
    const from = page * READ_PAGE_SIZE;
    const to = from + READ_PAGE_SIZE - 1;
    const { data, error } = await admin
      .from('vrf_readings')
      .select(VRF_READING_SELECT)
      .eq('device_id', deviceId)
      .gte('recorded_at', since)
      .lte('recorded_at', until)
      .order('recorded_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      if (collected.length >= maxRows) break;
      collected.push(row);
    }

    const oldest = batch[batch.length - 1] as { recorded_at: string };
    const oldestMs = new Date(oldest.recorded_at).getTime();
    if (batch.length < READ_PAGE_SIZE || oldestMs <= sinceMs) break;
  }

  collected.reverse();
  return collected;
}

function resolveShareWindow(body: Record<string, unknown>) {
  const startRaw = body.start ?? body.period_start;
  const endRaw = body.end ?? body.period_end;

  if (startRaw != null && endRaw != null) {
    const startMs = new Date(String(startRaw)).getTime();
    const endMs = new Date(String(endRaw)).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('Virheellinen aikaväli');
    }
    const spanHours = (endMs - startMs) / 3600_000;
    if (spanHours > MAX_SHARE_HOURS) {
      throw new Error('Aikaväli liian pitkä (enintään 3 kk)');
    }
    return {
      since: new Date(startMs).toISOString(),
      until: new Date(endMs).toISOString(),
      limit: readingLimit(spanHours),
    };
  }

  const hours = Math.min(Math.max(Number(body.hours ?? 24) || 24, 1), MAX_SHARE_HOURS);
  return {
    since: new Date(Date.now() - hours * 3600_000).toISOString(),
    until: new Date().toISOString(),
    limit: readingLimit(hours),
  };
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
    const body = (await req.json()) as Record<string, unknown>;
    const token = String(body.token ?? '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Puuttuva jakotunnus' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const window = resolveShareWindow(body);

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

    if (share.kind === 'vrf' && share.vrf_device_id) {
      const deviceRes = await admin
        .from('vrf_devices')
        .select(VRF_DEVICE_SELECT)
        .eq('id', share.vrf_device_id)
        .maybeSingle();

      if (deviceRes.error || !deviceRes.data) {
        return new Response(JSON.stringify({ error: 'Laitetta ei löydy' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const vrfReadings = await fetchVrfReadingsInWindow(
        admin,
        share.vrf_device_id,
        window.since,
        window.until,
        window.limit,
      );

      return new Response(
        JSON.stringify({
          share: {
            id: share.id,
            kind: share.kind,
            label: share.label,
          },
          device: deviceRes.data,
          readings: vrfReadings,
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
          .gte('recorded_at', window.since)
          .lte('recorded_at', window.until)
          .order('recorded_at', { ascending: false })
          .limit(window.limit),
      ]);

      if (deviceRes.error || !deviceRes.data) {
        return new Response(JSON.stringify({ error: 'Laitetta ei löydy' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tempReadings = readingsRes.data ?? [];
      tempReadings.reverse();

      return new Response(
        JSON.stringify({
          share: {
            id: share.id,
            kind: share.kind,
            label: share.label,
          },
          device: deviceRes.data,
          readings: tempReadings,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ error: 'Virheellinen jako' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Virhe';
    const status = message.includes('Aikaväli') || message.includes('Virheellinen') ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
