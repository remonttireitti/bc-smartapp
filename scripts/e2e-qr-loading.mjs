// /q/:token ja /p/:code: aluksi "Ladataan…", virhe vasta kun palvelin ratkaisevasti vastaa; uusintayritys verkkovirheessä. Supabase mockattu.
// Ajo (Playwright-kansiosta): BASE=http://localhost:5306 node e2e-qr-loading.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5306';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const CYL_ID = '3f9a1c7e-5b2d-4c81-9a0e-7d6f12345678';
const cyl = { id: CYL_ID, company_id: cid, serial_number: 'PULLO-77', bottle_size: '10kg', non_recyclable: false, refrigerant_type: 'R-410A', purchased_kg: 10, remaining_kg: 6.5, capacity_kg: 10, owner_user_id: null, ownership_type: 'own', rental_supplier: null, stock_source: 'purchase', customer_id: null, location: 'Varasto', status: 'in_stock', purchase_date: null, returned_at: null, notes: null, image_path: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', owner_user: null, customer: null };
const card = { device: { tag: 'JK-1', name: 'JK-1', model: 'SRC80', manufacturer: 'Mitsubishi', refrigerant: 'R-410A', chargeKg: 3.5, gwp: null, owner: 'Messukeskus', address: 'Messuaukio 1', location: 'Halli' }, rows: [] };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch(); const checks = {};
const BAD_TEXT = /ei ole voimassa|epäonnistui|ei löytynyt/i;
const watch = () => {
  window.__texts = [];
  const snap = () => { const t = document.body?.innerText || ''; if (t.trim() && window.__texts[window.__texts.length - 1] !== t) window.__texts.push(t); };
  new MutationObserver(snap).observe(document, { childList: true, subtree: true, characterData: true });
  setInterval(snap, 50);
};
async function scenario(name, { authed = false, handler, path, wait }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(watch);
  if (authed) await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  const calls = [];
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/functions/v1/device-public-card')) { calls.push(JSON.parse(req.postData() || '{}').token); return handler(route, calls.length, (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })); }
    if (u.pathname.endsWith('/refrigerant_cylinders') && (u.searchParams.getAll('id') || []).some((v) => v.startsWith('gte.'))) { calls.push('cyl'); return handler(route, calls.length, json); }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) return json(single ? {} : []);
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
    if (u.pathname.endsWith('/refrigerant_cylinders')) return json(single ? cyl : [cyl]);
    return json(single ? null : []);
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}${path}`, { waitUntil: 'commit' });
  await wait(p);
  const texts = await p.evaluate(() => window.__texts);
  await ctx.close();
  return { texts, calls, errs };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 1) Viivästetty onnistuva vastaus (kylmäkäynnistys): ei virhevälähdystä
let r = await scenario('slow', { path: '/q/ABCD2345', handler: async (route, n, json) => { await sleep(4000); return json(card); }, wait: (p) => p.waitForSelector('[data-testid=device-public-card]', { timeout: 20000 }) });
checks['hidas: ei virhetekstiä missään vaiheessa'] = !r.texts.some((t) => BAD_TEXT.test(t));
checks['hidas: Ladataan… näkyi'] = r.texts.some((t) => /Ladataan…/.test(t));
checks['hidas: lyhyt koodi lähti palvelimelle sellaisenaan'] = r.calls[0] === 'ABCD2345';
// 2) Verkkovirhe kerran → uusintayritys onnistuu, ei virhevälähdystä
r = await scenario('netfail', { path: '/q/ABCD2345', handler: async (route, n, json) => (n === 1 ? route.abort('failed') : json(card)), wait: (p) => p.waitForSelector('[data-testid=device-public-card]', { timeout: 20000 }) });
checks['verkkovirhe: toinen yritys onnistui'] = r.calls.length >= 2;
checks['verkkovirhe: ei virhetekstiä'] = !r.texts.some((t) => BAD_TEXT.test(t));
// 3) Yhdyskäytävän 404 (ei not_found-koodia) → ei "ei voimassa"; vasta uusinnan jälkeen virhe + painike
r = await scenario('gw404', { path: '/q/ABCD2345', handler: async (route, n, json) => route.fulfill({ status: 404, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'NOT_FOUND' }), wait: (p) => p.waitForSelector('[data-testid=device-public-retry]', { timeout: 20000 }) });
// Kehityspalvelimen StrictMode ajaa efektin kahdesti → 2 tai 4 kutsua; tuotannossa 2.
checks['yhdyskäytävän 404: uusintayritys tehtiin'] = r.calls.length === 2 || r.calls.length === 4;
checks['yhdyskäytävän 404: ei "ei ole voimassa"'] = !r.texts.some((t) => /ei ole voimassa/i.test(t)) && r.texts.some((t) => /Tietojen haku epäonnistui/.test(t));
// 4) Määrätty not_found → "Linkki ei ole voimassa" vasta vastauksen jälkeen, yksi kutsu
r = await scenario('notfound', { path: '/q/ABCD2345', handler: async (route, n, json) => { await sleep(1500); return json({ code: 'not_found' }, 404); }, wait: (p) => p.waitForSelector('[data-testid=device-public-invalid]', { timeout: 20000 }) });
checks['not_found: ei uusintayritystä'] = r.calls.length <= 2;
const firstBad = r.texts.findIndex((t) => /ei ole voimassa/i.test(t));
checks['not_found: Ladataan… ennen virhettä'] = firstBad > 0 && /Ladataan…/.test(r.texts[firstBad - 1]);
// 5) Pullo /p/: viive + yksi epäonnistunut haku → ei "ei löytynyt" -välähdystä
r = await scenario('cyl', { authed: true, path: '/p/3f9a1c7e', handler: async (route, n, json) => { await sleep(n === 1 ? 800 : 2500); return n === 1 ? json({ message: 'boom' }, 500) : json([cyl]); }, wait: async (p) => { await p.waitForURL(/\/varasto/, { timeout: 25000 }); await p.waitForTimeout(1500); } });
checks['pullo: uusintayritys (2 hakua)'] = r.calls.filter((c) => c === 'cyl').length === 2;
checks['pullo: ei virhetekstiä'] = !r.texts.some((t) => BAD_TEXT.test(t));
checks['pullo: Ladataan… näkyi'] = r.texts.some((t) => /Ladataan…/.test(t));
checks['ei sivuvirheitä'] = r.errs.length === 0;
console.log(checks);
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
