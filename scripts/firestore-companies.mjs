import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
    storageBucket: 'bc-smartapp.firebasestorage.app',
  });
}

const db = admin.firestore();

function logoInfo(v) {
  if (!v) return null;
  const s = String(v);
  if (s.startsWith('data:')) return { kind: 'data', len: s.length, mime: s.slice(5, s.indexOf(';')) };
  return { kind: 'other', preview: s.slice(0, 100) };
}

async function main() {
  const snap = await db.collection('companies').get();
  console.log('All companies:', snap.size);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log('\n---', doc.id, '---');
    console.log(JSON.stringify({
      name: d.name || d.companyName,
      businessId: d.businessId,
      address: d.address,
      phone: d.phone,
      email: d.email,
      website: d.website,
      logo: logoInfo(d.logoBase64 || d.logo || d.logoUrl),
      keys: Object.keys(d).sort(),
    }, null, 2));
  }

  const users = await db.collection('users').limit(3).get();
  for (const u of users.docs) {
    const d = u.data();
    if (d.logoBase64 || d.companyName) {
      console.log('\nUser company branding', u.id, d.email, logoInfo(d.logoBase64));
    }
  }
}

main().catch(console.error);
