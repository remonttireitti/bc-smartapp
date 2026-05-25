/**
 * Tuo yritystiedot (logo + yhteystiedot) ja raporttien kuvat Firestoresta.
 *
 *   node scripts/import-firestore-media.mjs --dry-run
 *   node scripts/import-firestore-media.mjs --apply --production
 */
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '.cache');
const MAP_FILE = resolve(CACHE_DIR, 'firestore-import-map.json');
const MEDIA_MAP_FILE = resolve(CACHE_DIR, 'firestore-media-import-map.json');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const FIRESTORE_COMPANY = 'main';

const COMPANY_BY_KEY = {
  main: '11111111-1111-4111-8111-111111111111',
  dwXkNb8AUoUbXTiGOgbN: '11111111-1111-4111-8111-111111111111',
  uudenmaankylmahuoltooy: '22222222-2222-4222-8222-222222222222',
  lampokatsastusoy: '33333333-3333-4333-8333-333333333333',
  termatekoy: '44444444-4444-4444-8444-444444444444',
};

const COMPANY_BY_NAME = {
  'bc smartapp': '11111111-1111-4111-8111-111111111111',
  'tuusulan kylmähuolto oy': '11111111-1111-4111-8111-111111111111',
  'uudenmaan kylmähuolto oy': '22222222-2222-4222-8222-222222222222',
  'lämpökatsastus oy': '33333333-3333-4333-8333-333333333333',
  'termatek oy': '44444444-4444-4444-8444-444444444444',
};

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--apply');
const PRODUCTION = args.has('--production');

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
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
      storageBucket: 'bc-smartapp.firebasestorage.app',
    });
  }
  return { db: admin.firestore(), bucket: admin.storage().bucket() };
}

function resolveCompanyUuid(key, name) {
  const k = String(key || '').trim();
  if (COMPANY_BY_KEY[k]) return COMPANY_BY_KEY[k];
  const n = String(name || '').trim().toLowerCase();
  return COMPANY_BY_NAME[n] ?? null;
}

function parseAddressParts(address) {
  const raw = String(address || '').trim();
  if (!raw) return { address: '', postal_code: '', city: '' };
  const m = raw.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (m) return { address: m[1].trim(), postal_code: m[2], city: m[3].trim() };
  return { address: raw, postal_code: '', city: '' };
}

function parseBase64Logo(input) {
  const s = String(input || '').trim();
  if (!s || s.length < 80) return null;
  if (s.startsWith('data:')) {
    const m = s.match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) return null;
    return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
  }
  try {
    return { mime: 'image/png', buffer: Buffer.from(s, 'base64') };
  } catch {
    return null;
  }
}

function brandingFromWorkReport(data) {
  return {
    key: String(data.reportingCompanyId || 'main'),
    name: String(data.reportingCompanyName || '').trim(),
    businessId: String(data.reportingCompanyBusinessId || '').trim(),
    address: String(data.reportingCompanyAddress || '').trim(),
    phone: String(data.reportingCompanyPhone || '').trim(),
    email: String(data.reportingCompanyEmail || '').trim(),
    website: String(data.reportingCompanyWebsite || '').trim(),
    logoBase64: data.reportingCompanyLogoBase64,
  };
}

function brandingFromCompanyInfo(ci) {
  if (!ci || typeof ci !== 'object') return null;
  return {
    key: String(ci.id || ci.companyId || 'main'),
    name: String(ci.name || '').trim(),
    businessId: String(ci.businessId || '').trim(),
    address: String(ci.address || '').trim(),
    phone: String(ci.phone || '').trim(),
    email: String(ci.email || '').trim(),
    website: String(ci.website || '').trim(),
    logoBase64: ci.logoBase64,
  };
}

function mergeBranding(existing, incoming) {
  if (!incoming) return existing;
  const out = { ...(existing || {}) };
  for (const field of ['name', 'businessId', 'address', 'phone', 'email', 'website']) {
    if (!out[field] && incoming[field]) out[field] = incoming[field];
  }
  const oldLogoLen = String(out.logoBase64 || '').length;
  const newLogoLen = String(incoming.logoBase64 || '').length;
  if (newLogoLen > oldLogoLen) out.logoBase64 = incoming.logoBase64;
  if (!out.key && incoming.key) out.key = incoming.key;
  if (!out.name && incoming.name) out.name = incoming.name;
  return out;
}

async function downloadFirebaseFile(bucket, att) {
  const storagePath = att.storagePath ? String(att.storagePath) : '';
  if (storagePath) {
    const [buf] = await bucket.file(storagePath).download();
    return {
      buffer: buf,
      mime: att.contentType ? String(att.contentType) : guessMime(storagePath),
      name: att.fileName ? String(att.fileName) : storagePath.split('/').pop() || 'file',
    };
  }
  const url = att.url ? String(att.url) : '';
  if (url.startsWith('http')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`);
    const mime = res.headers.get('content-type') || guessMime(url);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mime,
      name: att.fileName ? String(att.fileName) : url.split('/').pop()?.split('?')[0] || 'file',
    };
  }
  throw new Error('Ei storagePath eikä url');
}

function guessMime(path) {
  const lower = String(path).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function main() {
  const { db, bucket } = initFirebase();
  const importMap = loadJson(MAP_FILE, {});
  const mediaMap = loadJson(MEDIA_MAP_FILE, { companies: {}, work_reports: {}, maintenance_reports: {} });
  const stats = {
    companiesUpdated: 0,
    logosUploaded: 0,
    workReportImages: 0,
    maintenanceImages: 0,
    skipped: 0,
    errors: 0,
  };

  const supabaseUrl = PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  let supabase = null;
  if (!DRY_RUN) {
    supabase = createClient(supabaseUrl, getServiceKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  console.log(DRY_RUN ? '=== MEDIA DRY RUN ===' : '=== MEDIA IMPORT ===');

  const brands = new Map();
  const wrSnap = await db.collection('companies').doc(FIRESTORE_COMPANY).collection('work_reports').get();
  for (const doc of wrSnap.docs) {
    const b = brandingFromWorkReport(doc.data());
    const uuid = resolveCompanyUuid(b.key, b.name);
    if (!uuid) continue;
    brands.set(uuid, mergeBranding(brands.get(uuid), b));
  }

  const huoltoSnap = await db.collection('huolto_raportit').get();
  for (const doc of huoltoSnap.docs) {
    const b = brandingFromCompanyInfo(doc.data().companyInfo);
    const uuid = resolveCompanyUuid(b?.key, b?.name);
    if (!uuid || !b) continue;
    brands.set(uuid, mergeBranding(brands.get(uuid), b));
  }

  for (const [companyId, brand] of brands) {
    if (mediaMap.companies[companyId]?.done) continue;
    const addr = parseAddressParts(brand.address);
    const settings = {
      address: addr.address,
      postal_code: addr.postal_code,
      city: addr.city,
      phone: brand.phone || '',
      email: brand.email || '',
      website: brand.website || '',
      billing: {
        business_id: brand.businessId || '',
        billing_address: brand.address || '',
        invoice_email: brand.email || '',
      },
    };

    const logo = parseBase64Logo(brand.logoBase64);
    console.log(`Company ${brand.name || companyId}: logo=${logo ? `${logo.mime} ${logo.buffer.length}B` : 'none'}`);

    if (DRY_RUN) {
      stats.companiesUpdated += 1;
      if (logo) stats.logosUploaded += 1;
      continue;
    }

    let logoPath = null;
    if (logo) {
      const ext = MIME_EXT[logo.mime] ?? 'png';
      logoPath = `${companyId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(logoPath, logo.buffer, { contentType: logo.mime, upsert: true });
      if (uploadError) {
        console.error('Logo upload failed', companyId, uploadError.message);
        stats.errors += 1;
        logoPath = null;
      } else {
        stats.logosUploaded += 1;
      }
    }

    const update = { settings };
    if (logoPath) update.logo_url = logoPath;
    const { error } = await supabase.from('companies').update(update).eq('id', companyId);
    if (error) {
      console.error('Company update failed', companyId, error.message);
      stats.errors += 1;
      continue;
    }
    stats.companiesUpdated += 1;
    mediaMap.companies[companyId] = { done: true, logoPath, at: new Date().toISOString() };
  }

  const defaultUserId = Object.values(importMap.users || {})[0] ?? null;

  for (const doc of wrSnap.docs) {
    const fsId = doc.id;
    const reportId = importMap.work_reports?.[fsId];
    if (!reportId) continue;
    if (mediaMap.work_reports[fsId]?.done) continue;

    const attachments = Array.isArray(doc.data().attachments) ? doc.data().attachments : [];
    if (attachments.length === 0) {
      mediaMap.work_reports[fsId] = { done: true, images: 0 };
      continue;
    }

    console.log(`Work report ${fsId}: ${attachments.length} attachment(s)`);
    if (DRY_RUN) {
      stats.workReportImages += attachments.length;
      continue;
    }

    let dailyLogId = mediaMap.work_reports[fsId]?.dailyLogId;
    if (!dailyLogId) {
      const { data: existingLogs } = await supabase
        .from('work_report_daily_logs')
        .select('id, work_done')
        .eq('work_report_id', reportId);
      const importLog = (existingLogs || []).find((l) => l.work_done === 'Liitteet (tuonti)');
      dailyLogId = importLog?.id;
    }

    if (!dailyLogId) {
      const { data: logRow, error: logError } = await supabase
        .from('work_report_daily_logs')
        .insert({
          work_report_id: reportId,
          log_date: new Date().toISOString().slice(0, 10),
          entry_type: 'regular',
          hours_regular: 0,
          hours_overtime: 0,
          hours_on_call: 0,
          work_done: 'Liitteet (tuonti)',
          created_by: defaultUserId,
        })
        .select('id')
        .single();
      if (logError || !logRow) {
        console.error('Daily log create failed', fsId, logError?.message);
        stats.errors += 1;
        continue;
      }
      dailyLogId = logRow.id;
    }

    let imported = 0;
    let failed = 0;
    let skippedExisting = 0;

    const existingNames = new Set();
    if (!DRY_RUN && dailyLogId) {
      const { data: existingImages } = await supabase
        .from('work_report_daily_log_images')
        .select('file_name')
        .eq('daily_log_id', dailyLogId);
      for (const row of existingImages || []) existingNames.add(String(row.file_name));
    }

    for (const att of attachments) {
      const attName = att.name ? String(att.name) : att.fileName ? String(att.fileName) : '';
      if (attName && existingNames.has(attName)) {
        skippedExisting += 1;
        continue;
      }
      try {
        const file = await downloadFirebaseFile(bucket, att);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${reportId}/${dailyLogId}/${randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('work-report-images')
          .upload(storagePath, file.buffer, { contentType: file.mime, upsert: false });
        if (uploadError) throw new Error(uploadError.message);

        const { error: metaError } = await supabase.from('work_report_daily_log_images').insert({
          daily_log_id: dailyLogId,
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.mime,
          uploaded_by: defaultUserId,
        });
        if (metaError) {
          await supabase.storage.from('work-report-images').remove([storagePath]);
          throw new Error(metaError.message);
        }
        imported += 1;
        stats.workReportImages += 1;
      } catch (err) {
        console.error('Work attachment failed', fsId, att.name || att.storagePath, err.message);
        stats.errors += 1;
        failed += 1;
      }
    }

    if (failed === 0) {
      mediaMap.work_reports[fsId] = { done: true, dailyLogId, images: imported, at: new Date().toISOString() };
    } else {
      mediaMap.work_reports[fsId] = { done: false, dailyLogId, images: imported, failed, at: new Date().toISOString() };
    }
  }

  for (const doc of huoltoSnap.docs) {
    const fsId = doc.id;
    const reportId = importMap.maintenance_reports?.[fsId];
    if (!reportId) continue;
    if (mediaMap.maintenance_reports[fsId]?.done) continue;

    const liitteet = Array.isArray(doc.data().huomiotLiitteet) ? doc.data().huomiotLiitteet : [];
    if (liitteet.length === 0) {
      mediaMap.maintenance_reports[fsId] = { done: true, images: 0 };
      continue;
    }

    console.log(`Huolto ${fsId}: ${liitteet.length} liite(tä)`);
    if (DRY_RUN) {
      stats.maintenanceImages += liitteet.length;
      continue;
    }

    const newLiitteet = [];
    let imported = 0;
    let failed = 0;
    let skippedExisting = 0;

    const existingNames = new Set();
    if (!DRY_RUN) {
      const { data: existingImages } = await supabase
        .from('maintenance_report_images')
        .select('file_name')
        .eq('maintenance_report_id', reportId);
      for (const row of existingImages || []) existingNames.add(String(row.file_name));

      const { data: row } = await supabase.from('maintenance_reports').select('data').eq('id', reportId).single();
      for (const liite of row?.data?.huomiotLiitteet || []) {
        if (liite?.fileName) newLiitteet.push(liite);
      }
    }

    for (const att of liitteet.slice(0, 6)) {
      const attName = att.fileName ? String(att.fileName) : att.name ? String(att.name) : '';
      if (attName && existingNames.has(attName)) {
        skippedExisting += 1;
        continue;
      }
      try {
        const file = await downloadFirebaseFile(bucket, att);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${reportId}/huomiot/${randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('maintenance-report-images')
          .upload(storagePath, file.buffer, { contentType: file.mime, upsert: false });
        if (uploadError) throw new Error(uploadError.message);

        const { error: metaError } = await supabase.from('maintenance_report_images').insert({
          maintenance_report_id: reportId,
          section: 'huomiot',
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.mime,
          uploaded_by: defaultUserId,
        });
        if (metaError) {
          await supabase.storage.from('maintenance-report-images').remove([storagePath]);
          throw new Error(metaError.message);
        }

        newLiitteet.push({
          id: att.id || randomUUID(),
          comment: att.comment || '',
          fileName: file.name,
          contentType: file.mime,
          storagePath,
        });
        imported += 1;
        stats.maintenanceImages += 1;
      } catch (err) {
        console.error('Huolto liite failed', fsId, att.fileName || att.storagePath, err.message);
        stats.errors += 1;
        failed += 1;
      }
    }

    if (imported > 0 || newLiitteet.length > 0) {
      const { data: row } = await supabase.from('maintenance_reports').select('data').eq('id', reportId).single();
      const data = { ...(row?.data || {}), huomiotLiitteet: newLiitteet };
      await supabase.from('maintenance_reports').update({ data }).eq('id', reportId);
    }

    if (failed === 0) {
      mediaMap.maintenance_reports[fsId] = {
        done: true,
        images: imported,
        skippedExisting,
        at: new Date().toISOString(),
      };
    } else {
      mediaMap.maintenance_reports[fsId] = {
        done: false,
        images: imported,
        skippedExisting,
        failed,
        at: new Date().toISOString(),
      };
    }
  }

  if (!DRY_RUN) saveJson(MEDIA_MAP_FILE, mediaMap);

  console.log('\nYhteenveto:');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
