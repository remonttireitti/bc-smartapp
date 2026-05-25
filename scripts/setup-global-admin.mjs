/**
 * Luo/päivittää globaali admin -käyttäjät tuotantoon.
 * Aja: node scripts/setup-global-admin.mjs --production
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const BC_COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PASSWORD = process.env.GLOBAL_ADMIN_PASSWORD ?? 'BCimport2026!';

const GLOBAL_ADMINS = [
  {
    email: 'bestcool@bestcool.fi',
    display_name: 'Enn Kotselainen',
    role: 'admin',
    company_id: BC_COMPANY_ID,
  },
  {
    email: 'info@remonttireitti.fi',
    display_name: 'Remonttireitti Admin',
    role: 'admin',
    company_id: BC_COMPANY_ID,
  },
  {
    email: 'huolto@tuusulankylmahuolto.fi',
    display_name: 'Enn Kotselainen',
    role: 'admin',
    company_id: BC_COMPANY_ID,
    global_admin: false,
  },
];

const args = new Set(process.argv.slice(2));
const PRODUCTION = args.has('--production');

function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('npx supabase projects api-keys --project-ref qvqmemeexberatbqxivw', {
    encoding: 'utf8',
  });
  for (const line of raw.split('\n')) {
    if (!line.includes('service_role')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'service_role') return parts[1];
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY puuttuu');
}

const url = PRODUCTION ? PRODUCTION_URL : 'http://127.0.0.1:54321';
const admin = createClient(url, getServiceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(user) {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === user.email.toLowerCase());
  let userId = existing?.id;

  const metadata = {
    company_id: user.company_id,
    role: user.role,
    display_name: user.display_name,
    is_global_admin: user.global_admin !== false,
  };

  if (existing) {
    await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    console.log(`Päivitetty: ${user.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${user.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`Luotu: ${user.email}`);
  }

  await admin.from('profiles').upsert(
    {
      id: userId,
      company_id: user.company_id,
      role: user.role,
      email: user.email,
      display_name: user.display_name,
      is_global_admin: user.global_admin !== false,
      bill_hours_enabled: true,
      bill_expenses_enabled: true,
    },
    { onConflict: 'id' },
  );
}

for (const user of GLOBAL_ADMINS) {
  await ensureUser(user);
}

console.log('');
console.log('Globaali admin:', GLOBAL_ADMINS.filter((u) => u.global_admin !== false).map((u) => u.email).join(', '));
console.log(`Salasana: ${PASSWORD}`);
