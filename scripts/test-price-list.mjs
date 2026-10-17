import assert from 'node:assert/strict';
import { BASE_PACKAGE_DESCRIPTION, estimateMonthly, grossOf, parsePriceList, vatOf, devicesMonthly } from '../supabase/functions/_shared/companySignupCore.ts';
import { PRICE_GROUPS, PRICE_ROWS, applyDraft, eurInput, parseEurInput, priceListPayload } from '../src/lib/priceListAdmin.ts';

// Tuotannon license_catalog (2026-10-17).
const row = {
  trial_days: 30, base_monthly_eur: '49.00',
  module_prices: { tools: 10, quotes: 10, billing: 10, partners: 10, remote_monitoring: 30 },
  temp_device_monthly_prices: { jc3248: 5, default: 5, esp32_ds18b20: 5 },
  role_prices: { admin: 0, manager: 15, technician: 10 },
  huolto_prices: { iv: 10, lvi: 10, kylma: 10, sahko: 10 },
};
const p = parsePriceList(row);
assert.equal(p.trial_days, 30);
assert.deepEqual(p.device_prices, { jc3248: 5, esp32_ds18b20: 5, default: 5 });

// Ryhmät ja rivit: kaikki hinnat yhdessä, ei duplikaatteja.
assert.deepEqual(PRICE_GROUPS.map((g) => g.title), ['Peruspaketti', 'Moduulit', 'Huoltoraportit', 'Käyttäjät']);
assert.equal(new Set(PRICE_ROWS.map((r) => r.key)).size, PRICE_ROWS.length);
assert.deepEqual(PRICE_ROWS.filter((r) => r.group === 'moduulit').map((r) => r.label), [
  'Tarjoukset', 'Laskutus', 'Etäseuranta', 'Laitemaksu: JC3248-näyttölaite', 'Laitemaksu: ESP32 + DS18B20', 'Laitemaksu: Muu lämpötilalaite', 'Varasto', 'Työkalut', 'Kumppanuudet',
]);
assert.equal(PRICE_ROWS.find((r) => r.key === 'module:billing').description, 'Laskettavat summat asiakkaalle ja kumppanien kesken — ei laskujen lähetystä');
assert.equal(PRICE_ROWS.find((r) => r.key === 'base').description, BASE_PACKAGE_DESCRIPTION);
assert.ok(!/varasto/i.test(BASE_PACKAGE_DESCRIPTION));
for (const w of ['Työraportit', 'laiterekisteri', 'tilaajaportaali', 'käyttäjähallinta']) assert.ok(BASE_PACKAGE_DESCRIPTION.includes(w), w);
assert.equal(PRICE_ROWS.filter((r) => r.group === 'huolto').length, 4);
assert.equal(PRICE_ROWS.filter((r) => r.group === 'kayttajat').length, 3);

// Syöte
assert.equal(parseEurInput('12,5'), 12.5);
assert.equal(parseEurInput('49.99'), 49.99);
assert.equal(parseEurInput('1 000,00'), 1000);
assert.equal(parseEurInput('-1'), null);
assert.equal(parseEurInput('1,234'), null);
assert.equal(parseEurInput(''), null);
assert.equal(eurInput(49), '49,00');

// Luonnos → hinnasto → RPC-parametri
const draft = Object.fromEntries(PRICE_ROWS.map((r) => [r.key, eurInput(r.get(p))]));
draft['module:partners'] = '7,77';
draft['role:manager'] = '15,55';
const res = applyDraft(p, draft, '14');
assert.ok('prices' in res);
const payload = priceListPayload(res.prices);
assert.equal(payload.trial_days, 14);
assert.equal(payload.module_prices.partners, 7.77);
assert.equal(payload.role_prices.manager, 15.55);
assert.deepEqual(Object.keys(payload).sort(), ['base_monthly_eur', 'huolto_prices', 'module_prices', 'role_prices', 'temp_device_monthly_prices', 'trial_days']);
assert.deepEqual(applyDraft(p, { ...draft, base: 'x' }, '14'), { error: 'Tarkista hinta: Peruspaketti' });
assert.deepEqual(applyDraft(p, draft, '0'), { error: 'Kokeilujakso 1–365 päivää' });

// ALV sentilleen (PostgreSQL round): 49,99 → 12,75 → 62,74
assert.equal(vatOf(49.99), 12.75);
assert.equal(grossOf(49.99), 62.74);
assert.equal(grossOf(0), 0);

// Laitemaksut: tyyppi tai oletus
assert.equal(devicesMonthly({ jc3248: 2, unknown_type: 1 }, { ...p, device_prices: { jc3248: 6.5, esp32_ds18b20: 5, default: 4.25 } }), 17.25);

// Sama kuin tuotannon company_monthly_price_breakdown (kuivaharjoitus 17.10.2026, hinnat muutettu):
// Kevytyrittäjä (vanha sopimus, kaikki moduulit, 1 JC3248-laite, kaikki huoltolajit, 1 ylläpitäjä) = 166,75 + 42,52 = 209,27
const changed = parsePriceList({
  ...row, base_monthly_eur: 49.99,
  module_prices: { ...row.module_prices, quotes: 12.5, partners: 7.77 },
  huolto_prices: { ...row.huolto_prices, lvi: 9.99 },
  temp_device_monthly_prices: { ...row.temp_device_monthly_prices, jc3248: 6.5 },
});
const kevyt = estimateMonthly({
  base: true,
  modules: { quotes: true, billing: true, remote_monitoring: true, tools: true, partners: true },
  huolto: { kylma: true, lvi: true, iv: true, sahko: true },
  users: [{ roles: ['admin'] }],
  devices: { jc3248: 1 },
}, changed);
assert.deepEqual([kevyt.net, kevyt.vat, kevyt.gross], [166.75, 42.52, 209.27]);
assert.deepEqual(kevyt.lines.map((l) => l.key), [
  'base', 'module:quotes', 'module:billing', 'module:remote_monitoring', 'devices', 'module:tools', 'module:partners',
  'huolto:kylma', 'huolto:lvi', 'huolto:iv', 'huolto:sahko', 'role:admin',
]);
console.log('test-price-list OK');

// --- Varasto-moduuli: taaksepäin yhteensopiva ennen varasto_module.sql-ajoa ---
import { MODULE_DESCRIPTIONS, MODULE_NOTES, HUOLTO_DESCRIPTIONS, STAFF_ROLE_DESCRIPTIONS, offeredAddonModules, deviceFromPrice } from '../supabase/functions/_shared/companySignupCore.ts';
import { isLicenseModuleAccessible, licenseModuleForPath, parseCompanyLicenseSnapshot, offeredLicenseAddonModules, LICENSE_MODULE_DESCRIPTIONS } from '../src/lib/companyLicense.ts';
assert.equal(p.inventory_priced, false);
assert.ok(!offeredAddonModules(p).includes('inventory'));
assert.equal(priceListPayload(p).module_prices.inventory, undefined, 'ei lähetetä ennen SQL:ää');
const pInv = parsePriceList({ ...row, module_prices: { ...row.module_prices, inventory: 10 } });
assert.equal(pInv.inventory_priced, true);
assert.ok(offeredAddonModules(pInv).includes('inventory'));
assert.equal(priceListPayload(pInv).module_prices.inventory, 10);
// Laskun rivijärjestys = SQL: Etäseuranta (+laitteet), Varasto, Työkalut
const inv = estimateMonthly({ base: false, modules: { remote_monitoring: true, inventory: true, tools: true }, huolto: {}, users: [], devices: { jc3248: 1 } }, pInv);
assert.deepEqual(inv.lines.map((l) => l.key), ['module:remote_monitoring', 'devices', 'module:inventory', 'module:tools']);
assert.equal(inv.net, 55);
// Gating: /varasto → inventory; snapshot ilman avainta → peruspaketin mukaan.
assert.equal(licenseModuleForPath('/varasto'), 'inventory');
const snapOld = parseCompanyLicenseSnapshot({ enrollment: 'subscription', effective_status: 'active', base_active: true, modules: { tools: false } });
assert.equal(isLicenseModuleAccessible(snapOld, 'inventory'), true);
const snapOldNoBase = parseCompanyLicenseSnapshot({ enrollment: 'subscription', effective_status: 'active', base_active: false, modules: {} });
assert.equal(isLicenseModuleAccessible(snapOldNoBase, 'inventory'), false);
const snapNew = parseCompanyLicenseSnapshot({ enrollment: 'subscription', effective_status: 'active', base_active: true, modules: { inventory: false } });
assert.equal(isLicenseModuleAccessible(snapNew, 'inventory'), false);
assert.equal(isLicenseModuleAccessible(parseCompanyLicenseSnapshot({ ...snapNew, modules: { inventory: true } }), 'inventory'), true);
assert.ok(!offeredLicenseAddonModules({ module_prices: { tools: 10 } }).includes('inventory'));
assert.ok(offeredLicenseAddonModules({ module_prices: { inventory: 10 } }).includes('inventory'));
// Yksi lähde kuvauksille
assert.equal(MODULE_DESCRIPTIONS.inventory, 'Materiaalit ja kylmäaine, saldot linkitettynä työraportteihin ja hinnoitteluun');
assert.equal(BASE_PACKAGE_DESCRIPTION, 'Työraportit ja toimeksiannot, asiakkaat ja laiterekisteri, tilaajaportaali sekä yritys- ja käyttäjähallinta');
assert.equal(MODULE_DESCRIPTIONS.remote_monitoring, 'Lämpötila, kosteus, paine, valaistus, NO/NC-tilatiedot, 0–10 V, jännitteet ja sähkönkulutus — hälytykset, trendit ja etäohjaus');
assert.equal(MODULE_NOTES.remote_monitoring, 'Vaatii seurattavan laitteen tilauksen (alkaen 25,00 € / laite + toimitus, hinta mittauskohteiden mukaan)');
assert.ok(PRICE_ROWS.filter((r) => r.key.startsWith('device:')).every((r) => r.note.includes('alkaen 25,00 € / laite + toimitus') && r.label.startsWith('Laitemaksu')));
for (const k of ['quotes', 'billing', 'remote_monitoring', 'inventory', 'tools']) assert.equal(LICENSE_MODULE_DESCRIPTIONS[k], MODULE_DESCRIPTIONS[k], k);
for (const r of PRICE_ROWS.filter((x) => x.key.startsWith('module:'))) assert.equal(r.description, MODULE_DESCRIPTIONS[r.key.slice(7)]);
for (const r of PRICE_ROWS.filter((x) => x.key.startsWith('huolto:'))) assert.equal(r.description, HUOLTO_DESCRIPTIONS[r.key.slice(7)]);
for (const r of PRICE_ROWS.filter((x) => x.key.startsWith('role:'))) assert.equal(r.description, STAFF_ROLE_DESCRIPTIONS[r.key.slice(5)]);
for (const d of [...Object.values(MODULE_DESCRIPTIONS), ...Object.values(HUOLTO_DESCRIPTIONS), ...Object.values(STAFF_ROLE_DESCRIPTIONS)]) assert.ok(d.length <= 140, d);
assert.equal(deviceFromPrice({ device_prices: { jc3248: 7, esp32_ds18b20: 5, default: 6 } }), 5);
console.log('test-price-list varasto OK');
