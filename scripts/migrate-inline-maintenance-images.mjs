/**
 * Siirtää vanhat data:image/... inline-kuvat Supabase-storageen.
 *
 *   node scripts/migrate-inline-maintenance-images.mjs --production
 *   node scripts/migrate-inline-maintenance-images.mjs --production --apply
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
const BUCKET = 'maintenance-report-images';

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

function isInlineDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { mimeType, buffer };
}

function extForMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

async function uploadInline(reportId, section, dataUrl, index) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('Virheellinen data-URL');
  const ext = extForMime(parsed.mimeType);
  const storagePath = `${reportId}/${section}/${crypto.randomUUID()}-inline-${index}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, parsed.buffer, { contentType: parsed.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { error: metaError } = await supabase.from('maintenance_report_images').insert({
    maintenance_report_id: reportId,
    section,
    storage_path: storagePath,
    file_name: `inline-${index}.${ext}`,
    mime_type: parsed.mimeType,
    uploaded_by: null,
  });
  if (metaError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw metaError;
  }
  return storagePath;
}

async function main() {
  console.log(apply ? '=== SIIRRETÄÄN INLINE-KUVAT ===' : '=== ESIKATSELU (lisää --apply) ===');
  console.log(`Supabase: ${supabaseUrl}`);

  const { data: reports, error } = await supabase.from('maintenance_reports').select('id, title, data');
  if (error) throw error;

  let migrated = 0;
  for (const report of reports ?? []) {
    const data = structuredClone(report.data ?? {});
    let reportChanged = false;

    const sections = [
      ['huomiot', data.huomiotLiitteet, 'huomiotLiitteet'],
      ['tiiveyskoe', data.tiiveyskoeData?.todisteKuvat, 'tiiveyskoeData'],
      ['tyhjiointi', data.tyhjiointiData?.todisteKuvat, 'tyhjiointiData'],
    ];

    for (const [section, rawItems, jsonKey] of sections) {
      const list = Array.isArray(rawItems) ? rawItems : [];
      const pending = [];
      const kept = [];

      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const path = typeof item === 'string' ? item : (item?.storagePath ?? item?.id ?? '');
        if (!isInlineDataUrl(path)) {
          kept.push(item);
          continue;
        }
        pending.push({ item, path, index });
      }

      if (pending.length === 0) continue;

      console.log(`  ${report.title ?? report.id} · ${section}: ${pending.length} inline-kuvaa`);
      reportChanged = true;
      migrated += pending.length;

      if (apply) {
        for (const entry of pending) {
          const storagePath = await uploadInline(report.id, section, entry.path, entry.index);
          const comment = typeof entry.item === 'object' ? (entry.item.comment ?? '') : '';
          if (jsonKey === 'huomiotLiitteet') {
            kept.push({
              ...(typeof entry.item === 'object' ? entry.item : {}),
              id: storagePath,
              storagePath,
              url: '',
              comment,
              fileName: storagePath.split('/').pop(),
              contentType: 'image/jpeg',
            });
          } else {
            kept.push({ storagePath, comment });
          }
        }
      }

      if (jsonKey === 'huomiotLiitteet') {
        data.huomiotLiitteet = apply ? kept : list;
      } else if (jsonKey === 'tiiveyskoeData') {
        data.tiiveyskoeData = { ...(data.tiiveyskoeData ?? {}), todisteKuvat: apply ? kept : list };
      } else {
        data.tyhjiointiData = { ...(data.tyhjiointiData ?? {}), todisteKuvat: apply ? kept : list };
      }
    }

    if (reportChanged && apply) {
      const { error: updateError } = await supabase
        .from('maintenance_reports')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', report.id);
      if (updateError) throw updateError;
    }
  }

  console.log(`Inline-kuvia ${apply ? 'siirretty' : 'löydetty'}: ${migrated}`);
  console.log('Valmis.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
