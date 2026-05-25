/**
 * Luo uusi yrityskäyttäjä (ylläpitäjä voi ajaa paikallisesti).
 * Aja: npm run invite:user -- --email asentaja@x.test --company x --role technician
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const PASSWORD = process.argv.includes('--password')
  ? process.argv[process.argv.indexOf('--password') + 1]
  : 'test123456';

const COMPANY_IDS = {
  x: '11111111-1111-4111-8111-111111111111',
  y: '22222222-2222-4222-8222-222222222222',
  z: '33333333-3333-4333-8333-333333333333',
  t: '44444444-4444-4444-8444-444444444444',
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const email = arg('email');
const displayName = arg('name') ?? email?.split('@')[0] ?? 'Käyttäjä';
const role = arg('role') ?? 'technician';
const companyKey = arg('company');
const companyId = arg('company-id') ?? (companyKey ? COMPANY_IDS[companyKey] : null);

if (!email || !companyId) {
  console.error('Käyttö: npm run invite:user -- --email user@x.test --company x [--role technician|admin] [--name "Nimi"]');
  process.exit(1);
}

function getLocalKeys() {
  try {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8' });
    const status = JSON.parse(raw);
    return {
      url: status.API_URL ?? 'http://127.0.0.1:54321',
      serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    };
  } catch {
    return {
      url: 'http://127.0.0.1:54321',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

const { url, serviceKey } = getLocalKeys();
if (!serviceKey) {
  console.error('Supabase ei ole käynnissä. Aja: npm run db:start');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const subscriberId = arg('subscriber-id');
const customerId = arg('customer-id');
const metadata = {
  company_id: companyId,
  role,
  display_name: displayName,
  ...(subscriberId ? { subscriber_id: subscriberId } : {}),
  ...(customerId ? { customer_id: customerId } : {}),
};

const { data: listed } = await admin.auth.admin.listUsers();
const existing = listed?.users?.find((u) => u.email === email);

let userId = existing?.id;
if (existing) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(error.message);
  console.log(`Päivitetty: ${email}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  console.log(`Luotu: ${email}`);
}

const { error: profileError } = await admin.from('profiles').upsert(
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

if (profileError) throw new Error(profileError.message);

console.log(`Rooli: ${role}, salasana: ${PASSWORD}`);
