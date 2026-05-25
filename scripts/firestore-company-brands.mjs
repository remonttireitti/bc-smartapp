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

function pickCompany(d) {
  return {
    id: d.reportingCompanyId,
    name: d.reportingCompanyName,
    businessId: d.reportingCompanyBusinessId,
    address: d.reportingCompanyAddress,
    phone: d.reportingCompanyPhone,
    email: d.reportingCompanyEmail,
    website: d.reportingCompanyWebsite,
    logoLen: String(d.reportingCompanyLogoBase64 || '').length,
  };
}

async function main() {
  const companies = new Map();
  const wr = await db.collection('companies').doc('main').collection('work_reports').get();
  for (const doc of wr.docs) {
    const d = doc.data();
    const key = String(d.reportingCompanyId || 'main');
    if (!companies.has(key)) companies.set(key, pickCompany(d));
  }

  const huolto = await db.collection('huolto_raportit').get();
  for (const doc of huolto.docs) {
    const ci = doc.data().companyInfo;
    if (ci && typeof ci === 'object') {
      const key = String(ci.id || ci.companyId || doc.data().companyId || 'main');
      if (!companies.has(key)) {
        companies.set(key, {
          id: key,
          name: ci.name,
          businessId: ci.businessId,
          address: ci.address,
          phone: ci.phone,
          email: ci.email,
          website: ci.website,
          logoLen: String(ci.logoBase64 || '').length,
        });
      }
    }
  }

  console.log('Unique reporting companies:');
  for (const [k, v] of companies) console.log(JSON.stringify({ key: k, ...v }));

  let huoltoWithLiitteet = 0;
  let tiiveysImages = 0;
  for (const doc of huolto.docs) {
    const d = doc.data();
    if (Array.isArray(d.huomiotLiitteet) && d.huomiotLiitteet.length) huoltoWithLiitteet += 1;
    const tk = d.tiiveyskoeData;
    if (tk && typeof tk === 'object') {
      for (const val of Object.values(tk)) {
        if (val && typeof val === 'object' && ('kuvaUrl' in val || 'kuvaDataUrl' in val)) tiiveysImages += 1;
      }
    }
  }
  console.log(`Huolto with huomiotLiitteet: ${huoltoWithLiitteet}/${huolto.size}`);
  console.log(`Tiiveyskoe image fields sample count: ${tiiveysImages}`);

  const quotes = await db.collection('companies').doc('main').collection('quotes').get();
  let quoteAttachments = 0;
  for (const doc of quotes.docs) {
    quoteAttachments += (doc.data().attachments || []).length;
  }
  console.log(`Quote attachments: ${quoteAttachments}`);
}

main().catch(console.error);
