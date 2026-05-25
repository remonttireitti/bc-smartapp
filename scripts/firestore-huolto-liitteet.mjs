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
  const snap = await db.collection('huolto_raportit').get();
  let n = 0;
  for (const doc of snap.docs) {
    const liitteet = doc.data().huomiotLiitteet;
    if (!Array.isArray(liitteet) || !liitteet.length) continue;
    n += 1;
    if (n <= 3) {
      console.log(doc.id, liitteet.map((x) => ({ storagePath: x.storagePath, url: String(x.url || '').slice(0, 60), fileName: x.fileName })));
    }
  }
  console.log('total with liitteet', n);
}

main().catch(console.error);
