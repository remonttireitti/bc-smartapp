/**
 * Luo paikalliset testikäyttäjät neljälle yritykselle.
 * Aja: npm run setup:dev
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const PASSWORD = 'test123456';

const TEST_USERS = [
  {
    email: 'admin@x.test',
    display_name: 'Admin BC',
    role: 'admin',
    company_id: '11111111-1111-4111-8111-111111111111',
    company_name: 'BC Smartapp',
  },
  {
    email: 'admin@y.test',
    display_name: 'Admin UKH',
    role: 'admin',
    company_id: '22222222-2222-4222-8222-222222222222',
    company_name: 'Uudenmaan Kylmähuolto Oy',
  },
  {
    email: 'admin@z.test',
    display_name: 'Admin LK',
    role: 'admin',
    company_id: '33333333-3333-4333-8333-333333333333',
    company_name: 'Lämpökatsastus Oy',
  },
  {
    email: 'admin@t.test',
    display_name: 'Admin Termatek',
    role: 'admin',
    company_id: '44444444-4444-4444-8444-444444444444',
    company_name: 'Termatek Oy',
  },
];

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
  console.error('Supabase ei ole käynnissä. Aja ensin: npm run db:start');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(testUser) {
  const { data: listed } = await admin.auth.admin.listUsers();
  const existing = listed?.users?.find((u) => u.email === testUser.email);
  let userId = existing?.id;

  const metadata = {
    company_id: testUser.company_id,
    role: testUser.role,
    display_name: testUser.display_name,
  };

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${testUser.email}: ${error.message}`);
    console.log(`Päivitetty: ${testUser.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: testUser.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${testUser.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`Luotu: ${testUser.email}`);
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      company_id: testUser.company_id,
      role: testUser.role,
      email: testUser.email,
      display_name: testUser.display_name,
    },
    { onConflict: 'id' },
  );

  if (profileError) throw new Error(`${testUser.email} profiili: ${profileError.message}`);

  const { error: companyError } = await admin
    .from('companies')
    .update({ name: testUser.company_name })
    .eq('id', testUser.company_id);

  if (companyError) throw new Error(`${testUser.email} yritys: ${companyError.message}`);

  return userId;
}

try {
  const xUserId = await ensureUser(TEST_USERS[0]);

  await admin
    .from('work_reports')
    .update({ assigned_user_id: xUserId, created_by_user_id: xUserId })
    .eq('title', 'Huolto BC Smartapp → Uudenmaan Kylmähuolto')
    .is('assigned_user_id', null);

  for (const user of TEST_USERS.slice(1)) {
    await ensureUser(user);
  }

  console.log('');
  console.log('Testikäyttäjät valmiina (salasana kaikilla: test123456)');
  console.log('');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email}  →  ${user.company_name}`);
  }
  console.log('');
  console.log('Kumppanuus: BC Smartapp voi luoda raportteja Uudenmaan Kylmähuolto Oy:n nimissä.');
  console.log('Lämpökatsastus Oy ja Termatek Oy eivät näe muiden yritysten dataa.');
  console.log('');
  console.log('Kirjaudu: http://localhost:5173');
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
