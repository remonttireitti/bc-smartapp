import assert from 'node:assert/strict';
import { estimateMonthly, grossOf, parsePriceList, vatOf, devicesMonthly } from '../supabase/functions/_shared/companySignupCore.ts';
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
  'Tarjoukset', 'Laskutus', 'Etäseuranta', 'Laite: JC3248-näyttölaite', 'Laite: ESP32 + DS18B20', 'Laite: Muu lämpötilalaite', 'Työkalut', 'Kumppanuudet',
]);
assert.equal(PRICE_ROWS.find((r) => r.key === 'module:billing').description, 'Laskettavat summat asiakkaalle ja kumppanien kesken — ei laskujen lähetystä');
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
