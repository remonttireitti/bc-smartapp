/**
 * Näytä Firestore-esimerkkidokumentit ja yrityksen tiedot.
 */
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
    storageBucket: 'bc-smartapp.firebasestorage.app',
  });
}

const db = admin.firestore();

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function sample(pathRef, n = 1) {
  const snap = await pathRef.limit(n).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function main() {
  const companies = await db.collection('companies').get();
  console.log('Companies:');
  for (const c of companies.docs) {
    console.log(JSON.stringify({ id: c.id, ...pick(c.data(), ['name', 'businessId', 'email']) }, null, 2));
  }

  const users = await sample(db.collection('users'), 2);
  console.log('\nSample users:');
  console.log(JSON.stringify(users.map((u) => pick(u, ['id', 'email', 'displayName', 'role', 'companyId', 'companyIds'])), null, 2));

  const asiakkaat = await sample(db.collection('companies', 'main', 'asiakkaat'), 1);
  console.log('\nSample asiakas:');
  console.log(JSON.stringify(asiakkaat[0], null, 2));

  const laitteet = await sample(db.collection('companies', 'main', 'laitteet'), 1);
  console.log('\nSample laite:');
  console.log(JSON.stringify(laitteet[0], null, 2));

  const workReports = await sample(db.collection('companies', 'main', 'work_reports'), 1);
  console.log('\nSample work_report keys:');
  console.log(Object.keys(workReports[0] || {}).sort().join(', '));
  console.log(JSON.stringify(pick(workReports[0] || {}, [
    'title', 'status', 'customerId', 'customerName', 'ownerCompanyId', 'createdByCompanyId',
    'brandCompanyId', 'companyId', 'assignedUserId', 'createdAt', 'startedAt', 'completedAt',
    'dailyLogs', 'billableSummary', 'syncGroupId', 'syncRole',
  ]), null, 2));

  const huolto = await sample(db.collection('huolto_raportit'), 1);
  console.log('\nSample huolto_raportti keys:');
  console.log(Object.keys(huolto[0] || {}).sort().join(', '));
  console.log(JSON.stringify(pick(huolto[0] || {}, [
    'companyId', 'customerId', 'customerName', 'equipmentId', 'status', 'createdAt', 'updatedAt',
    'asiakas', 'laite', 'ownerCompanyId', 'brandCompanyId',
  ]), null, 2));

  const quotes = await sample(db.collection('companies', 'main', 'quotes'), 1);
  console.log('\nSample quote:');
  console.log(JSON.stringify(quotes[0], null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
