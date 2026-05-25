/**
 * Listaa Firestore-datan määrät (suora haku, ei vain backup-JSON).
 * Aja: node scripts/firestore-export-stats.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const bucket = admin.storage().bucket();

async function countCollection(pathRef) {
  const snap = await pathRef.get();
  return snap.size;
}

async function listBackups(limit = 5) {
  const [files] = await bucket.getFiles({ prefix: 'backups/' });
  return files
    .filter((f) => f.name.endsWith('.json'))
    .sort((a, b) => new Date(b.metadata.timeCreated).getTime() - new Date(a.metadata.timeCreated).getTime())
    .slice(0, limit)
    .map((f) => ({
      name: f.name,
      size: Number(f.metadata.size || 0),
      created: f.metadata.timeCreated,
    }));
}

async function main() {
  console.log('=== Firebase Storage backups ===');
  try {
    for (const b of await listBackups()) {
      console.log(`  ${b.created}  ${(b.size / 1024 / 1024).toFixed(2)} MB  ${b.name}`);
    }
  } catch (err) {
    console.log(`  (ei saatavilla: ${err.message})`);
  }

  console.log('\n=== Root collections ===');
  const rootCols = [
    'users',
    'companies',
    'company_connections',
    'huolto_raportit',
    'tulityo_luvat',
    'sahko_tarkastukset',
    'sahko_poytakirjat',
    'company_notifications',
  ];
  for (const col of rootCols) {
    const n = await countCollection(db.collection(col));
    console.log(`  ${col}: ${n}`);
  }

  console.log('\n=== Companies ===');
  const companiesSnap = await db.collection('companies').get();
  const subCols = ['members', 'customers', 'asiakkaat', 'work_reports', 'quotes', 'tarjoukset', 'laitteet'];
  for (const cdoc of companiesSnap.docs) {
    const data = cdoc.data();
    const name = String(data.name || data.companyName || cdoc.id);
    const counts = {};
    for (const sub of subCols) {
      counts[sub] = await countCollection(cdoc.ref.collection(sub));
    }
    console.log(`  ${name} (${cdoc.id})`);
    for (const [k, v] of Object.entries(counts)) {
      if (v > 0) console.log(`    ${k}: ${v}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
