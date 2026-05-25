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
const bucket = admin.storage().bucket();

async function main() {
  const wr = await db.collection('companies').doc('main').collection('work_reports').limit(5).get();
  for (const doc of wr.docs) {
    const d = doc.data();
    console.log(doc.id, {
      reportingCompanyId: d.reportingCompanyId,
      reportingCompanyName: d.reportingCompanyName,
      logoLen: String(d.reportingCompanyLogoBase64 || '').length,
      attachments: (d.attachments || []).length,
    });
  }

  const wrAll = await db.collection('companies').doc('main').collection('work_reports').get();
  let logos = 0;
  let maxLogo = 0;
  for (const doc of wrAll.docs) {
    const lg = String(doc.data().reportingCompanyLogoBase64 || '');
    if (lg.length > 100) {
      logos += 1;
      maxLogo = Math.max(maxLogo, lg.length);
    }
  }
  console.log(`Work reports with embedded logo: ${logos}, max len ${maxLogo}`);

  const [files] = await bucket.getFiles({ prefix: 'companies/' });
  const companyIds = new Set();
  for (const f of files) {
    const parts = f.name.split('/');
    if (parts.length >= 2) companyIds.add(parts[1]);
  }
  console.log('Storage company ids:', [...companyIds]);

  for (const cid of companyIds) {
    const doc = await db.collection('companies').doc(cid).get();
    console.log(`Firestore companies/${cid}: exists=${doc.exists}`, doc.exists ? Object.keys(doc.data() || {}) : '');
  }

  const huolto = await db.collection('huolto_raportit').limit(3).get();
  for (const doc of huolto.docs) {
    const d = doc.data();
    const liitteet = d.huomiotLiitteet || [];
    console.log('\nHuolto', doc.id, 'liitteet', liitteet.length, liitteet[0]?.storagePath || liitteet[0]?.url?.slice(0, 80));
    console.log('companyInfo logo', String(d.companyInfo?.logoBase64 || '').length);
  }
}

main().catch(console.error);
