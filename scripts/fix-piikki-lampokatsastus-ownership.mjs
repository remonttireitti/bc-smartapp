/**
 * Siirtää Piikin kohteet (Asemamiehenkatu 2, Ratamestarinkatu 11) kokonaan Lämpökatsastus Oy:lle
 * ja poistaa Uudenmaan Kylmähuolto Oy:n näkyvyyden (owner + created_by + branding).
 *
 * Aja: node scripts/fix-piikki-lampokatsastus-ownership.mjs --dry-run --production
 *      node scripts/fix-piikki-lampokatsastus-ownership.mjs --apply --production
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';

const UUDENMAAN_ID = '22222222-2222-4222-8222-222222222222';
const LAMPOKATSASTUS_ID = '33333333-3333-4333-8333-333333333333';

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

function isPiikkiSiteAddress(address, city, name) {
  const blob = `${address ?? ''} ${city ?? ''} ${name ?? ''}`.toLowerCase();
  const asemamies = blob.includes('asemamiehenkatu') && /\b2\b/.test(blob);
  const ratamestari = blob.includes('ratamestarinkatu') && /\b11\b/.test(blob);
  const piikki = blob.includes('piikki');
  return (asemamies || ratamestari) && (piikki || asemamies || ratamestari);
}

function reportOsoiteMatches(osoite) {
  if (!osoite) return false;
  return isPiikkiSiteAddress(osoite, '', '');
}

async function resolveCompanyIds(supabase) {
  const { data, error } = await supabase.from('companies').select('id, name');
  if (error) throw error;
  let uudenmaan = UUDENMAAN_ID;
  let lampokatsastus = LAMPOKATSASTUS_ID;
  for (const row of data ?? []) {
    const n = String(row.name ?? '').toLowerCase();
    if (n.includes('uudenmaan') && n.includes('kylm')) uudenmaan = row.id;
    if (n.includes('lämpökatsastus') || n.includes('lampokatsastus')) lampokatsastus = row.id;
  }
  return { uudenmaan, lampokatsastus };
}

async function main() {
  const supabase = createClient(
    PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    getServiceKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { uudenmaan, lampokatsastus } = await resolveCompanyIds(supabase);
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY ===');
  console.log('Uudenmaan:', uudenmaan);
  console.log('Lämpökatsastus:', lampokatsastus);

  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, address, city, owner_company_id');
  if (custErr) throw custErr;

  const piikkiCustomers = (customers ?? []).filter((c) =>
    isPiikkiSiteAddress(c.address, c.city, c.name),
  );
  const piikkiCustomerIds = piikkiCustomers.map((c) => c.id);
  console.log('Piikki-asiakkaat:', piikkiCustomers.length);
  for (const c of piikkiCustomers) {
    console.log(' -', c.name, '|', c.address, c.city ?? '', '| owner:', c.owner_company_id.slice(0, 8));
  }

  const { data: allMr, error: mrErr } = await supabase
    .from('maintenance_reports')
    .select('id, title, owner_company_id, created_by_company_id, branding_company_id, customer_id, data');
  if (mrErr) throw mrErr;

  const piikkiReports = (allMr ?? []).filter((mr) => {
    const linked = mr.customer_id && piikkiCustomerIds.includes(mr.customer_id);
    const osoite = typeof mr.data === 'object' && mr.data ? mr.data.osoite : '';
    return linked || reportOsoiteMatches(String(osoite ?? ''));
  });

  const needsFix = piikkiReports.filter(
    (mr) =>
      mr.owner_company_id !== lampokatsastus
      || mr.created_by_company_id !== lampokatsastus
      || mr.branding_company_id !== lampokatsastus
      || mr.owner_company_id === uudenmaan
      || mr.created_by_company_id === uudenmaan
      || mr.branding_company_id === uudenmaan,
  );

  console.log('Piikki-huoltoraportit:', piikkiReports.length, '| korjattavia:', needsFix.length);
  for (const mr of needsFix) {
    const title = mr.title || (mr.data?.laiteTunnus ?? mr.id.slice(0, 8));
    console.log(
      ' -',
      title,
      '| owner',
      mr.owner_company_id.slice(0, 8),
      'created',
      mr.created_by_company_id.slice(0, 8),
      'brand',
      mr.branding_company_id.slice(0, 8),
    );
  }

  const wrongOwnerCustomers = piikkiCustomers.filter((c) => c.owner_company_id !== lampokatsastus);
  console.log('Asiakkaat väärällä ownerilla:', wrongOwnerCustomers.length);

  if (DRY_RUN) return;

  if (wrongOwnerCustomers.length > 0) {
    const { error } = await supabase
      .from('customers')
      .update({ owner_company_id: lampokatsastus, updated_at: new Date().toISOString() })
      .in('id', wrongOwnerCustomers.map((c) => c.id));
    if (error) throw error;
  }

  if (piikkiCustomerIds.length > 0) {
    const { error: eqErr } = await supabase
      .from('equipment')
      .update({ owner_company_id: lampokatsastus, updated_at: new Date().toISOString() })
      .in('customer_id', piikkiCustomerIds)
      .neq('owner_company_id', lampokatsastus);
    if (eqErr) throw eqErr;
  }

  if (needsFix.length > 0) {
    const ids = needsFix.map((mr) => mr.id);
    const { error } = await supabase
      .from('maintenance_reports')
      .update({
        owner_company_id: lampokatsastus,
        created_by_company_id: lampokatsastus,
        branding_company_id: lampokatsastus,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (error) throw error;
  }

  console.log('Valmis.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
