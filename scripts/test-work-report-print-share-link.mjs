/**
 * Laskutus → "Kopioi tulostelinkki": linkki avaa asiakkaan työraporttitulosteen ilman kirjautumista.
 *  - linkin osoite (tuotanto-origin, ei localhost/esikatselu), reitti /j/:token julkisena ja kirjautuneena
 *  - edge-funktio work-report-print-share ilman moniselitteisiä embedejä (equipment ↔ work_report_equipment)
 *  - asiakasturvallinen data: ei hintoja/katteita/provisiota, tarjouksen 0 €-rivit piilossa
 *  - tuloste renderöityy asiakastilassa
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  PUBLIC_APP_ORIGIN,
  parseWorkReportPrintShareResponse,
  resolvePublicShareOrigin,
  workReportPrintShareUrl,
} from '../src/lib/workReportPrintShareLink.ts';
import {
  publicPrintExpensePriceMissing,
  sanitizeWorkReportPublicPrintLogs,
} from '../supabase/functions/_shared/workReportPublicPrint.ts';
import { expenseLinePriceMissing } from '../src/lib/expensePriceMissing.ts';
import { generateWorkReportPrintHtml } from '../src/lib/workReportPrintHtml.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- 1. Linkin osoite ---------------------------------------------------------
assert.equal(PUBLIC_APP_ORIGIN, 'https://bc-smartapp.pages.dev');
assert.equal(workReportPrintShareUrl('abc123def456', 'https://bc-smartapp.pages.dev'), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(workReportPrintShareUrl('abc123def456', 'http://localhost:5173'), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(workReportPrintShareUrl('abc123def456', 'http://127.0.0.1:4173'), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(workReportPrintShareUrl('abc123def456', 'https://3f2a1b9c.bc-smartapp.pages.dev'), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(workReportPrintShareUrl('abc123def456', 'capacitor://localhost'), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(workReportPrintShareUrl('abc123def456', null), 'https://bc-smartapp.pages.dev/j/abc123def456');
assert.equal(resolvePublicShareOrigin('https://app.remonttireitti.fi'), 'https://app.remonttireitti.fi', 'oma domain säilyy');
assert.equal(resolvePublicShareOrigin('http://app.example.fi'), PUBLIC_APP_ORIGIN, 'ei http-linkkejä asiakkaalle');

// --- 2. Reitti on olemassa sekä kirjautumatta että kirjautuneena ----------------------
const appSrc = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const authRoutesSrc = readFileSync(join(root, 'src/routes/authenticatedRoutes.tsx'), 'utf8');
assert.match(appSrc, /path="\/j\/:token" element={<WorkReportPublicPrintPage \/>}/);
assert.match(authRoutesSrc, /path: '\/j\/:token', element: <WorkReportPublicPrintPage \/>/);
// Pages: ei _redirects-sääntöä, joka ohjaisi /j/* muualle; SPA-fallback hoitaa syvälinkit.
let redirects = '';
try { redirects = readFileSync(join(root, 'public/_redirects'), 'utf8'); } catch { /* ei tiedostoa */ }
assert.doesNotMatch(redirects, /^\/j\//m);
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');
assert.match(viteConfig, /navigateFallback: '\/index.html'/);

// --- 3. Hinta puuttuu -tarkistus sama kuin sovelluksessa ---------------------------
for (const line of [
  { expense_type: 'material', description: 'Kupariputki', unit_price: 0, customer_unit_price: null },
  { expense_type: 'material', description: 'Kupariputki', unit_price: 12, customer_unit_price: null },
  { expense_type: 'other', description: 'Muu', unit_price: 0, customer_unit_price: 30 },
  { expense_type: 'device', description: 'Laite', unit_price: 0, customer_unit_price: 0 },
  { expense_type: 'km', description: '20 km', unit_price: 0, customer_unit_price: 0 },
  { expense_type: 'parking', description: '', unit_price: 0, customer_unit_price: 0 },
]) {
  assert.equal(publicPrintExpensePriceMissing(line), expenseLinePriceMissing(line), JSON.stringify(line));
}

// --- 4. Edge-funktio (Deno) Node-mockilla -------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'print-share-'));
const bundlePath = join(tmp, 'edge.mjs');
await build({
  entryPoints: [join(root, 'supabase/functions/work-report-print-share/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'silent',
  plugins: [{
    name: 'mock-supabase',
    setup(b) {
      b.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({
        path: join(root, 'scripts/lib/mockSupabaseForEdge.mjs'),
      }));
    },
  }],
});

let handler = null;
globalThis.Deno = {
  env: { get: (key) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' })[key] },
  serve: (fn) => { handler = fn; },
};

const REPORT_ID = 'r-1';
const LOG_ID = 'l-1';
globalThis.__edgeDb = {
  queries: [],
  tables: {
    work_report_print_shares: [
      { id: 's1', work_report_id: REPORT_ID, short_token: 'abc123def456', access_token: 'a'.repeat(64), enabled: true, expires_at: null },
      { id: 's2', work_report_id: 'r-2', short_token: 'disabled0001', access_token: 'b'.repeat(64), enabled: false, expires_at: null },
      { id: 's3', work_report_id: 'r-3', short_token: 'expired00001', access_token: 'c'.repeat(64), enabled: true, expires_at: '2020-01-01T00:00:00Z' },
    ],
    work_reports: [{
      id: REPORT_ID, title: 'Ilmalämpöpumpun asennus', heading: null, description: 'Asennus olohuoneeseen',
      orderer_name: 'Matti', location_text: 'Espoo', status: 'completed',
      scheduled_start: null, scheduled_end: null, completed_at: '2026-09-30T12:00:00Z',
      owner_company_id: 'c-owner', created_by_company_id: 'c-owner', created_by_user_id: 'u-1', branding_company_id: null,
      partnership_id: null, customer_id: 'cu-1', equipment_id: 'e-1', assigned_user_id: 'u-2',
      delegate_company_id: null, delegated_at: null,
      created_by_user_name_snapshot: null, created_by_user_deleted: false,
      assigned_user_name_snapshot: null, assigned_user_deleted: false,
      internal_secret_column: 'ei asiakkaalle',
    }],
    work_report_daily_logs: [{
      id: LOG_ID, work_report_id: REPORT_ID, log_date: '2026-09-30', entry_type: 'fixed_price',
      hours_regular: 0, hours_overtime: 0, hours_on_call: 0,
      fixed_price_amount: 1890, commission_amount: 150, commission_note: 'Provisio kumppanille',
      work_done: 'Asennettiin sisä- ja ulkoyksikkö.', created_by: 'u-2', created_at: '2026-09-30T12:00:00Z',
      author_name_snapshot: null, author_deleted: false,
      customer_extra_billing: { hours: 2, hourly_rate: 65, hours_extra_billable: true, hours_extra_billing_allowed: true },
      expense_lines: [
        { id: 'x1', daily_log_id: LOG_ID, expense_type: 'material', description: 'Asennussarja 4 m (tarjous)', qty: 1, unit_price: 0, customer_unit_price: null, bill_to_partner: false, bill_to_customer: false, sort_order: 0 },
        { id: 'x2', daily_log_id: LOG_ID, expense_type: 'other', description: 'Seinäteline', qty: 1, unit_price: 77.5, customer_unit_price: 139.5, bill_to_partner: true, bill_to_customer: true, customer_margin_percent: 80, sort_order: 1 },
        { id: 'x3', daily_log_id: LOG_ID, expense_type: 'km', description: '42 km', qty: 42, unit_price: 0, customer_unit_price: 0, bill_to_partner: true, bill_to_customer: true, sort_order: 2 },
      ],
      refrigerant_lines: [
        { id: 'rf1', daily_log_id: LOG_ID, refrigerant_type: 'R32', qty_kg: 0.3, unit_price: 55, customer_unit_price: 99, supplier_paid_by: 'partner', bill_to_customer: true, created_at: '2026-09-30T12:00:00Z' },
      ],
      images: [{ id: 'i1', daily_log_id: LOG_ID, storage_path: `${REPORT_ID}/${LOG_ID}/kuva.jpg`, file_name: 'kuva.jpg', caption: 'Ulkoyksikkö' }],
    }],
    work_report_billable: [{ work_report_id: REPORT_ID, billing_quote: { quote_request_id: 'q-1', customer_mode: 'quote_fixed', customer_invoice_total: 2490 } }],
    work_report_equipment: [
      { work_report_id: REPORT_ID, equipment_id: 'e-1', sort_order: 0 },
      { work_report_id: REPORT_ID, equipment_id: 'e-2', sort_order: 1 },
    ],
    equipment: [{ id: 'e-1', name: 'ILP olohuone', tag: 'ILP-1' }, { id: 'e-2', name: 'ILP makuuhuone', tag: 'ILP-2' }],
    companies: [{ id: 'c-owner', name: 'BC Kylmä Oy', logo_url: 'c-owner/logo.png' }],
    customers: [{ id: 'cu-1', name: 'Asiakas Oy' }],
    profiles: [{ id: 'u-1', display_name: 'Enn', email: 'enn@example.fi' }, { id: 'u-2', display_name: 'Asentaja A', email: 'a@example.fi' }],
  },
};

await import(pathToFileURL(bundlePath).href);
assert.ok(handler, 'Deno.serve-käsittelijä rekisteröity');

async function call(body, method = 'POST') {
  const res = await handler(new Request('https://x.supabase.co/functions/v1/work-report-print-share', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, text: await res.text(), headers: res.headers };
}

const ping = await call({ ping: true });
assert.equal(ping.status, 200);
assert.match(JSON.parse(ping.text).version, /^\d{4}-\d{2}-\d{2}$/);

assert.equal((await call({}, 'GET')).status, 405);
assert.equal((await call({})).status, 400);
assert.equal((await call({ token: 'eiolemassa99' })).status, 404);
assert.equal((await call({ token: 'disabled0001' })).status, 403);
assert.equal((await call({ token: 'expired00001' })).status, 403);
const queriesBefore = globalThis.__edgeDb.queries.length;
assert.equal((await call({ token: 'abc,access_token.neq.x' })).status, 404, 'or()-injektio torjutaan');
assert.equal(globalThis.__edgeDb.queries.length, queriesBefore, 'virheellinen tunnus ei kysele kantaa');

const ok = await call({ token: 'abc123def456' });
assert.equal(ok.status, 200, ok.text);
assert.equal(ok.headers.get('access-control-allow-origin'), '*');
const body = JSON.parse(ok.text);
assert.ok(
  globalThis.__edgeDb.queries.filter((q) => q.table === 'work_reports').every((q) => !q.select.includes('(')),
  'work_reports-kysely ilman embedejä (ei PGRST201)',
);
assert.equal(body.report.title, 'Ilmalämpöpumpun asennus');
assert.deepEqual(body.report.customers, { name: 'Asiakas Oy' });
assert.deepEqual(body.report.equipment, { name: 'ILP olohuone', tag: 'ILP-1' });
assert.deepEqual(body.report.owner_company, { name: 'BC Kylmä Oy' });
assert.deepEqual(body.report.assigned_user, { display_name: 'Asentaja A' });
assert.equal(body.report.internal_secret_column, undefined);
assert.deepEqual(body.equipmentLinks.map((e) => e.tag), ['ILP-1', 'ILP-2']);
assert.equal(body.meta.companyName, 'BC Kylmä Oy');
assert.equal(body.meta.logoUrl, 'https://signed.example/company-logos/c-owner/logo.png');
assert.equal(body.logImages[LOG_ID][0].url, `https://signed.example/work-report-images/${REPORT_ID}/${LOG_ID}/kuva.jpg`);

const log = body.logs[0];
assert.equal(log.author.display_name, 'Asentaja A');
for (const key of ['fixed_price_amount', 'commission_amount', 'commission_note']) {
  assert.equal(key in log, false, `lokilta poistettu ${key}`);
}
assert.deepEqual(log.expense_lines.map((l) => l.id), ['x2', 'x3'], 'tarjouksen 0 €-rivi piilotettu, km säilyy');
for (const line of log.expense_lines) {
  assert.equal('unit_price' in line, false);
  assert.equal('customer_unit_price' in line, false);
  assert.equal('customer_margin_percent' in line, false);
}
assert.equal('unit_price' in log.refrigerant_lines[0], false);
assert.equal('customer_unit_price' in log.refrigerant_lines[0], false);
assert.deepEqual(log.customer_extra_billing, { hours: 2, hours_extra_billable: true, hours_extra_billing_allowed: true });
assert.deepEqual(log.images, [], 'tallennuspolkuja ei palauteta');
assert.doesNotMatch(ok.text, /1890|77\.5|139\.5|2490|"150"|: ?150\b|Provisio kumppanille/, 'ei sisäisiä lukuja vastauksessa');

// Ilman linkitettyä tarjousta 0 €-rivi näkyy (kuten sovelluksen asiakastulosteessa).
const unlinked = sanitizeWorkReportPublicPrintLogs(globalThis.__edgeDb.tables.work_report_daily_logs, { linkedQuoteRequest: false });
assert.deepEqual(unlinked[0].expense_lines.map((l) => l.id), ['x1', 'x2', 'x3']);

// --- 5. Selain: vastauksen tulkinta + asiakastuloste ------------------------------------
const bundle = parseWorkReportPrintShareResponse(200, ok.text);
const html = generateWorkReportPrintHtml({
  report: bundle.report,
  logs: bundle.logs,
  logImages: bundle.logImages,
  printMode: 'customer',
  showPartnerPrices: false,
  calculation: null,
  meta: { companyName: bundle.meta.companyName, logoUrl: bundle.meta.logoUrl ?? undefined },
  hideAssignee: false,
  equipmentLinks: bundle.equipmentLinks,
});
assert.match(html, /Ilmalämpöpumpun asennus|ILP/);
assert.match(html, /Asiakas Oy/);
assert.match(html, /ILP-1/);
assert.match(html, /ILP-2/);
assert.match(html, /Seinäteline/);
assert.match(html, /Asennettiin sisä- ja ulkoyksikkö/);
assert.match(html, /kuva\.jpg/);
assert.doesNotMatch(html, /Asennussarja 4 m/, 'tarjouksen 0 €-rivi ei näy');
assert.doesNotMatch(html, /Provisio/, 'ei provisiota asiakastulosteessa');
assert.doesNotMatch(html, /€/, 'ei euromääriä asiakastulosteessa');

// Vanhan funktion vastaus (summat mukana) siivotaan selaimessa.
const legacy = parseWorkReportPrintShareResponse(200, JSON.stringify({
  report: bundle.report,
  logs: globalThis.__edgeDb.tables.work_report_daily_logs,
  logImages: {},
  meta: { companyName: 'BC', logoUrl: null },
}));
assert.equal('commission_amount' in legacy.logs[0], false);
assert.equal('unit_price' in legacy.logs[0].expense_lines[0], false);

// Virheet: JSON-virhe, HTML-virhesivu, puuttuva funktio.
assert.throws(() => parseWorkReportPrintShareResponse(404, '{"error":"Jakolinkki ei ole voimassa"}'), /Jakolinkki ei ole voimassa/);
assert.throws(() => parseWorkReportPrintShareResponse(404, '<html>Not found</html>'), /work-report-print-share puuttuu/);
assert.throws(() => parseWorkReportPrintShareResponse(502, 'Bad gateway'), /\(502\)/);
assert.throws(() => parseWorkReportPrintShareResponse(200, '{}'), /tyhjä vastaus/);

// Sovelluksen oma asiakastuloste: ei provisiota, sisäisessä tulosteessa provisio näkyy.
const internalHtml = generateWorkReportPrintHtml({
  report: bundle.report,
  logs: globalThis.__edgeDb.tables.work_report_daily_logs,
  printMode: 'internal',
  showPartnerPrices: false,
  calculation: null,
  meta: { companyName: 'BC' },
});
assert.match(internalHtml, /Provisio/);

console.log('test-work-report-print-share-link: ok');
