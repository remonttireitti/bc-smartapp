/**
 * Korjaa tuodut huoltoraportit: normalisoi legacy-kentät, moduulit ja piiridata.
 *
 *   npx tsx scripts/fix-import-huolto.ts --dry-run
 *   npx tsx scripts/fix-import-huolto.ts --apply --production
 *   npx tsx scripts/fix-import-huolto.ts --apply --production --all
 */
import admin from 'firebase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { HUOLTO_IMPORT_NORMALIZE_VERSION } from '../src/lib/huoltoRaportti/legacyImportInference.ts';
import type { HuoltoReportData } from '../src/lib/huoltoRaportti/types.ts';
import {
  applyLegacyHuoltoFields,
  huoltoTitleFromFirestore,
} from './lib/huolto-legacy-import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = resolve(__dirname, '.cache/firestore-import-map.json');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const FIRESTORE_COMPANY_ID = 'main';

const HUOLTO_META_KEYS = new Set([
  'id',
  'companyId',
  'customerId',
  'customerName',
  'customerBusinessId',
  'customerRegistryCompanyId',
  'customerRegistryId',
  'equipmentId',
  'equipmentRegistryCompanyId',
  'originCompanyId',
  'sharedWithCompanyIds',
  'syncGroupId',
  'syncMeta',
  'syncRevision',
  'syncRole',
  'visibilityMode',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'autoSavedAt',
  'reportLetterheadCompanyId',
  'partnerCompanyInfo',
  'companyInfo',
  'title',
]);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--apply');
const PRODUCTION = args.has('--production');
const ALL_REPORTS = args.has('--all');

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

function extractHuoltoData(doc: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (HUOLTO_META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function normalizeHuoltoImportPayload(
  raw: Record<string, unknown>,
  meta?: Record<string, unknown>,
): HuoltoReportData {
  const legacy = applyLegacyHuoltoFields(
    raw as Partial<HuoltoReportData> & Record<string, unknown>,
    meta,
  );
  return normalizeHuoltoReportData(legacy);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

async function updateReport(
  supabase: SupabaseClient,
  reportId: string,
  patch: { data: HuoltoReportData; title?: string },
  currentData: unknown,
) {
  const prev = (currentData ?? {}) as HuoltoReportData;
  const versionStale = (prev.legacyImportNormalizedVersion ?? 0) < HUOLTO_IMPORT_NORMALIZE_VERSION;
  if (!versionStale && stableJson(patch.data) === stableJson(currentData)) {
    return false;
  }
  if (DRY_RUN) return true;

  const { error } = await supabase
    .from('maintenance_reports')
    .update({
      data: patch.data,
      ...(patch.title ? { title: patch.title } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);
  if (error) throw new Error(`${reportId}: ${error.message}`);
  return true;
}

async function main() {
  const supabaseUrl = PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabase = createClient(supabaseUrl, getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stats = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    fromFirestore: 0,
    fromSupabaseOnly: 0,
    skipped: 0,
  };

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY HUOLTO FIX ===');
  console.log(`Target: ${PRODUCTION ? 'production' : 'local'} (${supabaseUrl})`);

  const importMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : null;
  const firestoreByReportId = new Map<string, Record<string, unknown>>();

  if (importMap?.maintenance_reports) {
    const db = initFirebase();
    const huoltoSnap = await db.collection('huolto_raportit').get();
    for (const doc of huoltoSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (String(data.syncRole || '').toLowerCase() === 'mirror') continue;
      const sourceCompany = String(data.companyId || data.customerRegistryCompanyId || FIRESTORE_COMPANY_ID);
      if (sourceCompany !== FIRESTORE_COMPANY_ID) continue;
      const reportId = importMap.maintenance_reports[doc.id];
      if (!reportId) continue;
      firestoreByReportId.set(reportId, data);
    }
  }

  let query = supabase.from('maintenance_reports').select('id, title, data, customer_id, equipment_id');
  if (!ALL_REPORTS && firestoreByReportId.size > 0) {
    query = query.in('id', [...firestoreByReportId.keys()]);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  for (const row of rows ?? []) {
    stats.scanned += 1;
    const firestoreDoc = firestoreByReportId.get(row.id);
    let normalized: HuoltoReportData;
    let title = row.title as string | null;

    if (firestoreDoc) {
      stats.fromFirestore += 1;
      normalized = normalizeHuoltoImportPayload(extractHuoltoData(firestoreDoc), firestoreDoc);
      title = huoltoTitleFromFirestore(firestoreDoc);
    } else if (ALL_REPORTS || !importMap) {
      stats.fromSupabaseOnly += 1;
      normalized = normalizeHuoltoImportPayload((row.data ?? {}) as Record<string, unknown>);
    } else {
      stats.skipped += 1;
      continue;
    }

    const deviceType = normalized.laiteTyyppi || '—';
    const modules = Object.entries(normalized.selectedModules ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');

    const changed = await updateReport(
      supabase,
      row.id,
      { data: normalized, title: title ?? undefined },
      row.data,
    );

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}${row.id.slice(0, 8)}… ${deviceType} [${modules || 'ei moduuleja'}] ${changed ? '→ päivitetään' : '→ ok'}`,
    );

    if (changed) stats.updated += 1;
    else stats.unchanged += 1;
  }

  console.log('\nYhteenveto:', stats);
  if (DRY_RUN) {
    console.log('Aja korjaus: npx tsx scripts/fix-import-huolto.ts --apply --production --all');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
