import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('role, company_id')
      .eq('id', authData.user.id)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Vain ylläpitäjä voi muokata portaalikäyttäjiä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const userId = String(body.user_id ?? '').trim();
    const email = String(body.email ?? '').trim();
    const password = body.password != null ? String(body.password) : '';
    const displayName = String(body.display_name ?? '').trim();
    const subscriberId =
      body.subscriber_id != null && String(body.subscriber_id).trim() !== ''
        ? String(body.subscriber_id).trim()
        : null;
    const customerId =
      body.customer_id != null && String(body.customer_id).trim() !== ''
        ? String(body.customer_id).trim()
        : null;

    if (!userId || !email) {
      return new Response(JSON.stringify({ error: 'Käyttäjä ja sähköposti ovat pakollisia' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subscriberId && !customerId) {
      return new Response(JSON.stringify({ error: 'Puuttuva kohde (tilaaja tai asiakas)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('id, role, company_id, subscriber_id, customer_id, email, display_name')
      .eq('id', userId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Portaalikäyttäjää ei löydy' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (targetProfile.company_id !== adminProfile.company_id) {
      return new Response(JSON.stringify({ error: 'Ei oikeutta muokata tätä käyttäjää' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (subscriberId) {
      if (targetProfile.role !== 'subscriber' || targetProfile.subscriber_id !== subscriberId) {
        return new Response(JSON.stringify({ error: 'Käyttäjä ei kuulu valittuun tilaajaan' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: subscriberRow, error: subscriberError } = await adminClient
        .from('subscribers')
        .select('id, owner_company_id')
        .eq('id', subscriberId)
        .maybeSingle();
      if (subscriberError || !subscriberRow || subscriberRow.owner_company_id !== adminProfile.company_id) {
        return new Response(JSON.stringify({ error: 'Valittu tilaaja ei kuulu yrityksellesi' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (customerId) {
      if (targetProfile.role !== 'customer' || targetProfile.customer_id !== customerId) {
        return new Response(JSON.stringify({ error: 'Käyttäjä ei kuulu valittuun asiakaskohteeseen' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: customerRow, error: customerError } = await adminClient
        .from('customers')
        .select('id, owner_company_id')
        .eq('id', customerId)
        .maybeSingle();
      if (customerError || !customerRow || customerRow.owner_company_id !== adminProfile.company_id) {
        return new Response(JSON.stringify({ error: 'Valittu asiakaskohde ei kuulu yrityksellesi' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const resolvedDisplayName = displayName || targetProfile.display_name || email.split('@')[0] || 'Käyttäjä';
    const metadata = {
      company_id: adminProfile.company_id,
      role: targetProfile.role,
      display_name: resolvedDisplayName,
      ...(subscriberId ? { subscriber_id: subscriberId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
    };

    const authPatch: { email: string; email_confirm: boolean; user_metadata: typeof metadata; password?: string } = {
      email,
      email_confirm: true,
      user_metadata: metadata,
    };
    if (password.trim().length > 0) {
      if (password.trim().length < 6) {
        return new Response(JSON.stringify({ error: 'Salasanan on oltava vähintään 6 merkkiä' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authPatch.password = password;
    }

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authPatch);
    if (authUpdateError) throw authUpdateError;

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        email,
        display_name: resolvedDisplayName,
      })
      .eq('id', userId);

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
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
