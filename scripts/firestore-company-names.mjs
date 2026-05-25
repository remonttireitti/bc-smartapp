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

async function main() {
  const names = new Set();
  const wr = await db.collection('companies').doc('main').collection('work_reports').get();
  for (const doc of wr.docs) {
    names.add(String(doc.data().reportingCompanyName || ''));
  }
  console.log([...names].sort());

  const huolto = await db.collection('huolto_raportit').get();
  const hnames = new Set();
  for (const doc of huolto.docs) {
    const ci = doc.data().companyInfo;
    if (ci?.name) hnames.add(String(ci.name));
  }
  console.log('Huolto companyInfo names:', [...hnames].sort());
}

main().catch(console.error);
