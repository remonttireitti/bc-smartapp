/**
 * Korjaa tuotujen raporttien yritysomistajuus Firestore-raportointitiedon mukaan.
 * Aja: node scripts/fix-import-ownership.mjs --apply --production
 */
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = resolve(__dirname, '.cache/firestore-import-map.json');
const KEY_PATH =
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const BC_COMPANY_ID = '11111111-1111-4111-8111-111111111111';

const REPORTING_COMPANY_MAP = {
  main: BC_COMPANY_ID,
  dwXkNb8AUoUbXTiGOgbN: BC_COMPANY_ID,
  uudenmaankylmahuoltooy: '22222222-2222-4222-8222-222222222222',
  lampokatsastusoy: '33333333-3333-4333-8333-333333333333',
  termatekoy: '44444444-4444-4444-8444-444444444444',
};

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--apply');
const PRODUCTION = args.has('--production');

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

function mapReportingCompany(data) {
  const key = String(
    data.reportingCompanyId ||
      data.companyId ||
      data.originCompanyId ||
      data.companyInfo?.id ||
      data.companyInfo?.companyId ||
      'main',
  ).trim();
  const name = String(data.reportingCompanyName || data.companyInfo?.name || '').toLowerCase();
  if (REPORTING_COMPANY_MAP[key]) return REPORTING_COMPANY_MAP[key];
  if (name.includes('uudenmaan')) return REPORTING_COMPANY_MAP.uudenmaankylmahuoltooy;
  if (name.includes('lämpökatsastus') || name.includes('lampokatsastus')) return REPORTING_COMPANY_MAP.lampokatsastusoy;
  if (name.includes('termatek')) return REPORTING_COMPANY_MAP.termatekoy;
  return BC_COMPANY_ID;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  });
}

const db = admin.firestore();
const importMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};
const supabase = createClient(PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321', getServiceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const defaultCreator =
  importMap.users?.JqDhaNSyIzNpBoglj6GyMB0rdSY2 ??
  Object.values(importMap.users || {})[0] ??
  null;

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY ===');
  const stats = { work_reports: 0, maintenance_reports: 0, quotes: 0 };

  const wrSnap = await db.collection('companies').doc('main').collection('work_reports').get();
  for (const doc of wrSnap.docs) {
    const data = doc.data();
    if (String(data.syncRole || '').toLowerCase() === 'mirror') continue;
    const reportId = importMap.work_reports?.[doc.id];
    if (!reportId) continue;

    const reportingCompanyId = mapReportingCompany(data);
    const createdByUserId = importMap.users?.[String(data.createdByUserId || '')] ?? defaultCreator;

    stats.work_reports += 1;
    if (DRY_RUN) {
      console.log('WR', doc.id, '->', reportingCompanyId.slice(0, 8));
      continue;
    }

    await supabase
      .from('work_reports')
      .update({
        owner_company_id: BC_COMPANY_ID,
        created_by_company_id: reportingCompanyId,
        branding_company_id: reportingCompanyId,
        created_by_user_id: createdByUserId,
        assigned_user_id: importMap.users?.[String(data.assignedToUserId || '')] ?? createdByUserId,
      })
      .eq('id', reportId);
  }

  const huoltoSnap = await db.collection('huolto_raportit').get();
  for (const doc of huoltoSnap.docs) {
    const data = doc.data();
    if (String(data.syncRole || '').toLowerCase() === 'mirror') continue;
    const reportId = importMap.maintenance_reports?.[doc.id];
    if (!reportId) continue;

    const reportingCompanyId = mapReportingCompany(data);
    stats.maintenance_reports += 1;
    if (DRY_RUN) {
      console.log('MR', doc.id, '->', reportingCompanyId.slice(0, 8));
      continue;
    }

    await supabase
      .from('maintenance_reports')
      .update({
        owner_company_id: BC_COMPANY_ID,
        created_by_company_id: reportingCompanyId,
        branding_company_id: reportingCompanyId,
      })
      .eq('id', reportId);
  }

  const quotesSnap = await db.collection('companies').doc('main').collection('quotes').get();
  for (const doc of quotesSnap.docs) {
    if (doc.id === 'main') continue;
    const data = doc.data();
    const quoteId = importMap.quotes?.[doc.id];
    if (!quoteId) continue;
    const reportingCompanyId = mapReportingCompany({ companyId: data.companyId, reportingCompanyName: data.companyName });
    stats.quotes += 1;
    if (DRY_RUN) continue;
    await supabase
      .from('quote_requests')
      .update({
        owner_company_id: BC_COMPANY_ID,
        created_by_company_id: reportingCompanyId,
        branding_company_id: reportingCompanyId,
      })
      .eq('id', quoteId);
  }

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
