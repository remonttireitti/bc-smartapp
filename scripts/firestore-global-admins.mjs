import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const KEY_PATH =
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  });
}

const db = admin.firestore();

async function main() {
  const snap = await db.collection('users').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(d.email, 'globalAdmin=', d.isGlobalAdmin, 'role=', d.role, 'company=', d.companyId);
  }
}

main().catch(console.error);
