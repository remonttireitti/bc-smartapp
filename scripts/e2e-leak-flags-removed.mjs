// Laitekortti: Vuodonilmaisin/Hermeettinen-kytkimet poistettu; tallennetut arvot säilyvät, vuototarkastusväli vain CO2e:stä. Supabase mockattu, ei oikeita kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5305 & BASE=http://localhost:5305 node scripts/e2e-leak-flags-removed.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5305';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
// R-404A 5 kg = 19,6 t CO2e -> 12 kk. Vanhat liput (true) eivät saa muuttaa väliä (ennen: vuodonilmaisin → 24 kk, hermeettinen < 10 t → ei velvoitetta).
const device = { id: '00000000-0000-4000-8000-0000000000e1', customer_id: customer.id, owner_company_id: cid, name: 'Kylmiö 1', tag: 'K1', model: 'M', serial_number: null, location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: null, created_at: '2026-01-01T00:00:00Z', notes: null,
  huolto_technical_snapshot: { huoltoAsetukset: { huoltovaliKk: 6, gwp: null, vuodonilmaisin: true, hermeettinen: true }, refrigerant: 'R-404A' }, refrigerant: 'R-404A', refrigerant_charge_kg: 5 };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch(); const checks = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki' });
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const patches = [], otherWrites = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  const isEq = u.pathname.endsWith('/equipment');
  if (isEq && req.method() === 'PATCH') { patches.push(JSON.parse(req.postData() || '{}')); return json(single ? device : [{ id: device.id }]); }
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { otherWrites.push(req.method() + ' ' + u.pathname); return json(single ? {} : []); }
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
  if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
  if (isEq) return json(single ? device : [device]);
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${device.id}`); await p.waitForTimeout(5500);
const vis = '.keep-alive-panel:not([hidden])';
const root = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
await root.getByRole('button', { name: 'Muokkaa', exact: true }).first().click(); await p.waitForTimeout(800);
const body = await root.innerText();
checks['ei Vuodonilmaisin-tekstiä'] = !/Vuodonilmaisin/i.test(body);
checks['ei Hermeettinen-tekstiä'] = !/Hermeettinen/i.test(body);
checks['ei kytkimiä lomakkeella'] = (await root.locator('form [role=switch]').count()) === 0;
checks['Vuototarkastus 12 kk (vain CO2e)'] = /CO₂e[^\n]*Vuototarkastus 12 kk/.test(body.replace(/\n/g, ' ')) || /Vuototarkastus 12 kk/.test(body);
await root.getByRole('button', { name: 'Tallenna', exact: true }).first().click(); await p.waitForTimeout(1500);
const snapPatch = patches.find((x) => x.huolto_technical_snapshot);
const a = snapPatch?.huolto_technical_snapshot?.huoltoAsetukset;
checks['tallennus: PATCH tehty'] = !!snapPatch;
checks['tallennus: vanhat arvot koskemattomia (true/true)'] = a?.vuodonilmaisin === true && a?.hermeettinen === true;
checks['tallennus: huoltoväli säilyy 6'] = a?.huoltovaliKk === 6;
checks['ei muita kirjoituksia'] = otherWrites.length === 0;
checks['ei sivuvirheitä'] = errs.length === 0;
console.log(JSON.stringify(a), checks);
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
