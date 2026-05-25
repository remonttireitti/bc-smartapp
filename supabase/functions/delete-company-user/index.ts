import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AdminClient = ReturnType<typeof createClient>;

async function resolveDeleteTarget(
  adminClient: AdminClient,
  userId: string,
  companyIdFromBody: string | null,
) {
  const { data: target, error } = await adminClient
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !target?.company_id) {
    return { error: 'Käyttäjää ei löydy' as const };
  }

  if (target.role === 'customer') {
    return { error: 'Asiakaskäyttäjiä ei voi poistaa tästä' as const };
  }

  if (companyIdFromBody && companyIdFromBody !== target.company_id) {
    return { error: 'Virheelliset tiedot' as const };
  }

  return { targetCompanyId: target.company_id as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Kirjautuminen epäonnistui' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminProfile } = await userClient
      .from('profiles')
      .select('role, company_id, is_global_admin')
      .eq('id', authData.user.id)
      .single();

    if (!adminProfile?.is_global_admin || adminProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Vain globaali admin voi poistaa käyttäjiä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const userId = String(body.user_id ?? '').trim();
    const companyIdFromBody = body.company_id ? String(body.company_id).trim() : null;
    const transferToUserId = body.transfer_to_user_id ? String(body.transfer_to_user_id).trim() : null;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Käyttäjätunniste puuttuu' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userId === authData.user.id) {
      return new Response(JSON.stringify({ error: 'Et voi poistaa omaa tiliäsi tästä' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resolved = await resolveDeleteTarget(adminClient, userId, companyIdFromBody);
    if ('error' in resolved) {
      return new Response(JSON.stringify({ error: resolved.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: prepared, error: prepareError } = await adminClient.rpc('prepare_company_user_deletion', {
      p_user_id: userId,
      p_company_id: resolved.targetCompanyId,
      p_transfer_to_user_id: transferToUserId,
    });

    if (prepareError) {
      return new Response(JSON.stringify({ error: prepareError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true, impact: prepared }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tuntematon virhe';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
