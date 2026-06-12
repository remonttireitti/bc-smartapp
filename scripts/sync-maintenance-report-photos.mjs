/**
 * Synkronoi huoltoraportin JSON-kuvapolut maintenance_report_images -taulun Supabase-poluilla.
 *
 *   node scripts/sync-maintenance-report-photos.mjs --production
 *   node scripts/sync-maintenance-report-photos.mjs --production --apply
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const production = process.argv.includes('--production');

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const PROJECT_REF = 'qvqmemeexberatbqxivw';

function loadEnvFile(relativePath) {
  const path = join(rootDir, relativePath);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env');
if (production) loadEnvFile('.env.production');

function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    cwd: rootDir,
  });
  for (const line of raw.split('\n')) {
    if (!line.includes('service_role')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'service_role') return parts[1];
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY puuttuu');
}

const supabaseUrl = production
  ? (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? PRODUCTION_URL)
  : (process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321');
const serviceKey = getServiceKey();
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isLegacyPath(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (/firebasestorage\.googleapis\.com|storage\.googleapis\.com\/v0\/b\//i.test(v)) return true;
  if (v.includes('huolto_raportti_liitteet/') || v.startsWith('companies/main/')) return true;
  if (/^https?:\/\//i.test(v)) return true;
  return false;
}

function mergeSection(dbRows, jsonItems) {
  return dbRows.map((row, index) => ({
    storagePath: row.storage_path,
    comment: jsonItems[index]?.comment ?? jsonItems[index]?.comment?.trim?.() ?? '',
    fileName: row.file_name,
    contentType: row.mime_type ?? 'image/jpeg',
  }));
}

function normalizePhotos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return { storagePath: item, comment: '' };
      if (item && typeof item === 'object') {
        return {
          storagePath: String(item.storagePath ?? item.path ?? item.id ?? '').trim(),
          comment: String(item.comment ?? '').trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function syncData(reportId, data, images) {
  let changed = false;
  const next = structuredClone(data ?? {});

  for (const section of ['huomiot', 'tiiveyskoe', 'tyhjiointi']) {
    const dbRows = images.filter((img) => img.section === section);
    if (dbRows.length === 0) continue;

    if (section === 'huomiot') {
      const jsonItems = Array.isArray(next.huomiotLiitteet) ? next.huomiotLiitteet : [];
      const jsonPaths = jsonItems.map((item) => item.storagePath ?? item.id);
      if (!jsonPaths.some(isLegacyPath) && jsonItems.length === dbRows.length) continue;
      next.huomiotLiitteet = dbRows.map((row, index) => {
        const prev = jsonItems[index];
        return {
          ...(prev ?? {}),
          id: row.storage_path,
          storagePath: row.storage_path,
          url: '',
          comment: prev?.comment ?? '',
          fileName: row.file_name,
          contentType: row.mime_type ?? prev?.contentType ?? 'image/jpeg',
        };
      });
      changed = true;
      continue;
    }

    const key = section === 'tiiveyskoe' ? 'tiiveyskoeData' : 'tyhjiointiData';
    const jsonItems = normalizePhotos(next[key]?.todisteKuvat);
    const jsonPaths = jsonItems.map((item) => item.storagePath);
    if (!jsonPaths.some(isLegacyPath) && jsonItems.length === dbRows.length) continue;
    next[key] = {
      ...(next[key] ?? {}),
      todisteKuvat: mergeSection(dbRows, jsonItems),
    };
    changed = true;
  }

  return { changed, data: next };
}

async function main() {
  console.log(apply ? '=== AJETAAN SYNKRONOINTI ===' : '=== ESIKATSELU (lisää --apply) ===');
  console.log(`Supabase: ${supabaseUrl}`);

  const { data: reports, error } = await supabase.from('maintenance_reports').select('id, title, data');
  if (error) throw error;

  const { data: allImages, error: imgError } = await supabase
    .from('maintenance_report_images')
    .select('maintenance_report_id, section, storage_path, file_name, mime_type, created_at')
    .order('created_at', { ascending: true });
  if (imgError) throw imgError;

  const imagesByReport = new Map();
  for (const img of allImages ?? []) {
    const list = imagesByReport.get(img.maintenance_report_id) ?? [];
    list.push(img);
    imagesByReport.set(img.maintenance_report_id, list);
  }

  let updated = 0;
  for (const report of reports ?? []) {
    const images = imagesByReport.get(report.id) ?? [];
    if (images.length === 0) continue;
    const { changed, data } = syncData(report.id, report.data, images);
    if (!changed) continue;
    updated += 1;
    console.log(`  ${report.title ?? report.id}`);
    if (apply) {
      const { error: updateError } = await supabase
        .from('maintenance_reports')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', report.id);
      if (updateError) throw updateError;
    }
  }

  console.log(`Päivitettäviä raportteja: ${updated}`);
  console.log('Valmis.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
