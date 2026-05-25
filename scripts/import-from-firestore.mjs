/**
 * Tuo BC Smartapp -tuotantodata Firestoresta Supabaseen.
 *
 * Aja ensin kuivana:
 *   node scripts/import-from-firestore.mjs --dry-run
 *
 * Tuonti tuotantoon (vaatii Supabase CLI -kirjautumisen):
 *   node scripts/import-from-firestore.mjs --apply --production
 */
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLegacyQuoteFields,
  firestoreQuoteCustomerId,
  quoteTitleFromFirestore,
} from './lib/quote-legacy-import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '.cache');
const MAP_FILE = resolve(CACHE_DIR, 'firestore-import-map.json');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  'C:\\Users\\Administrator\\BC yrityshallinta\\functions\\scripts\\service-account-key.json';

const COMPANY_MAP = {
  main: '11111111-1111-4111-8111-111111111111',
};

const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';
const DEFAULT_IMPORT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD ?? 'BCimport2026!';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--apply');
const PRODUCTION = args.has('--production');
const CLEAR_DEMO = args.has('--clear-demo');

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

function loadMap() {
  if (!existsSync(MAP_FILE)) {
    return { companies: { ...COMPANY_MAP }, users: {}, customers: {}, equipment: {}, work_reports: {}, maintenance_reports: {}, quotes: {} };
  }
  return JSON.parse(readFileSync(MAP_FILE, 'utf8'));
}

function saveMap(map) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
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
  return admin.firestore();
}

function tsToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    if ('_seconds' in value && typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000).toISOString();
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString();
    }
  }
  return null;
}

function mapCompanyId(firestoreCompanyId) {
  return COMPANY_MAP[firestoreCompanyId] ?? null;
}

function mapRole(role) {
  const r = String(role || 'technician').toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'customer') return 'customer';
  return 'technician';
}

function mapWorkStatus(status) {
  switch (status) {
    case 'upcoming':
      return 'scheduled';
    case 'in_progress':
      return 'in_progress';
    case 'done':
      return 'completed';
    case 'customer_billed':
      return 'billed_customer';
    default:
      return 'scheduled';
  }
}

function mapWorkEntry(entry) {
  const date = String(entry.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const hours = Number(entry.hours || 0);
  const type = String(entry.workHourType || 'normal');
  let entry_type = 'regular';
  let hours_regular = 0;
  let hours_overtime = 0;
  let hours_on_call = 0;
  let fixed_price_amount = null;

  if (type === 'overtime') {
    entry_type = 'overtime';
    hours_overtime = hours;
  } else if (type === 'oncall') {
    entry_type = 'on_call';
    hours_on_call = hours;
  } else if (type === 'contract') {
    entry_type = 'fixed_price';
    fixed_price_amount = Number(entry.hours || 0) > 0 ? hours : null;
  } else {
    entry_type = 'regular';
    hours_regular = hours;
  }

  const expenseLines = [];
  for (const line of entry.billableLines || []) {
    if (!line || typeof line !== 'object') continue;
    expenseLines.push({
      expense_type: line.kind === 'expense_supply' ? 'material' : 'other',
      description: String(line.label || line.comment || 'Kulu'),
      qty: Number(line.qty || 1),
      unit_price: Number(line.unitPrice || 0),
      sort_order: expenseLines.length,
    });
  }

  if (Number(entry.customerParkingFee || 0) > 0) {
    expenseLines.push({
      expense_type: 'parking',
      description: 'Pysäköinti',
      qty: 1,
      unit_price: Number(entry.customerParkingFee),
      sort_order: expenseLines.length,
    });
  }

  return {
    log_date: date,
    entry_type,
    hours_regular,
    hours_overtime,
    hours_on_call,
    fixed_price_amount,
    commission_amount: 0,
    commission_note: null,
    work_done: String(entry.description || '').trim() || 'Tuotu vanhasta järjestelmästä',
    expense_lines: expenseLines,
  };
}

function extractHuoltoData(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (HUOLTO_META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function extractQuoteData(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (QUOTE_META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function isConfigDoc(id, data) {
  return id === 'main' && data?.modules && !data?.name?.includes('Oy');
}

async function fetchSubcollection(db, companyId, sub) {
  const snap = await db.collection('companies').doc(companyId).collection(sub).get();
  return snap.docs.filter((d) => !isConfigDoc(d.id, d.data()));
}

async function main() {
  const db = initFirebase();
  const map = loadMap();
  const stats = {
    users: 0,
    customers: 0,
    equipment: 0,
    work_reports: 0,
    daily_logs: 0,
    maintenance_reports: 0,
    quotes: 0,
    skipped: 0,
  };

  const supabaseUrl = PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  let supabase = null;
  if (!DRY_RUN) {
    supabase = createClient(supabaseUrl, getServiceKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY IMPORT ===');
  console.log(`Target: ${PRODUCTION ? 'production' : 'local'} (${supabaseUrl})`);

  const firestoreCompanyId = 'main';
  const targetCompanyId = map.companies[firestoreCompanyId];
  if (!targetCompanyId) throw new Error(`Yritystä ${firestoreCompanyId} ei ole kartoitettu`);

  if (CLEAR_DEMO && !DRY_RUN) {
    const { data: demoCustomers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('owner_company_id', targetCompanyId)
      .like('name', '% asiakas %');
    const demoIds = (demoCustomers ?? []).map((c) => c.id);
    if (demoIds.length > 0) {
      await supabase.from('customers').delete().in('id', demoIds);
      console.log(`Poistettu ${demoIds.length} demo-asiakasta`);
    }
  }

  const usersSnap = await db.collection('users').get();
  const membersSnap = await db.collection('companies').doc(firestoreCompanyId).collection('members').get();
  const memberRoles = new Map(membersSnap.docs.map((d) => [d.id, d.data()?.role]));

  let defaultUserId = null;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) {
      stats.skipped += 1;
      continue;
    }
    if (String(data.companyId || '') !== firestoreCompanyId && !(data.companyIds || []).includes(firestoreCompanyId)) {
      stats.skipped += 1;
      continue;
    }

    const role = mapRole(memberRoles.get(userDoc.id) ?? data.role);
    const displayName = String(data.displayName || email.split('@')[0]).trim();

    if (map.users[userDoc.id]) {
      defaultUserId ??= map.users[userDoc.id];
      continue;
    }

    stats.users += 1;
    if (DRY_RUN) {
      console.log(`  user: ${email} (${role})`);
      map.users[userDoc.id] = map.users[userDoc.id] ?? randomUUID();
      defaultUserId ??= map.users[userDoc.id];
      continue;
    }

    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let userId = listed?.users?.find((u) => u.email?.toLowerCase() === email)?.id;
    const metadata = { company_id: targetCompanyId, role, display_name: displayName };

    if (userId) {
      await supabase.auth.admin.updateUserById(userId, {
        password: DEFAULT_IMPORT_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      });
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_IMPORT_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`${email}: ${error.message}`);
      userId = created.user.id;
    }

    await supabase.from('profiles').upsert(
      {
        id: userId,
        company_id: targetCompanyId,
        role,
        email,
        display_name: displayName,
      },
      { onConflict: 'id' },
    );

    map.users[userDoc.id] = userId;
    defaultUserId ??= userId;
  }

  const asiakkaat = await fetchSubcollection(db, firestoreCompanyId, 'asiakkaat');
  for (const doc of asiakkaat) {
    const data = doc.data();
    if (data.isActive === false || !String(data.name || '').trim()) {
      stats.skipped += 1;
      continue;
    }
    if (map.customers[doc.id]) continue;

    stats.customers += 1;
    const customerUuid = map.customers[doc.id] ?? randomUUID();
    map.customers[doc.id] = customerUuid;
    if (DRY_RUN) {
      console.log(`  customer: ${data.name}`);
      continue;
    }
    const row = {
      id: customerUuid,
      owner_company_id: targetCompanyId,
      name: String(data.name).trim(),
      business_id: data.businessId ? String(data.businessId) : null,
      email: data.email ? String(data.email) : null,
      phone: data.phone ? String(data.phone) : null,
      address: data.address ? String(data.address) : null,
      city: data.city ? String(data.city) : null,
      notes: data.contactPerson ? `Yhteyshenkilö: ${data.contactPerson}` : null,
      created_at: tsToIso(data.createdAt) ?? undefined,
      updated_at: tsToIso(data.updatedAt) ?? undefined,
    };

    const { error } = await supabase.from('customers').insert(row);
    if (error) throw new Error(`Asiakas ${data.name}: ${error.message}`);
    map.customers[doc.id] = customerUuid;
  }

  const laitteet = await fetchSubcollection(db, firestoreCompanyId, 'laitteet');
  for (const doc of laitteet) {
    const data = doc.data();
    if (data.isActive === false) {
      stats.skipped += 1;
      continue;
    }
    const customerId = map.customers[String(data.customerId || '')];
    if (!customerId) {
      stats.skipped += 1;
      continue;
    }
    if (map.equipment[doc.id]) continue;

    stats.equipment += 1;
    if (DRY_RUN) {
      console.log(`  equipment: ${data.name || data.deviceType}`);
      continue;
    }

    const id = randomUUID();
    const row = {
      id,
      owner_company_id: targetCompanyId,
      customer_id: customerId,
      tag: data.deviceTag ? String(data.deviceTag) : null,
      name: String(data.name || data.deviceType || 'Laite').trim(),
      model: data.model ? String(data.model) : null,
      serial_number: data.serialNumber ? String(data.serialNumber) : null,
      location: data.location ? String(data.location) : null,
      device_type: data.deviceType ? String(data.deviceType) : null,
      huolto_technical_snapshot: data.huoltoTechnicalSnapshot ?? null,
      notes: data.notes ? String(data.notes) : null,
      created_at: tsToIso(data.createdAt) ?? undefined,
      updated_at: tsToIso(data.updatedAt) ?? undefined,
    };

    const { error } = await supabase.from('equipment').insert(row);
    if (error) throw new Error(`Laite ${row.name}: ${error.message}`);
    map.equipment[doc.id] = id;
  }

  const workReports = await fetchSubcollection(db, firestoreCompanyId, 'work_reports');
  for (const doc of workReports) {
    const data = doc.data();
    if (String(data.syncRole || '').toLowerCase() === 'mirror') {
      stats.skipped += 1;
      continue;
    }
    if (!String(data.taskTitle || data.customerName || '').trim()) {
      stats.skipped += 1;
      continue;
    }
    if (map.work_reports[doc.id]) continue;

    stats.work_reports += 1;
    const createdByUserId = map.users[String(data.createdByUserId || '')] ?? defaultUserId;
    const assignedUserId = map.users[String(data.assignedToUserId || '')] ?? createdByUserId;
    const customerId = map.customers[String(data.customerId || '')] ?? null;
    const equipmentId = map.equipment[String(data.equipmentId || '')] ?? null;

    if (DRY_RUN) {
      console.log(`  work_report: ${data.taskTitle || data.customerName}`);
      stats.daily_logs += Array.isArray(data.workEntries) ? data.workEntries.length : 0;
      continue;
    }

    const reportId = randomUUID();
    const row = {
      id: reportId,
      owner_company_id: targetCompanyId,
      created_by_company_id: targetCompanyId,
      branding_company_id: targetCompanyId,
      customer_id: customerId,
      equipment_id: equipmentId,
      assigned_user_id: assignedUserId,
      created_by_user_id: createdByUserId,
      title: String(data.taskTitle || data.customerName || 'Työraportti').trim(),
      description: String(data.workDoneDescription || data.workRequestDescription || '').trim() || null,
      location_text: data.customerAddress ? String(data.customerAddress) : null,
      status: mapWorkStatus(data.status),
      scheduled_start: tsToIso(data.startedAt),
      scheduled_end: tsToIso(data.endedAt),
      completed_at: data.status === 'done' || data.status === 'customer_billed' ? tsToIso(data.endedAt) : null,
      created_at: tsToIso(data.createdAt) ?? undefined,
      updated_at: tsToIso(data.updatedAt) ?? undefined,
    };

    const { error } = await supabase.from('work_reports').insert(row);
    if (error) throw new Error(`Työraportti ${row.title}: ${error.message}`);

    for (const entry of data.workEntries || []) {
      const log = mapWorkEntry(entry);
      const { data: logRow, error: logError } = await supabase
        .from('work_report_daily_logs')
        .insert({
          work_report_id: reportId,
          log_date: log.log_date,
          entry_type: log.entry_type,
          hours_regular: log.hours_regular,
          hours_overtime: log.hours_overtime,
          hours_on_call: log.hours_on_call,
          fixed_price_amount: log.fixed_price_amount,
          commission_amount: log.commission_amount,
          commission_note: log.commission_note,
          work_done: log.work_done,
          created_by: createdByUserId,
        })
        .select('id')
        .single();
      if (logError) throw new Error(`Päiväkirjaus: ${logError.message}`);
      stats.daily_logs += 1;

      if (log.expense_lines.length > 0) {
        const { error: expError } = await supabase.from('work_report_daily_expense_lines').insert(
          log.expense_lines.map((line) => ({ ...line, daily_log_id: logRow.id })),
        );
        if (expError) throw new Error(`Kulurivit: ${expError.message}`);
      }
    }

    map.work_reports[doc.id] = reportId;
  }

  const huoltoSnap = await db.collection('huolto_raportit').get();
  for (const doc of huoltoSnap.docs) {
    const data = doc.data();
    if (String(data.syncRole || '').toLowerCase() === 'mirror') {
      stats.skipped += 1;
      continue;
    }
    const sourceCompany = String(data.companyId || data.customerRegistryCompanyId || firestoreCompanyId);
    if (sourceCompany !== firestoreCompanyId) {
      stats.skipped += 1;
      continue;
    }
    if (map.maintenance_reports[doc.id]) continue;

    stats.maintenance_reports += 1;
    const customerId = map.customers[String(data.customerId || '')] ?? null;
    const equipmentId = map.equipment[String(data.equipmentId || '')] ?? null;
    const completed = Boolean(data.huoltoSuoritettu);

    if (DRY_RUN) {
      console.log(`  maintenance: ${data.title || data.asiakas || doc.id}`);
      continue;
    }

    const id = randomUUID();
    const row = {
      id,
      owner_company_id: targetCompanyId,
      created_by_company_id: targetCompanyId,
      branding_company_id: targetCompanyId,
      customer_id: customerId,
      equipment_id: equipmentId,
      data: extractHuoltoData(data),
      status: completed ? 'completed' : 'draft',
      completed_at: completed ? tsToIso(data.updatedAt) : null,
      created_at: tsToIso(data.createdAt) ?? undefined,
      updated_at: tsToIso(data.updatedAt) ?? undefined,
    };

    const { error } = await supabase.from('maintenance_reports').insert(row);
    if (error) throw new Error(`Huoltoraportti ${doc.id}: ${error.message}`);
    map.maintenance_reports[doc.id] = id;
  }

  const quotes = await fetchSubcollection(db, firestoreCompanyId, 'quotes');
  for (const doc of quotes) {
    const data = doc.data();
    if (map.quotes[doc.id]) continue;

    stats.quotes += 1;
    const customerId = map.customers[firestoreQuoteCustomerId(data)] ?? null;

    if (DRY_RUN) {
      console.log(`  quote: ${data.customerName || data.type || doc.id}`);
      continue;
    }

    const id = randomUUID();
    const quoteData = applyLegacyQuoteFields(extractQuoteData(data), data);
    if (!quoteData.type) quoteData.type = String(data.type || 'huolto');
    const equipmentId = map.equipment[String(data.equipmentId || '')] ?? null;
    const row = {
      id,
      owner_company_id: targetCompanyId,
      created_by_company_id: targetCompanyId,
      branding_company_id: targetCompanyId,
      customer_id: customerId,
      equipment_id: equipmentId,
      title: quoteTitleFromFirestore(data),
      status: 'sent',
      data: quoteData,
      created_at: tsToIso(data.createdAt) ?? undefined,
      updated_at: tsToIso(data.updatedAt) ?? undefined,
    };

    const { error } = await supabase.from('quote_requests').insert(row);
    if (error) throw new Error(`Tarjous ${doc.id}: ${error.message}`);
    map.quotes[doc.id] = id;
  }

  if (!DRY_RUN) saveMap(map);

  console.log('\nYhteenveto:');
  console.log(JSON.stringify(stats, null, 2));
  if (DRY_RUN) {
    console.log('\nAja tuonti: node scripts/import-from-firestore.mjs --apply --production --clear-demo');
    console.log(`Tuodut käyttäjät saavat väliaikaisen salasanan: ${DEFAULT_IMPORT_PASSWORD}`);
  } else {
    console.log(`\nKäyttäjien väliaikainen salasana: ${DEFAULT_IMPORT_PASSWORD}`);
    console.log('ID-kartta: scripts/.cache/firestore-import-map.json');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
