import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-backup-cron-secret',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function insertPlatformAudit(
  admin: SupabaseClient,
  input: {
    userId: string | null;
    action: string;
    summary: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  let email: string | null = null;
  let companyId: string | null = null;
  if (input.userId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('email, company_id')
      .eq('id', input.userId)
      .maybeSingle();
    email = profile?.email ?? null;
    companyId = profile?.company_id ?? null;
  }

  await admin.from('platform_audit_events').insert({
    actor_user_id: input.userId,
    actor_email: email,
    actor_company_id: companyId,
    action: input.action,
    summary: input.summary,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function assertGlobalAdminOrCron(
  req: Request,
  adminClient: SupabaseClient,
): Promise<{ ok: true; userId: string | null } | { ok: false; status: number; error: string }> {
  const cronSecret = Deno.env.get('PLATFORM_BACKUP_CRON_SECRET')?.trim();
  const headerSecret = req.headers.get('x-backup-cron-secret')?.trim();
  if (cronSecret && headerSecret && cronSecret === headerSecret) {
    return { ok: true, userId: null };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Ei kirjautumista' };
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, status: 401, error: 'Kirjautuminen epäonnistui' };
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_global_admin')
    .eq('id', authData.user.id)
    .maybeSingle();

  const metaAdmin =
    authData.user.user_metadata?.is_global_admin === true
    || authData.user.user_metadata?.is_global_admin === 'true';

  if (!profile?.is_global_admin && !metaAdmin) {
    return { ok: false, status: 403, error: 'Vain globaali admin' };
  }

  return { ok: true, userId: authData.user.id };
}
