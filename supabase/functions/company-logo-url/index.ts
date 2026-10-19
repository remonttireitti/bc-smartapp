import { createClient } from 'npm:@supabase/supabase-js@2';

// Palauttaa yrityslogon allekirjoitetun URL:n, jos kutsuja näkee yrityksen rivin (RLS).
// Tarvitaan asiakasportaalissa: storage-policy estää asiakaskäyttäjiltä logon suoran luvun.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Ei kirjautumista' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return json({ error: 'Kirjautuminen epäonnistui' }, 401);

    const { company_id } = await req.json();
    const cid = String(company_id ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(cid)) return json({ error: 'Virheellinen yritys' }, 400);

    const { data: row } = await userClient.from('companies').select('logo_url').eq('id', cid).maybeSingle();
    const logo = (row as { logo_url: string | null } | null)?.logo_url ?? null;
    if (!logo) return json({ url: null });
    if (/^https?:\/\//.test(logo)) return json({ url: logo });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const path = logo.replace(/^\/+/, '').replace(/^company-logos\//, '');
    const { data, error } = await admin.storage.from('company-logos').createSignedUrl(path, 3600);
    if (error) return json({ url: null });
    return json({ url: data.signedUrl });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
// v1
