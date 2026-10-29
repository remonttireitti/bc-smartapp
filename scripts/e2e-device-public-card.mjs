// QR-sivu /q/:token: julkinen lista, ei kirjautumista eikä muokkausta. Funktiovastaus mockattu, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5302 & BASE=http://localhost:5302 node scripts/e2e-device-public-card.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5302';
const TOKEN = 'A'.repeat(43), BAD = 'B'.repeat(43);
const card = {
  device: { tag: 'JK-1', name: 'JK-1', model: 'SRC80', manufacturer: 'Mitsubishi', refrigerant: 'R-410A', chargeKg: 3.5, gwp: null, owner: 'Messukeskus', address: 'Messuaukio 1, 00521 Helsinki', location: 'Serverihuone' },
  rows: [
    { id: 'a', date: '2026-10-27', type: 'Huolto', installer: 'Enn Kotselainen', tukes: '538/91/2015', text: 'Huolto, vuototarkastus' },
    { id: 'b', date: '2026-04-05', type: 'Korjaus', installer: 'Matti M', tukes: null, text: 'Vaihdettu puhallin' },
    { id: 'c', date: '2025-12-01', type: 'Merkintä', installer: 'UKH', tukes: null, text: 'Hälytys tarkistettu' },
  ],
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const calls = []; const other = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url());
  if (u.pathname.endsWith('/functions/v1/device-public-card')) {
    const body = JSON.parse(req.postData() || '{}'); calls.push({ method: req.method(), hasUserJwt: false, token: body.token, action: body.action });
    const variant = { BIG: { chargeKg: 46 }, NOAMT: { chargeKg: null }, NOGWP: { refrigerant: 'Tuntematon-X' } }[body.token];
    if (variant) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...card, device: { ...card.device, ...variant } }) });
    if (body.token === TOKEN) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(card) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'not_found' }) });
  }
  if (req.method() !== 'GET') other.push(req.method() + ' ' + u.pathname);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const checks = {};
await p.goto(`${BASE}/q/${TOKEN}`); await p.waitForSelector('[data-testid=device-public-card]', { timeout: 15000 });
const text = await p.locator('[data-testid=device-public-card]').innerText();
checks.title = (await p.getByTestId('device-public-title').innerText()) === 'JK-1';
checks.model = (await p.getByTestId('device-public-model').innerText()).includes('Mitsubishi SRC80');
const ref = await p.getByTestId('device-public-refrigerant').innerText();
checks.refrigerant = /R-410A/.test(ref) && /3,5 kg/.test(ref) && /7,3 t CO2e/.test(ref) && !/GWP/.test(ref);
checks.owner = (await p.getByTestId('device-public-owner').innerText()).includes('Messukeskus');
checks.address = /Messuaukio 1, 00521 Helsinki/.test(await p.getByTestId('device-public-address').innerText());
const rows = await p.locator('[data-testid=device-public-rows] > li').allInnerTexts();
checks.rowCount = rows.length === 3;
checks.order = rows[0].includes('27.10.2026') && rows[1].includes('5.4.2026') && rows[2].includes('1.12.2025');
checks.row1 = /Enn Kotselainen/.test(rows[0]) && /Tukes 538\/91\/2015/.test(rows[0]) && /Huolto, vuototarkastus/.test(rows[0]);
checks.row2NoTukes = !/Tukes/.test(rows[1]) && /Vaihdettu puhallin/.test(rows[1]);
checks.noLoginUi = !/Kirjaudu|Tilaa asiakasportaali|Liity sovellukseen|\+ Merkintä/i.test(text) && (await p.locator('input, textarea, select, form').count()) === 0;
checks.noDocLinks = (await p.locator('[data-testid=device-public-rows] a, [data-testid=device-public-rows] button').count()) === 0;
const link = p.locator('.device-public-footer a');
checks.footer = /Huoltopöytäkirjaa ylläpitää BC Smartapp/.test(await p.locator('.device-public-footer').innerText()) && (await link.getAttribute('href')) === 'https://bestcool.eu';
checks.noPriceOrBusinessId = !/€|y-tunnus|Y-tunnus/.test(text);
checks.noAuthCalls = !(await Promise.resolve(calls.some((c) => c.action))) && calls.length >= 1;
const refOf = async (t) => { await p.goto(`${BASE}/q/${t}`); await p.waitForSelector('[data-testid=device-public-card]', { timeout: 15000 }); return (await p.getByTestId('device-public-refrigerant').innerText()).replace(/\s+/g, ' '); };
const big = await refOf('BIG'); checks.co2eExample = /R-410A · 46 kg · 96,0 t CO2e/.test(big);
const noAmt = await refOf('NOAMT'); checks.noAmountOmitsCo2 = /R-410A/.test(noAmt) && !/CO2e|kg|GWP|NaN|null/.test(noAmt);
const noGwp = await refOf('NOGWP'); checks.noGwpOmitsCo2 = /Tuntematon-X/.test(noGwp) && /3,5 kg/.test(noGwp) && !/CO2e|GWP|NaN|null/.test(noGwp);
await p.goto(`${BASE}/q/${BAD}`); await p.waitForSelector('[data-testid=device-public-invalid]', { timeout: 15000 });
checks.invalid = /Linkki ei ole voimassa/.test(await p.getByTestId('device-public-invalid').innerText());
checks.noWrites = other.length === 0;
checks.noErrors = errs.length === 0;
console.log(JSON.stringify(checks), other, errs.slice(0, 2));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
