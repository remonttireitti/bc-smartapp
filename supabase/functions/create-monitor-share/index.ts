import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Ei kirjautumista' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Kirjautuminen epäonnistui' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', authData.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Vain ylläpitäjä voi luoda jakolinkkejä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const kind = String(body.kind ?? '').trim();
    const deviceId = String(body.device_id ?? '').trim();
    const label = body.label != null ? String(body.label).trim() : '';
    const expiresAt = body.expires_at != null && String(body.expires_at).trim() !== '' ? String(body.expires_at) : null;
    const viewerEmail = body.viewer_email != null ? String(body.viewer_email).trim() : '';
    const viewerPassword = body.viewer_password != null ? String(body.viewer_password) : 'Lukija2026!';
    const viewerDisplayName =
      body.viewer_display_name != null && String(body.viewer_display_name).trim() !== ''
        ? String(body.viewer_display_name).trim()
        : label || 'Seurannan lukija';

    if (!['vrf', 'temp'].includes(kind) || !deviceId) {
      return new Response(JSON.stringify({ error: 'Virheelliset tiedot' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deviceTable = kind === 'vrf' ? 'vrf_devices' : 'temp_devices';
    const { data: deviceRow, error: deviceError } = await admin
      .from(deviceTable)
      .select('id, company_id, name')
      .eq('id', deviceId)
      .maybeSingle();

    if (deviceError || !deviceRow || deviceRow.company_id !== profile.company_id) {
      return new Response(JSON.stringify({ error: 'Laite ei kuulu yrityksellesi' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let viewerUserId: string | null = null;

    if (viewerEmail) {
      const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === viewerEmail.toLowerCase());

      if (existing) {
        viewerUserId = existing.id;
        await admin.from('profiles').upsert({
          id: existing.id,
          email: viewerEmail,
          display_name: viewerDisplayName,
          role: 'monitor_viewer',
          company_id: profile.company_id,
        });
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: viewerEmail,
          password: viewerPassword,
          email_confirm: true,
          user_metadata: { role: 'monitor_viewer', company_id: profile.company_id },
        });
        if (createError || !created.user) {
          return new Response(JSON.stringify({ error: createError?.message ?? 'Lukijakäyttäjän luonti epäonnistui' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        viewerUserId = created.user.id;
        await admin.from('profiles').upsert({
          id: created.user.id,
          email: viewerEmail,
          display_name: viewerDisplayName,
          role: 'monitor_viewer',
          company_id: profile.company_id,
        });
      }
    }

    const insertRow: Record<string, unknown> = {
      company_id: profile.company_id,
      kind,
      label: label || deviceRow.name,
      viewer_user_id: viewerUserId,
      expires_at: expiresAt,
      created_by: authData.user.id,
    };
    if (kind === 'vrf') insertRow.vrf_device_id = deviceId;
    else insertRow.temp_device_id = deviceId;

    const { data: share, error: insertError } = await admin
      .from('monitor_reader_shares')
      .insert(insertRow)
      .select('id, access_token, label, viewer_user_id, expires_at')
      .single();

    if (insertError || !share) {
      return new Response(JSON.stringify({ error: insertError?.message ?? 'Jaon luonti epäonnistui' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        share_id: share.id,
        access_token: share.access_token,
        label: share.label,
        viewer_user_id: share.viewer_user_id,
        expires_at: share.expires_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Virhe' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
