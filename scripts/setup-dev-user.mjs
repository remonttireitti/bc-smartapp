/**
 * Luo paikallisen testikäyttäjän ilman Studion metadata-kenttää.
 * Aja: npm run setup:user
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const EMAIL = 'admin@x.test';
const PASSWORD = 'test123456';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

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

const { data: existing } = await admin.auth.admin.listUsers();
const user = existing?.users?.find((u) => u.email === EMAIL);

let userId = user?.id;

if (user) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      company_id: COMPANY_ID,
      role: 'admin',
      display_name: 'Admin X',
    },
  });
  if (error) {
    console.error('Käyttäjän päivitys epäonnistui:', error.message);
    process.exit(1);
  }
  console.log('Käyttäjä päivitetty:', EMAIL);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      company_id: COMPANY_ID,
      role: 'admin',
      display_name: 'Admin X',
    },
  });
  if (error) {
    console.error('Käyttäjän luonti epäonnistui:', error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log('Käyttäjä luotu:', EMAIL);
}

// Varmista profiili (jos trigger ei ajanut metadataa aiemmin)
const { error: profileError } = await admin.from('profiles').upsert(
  {
    id: userId,
    company_id: COMPANY_ID,
    role: 'admin',
    email: EMAIL,
    display_name: 'Admin X',
  },
  { onConflict: 'id' },
);

if (profileError) {
  console.error('Profiilin tallennus epäonnistui:', profileError.message);
  process.exit(1);
}

await admin
  .from('work_reports')
  .update({ assigned_user_id: userId })
  .eq('title', 'Huolto X:n toimesta Y:n logoilla')
  .is('assigned_user_id', null);

console.log('');
console.log('Valmis! Kirjaudu sovellukseen:');
console.log('  URL:      http://localhost:5173');
console.log('  Sähköposti:', EMAIL);
console.log('  Salasana:  ', PASSWORD);
