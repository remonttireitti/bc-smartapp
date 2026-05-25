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
      return new Response(JSON.stringify({ error: 'Vain ylläpitäjä voi kutsua käyttäjiä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? 'test123456');
    const displayName = String(body.display_name ?? email.split('@')[0] ?? 'Käyttäjä');
    const role = String(body.role ?? 'technician');
    const companyId = String(body.company_id ?? adminProfile.company_id);
    const subscriberId =
      body.subscriber_id != null && String(body.subscriber_id).trim() !== ''
        ? String(body.subscriber_id).trim()
        : null;
    const customerId =
      body.customer_id != null && String(body.customer_id).trim() !== ''
        ? String(body.customer_id).trim()
        : null;

    if (!email || companyId !== adminProfile.company_id) {
      return new Response(JSON.stringify({ error: 'Virheelliset tiedot' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['admin', 'technician', 'manager', 'subscriber', 'customer'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Virheellinen rooli' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'subscriber' && !subscriberId) {
      return new Response(JSON.stringify({ error: 'Tilaaja-käyttäjälle valitse tilaaja rekisteristä' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'customer' && !customerId) {
      return new Response(JSON.stringify({ error: 'Asiakasportaalille valitse asiakaskohde rekisteristä' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'customer' && customerId) {
      const { data: customerRow, error: customerError } = await adminClient
        .from('customers')
        .select('id, owner_company_id')
        .eq('id', customerId)
        .maybeSingle();
      if (customerError || !customerRow || customerRow.owner_company_id !== companyId) {
        return new Response(JSON.stringify({ error: 'Valittu asiakaskohde ei kuulu yrityksellesi' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (role === 'subscriber' && subscriberId) {
      const { data: subscriberRow, error: subscriberError } = await adminClient
        .from('subscribers')
        .select('id, owner_company_id')
        .eq('id', subscriberId)
        .maybeSingle();
      if (subscriberError || !subscriberRow || subscriberRow.owner_company_id !== companyId) {
        return new Response(JSON.stringify({ error: 'Valittu tilaaja ei kuulu yrityksellesi' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const metadata = {
      company_id: companyId,
      role,
      display_name: displayName,
      ...(subscriberId ? { subscriber_id: subscriberId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
    };

    const { data: listed } = await adminClient.auth.admin.listUsers();
    const existing = listed?.users?.find((u) => u.email === email);
    let userId = existing?.id;

    if (existing) {
      const { error } = await adminClient.auth.admin.updateUserById(userId!, {
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw error;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: profileError } = await adminClient.from('profiles').upsert(
      {
        id: userId,
        company_id: companyId,
        role,
        email,
        display_name: displayName,
        subscriber_id: role === 'subscriber' ? subscriberId : null,
        customer_id: role === 'customer' ? customerId : null,
      },
      { onConflict: 'id' },
    );
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
