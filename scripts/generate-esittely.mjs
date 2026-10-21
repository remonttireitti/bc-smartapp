/**
 * Julkiset esittelysivut /esittely/<sivu>/ (staattinen HTML, keksitty data, ei Supabasea).
 * Käyttää sovelluksen omia tulostegeneraattoreita, jotta sivut näyttävät oikealta sovellukselta.
 * Ajetaan buildissa ennen vitea: tuottaa public/esittely/**.
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && /(^|\\/)supabase(\\.ts)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/')) {
    return { url: 'data:text/javascript,export const supabase = {};', shortCircuit: true };
  }
  return next(spec, ctx);
}`));

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'esittely');
const SITE = 'https://bestcool.eu';
const COMPANY = 'Esimerkki Kylmä Oy';
const CUSTOMER = { name: 'As Oy Esimerkkipuisto', address: 'Esimerkkikatu 12', postal_code: '00100', city: 'Helsinki' };
const DATE = '2026-09-15';

const { generateWorkReportPrintHtml } = await import('../src/lib/workReportPrintHtml.ts');
const { calculateWorkReportCustomerBillable } = await import('../src/lib/workReportCustomerBilling.ts');
const { generateIlpPrintHtml } = await import('../src/lib/huoltoRaportti/ilpPrint.ts');
const { createEmptyHuoltoReportData } = await import('../src/lib/huoltoRaportti/defaults.ts');
const { buildEquipmentCardPrintHtml, buildMaintenanceHistoryPrintHtml } = await import('../src/lib/equipmentMaintenanceHistory.ts');
const { generateQuoteOfferPrintHtml, generateQuoteHeatCalcPrintHtml } = await import('../src/lib/quoteRequest/printHtml.ts');
const { createEmptyQuoteRequestData } = await import('../src/lib/quoteRequest/defaults.ts');

export const PAGES = [
  { slug: 'tyoraportti', nav: 'Työraportti', title: 'Työraportti – esimerkki | BestCool', h1: 'Esimerkki: työraportti',
    desc: 'Esimerkki BestCool-työraportista: työkirjaukset, tunnit, tarvikkeet ja asiakastuloste yhdellä sivulla.' },
  { slug: 'huoltopoytakirja', nav: 'Huoltopöytäkirja', title: 'Ilmalämpöpumpun huoltopöytäkirja – esimerkki | BestCool', h1: 'Esimerkki: ilmalämpöpumpun huoltopöytäkirja',
    desc: 'Esimerkki ilmalämpöpumpun huoltopöytäkirjasta: mittaukset, kylmäainetiedot ja tarkastukset.' },
  { slug: 'laitekortti', nav: 'Laitekortti', title: 'Laitekortti ja huoltohistoria – esimerkki | BestCool', h1: 'Esimerkki: laitekortti ja huoltohistoria',
    desc: 'Esimerkki laitekortista: laitteen tiedot ja koko huoltohistoria aikajärjestyksessä.' },
  { slug: 'asiakasportaali', nav: 'Asiakasportaali', title: 'Asiakasportaali – esimerkki | BestCool', h1: 'Esimerkki: asiakasportaali',
    desc: 'Asiakasportaalissa asiakas näkee omat laitteensa, työraportit, huoltopöytäkirjat ja tarjoukset sekä voi lähettää työtilauksen.' },
  { slug: 'tarjoukset', nav: 'Tarjoukset ja laskennat', title: 'Tarjous ja lämpöhäviölaskenta – esimerkki | BestCool', h1: 'Esimerkki: tarjous ja laskenta',
    desc: 'Esimerkki BestCool-tarjouksesta ja lämpöpumpun mitoituslaskennasta.' },
];

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bodyInner = (html) => (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html);
const headInner = (html) => (html.match(/<head[^>]*>([\s\S]*)<\/head>/i)?.[1] ?? '').replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta[^>]+charset[^>]*>/i, '');

const BAR_CSS = `
.esittely-bar{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.esittely-bar a{color:#fff;text-decoration:none;font-size:14px;padding:4px 8px;border-radius:6px}
.esittely-bar a[aria-current]{background:#F0810F}
.esittely-badge{background:#F0810F;color:#111;font-weight:700;font-size:12px;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
.esittely-head{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:18px auto 6px;padding:0 16px}
.esittely-head h1{font-size:24px;margin:0 0 4px}
.esittely-head p{margin:0;color:#4b5563}
.esittely-cta{display:inline-block;margin-top:10px;background:#F0810F;color:#111!important;font-weight:600;padding:8px 14px;border-radius:8px;text-decoration:none}
.esittely-doc{max-width:960px;margin:12px auto 40px;padding:0 16px}
@media print{.esittely-bar,.esittely-head{display:none}}`;

function page(p, docHtml) {
  const href = p.slug ? `/esittely/${p.slug}/` : '/esittely/';
  const nav = PAGES.map((x) => `<a href="/esittely/${x.slug}/"${x.slug === p.slug ? ' aria-current="page"' : ''}>${esc(x.nav)}</a>`).join('');
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}" />
<link rel="canonical" href="${SITE}${href}" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(p.desc)}" />
<meta property="og:url" content="${SITE}${href}" />
<meta property="og:image" content="${SITE}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
${headInner(docHtml)}
<style>${BAR_CSS}</style>
</head>
<body>
<nav class="esittely-bar" aria-label="Esittely"><span class="esittely-badge">Esimerkki</span><a href="/">BestCool</a>${nav}</nav>
<header class="esittely-head"><h1>${esc(p.h1)}</h1><p>${esc(p.desc)} Keksitty yritys ja asiakas.</p><a class="esittely-cta" href="/login">Kokeile BestCoolia</a></header>
<main class="esittely-doc">${bodyInner(docHtml)}</main>
</body>
</html>
`;
}

// --- Työraportti ---
function workReport() {
  const log = (id, d, hours, work, expenses = []) => ({
    id, work_report_id: 'demo', log_date: d, log_start_time: '08:00', entry_type: 'regular', hours_regular: hours,
    hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: 'u1', created_at: `${d}T08:00:00Z`,
    fixed_price_amount: null, customer_fixed_price_amount: null, partner_urakka_margin_percent: null,
    commission_amount: 0, commission_note: null, work_done: work, partner_billing: null, customer_extra_billing: {},
    expense_lines: expenses, trip_legs: [], refrigerant_lines: [], author: { display_name: 'Matti Esimerkki' },
    author_name_snapshot: 'Matti Esimerkki',
  });
  const exp = (id, description, qty, price) => ({ id, description, expense_type: 'material', qty, unit_price: price, customer_unit_price: price, bill_to_customer: true, bill_to_partner: true });
  const logs = [
    log('l1', '2026-09-14', 6, 'Vanhan ilmalämpöpumpun purku ja putkitusten tarkastus.', [exp('e1', 'Kondenssiletku 10 m', 1, 18.5)]),
    log('l2', '2026-09-15', 7.5, 'Uuden ilmalämpöpumpun asennus, tyhjiöinti ja käyttöönotto. Käyttöopastus asukkaalle.', [exp('e2', 'Seinäteline', 1, 69), exp('e3', 'Putkieriste 3 m', 2, 9.9)]),
  ];
  const rates = { hourly_regular: 62, hourly_overtime: 93, hourly_on_call: 124 };
  const customerCalculation = calculateWorkReportCustomerBillable({ logs, rates, ratesSource: 'company', customerName: CUSTOMER.name });
  const report = {
    id: 'demo', status: 'completed', title: 'Ilmalämpöpumpun vaihto', heading: 'Ilmalämpöpumpun vaihto',
    description: 'Vanhan laitteen purku ja uuden asennus, as. B 7.', location_text: `${CUSTOMER.address}, ${CUSTOMER.city}`,
    orderer_name: 'Isännöitsijä Liisa Malli', completed_at: '2026-09-15T15:00:00Z', created_at: '2026-09-10T09:00:00Z',
    scheduled_start: '2026-09-14T08:00:00Z', equipment_id: 'eq1', equipment: { name: 'Ilmalämpöpumppu B 7', tag: 'ILP-B7' },
    customers: { name: CUSTOMER.name }, branding_company: null, owner_company: { name: COMPANY }, delegate_company: null,
    assignee: { display_name: 'Matti Esimerkki' }, created_by_profile: null, owner_company_id: 'c1', created_by_company_id: 'c1',
  };
  return generateWorkReportPrintHtml({ report, logs, printMode: 'customer', showPartnerPrices: false, calculation: null, customerCalculation, meta: { companyName: COMPANY } });
}

// --- ILP-huoltopöytäkirja ---
function ilp() {
  const data = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'lämpöpumppu', asiakas: CUSTOMER.name, osoite: `${CUSTOMER.address}, ${CUSTOMER.postal_code} ${CUSTOMER.city}`,
    asiakasYhteyshenkilo: 'Liisa Malli', laiteTunnus: 'ILP-B7', laiteValmistaja: 'Esimerkkimerkki', laiteSijainti: 'As. B 7, olohuone',
    huoltoPaivamaara: DATE, huoltoSuoritettu: true, huoltoLaiteessaVika: false, huoltoSuorittajaNimi: 'Matti Esimerkki',
    kylmaaineTyyppi: 'R32', kylmaaineValmistajaMaara: '1,05', kylmaaineLisattyMaara: '0', kylmaainePutkimatka: '5',
    sisayksikkoMaara: 1, mittausLammitysTestattu: true, mittausUlkoLampotila: '8', mittausTestausLampotila: '21',
    huomiot: 'Sisäyksikön suodattimet pesty, ulkoyksikön kenno puhdistettu. Laite toimii normaalisti.',
  };
  return generateIlpPrintHtml(data, { companyName: COMPANY, docTitle: 'Huoltopöytäkirja – ilmalämpöpumppu', fault: false });
}

// --- Laitekortti + huoltohistoria ---
function equipmentCard() {
  const equipment = { id: 'eq1', name: 'Ilmalämpöpumppu B 7', tag: 'ILP-B7', model: 'Esimerkki Nordic 35', serial_number: 'EX-2026-0147',
    location: 'As. B 7, olohuone', notes: 'Asennettu 15.9.2026. Huoltoväli 12 kk.', device_type: 'lampopumppu', huolto_technical_snapshot: null };
  const branding = { companyName: COMPANY };
  const card = buildEquipmentCardPrintHtml({ customerName: CUSTOMER.name, equipment, latestMaintenanceYmd: DATE, branding });
  const history = buildMaintenanceHistoryPrintHtml({ customerName: CUSTOMER.name, branding, sections: [{ deviceLabel: 'ILP-B7 · Ilmalämpöpumppu B 7', entries: [
    { dateLabel: '12.10.2024', kind: 'huoltopöytäkirja', summary: 'Vuosihuolto: suodattimet ja kenno puhdistettu.' },
    { dateLabel: '20.10.2025', kind: 'huoltopöytäkirja', summary: 'Vuosihuolto.', huomiotHighlight: 'Kondenssiletku osittain tukossa, avattu.' },
    { dateLabel: '15.9.2026', kind: 'työraportti', summary: 'Ilmalämpöpumpun vaihto uuteen.' },
    { dateLabel: '15.9.2026', kind: 'huoltopöytäkirja', summary: 'Käyttöönottotarkastus, ei vikaa havaittu.' },
  ] }] });
  return card.replace(/<\/body>/i, `<section style="margin-top:28px">${bodyInner(history)}</section></body>`);
}

// --- Tarjous + laskenta ---
function quotes() {
  const data = { ...createEmptyQuoteRequestData('ilma-ilma') };
  const customer = { name: 'Esimerkki Perhe', address: 'Mallitie 4', postal_code: '33100', city: 'Tampere' };
  const meta = { companyName: COMPANY, quoteNumber: 'T-2026-014', quoteDate: DATE };
  const offer = generateQuoteOfferPrintHtml({ data, customer, meta });
  const heat = generateQuoteHeatCalcPrintHtml({ data: { ...createEmptyQuoteRequestData('vesi-ilma') }, customer, meta });
  return offer.replace(/<\/body>/i, `<section style="margin-top:28px">${bodyInner(heat)}</section></body>`);
}

// --- Asiakasportaali (staattinen kopio portaalin näkymästä) ---
function portal() {
  const row = (cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  return `<!doctype html><html><head><style>
  .pt{font-family:system-ui,-apple-system,sans-serif;display:grid;grid-template-columns:210px 1fr;gap:0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff}
  .pt nav{background:#0f172a;color:#cbd5e1;padding:16px 10px;display:flex;flex-direction:column;gap:4px}
  .pt nav strong{color:#fff;margin:0 8px 10px}
  .pt nav span{padding:8px 10px;border-radius:8px;font-size:14px}.pt nav span.on{background:#1e293b;color:#fff}
  .pt section{padding:18px 20px}.pt h2{font-size:18px;margin:4px 0 12px}
  .pt table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px}.pt th,.pt td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}
  .pt th{color:#6b7280;font-weight:600}.ok{color:#15803d;font-weight:600}
  @media(max-width:640px){.pt{grid-template-columns:1fr}}
  </style></head><body>
  <div class="pt"><nav><strong>${esc(CUSTOMER.name)}</strong><span>Uusi työtilaus</span><span>Työraportit</span><span class="on">Laitteet</span><span>Huoltopöytäkirjat</span><span>Tarjoukset</span></nav>
  <section><h2>Laitteet</h2><table><thead><tr><th>Laite</th><th>Sijainti</th><th>Viimeisin huolto</th><th>Tila</th></tr></thead><tbody>
  ${row(['ILP-B7 · Ilmalämpöpumppu', 'As. B 7', '15.9.2026', 'OK'])}${row(['IVK-1 · Ilmanvaihtokone', 'Ullakko', '2.6.2026', 'OK'])}${row(['LJH-1 · Lämmönjako', 'Kellari', '28.4.2026', 'Huomio'])}
  </tbody></table>
  <h2>Työraportit</h2><table><thead><tr><th>Päivä</th><th>Työ</th><th>Tila</th></tr></thead><tbody>
  ${row(['15.9.2026', 'Ilmalämpöpumpun vaihto', 'Valmis'])}${row(['2.6.2026', 'IV-koneen suodatinvaihto', 'Valmis'])}
  </tbody></table>
  <h2>Uusi työtilaus</h2><table><tbody>${row(['Kohde', `${CUSTOMER.name}, ${CUSTOMER.address}`])}${row(['Kuvaus', 'Esim. laite ei lämmitä'])}</tbody></table>
  </section></div></body></html>`;
}

const builders = { tyoraportti: workReport, huoltopoytakirja: ilp, laitekortti: equipmentCard, asiakasportaali: portal, tarjoukset: quotes };
fs.rmSync(OUT, { recursive: true, force: true });
for (const p of PAGES) {
  const html = page(p, builders[p.slug]());
  if (/supabase\.co/i.test(html)) throw new Error(`${p.slug}: supabase-viittaus`);
  fs.mkdirSync(path.join(OUT, p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.slug, 'index.html'), html);
}
fs.writeFileSync(path.join(OUT, 'index.html'), page({ slug: '', nav: '', title: 'Esittely – BestCool', h1: 'BestCool-esittely', desc: 'Esimerkit sovelluksen näkymistä ja tulosteista.' },
  `<ul style="font-family:system-ui;font-size:18px;line-height:2">${PAGES.map((x) => `<li><a href="/esittely/${x.slug}/">${esc(x.nav)}</a> – ${esc(x.desc)}</li>`).join('')}</ul>`));
console.log(`esittely: ${PAGES.length + 1} sivua → public/esittely`);
