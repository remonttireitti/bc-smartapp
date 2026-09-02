/**
 * Kopioi yhden asiakkaan laitteet, huoltohistorian ja huoltoraportit toiselle yritykselle.
 * Alkuperäiset jäävät lähdeyritykselle — kopioilla on kohdeyrityksen omistus ja brändäys.
 *
 * Esimerkki (listaa Uudenmaan asiakkaat):
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run copy:customer-to-partner -- --production --list-customers
 *   SUPABASE_SECRET_KEY=sb_secret_... npm run copy:customer-to-partner -- --production --list-customers
 *
 * Kuivajo (dry-run):
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/copy-customer-to-partner.mjs --production --customer-id=<uuid>
 *
 * Aja kopio:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/copy-customer-to-partner.mjs --production --customer-id=<uuid> --apply
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const PROJECT_REF = 'qvqmemeexberatbqxivw';
const IMAGE_BUCKET = 'maintenance-report-images';

const COPY_CUSTOMER_MARKER = 'bc_partner_copy_source_customer_id:';
const COPY_EQUIPMENT_MARKER = 'bc_partner_copy_source_equipment_id:';
const COPY_REPORT_MARKER = 'bc_partner_copy_source_report_id:';

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=');
      if (eq === -1) return [a.slice(2), true];
      return [a.slice(2, eq), a.slice(eq + 1)];
    }),
);
const DRY_RUN = !args.includes('--apply');
const PRODUCTION = args.includes('--production');
const LIST_CUSTOMERS = args.includes('--list-customers');
const CUSTOMER_ID = argMap['customer-id'] ?? null;
const CUSTOMER_NAME = argMap['customer-name'] ?? null;
const SOURCE_COMPANY = (argMap['source-company'] ?? 'uudenmaan').toLowerCase();
const TARGET_COMPANY = (argMap['target-company'] ?? 'lampokatsastus').toLowerCase();
const INCLUDE_WORK_REPORTS = !args.includes('--skip-work-reports');

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
if (PRODUCTION) loadEnvFile('.env.production');

function getServiceKey() {
  const fromEnv =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SB_SECRET_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    cwd: rootDir,
  });
  for (const line of raw.split('\n')) {
    if (!line.includes('service_role')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'service_role') return parts[1];
  }
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY tai SUPABASE_SECRET_KEY puuttuu (Dashboard → Project Settings → API).',
  );
}

function createAdminClient(supabaseUrl, serviceKey) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: serviceKey } },
  });
}

function companyMatches(name, needle) {
  const n = String(name ?? '').toLowerCase();
  if (needle.includes('uudenmaan')) return n.includes('uudenmaan') && n.includes('kylm');
  if (needle.includes('lampokatsastus') || needle.includes('lämpökatsastus')) {
    return n.includes('lämpökatsastus') || n.includes('lampokatsastus');
  }
  return n.includes(needle);
}

async function resolveCompanies(supabase) {
  const { data, error } = await supabase.from('companies').select('id, name');
  if (error) throw error;
  const source = data?.find((row) => companyMatches(row.name, SOURCE_COMPANY));
  const target = data?.find((row) => companyMatches(row.name, TARGET_COMPANY));
  if (!source) throw new Error(`Lähdeyritystä ei löytynyt: ${SOURCE_COMPANY}`);
  if (!target) throw new Error(`Kohdeyritystä ei löytynyt: ${TARGET_COMPANY}`);
  return { source, target };
}

function copyMarker(marker, id) {
  return `${marker}${id}`;
}

function hasMarker(notes, marker, id) {
  return String(notes ?? '').includes(copyMarker(marker, id));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function replaceReportPathsInValue(value, oldReportId, newReportId) {
  if (typeof value === 'string') {
    if (value.startsWith(`${oldReportId}/`)) {
      return `${newReportId}/${value.slice(oldReportId.length + 1)}`;
    }
    return value.replaceAll(oldReportId, newReportId);
  }
  if (Array.isArray(value)) return value.map((item) => replaceReportPathsInValue(item, oldReportId, newReportId));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = replaceReportPathsInValue(child, oldReportId, newReportId);
    }
    return next;
  }
  return value;
}

async function pickCompanyUserId(supabase, companyId) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .in('role', ['admin', 'manager', 'user'])
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function ensureTargetSubscriber(supabase, sourceSubscriberId, targetCompanyId, dryRun) {
  if (!sourceSubscriberId) return null;
  const { data: sourceSub, error } = await supabase
    .from('subscribers')
    .select('id, name, business_id, email, phone, notes')
    .eq('id', sourceSubscriberId)
    .maybeSingle();
  if (error) throw error;
  if (!sourceSub) return null;

  const { data: existing } = await supabase
    .from('subscribers')
    .select('id')
    .eq('owner_company_id', targetCompanyId)
    .eq('name', sourceSub.name)
    .maybeSingle();
  if (existing?.id) return existing.id;
  if (dryRun) return null;

  const { data: inserted, error: insertError } = await supabase
    .from('subscribers')
    .insert({
      owner_company_id: targetCompanyId,
      name: sourceSub.name,
      business_id: sourceSub.business_id,
      email: sourceSub.email,
      phone: sourceSub.phone,
      notes: sourceSub.notes,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}

async function findOrCreateTargetCustomer(supabase, sourceCustomer, targetCompanyId, dryRun) {
  const { data: existingRows, error: existingError } = await supabase
    .from('customers')
    .select('id, name, notes, subscriber_id')
    .eq('owner_company_id', targetCompanyId);
  if (existingError) throw existingError;

  const existing = (existingRows ?? []).find((row) => hasMarker(row.notes, COPY_CUSTOMER_MARKER, sourceCustomer.id));
  if (existing) return { customerId: existing.id, subscriberId: existing.subscriber_id, created: false };

  const targetSubscriberId = await ensureTargetSubscriber(
    supabase,
    sourceCustomer.subscriber_id,
    targetCompanyId,
    dryRun,
  );

  const payload = {
    owner_company_id: targetCompanyId,
    subscriber_id: targetSubscriberId,
    name: sourceCustomer.name,
    business_id: sourceCustomer.business_id,
    email: sourceCustomer.email,
    phone: sourceCustomer.phone,
    address: sourceCustomer.address,
    city: sourceCustomer.city,
    notes: [sourceCustomer.notes, copyMarker(COPY_CUSTOMER_MARKER, sourceCustomer.id)].filter(Boolean).join('\n'),
    is_onboarding_demo: false,
  };

  if (dryRun) {
    return {
      customerId: `dry-run-customer-${sourceCustomer.id.slice(0, 8)}`,
      subscriberId: targetSubscriberId,
      created: true,
      payload,
    };
  }

  const { data, error } = await supabase.from('customers').insert(payload).select('id, subscriber_id').single();
  if (error) throw error;
  return { customerId: data.id, subscriberId: data.subscriber_id, created: true };
}

async function findOrCreateTargetEquipment(
  supabase,
  sourceEquipment,
  targetCustomerId,
  targetCompanyId,
  dryRun,
) {
  const { data: existingRows, error } = await supabase
    .from('equipment')
    .select('id, notes')
    .eq('customer_id', targetCustomerId);
  if (error) throw error;

  const existing = (existingRows ?? []).find((row) =>
    hasMarker(row.notes, COPY_EQUIPMENT_MARKER, sourceEquipment.id),
  );
  if (existing) return { equipmentId: existing.id, created: false };

  const payload = {
    owner_company_id: targetCompanyId,
    customer_id: targetCustomerId,
    tag: sourceEquipment.tag,
    name: sourceEquipment.name,
    model: sourceEquipment.model,
    serial_number: sourceEquipment.serial_number,
    location: sourceEquipment.location,
    notes: [sourceEquipment.notes, copyMarker(COPY_EQUIPMENT_MARKER, sourceEquipment.id)]
      .filter(Boolean)
      .join('\n'),
    device_type: sourceEquipment.device_type,
    huolto_technical_snapshot: sourceEquipment.huolto_technical_snapshot,
    is_onboarding_demo: false,
  };

  if (dryRun) {
    return { equipmentId: `dry-run-equipment-${sourceEquipment.id.slice(0, 8)}`, created: true, payload };
  }

  const { data, error: insertError } = await supabase.from('equipment').insert(payload).select('id').single();
  if (insertError) throw insertError;
  return { equipmentId: data.id, created: true };
}

async function copyMaintenanceReportImages(supabase, sourceReportId, targetReportId, dryRun) {
  const { data: images, error } = await supabase
    .from('maintenance_report_images')
    .select('id, section, storage_path, file_name, mime_type, uploaded_by')
    .eq('maintenance_report_id', sourceReportId);
  if (error) throw error;
  if (!images?.length) return 0;

  let copied = 0;
  for (const image of images) {
    const oldPath = image.storage_path;
    const parts = oldPath.split('/');
    const tail = parts.length > 2 ? parts.slice(2).join('/') : image.file_name;
    const newPath = `${targetReportId}/${image.section}/${tail}`;

    if (dryRun) {
      copied += 1;
      continue;
    }

    const { data: blob, error: downloadError } = await supabase.storage.from(IMAGE_BUCKET).download(oldPath);
    if (downloadError) {
      console.warn('  Kuvan lataus epäonnistui:', oldPath, downloadError.message);
      continue;
    }

    const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(newPath, blob, {
      contentType: image.mime_type ?? 'image/jpeg',
      upsert: false,
    });
    if (uploadError) {
      console.warn('  Kuvan tallennus epäonnistui:', newPath, uploadError.message);
      continue;
    }

    const { error: metaError } = await supabase.from('maintenance_report_images').insert({
      maintenance_report_id: targetReportId,
      section: image.section,
      storage_path: newPath,
      file_name: image.file_name,
      mime_type: image.mime_type,
      uploaded_by: image.uploaded_by,
    });
    if (metaError) {
      await supabase.storage.from(IMAGE_BUCKET).remove([newPath]);
      throw metaError;
    }
    copied += 1;
  }
  return copied;
}

async function findExistingCopiedReport(supabase, sourceReportId, targetCustomerId) {
  const { data, error } = await supabase
    .from('maintenance_reports')
    .select('id, data')
    .eq('customer_id', targetCustomerId);
  if (error) throw error;
  return (data ?? []).find(
    (row) => row.data?._bcCopySourceReportId === sourceReportId
      || String(row.data?._bcCopySourceReportId ?? '') === sourceReportId,
  );
}

async function copyMaintenanceReport(
  supabase,
  sourceReport,
  targetCompanyId,
  targetCustomerId,
  targetSubscriberId,
  equipmentMap,
  defaultUserId,
  dryRun,
) {
  const existing = await findExistingCopiedReport(supabase, sourceReport.id, targetCustomerId);
  if (existing) return { reportId: existing.id, created: false, imagesCopied: 0 };

  const targetEquipmentId = sourceReport.equipment_id
    ? equipmentMap.get(sourceReport.equipment_id) ?? null
    : null;

  const newReportId = dryRun ? `dry-run-report-${sourceReport.id.slice(0, 8)}` : randomUUID();
  const data = replaceReportPathsInValue(deepClone(sourceReport.data), sourceReport.id, newReportId);
  if (data && typeof data === 'object') {
    data.customerId = targetCustomerId;
    data._bcCopySourceReportId = sourceReport.id;
  }

  const payload = {
    id: dryRun ? undefined : newReportId,
    owner_company_id: targetCompanyId,
    created_by_company_id: targetCompanyId,
    branding_company_id: targetCompanyId,
    partnership_id: null,
    customer_id: targetCustomerId,
    subscriber_id: targetSubscriberId,
    equipment_id: targetEquipmentId,
    template_id: sourceReport.template_id,
    assigned_user_id: defaultUserId,
    title: sourceReport.title,
    data,
    status: sourceReport.status,
    scheduled_at: sourceReport.scheduled_at,
    completed_at: sourceReport.completed_at,
    subscriber_portal_visibility: sourceReport.subscriber_portal_visibility ?? 'when_ready',
  };

  if (dryRun) {
    const imagesCopied = await copyMaintenanceReportImages(supabase, sourceReport.id, newReportId, true);
    return { reportId: newReportId, created: true, imagesCopied };
  }

  const { data: inserted, error } = await supabase
    .from('maintenance_reports')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;

  const imagesCopied = await copyMaintenanceReportImages(
    supabase,
    sourceReport.id,
    inserted.id,
    false,
  );
  return { reportId: inserted.id, created: true, imagesCopied };
}

async function findExistingCopiedWorkReport(supabase, sourceReportId, targetCustomerId) {
  const { data, error } = await supabase
    .from('work_reports')
    .select('id, description')
    .eq('customer_id', targetCustomerId);
  if (error) throw error;
  const marker = copyMarker(COPY_REPORT_MARKER, sourceReportId);
  return (data ?? []).find((row) => String(row.description ?? '').includes(marker));
}

async function copyWorkReport(
  supabase,
  sourceReport,
  targetCompanyId,
  targetCustomerId,
  targetSubscriberId,
  equipmentMap,
  defaultUserId,
  dryRun,
) {
  const existing = await findExistingCopiedWorkReport(supabase, sourceReport.id, targetCustomerId);
  if (existing) return { reportId: existing.id, created: false };

  const targetEquipmentId = sourceReport.equipment_id
    ? equipmentMap.get(sourceReport.equipment_id) ?? null
    : null;

  const description = [
    sourceReport.description,
    copyMarker(COPY_REPORT_MARKER, sourceReport.id),
  ]
    .filter(Boolean)
    .join('\n');

  const payload = {
    owner_company_id: targetCompanyId,
    created_by_company_id: targetCompanyId,
    branding_company_id: targetCompanyId,
    partnership_id: null,
    customer_id: targetCustomerId,
    subscriber_id: targetSubscriberId,
    equipment_id: targetEquipmentId,
    assigned_user_id: defaultUserId,
    created_by_user_id: defaultUserId,
    title: sourceReport.title,
    heading: sourceReport.heading,
    description,
    location_text: sourceReport.location_text,
    orderer_name: sourceReport.orderer_name,
    status: sourceReport.status,
    scheduled_start: sourceReport.scheduled_start,
    scheduled_end: sourceReport.scheduled_end,
    completed_at: sourceReport.completed_at,
    delegate_company_id: null,
    delegated_at: null,
    subscriber_portal_visibility: sourceReport.subscriber_portal_visibility ?? 'when_ready',
    is_onboarding_demo: false,
  };

  if (dryRun) return { reportId: `dry-run-work-${sourceReport.id.slice(0, 8)}`, created: true };

  const { data, error } = await supabase.from('work_reports').insert(payload).select('id').single();
  if (error) throw error;

  const { error: billingError } = await supabase.from('work_report_billing').insert({
    work_report_id: data.id,
  });
  if (billingError) throw billingError;

  return { reportId: data.id, created: true };
}

async function listSourceCustomers(supabase, sourceCompanyId) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, address, city, phone')
    .eq('owner_company_id', sourceCompanyId)
    .order('name');
  if (error) throw error;
  console.log(`Asiakkaat (${data?.length ?? 0}):`);
  for (const row of data ?? []) {
    console.log(`  ${row.id}  ${row.name}  |  ${row.address ?? ''} ${row.city ?? ''}  |  ${row.phone ?? ''}`);
  }
}

async function resolveSourceCustomer(supabase, sourceCompanyId) {
  if (CUSTOMER_ID) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', CUSTOMER_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Asiakasta ei löytynyt: ${CUSTOMER_ID}`);
    if (data.owner_company_id !== sourceCompanyId) {
      throw new Error('Asiakas ei kuulu lähdeyritykselle.');
    }
    return data;
  }

  if (CUSTOMER_NAME) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('owner_company_id', sourceCompanyId)
      .ilike('name', `%${CUSTOMER_NAME}%`);
    if (error) throw error;
    if (!data?.length) throw new Error(`Asiakasta ei löytynyt nimellä: ${CUSTOMER_NAME}`);
    if (data.length > 1) {
      console.error('Useita osumia — käytä --customer-id:');
      for (const row of data) console.error(`  ${row.id}  ${row.name}`);
      throw new Error('Asiakashaku epäselvä');
    }
    return data[0];
  }

  throw new Error('Anna --customer-id=<uuid> tai --customer-name=<haku> tai --list-customers');
}

async function main() {
  const supabaseUrl = PRODUCTION
    ? (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? PRODUCTION_URL)
    : (process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321');
  const supabase = createAdminClient(supabaseUrl, getServiceKey());

  const { source, target } = await resolveCompanies(supabase);
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY ===');
  console.log('Lähde:', source.name, source.id);
  console.log('Kohde:', target.name, target.id);

  if (LIST_CUSTOMERS) {
    await listSourceCustomers(supabase, source.id);
    return;
  }

  const sourceCustomer = await resolveSourceCustomer(supabase, source.id);
  console.log('Kopioitava asiakas:', sourceCustomer.name, '|', sourceCustomer.address, sourceCustomer.city ?? '');

  const { data: sourceEquipment, error: equipmentError } = await supabase
    .from('equipment')
    .select('*')
    .eq('customer_id', sourceCustomer.id)
    .order('tag');
  if (equipmentError) throw equipmentError;

  const equipmentIds = (sourceEquipment ?? []).map((row) => row.id);
  let maintenanceReports = [];
  {
    const { data: byCustomer, error: byCustomerError } = await supabase
      .from('maintenance_reports')
      .select('*')
      .eq('customer_id', sourceCustomer.id)
      .order('created_at');
    if (byCustomerError) throw byCustomerError;
    maintenanceReports = byCustomer ?? [];

    if (equipmentIds.length > 0) {
      const { data: byEquipment, error: byEquipmentError } = await supabase
        .from('maintenance_reports')
        .select('*')
        .in('equipment_id', equipmentIds)
        .order('created_at');
      if (byEquipmentError) throw byEquipmentError;
      const seen = new Set(maintenanceReports.map((row) => row.id));
      for (const row of byEquipment ?? []) {
        if (!seen.has(row.id)) maintenanceReports.push(row);
      }
    }
    maintenanceReports.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  let workReports = [];
  if (INCLUDE_WORK_REPORTS) {
    const { data, error } = await supabase
      .from('work_reports')
      .select('*')
      .eq('customer_id', sourceCustomer.id)
      .order('created_at');
    if (error) throw error;
    workReports = data ?? [];
  }

  console.log('Laitteita:', sourceEquipment?.length ?? 0);
  console.log('Huoltoraportteja:', maintenanceReports?.length ?? 0);
  console.log('Työraportteja (historia):', workReports.length);

  const defaultUserId = await pickCompanyUserId(supabase, target.id);
  const targetCustomer = await findOrCreateTargetCustomer(supabase, sourceCustomer, target.id, DRY_RUN);
  console.log(
    targetCustomer.created ? 'Luodaan kohdeasiakas' : 'Kohdeasiakas on jo olemassa',
    targetCustomer.customerId,
  );

  const equipmentMap = new Map();
  let equipmentCreated = 0;
  for (const row of sourceEquipment ?? []) {
    const copied = await findOrCreateTargetEquipment(
      supabase,
      row,
      targetCustomer.customerId,
      target.id,
      DRY_RUN,
    );
    equipmentMap.set(row.id, copied.equipmentId);
    if (copied.created) equipmentCreated += 1;
    console.log(
      `  Laite ${row.tag || row.name} -> ${copied.equipmentId.slice(0, 8)}${copied.created ? ' (uusi)' : ' (olemassa)'}`,
    );
  }

  let maintenanceCreated = 0;
  let imagesCopied = 0;
  for (const report of maintenanceReports ?? []) {
    const copied = await copyMaintenanceReport(
      supabase,
      report,
      target.id,
      targetCustomer.customerId,
      targetCustomer.subscriberId,
      equipmentMap,
      defaultUserId,
      DRY_RUN,
    );
    if (copied.created) maintenanceCreated += 1;
    imagesCopied += copied.imagesCopied;
    console.log(
      `  Huoltoraportti ${report.title || report.id.slice(0, 8)} -> ${copied.reportId.slice(0, 8)}${copied.created ? ' (uusi)' : ' (olemassa)'}${copied.imagesCopied ? `, kuvia ${copied.imagesCopied}` : ''}`,
    );
  }

  let workCreated = 0;
  if (INCLUDE_WORK_REPORTS) {
    for (const report of workReports) {
      const copied = await copyWorkReport(
        supabase,
        report,
        target.id,
        targetCustomer.customerId,
        targetCustomer.subscriberId,
        equipmentMap,
        defaultUserId,
        DRY_RUN,
      );
      if (copied.created) workCreated += 1;
      console.log(
        `  Työraportti ${report.title || report.id.slice(0, 8)} -> ${copied.reportId.slice(0, 8)}${copied.created ? ' (uusi)' : ' (olemassa)'}`,
      );
    }
  }

  console.log('\nYhteenveto:');
  console.log('  Kohdeasiakas:', targetCustomer.customerId);
  console.log('  Uudet laitteet:', equipmentCreated);
  console.log('  Uudet huoltoraportit:', maintenanceCreated);
  console.log('  Kopioituja kuvia:', imagesCopied);
  if (INCLUDE_WORK_REPORTS) console.log('  Uudet työraportit:', workCreated);
  console.log(
    DRY_RUN
      ? '\nAja uudelleen --apply:lla kun tulos näyttää oikealta.'
      : '\nValmis. Uudenmaan Kylmähuolto ei näe kopioita (eri owner_company_id).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
