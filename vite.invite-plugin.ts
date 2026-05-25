import type { IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Plugin } from 'vite';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function getLocalKeys() {
  try {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8' });
    const status = JSON.parse(raw);
    return {
      url: status.API_URL ?? 'http://127.0.0.1:54321',
      anonKey: status.ANON_KEY,
      serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    };
  } catch {
    return {
      url: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      anonKey: process.env.VITE_SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handleDeleteCompanyUser(
  req: IncomingMessage,
  res: ServerResponse,
  authHeader: string,
  bodyText: string,
) {
  const { url, anonKey, serviceKey } = getLocalKeys();
  if (!url || !anonKey || !serviceKey) {
    sendJson(res, 500, { error: 'Supabase ei ole käynnissä. Aja: npm run db:start' });
    return;
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    sendJson(res, 401, { error: 'Kirjautuminen epäonnistui' });
    return;
  }

  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role, company_id, is_global_admin')
    .eq('id', authData.user.id)
    .single();

  if (!adminProfile?.is_global_admin || adminProfile.role !== 'admin') {
    sendJson(res, 403, { error: 'Vain globaali admin voi poistaa käyttäjiä' });
    return;
  }

  const body = JSON.parse(bodyText) as Record<string, unknown>;
  const userId = String(body.user_id ?? '').trim();
  const companyIdFromBody = body.company_id ? String(body.company_id).trim() : null;
  const transferToUserId = body.transfer_to_user_id ? String(body.transfer_to_user_id).trim() : null;

  if (!userId) {
    sendJson(res, 400, { error: 'Käyttäjätunniste puuttuu' });
    return;
  }

  if (userId === authData.user.id) {
    sendJson(res, 400, { error: 'Et voi poistaa omaa tiliäsi tästä' });
    return;
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (targetError || !targetProfile?.company_id) {
    sendJson(res, 400, { error: 'Käyttäjää ei löydy' });
    return;
  }

  if (targetProfile.role === 'customer') {
    sendJson(res, 400, { error: 'Asiakaskäyttäjiä ei voi poistaa tästä' });
    return;
  }

  if (companyIdFromBody && companyIdFromBody !== targetProfile.company_id) {
    sendJson(res, 400, { error: 'Virheelliset tiedot' });
    return;
  }

  const targetCompanyId = targetProfile.company_id;

  const { data: prepared, error: prepareError } = await adminClient.rpc('prepare_company_user_deletion', {
    p_user_id: userId,
    p_company_id: targetCompanyId,
    p_transfer_to_user_id: transferToUserId,
  });

  if (prepareError) {
    sendJson(res, 400, { error: prepareError.message });
    return;
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;

  sendJson(res, 200, { ok: true, impact: prepared });
}

export function inviteCompanyUserPlugin(): Plugin {
  return {
    name: 'invite-company-user-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (
          (req.url !== '/api/invite-company-user' && req.url !== '/api/delete-company-user')
          || req.method !== 'POST'
        ) {
          next();
          return;
        }

        try {
          const authHeader = req.headers.authorization;
          if (!authHeader) {
            sendJson(res, 401, { error: 'Ei kirjautumista' });
            return;
          }

          const bodyText = await readBody(req);

          if (req.url === '/api/delete-company-user') {
            await handleDeleteCompanyUser(req, res, authHeader, bodyText);
            return;
          }

          const { url, anonKey, serviceKey } = getLocalKeys();
          if (!url || !anonKey || !serviceKey) {
            sendJson(res, 500, { error: 'Supabase ei ole käynnissä. Aja: npm run db:start' });
            return;
          }

          const userClient = createClient(url, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const adminClient = createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          const { data: authData, error: authError } = await userClient.auth.getUser();
          if (authError || !authData.user) {
            sendJson(res, 401, { error: 'Kirjautuminen epäonnistui' });
            return;
          }

          const { data: adminProfile } = await userClient
            .from('profiles')
            .select('role, company_id')
            .eq('id', authData.user.id)
            .single();

          if (!adminProfile || adminProfile.role !== 'admin') {
            sendJson(res, 403, { error: 'Vain ylläpitäjä voi kutsua käyttäjiä' });
            return;
          }

          const body = JSON.parse(bodyText) as Record<string, unknown>;
          const email = String(body.email ?? '').trim();
          const password = String(body.password ?? 'test123456');
          const displayName = String(body.display_name ?? email.split('@')[0] ?? 'Käyttäjä');
          const role = String(body.role ?? 'technician');
          const companyId = String(body.company_id ?? adminProfile.company_id);

          if (!email || companyId !== adminProfile.company_id) {
            sendJson(res, 400, { error: 'Virheelliset tiedot' });
            return;
          }

          if (!['admin', 'technician', 'manager'].includes(role)) {
            sendJson(res, 400, { error: 'Virheellinen rooli' });
            return;
          }

          const metadata = { company_id: companyId, role, display_name: displayName };

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
            },
            { onConflict: 'id' },
          );
          if (profileError) throw profileError;

          sendJson(res, 200, { ok: true, user_id: userId });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Tuntematon virhe';
          sendJson(res, 500, { error: message });
        }
      });
    },
  };
}
