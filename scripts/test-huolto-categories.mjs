import assert from 'node:assert/strict';
import { buildMainNav } from '../src/lib/mainNav.ts';
import '../src/lib/workReportBilling.ts';
import {
  huoltoAccess,
  legacyHuoltoSettings,
  newHuoltoReportHref,
  parseHuoltoSettings,
  reportCategoryOf,
  reportTypeKeyOf,
  reportTypeListLabel,
  serializeHuoltoSettings,
} from '../src/lib/huoltoCategories.ts';
import {
  airflowDeviationPercent,
  checklistFindings,
  checklistSummary,
  createEmptyChecklistReport,
  derivedItemValues,
  ltoEfficiencyPercent,
  normalizeChecklistReport,
  parseMeasurement,
} from '../src/lib/huoltoChecklist/logic.ts';
import { CHECKLIST_TEMPLATES } from '../src/lib/huoltoChecklist/templates.ts';
import { generateChecklistPrintHtml } from '../src/lib/huoltoChecklist/printHtml.ts';
import {
  buildHuoltoDailyLogs,
  buildHuoltoWorkReportPayload,
  huoltoPriceDefaults,
  huoltoTransferTotal,
  parseEuroInput,
} from '../src/lib/huoltoWorkReportTransfer.ts';

// --- Asetukset ---
// Vanha yritys (ei huolto-avainta): kylmä päällä, uudet lajit pois.
const legacy = huoltoAccess(parseHuoltoSettings({ address: 'x' }));
assert.equal(legacy.moduleEnabled, true);
assert.deepEqual(legacy.enabledCategories, ['kylma']);
assert.equal(legacy.isTypeEnabled('lämpöpumppu'), true);
assert.equal(legacy.isTypeEnabled('lvi'), false);
assert.equal(newHuoltoReportHref(legacy), '/huoltoraportit/uusi');
assert.equal(newHuoltoReportHref(legacy, 'customerId=1'), '/huoltoraportit/uusi?customerId=1');

// Uusi yritys (trigger): moduuli pois.
const fresh = huoltoAccess(parseHuoltoSettings({ huolto: { enabled: false, types: {} } }));
assert.equal(fresh.moduleEnabled, false);
assert.deepEqual(fresh.enabledCategories, []);

// Moduuli päällä ilman lajeja = ei käytössä.
assert.equal(huoltoAccess(parseHuoltoSettings({ huolto: { enabled: true, types: {} } })).moduleEnabled, false);

// Vain LVI → suoraan LVI-lomakkeeseen; useampi laji → valinta.
const onlyLvi = huoltoAccess(parseHuoltoSettings({ huolto: { enabled: true, types: { lvi: { enabled: true } } } }));
assert.equal(newHuoltoReportHref(onlyLvi, '?equipmentId=e'), '/huoltoraportit/uusi/lvi?equipmentId=e');
const mixed = huoltoAccess(parseHuoltoSettings({ huolto: { enabled: true, types: { pakastin: { enabled: true }, sahko: { enabled: true } } } }));
assert.deepEqual(mixed.enabledCategories, ['kylma', 'sahko']);
assert.deepEqual(mixed.enabledKylmaTypes, ['pakastin']);
assert.equal(newHuoltoReportHref(mixed), '/huoltoraportit/valitse');
// Moduulikytkin pois piilottaa kaiken, vaikka lajit päällä.
assert.equal(huoltoAccess(parseHuoltoSettings({ huolto: { enabled: false, types: { lvi: { enabled: true } } } })).moduleEnabled, false);

// Hinnat: pyöristys 2 desimaaliin, pilkku hyväksytään, negatiivinen/virheellinen → null.
const ser = serializeHuoltoSettings({ enabled: true, types: { lvi: { enabled: true, price: '149,555', hourly: -5 }, iv: { enabled: true, price: 'abc' } } });
assert.equal(ser.types.lvi.price, 149.56);
assert.equal(ser.types.lvi.hourly, null);
assert.equal(ser.types.iv.price, null);
assert.equal(ser.types.sahko.enabled, false);
assert.deepEqual(parseHuoltoSettings({ huolto: ser }), ser);
assert.deepEqual(huoltoPriceDefaults(ser, 'lvi'), { price: 149.56, hourly: 0 });
assert.equal(Object.values(legacyHuoltoSettings().types).filter((t) => t.enabled).length, 9);

// Raportin laji
assert.equal(reportCategoryOf({ laiteTyyppi: 'pakastin' }), 'kylma');
assert.equal(reportCategoryOf({ reportCategory: 'iv' }), 'iv');
assert.equal(reportTypeKeyOf({ laiteTyyppi: 'pakastin' }), 'pakastin');
assert.equal(reportTypeKeyOf({ reportCategory: 'sahko' }), 'sahko');
assert.equal(reportTypeListLabel({ reportCategory: 'lvi' }), 'LVI-huolto');

// --- Tarkastuslistat ---
for (const key of ['lvi', 'iv', 'sahko']) {
  const t = CHECKLIST_TEMPLATES[key];
  const ids = t.sections.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length, `${key}: kohde-id:t uniikkeja`);
  const mids = t.sections.flatMap((s) => s.items.flatMap((i) => (i.measurements ?? []).map((m) => m.id)));
  assert.equal(new Set(mids).size, mids.length, `${key}: mittaus-id:t uniikkeja`);
}

assert.equal(parseMeasurement('12,5'), 12.5);
assert.equal(parseMeasurement(' -3 '), -3);
assert.equal(parseMeasurement('abc'), null);
assert.equal(parseMeasurement(''), null);

const lvi = createEmptyChecklistReport('lvi', new Date('2026-10-17T10:00:00'));
assert.equal(lvi.tarkastusPvm, '2026-10-17');
assert.equal(checklistSummary(lvi).overall, 'empty');
lvi.items.lkv_meno = { status: 'ok', comment: '', photos: [] };
lvi.items.vuodot = { status: 'ok', comment: '', photos: [] };
assert.equal(checklistSummary(lvi).overall, 'ok');
// Legionellaraja: 52 °C < 55 °C → huomautus, vaikka merkitty OK.
lvi.measurements.lkv_meno_c = '52';
let f = checklistFindings(lvi);
assert.equal(f.length, 1);
assert.equal(f[0].status, 'huom');
assert.equal(f[0].fromMeasurement, true);
assert.match(f[0].comment, /52 °C \(raja ≥ 55 °C\)/);
let s = checklistSummary(lvi);
assert.equal(s.overall, 'huom');
assert.equal(s.ok, 1);
assert.equal(s.huom, 1);
assert.equal(s.total, s.ok + s.huom + s.vika + s.na);
lvi.measurements.lkv_kaluste_c = '58';
assert.equal(checklistFindings(lvi).length, 1, 'alue 50–65 °C sisällä');
lvi.items.vuodot = { status: 'vika', comment: 'Vuoto LKV-kierrossa', photos: [] };
s = checklistSummary(lvi);
assert.equal(s.overall, 'vika');
assert.equal(s.vika, 1);
assert.equal(s.ok, 0);

// Sähkö: käyttäjän huomautus + raja-arvon vika → vika.
const el = createEmptyChecklistReport('sahko');
el.items.eristys = { status: 'huom', comment: 'Tarkista', photos: [] };
el.measurements.eristys_mohm = '0,5';
f = checklistFindings(el);
assert.equal(f[0].status, 'vika');
assert.match(f[0].comment, /^Tarkista · /);
// Ryhmätaulukko: riso < 1 MΩ ja RCD > 300 ms → viat.
const el2 = createEmptyChecklistReport('sahko');
el2.circuits = [
  { id: 'a', keskus: 'RK1', ryhma: '3', suoja: 'C16', riso: '>500', zs: '0,8', rcdMs: '25' },
  { id: 'b', keskus: 'RK1', ryhma: '4', suoja: 'C16', riso: '0,4', zs: '', rcdMs: '320' },
];
f = checklistFindings(el2);
assert.equal(f.length, 2);
assert.ok(f.every((x) => x.status === 'vika' && x.label === 'RK1 / 4'));
assert.equal(checklistSummary(el2).overall, 'vika');
el2.measurements.rcd_ms = '300';
assert.equal(checklistFindings(el2).length, 2, '300 ms on vielä sallittu');

// IV: LTO-lämpötilasuhde ja ilmamäärän poikkeama.
assert.equal(ltoEfficiencyPercent({ lto_ulko_c: '-5', lto_tulo_c: '15', lto_poisto_c: '21' }), 77); // 20/26
assert.equal(ltoEfficiencyPercent({ lto_ulko_c: '18', lto_tulo_c: '19', lto_poisto_c: '21' }), null);
assert.equal(airflowDeviationPercent('180', '200'), -10);
assert.equal(airflowDeviationPercent('230', '200'), 15);
assert.equal(airflowDeviationPercent('230', '0'), null);
assert.deepEqual(derivedItemValues('ilmamaara_tulo', { tulo_ls: '230', tulo_suunn_ls: '200' }), ['Poikkeama suunnitellusta +15 %']);
assert.deepEqual(derivedItemValues('lto', { lto_ulko_c: '-5', lto_tulo_c: '15', lto_poisto_c: '21' }), ['Lämpötilasuhde 77 %']);

// Normalisointi: roskadata ei kaada.
const norm = normalizeChecklistReport({ items: { x: 'bad', lto: { status: 'vika' } }, measurements: { a: 5 }, circuits: 'no' }, 'iv');
assert.equal(norm.reportCategory, 'iv');
assert.equal(norm.items.lto.status, 'vika');
assert.ok(Array.isArray(norm.circuits));

// --- Tuloste ---
lvi.asiakas = 'As Oy Testi';
lvi.toimenpiteet = 'Nosta LKV-lämpötilaa.';
lvi.suorittajaNimi = 'Matti Huoltaja';
const html = generateChecklistPrintHtml(lvi, { companyName: 'BestCool', imageUrls: {} });
assert.match(html, /LVI-huoltoraportti/);
assert.match(html, /Vikoja havaittu/);
assert.match(html, /Vuoto LKV-kierrossa/);
assert.match(html, /Nosta LKV-lämpötilaa\./);
assert.match(html, /Matti Huoltaja/);
assert.ok(!html.includes('Lattiakaivot'), 'Ei kuulu -rivit ilman arvoja jätetään pois');
assert.equal((html.match(/Vuoto LKV-kierrossa/g) ?? []).length, 1, 'havainto ei toistu');
const elHtml = generateChecklistPrintHtml(el2, { companyName: 'BestCool', imageUrls: {} });
assert.match(elHtml, /Sähkötarkastusraportti/);
assert.match(elHtml, /SFS 6000/);
assert.match(elHtml, /RK1/);

// --- Työraporttiin siirto ---
assert.equal(parseEuroInput('149,50'), 149.5);
assert.equal(parseEuroInput('-1'), 0);
assert.equal(parseEuroInput(''), 0);
assert.equal(huoltoTransferTotal({ price: 149.5, hours: 1.5, hourlyRate: 62 }), 242.5);
assert.equal(huoltoTransferTotal({ price: 0, hours: 2, hourlyRate: 0 }), 0);

const input = {
  report: { id: 'r1', owner_company_id: 'own', branding_company_id: null, partnership_id: null, customer_id: 'c1', equipment_id: 'e1', subscriber_id: null },
  customerName: 'As Oy Testi',
  typeLabel: 'LVI-huolto',
  deviceLabel: 'Lämmönjakohuone',
  price: 200,
  hours: 1.5,
  hourlyRate: 62,
  logDate: '2026-10-17',
  done: true,
  sessionUserId: 'u1',
  creatorCompanyId: 'own',
};
const payload = buildHuoltoWorkReportPayload(input);
assert.equal(payload.status, 'completed');
assert.ok(payload.completed_at);
assert.equal(payload.branding_company_id, 'own');
assert.equal(payload.customer_id, 'c1');
assert.equal(payload.equipment_id, 'e1');
assert.equal(buildHuoltoWorkReportPayload({ ...input, done: false }).completed_at, null);

const logs = buildHuoltoDailyLogs(input, 'wr1');
assert.equal(logs.length, 2);
assert.equal(logs[0].entry_type, 'fixed_price');
assert.equal(logs[0].customer_fixed_price_amount, 200);
assert.equal(logs[0].fixed_price_amount, 180); // kumppanin osuus 90 %
assert.equal(logs[0].partner_urakka_margin_percent, 10);
assert.equal(logs[0].commission_amount, 0);
assert.equal(logs[1].entry_type, 'regular');
assert.equal(logs[1].hours_regular, 1.5);
assert.equal(logs[1].customer_hourly_rate_override, 62);
assert.ok(logs.every((l) => l.work_report_id === 'wr1' && l.log_date === '2026-10-17'));
const onlyHours = buildHuoltoDailyLogs({ ...input, price: 0, hourlyRate: 0 }, 'wr1');
assert.equal(onlyHours.length, 1);
assert.equal(onlyHours[0].customer_hourly_rate_override, null);

// --- Sivuvalikko ---
const navBase = { license: null, billingModuleEnabled: true, partnershipsEnabled: true, role: 'admin', isGlobalAdmin: false, globalAdminMode: false };
const navHas = (huolto) => buildMainNav({ ...navBase, huolto }).some((i) => i.key === 'maintenance');
assert.equal(navHas(undefined), true, 'ennen latausta ei piiloteta');
assert.equal(navHas(null), true);
assert.equal(navHas(legacy), true);
assert.equal(navHas(fresh), false);
const newChild = buildMainNav({ ...navBase, huolto: mixed }).find((i) => i.key === 'maintenance').children.find((c) => c.label === 'Uusi huoltoraportti');
assert.equal(newChild.href, '/huoltoraportit/valitse');

console.log('huolto-categories: OK');
