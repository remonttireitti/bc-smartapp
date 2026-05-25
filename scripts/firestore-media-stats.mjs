/**
 * Tutki yritystiedot ja kuvien sijainnit Firestoressa / Storagessa.
 */
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

function summarizeLogo(value) {
  if (!value) return null;
  const s = String(value);
  if (s.startsWith('data:')) return `data-url (${s.length} chars)`;
  if (s.startsWith('http')) return s.slice(0, 80);
  return s.slice(0, 80);
}

async function main() {
  const company = await db.collection('companies').doc('main').get();
  const data = company.data() || {};
  console.log('Company fields:', Object.keys(data).sort().join(', '));
  console.log(
    JSON.stringify(
      {
        name: data.name,
        businessId: data.businessId,
        address: data.address,
        phone: data.phone,
        email: data.email,
        website: data.website,
        logoBase64: summarizeLogo(data.logoBase64 || data.logo || data.logoUrl),
      },
      null,
      2,
    ),
  );

  const workReports = await db.collection('companies').doc('main').collection('work_reports').limit(50).get();
  let withAttachments = 0;
  let attachmentCount = 0;
  for (const doc of workReports.docs) {
    const d = doc.data();
    const atts = Array.isArray(d.attachments) ? d.attachments : [];
    if (atts.length > 0) {
      withAttachments += 1;
      attachmentCount += atts.length;
      if (withAttachments <= 2) {
        console.log('\nWork report attachment sample:', doc.id, atts[0]);
      }
    }
  }
  console.log(`\nWork reports with attachments (sample 50): ${withAttachments}, total files: ${attachmentCount}`);

  const huolto = await db.collection('huolto_raportit').limit(50).get();
  let huomiotImages = 0;
  for (const doc of huolto.docs) {
    const liitteet = doc.data()?.huomiotLiitteet;
    if (Array.isArray(liitteet)) huomiotImages += liitteet.length;
  }
  console.log(`Huolto huomiotLiitteet in sample 50: ${huomiotImages}`);

  const prefixes = [
    'companies/main/work_report_attachments/',
    'companies/main/quote_attachments/',
    'huolto/',
    'companies/main/',
  ];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({ prefix, maxResults: 5 });
    console.log(`\nStorage ${prefix}: ${files.length} sample files`);
    for (const f of files.slice(0, 3)) console.log(' ', f.name, f.metadata?.size);
  }

  const [allFiles] = await bucket.getFiles({ prefix: 'companies/main/work_report_attachments/' });
  console.log(`\nTotal work_report_attachments files: ${allFiles.length}`);

  const [huoltoFiles] = await bucket.getFiles({ prefix: '' });
  const huoltoStorage = huoltoFiles.filter((f) => /huolto|liite|attachment|report/i.test(f.name));
  console.log(`Storage files matching huolto/liite/attachment/report: ${huoltoStorage.length}`);
  for (const f of huoltoStorage.slice(0, 5)) console.log(' ', f.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
