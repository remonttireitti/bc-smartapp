/**
 * Poistaa vanhat Firebase Storage -linkit tietokannasta.
 * Uudet lataukset käyttävät Supabase Storagea — tämä siivoaa Firestore-tuonnin jäännökset.
 *
 * Tuotanto:
 *   node scripts/fix-legacy-firebase-urls.mjs --production
 *   node scripts/fix-legacy-firebase-urls.mjs --production --apply
 *
 * Paikallinen (supabase start):
 *   node scripts/fix-legacy-firebase-urls.mjs
 *   node scripts/fix-legacy-firebase-urls.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const production = args.has('--production');

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
loadEnvFile('.env.local');
if (production) {
  loadEnvFile('.env.production');
  loadEnvFile('.env.vercel.production');
}

function getLocalSupabase() {
  try {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8', cwd: rootDir });
    const status = JSON.parse(raw);
    return {
      url: status.API_URL ?? 'http://127.0.0.1:54321',
      serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    };
  } catch {
    return {
      url: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

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
  throw new Error('SUPABASE_SERVICE_ROLE_KEY puuttuu — aseta env tai kirjaudu: npx supabase login');
}

const supabaseUrl = production
  ? (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? PRODUCTION_URL)
  : getLocalSupabase().url;

const serviceKey = production ? getServiceKey() : getLocalSupabase().serviceKey;

if (!supabaseUrl || !serviceKey) {
  console.error(
    production
      ? 'Tuotanto: tarvitaan --production ja Supabase CLI (npx supabase login) tai SUPABASE_SERVICE_ROLE_KEY'
      : 'Paikallinen: aja ensin npm run db:start tai aseta SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

console.log(`${apply ? '=== AJETAAN KORJAUKSET ===' : '=== ESIKATSELU (lisää --apply) ==='}`);
console.log(`Supabase: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIREBASE_RE = /firebasestorage\.googleapis\.com|storage\.googleapis\.com\/v0\/b\//i;

const importMapPath = join(__dirname, '.cache', 'firestore-media-import-map.json');
const importMap = existsSync(importMapPath)
  ? JSON.parse(readFileSync(importMapPath, 'utf8'))
  : { companies: {} };

function logoPathForCompany(companyId) {
  return importMap.companies?.[companyId]?.logoPath ?? null;
}

async function fixCompanyLogos() {
  const { data, error } = await supabase.from('companies').select('id, name, logo_url');
  if (error) throw error;

  const rows = (data ?? []).filter((row) => FIREBASE_RE.test(String(row.logo_url ?? '')));
  console.log(`Yrityslogot (Firebase URL): ${rows.length}`);

  for (const row of rows) {
    const replacement = logoPathForCompany(row.id);
    console.log(`  ${row.name} (${row.id}): ${String(row.logo_url).slice(0, 60)}… → ${replacement ?? 'NULL'}`);
    if (apply) {
      const { error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: replacement })
        .eq('id', row.id);
      if (updateError) throw updateError;
    }
  }
}

function stripFirebaseFromHuoltoData(data) {
  if (!data || typeof data !== 'object') return { changed: false, data };
  const next = structuredClone(data);
  let changed = false;

  const scrubAttachment = (item) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    if (FIREBASE_RE.test(String(copy.url ?? ''))) {
      copy.url = '';
      changed = true;
    }
    if (FIREBASE_RE.test(String(copy.storagePath ?? ''))) {
      copy.storagePath = '';
      changed = true;
    }
    if (FIREBASE_RE.test(String(copy.id ?? ''))) {
      copy.id = copy.storagePath || copy.fileName || copy.id;
      changed = true;
    }
    return copy;
  };

  const scrubPhotos = (list) => {
    if (!Array.isArray(list)) return list;
    return list
      .map((item) => {
        if (typeof item === 'string') {
          if (FIREBASE_RE.test(item)) {
            changed = true;
            return '';
          }
          return item;
        }
        if (item && typeof item === 'object') {
          const copy = { ...item };
          if (FIREBASE_RE.test(String(copy.storagePath ?? ''))) {
            copy.storagePath = '';
            changed = true;
          }
          return copy;
        }
        return item;
      })
      .filter((item) => item !== '' && String(item?.storagePath ?? item ?? '').trim());
  };

  if (Array.isArray(next.huomiotLiitteet)) {
    next.huomiotLiitteet = next.huomiotLiitteet.map(scrubAttachment).filter((a) => a.storagePath || a.url);
  }
  if (next.tiiveyskoeData?.todisteKuvat) {
    next.tiiveyskoeData.todisteKuvat = scrubPhotos(next.tiiveyskoeData.todisteKuvat);
  }
  if (next.tyhjiointiData?.todisteKuvat) {
    next.tyhjiointiData.todisteKuvat = scrubPhotos(next.tyhjiointiData.todisteKuvat);
  }

  return { changed, data: next };
}

async function fixMaintenanceReports() {
  const { data, error } = await supabase.from('maintenance_reports').select('id, title, data');
  if (error) throw error;

  let count = 0;
  for (const row of data ?? []) {
    const raw = JSON.stringify(row.data ?? {});
    if (!FIREBASE_RE.test(raw)) continue;
    count += 1;
    const { changed, data: cleaned } = stripFirebaseFromHuoltoData(row.data);
    console.log(`  Huoltoraportti ${row.title ?? row.id}: ${changed ? 'siivotaan' : 'ei muutosta'}`);
    if (apply && changed) {
      const { error: updateError } = await supabase
        .from('maintenance_reports')
        .update({ data: cleaned })
        .eq('id', row.id);
      if (updateError) throw updateError;
    }
  }
  console.log(`Huoltoraportit (Firebase viittaukset data-JSON:ssa): ${count}`);
}

async function main() {
  await fixCompanyLogos();
  await fixMaintenanceReports();
  console.log('Valmis.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
