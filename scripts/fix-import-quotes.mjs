/**
 * Korjaa tuodut tarjouspyynnöt: linkitä asiakkaat, laitteet ja normalisoi legacy-kentät.
 *
 *   node scripts/fix-import-quotes.mjs --dry-run
 *   node scripts/fix-import-quotes.mjs --apply
 */
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLegacyQuoteFields,
  firestoreQuoteCustomerId,
  quoteTitleFromFirestore,
  resolveLegacyDeviceIds,
} from './lib/quote-legacy-import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = resolve(__dirname, '.cache/firestore-import-map.json');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

const DRY_RUN = !process.argv.includes('--apply');

const QUOTE_META_KEYS = new Set([
  'id',
  'companyId',
  'companyName',
  'customerId',
  'customerName',
  'customerAddress',
  'createdAt',
  'updatedAt',
  'pdfFileName',
  'total',
  'totalBase',
  'subtotal',
  'subtotalBase',
  'vat',
  'vatBase',
]);

function extractQuoteData(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (QUOTE_META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('npx supabase projects api-keys --project-ref qvqmemeexberatbqxivw', {
    encoding: 'utf8',
    cwd: resolve(__dirname, '..'),
  });
  for (const line of raw.split('\n')) {
    if (!line.includes('service_role')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'service_role') return parts[1];
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY puuttuu');
}

function initFirebase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
    });
  }
  return admin.firestore();
}

async function main() {
  if (!existsSync(MAP_FILE)) {
    throw new Error('Puuttuu scripts/.cache/firestore-import-map.json — aja ensin import-from-firestore.mjs');
  }

  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
  const db = initFirebase();
  const supabase = createClient('https://qvqmemeexberatbqxivw.supabase.co', getServiceKey());

  const stats = { scanned: 0, updated: 0, linkedCustomer: 0, linkedEquipment: 0, matchedByName: 0 };

  const { data: customerRows } = await supabase.from('customers').select('id, name, owner_company_id');
  const customersByName = new Map();
  for (const customer of customerRows ?? []) {
    const key = `${customer.owner_company_id}::${String(customer.name).trim().toLowerCase()}`;
    customersByName.set(key, customer.id);
  }

  const quotesSnap = await db.collection('companies').doc('main').collection('quotes').get();
  for (const doc of quotesSnap.docs) {
    if (doc.id === 'main') continue;
    const data = doc.data();
    const quoteId = map.quotes?.[doc.id];
    if (!quoteId) continue;

    stats.scanned += 1;
    let customerId = map.customers[firestoreQuoteCustomerId(data)] ?? null;
    if (!customerId && data.customerName) {
      const ownerCompanyId = map.companies?.main ?? null;
      if (ownerCompanyId) {
        const key = `${ownerCompanyId}::${String(data.customerName).trim().toLowerCase()}`;
        customerId = customersByName.get(key) ?? null;
        if (customerId) stats.matchedByName += 1;
      }
    }
    const equipmentId = map.equipment[String(data.equipmentId || '')] ?? null;
    const quoteData = applyLegacyQuoteFields(extractQuoteData(data), data);
    const quoteType = String(quoteData.type || data.type || 'huolto');
    if (!quoteData.type) quoteData.type = quoteType;
    Object.assign(quoteData, resolveLegacyDeviceIds(quoteData, quoteType));

    const patch = {
      customer_id: customerId,
      equipment_id: equipmentId,
      title: quoteTitleFromFirestore(data),
      data: quoteData,
    };

    if (customerId) stats.linkedCustomer += 1;
    if (equipmentId) stats.linkedEquipment += 1;

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}${doc.id} → ${quoteId}: customer=${customerId ? 'ok' : '—'} equipment=${equipmentId ? 'ok' : '—'} device=${quoteData.selectedDeviceId || '—'}`,
    );

    if (DRY_RUN) continue;

    const { error } = await supabase.from('quote_requests').update(patch).eq('id', quoteId);
    if (error) throw new Error(`${quoteId}: ${error.message}`);
    stats.updated += 1;
  }

  console.log('\nYhteenveto:', stats);
  if (DRY_RUN) console.log('Aja korjaus: node scripts/fix-import-quotes.mjs --apply');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
