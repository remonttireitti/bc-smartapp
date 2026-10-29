// Laiterivin ⋯-valikko: Tulosta QR-tarra (60×24 mm); laitekortin QR-osio edelleen näkyvissä. Supabase mockattu, ei oikeita kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5306 & BASE=http://localhost:5306 node scripts/e2e-row-qr.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5306';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const TOKEN = 'Zk3Jq9XcVbN2mLp0RtYu7WsEaD4fGhJk8QzXcVbN2mL';
const mk = (i, name, tag, token) => ({ id: `00000000-0000-4000-8000-0000000000e${i}`, customer_id: customer.id, owner_company_id: cid, name, tag, model: 'M', serial_number: null, location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: token, created_at: '2026-01-01T00:00:00Z', huolto_technical_snapshot: {}, notes: null });
const devices = [mk(1, 'Kylmiö A', 'KA-1', TOKEN), mk(2, 'Kylmiö B', 'KB-2', null)];
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch(); const checks = {}; const SHORT = /^[A-Z2-9]{8}$/;
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki', permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => {
  window.print = () => {}; window.close = () => {};
  const orig = window.open.bind(window);
  window.open = (...a) => { const w = orig(...a); if (w) { const dw = w.document.write.bind(w.document); w.document.write = (h) => { (window.__prints ||= []).push(String(h)); return dw(h); }; } return w; };
});
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const patches = [], otherWrites = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  const isEq = u.pathname.endsWith('/equipment');
  if (isEq && req.method() === 'PATCH') {
    const body = JSON.parse(req.postData() || '{}'); const id = (u.searchParams.get('id') || '').replace('eq.', '');
    patches.push({ id, body }); const d = devices.find((x) => x.id === id); if (d && 'public_qr_token' in body) d.public_qr_token = body.public_qr_token;
    return json(single ? d : [{ id }]);
  }
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { otherWrites.push(req.method() + ' ' + u.pathname); return json(single ? {} : []); }
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
  if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
  if (isEq) {
    const raw = u.searchParams.get('id') || ''; const id = raw.startsWith('eq.') ? raw.slice(3) : null; const inIds = raw.startsWith('in.') ? raw.slice(4).replace(/[()]/g, '').split(',') : null;
    const l = id ? devices.filter((d) => d.id === id) : inIds ? devices.filter((d) => inIds.includes(d.id)) : devices;
    return json(single ? l[0] ?? null : l);
  }
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/asiakkaat/${customer.id}`); await p.waitForTimeout(6000);
const vis = '.keep-alive-panel:not([hidden])';
const root = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
await root.getByText(/Laitteet \(2\)/).first().click(); await p.waitForTimeout(1200);
const popupHtml = async (action) => {
  const before = await p.evaluate(() => (window.__prints || []).length);
  await action();
  await p.waitForTimeout(2500);
  const all = await p.evaluate(() => window.__prints || []);
  for (const pg of ctx.pages()) if (pg !== p) await pg.close().catch(() => null);
  await p.bringToFront();
  return all.length > before ? all[all.length - 1] : null;
};
const menuOf = (name) => root.locator('tr', { hasText: name }).first().locator('.row-action-menu-btn');
// Laite A: token olemassa
await menuOf('Kylmiö A').click(); await p.waitForTimeout(200);
const items = await p.locator('.row-action-menu-panel [role=menuitem]').allInnerTexts();
checks['valikossa Tulosta QR-tarra'] = items.includes('Tulosta QR-tarra');
const htmlA = await popupHtml(() => p.getByRole('menuitem', { name: 'Tulosta QR-tarra' }).click());
checks['A: tulostusikkuna avautui 60×24 mm'] = !!htmlA && /size:\s*60mm 24mm/.test(htmlA);
checks['A: tunnus KA-1 ja teksti tarrassa'] = !!htmlA && htmlA.includes('KA-1') && htmlA.includes('ylläpitää BC Smartapp');
checks['A: token ei muuttunut, ei PATCH'] = patches.length === 0;
// Laite B: ei tokenia → lyhyt koodi luodaan ilman vahvistusta
let dlgMsg = '';
p.on('dialog', (d) => { dlgMsg = d.message(); d.accept(); });
await menuOf('Kylmiö B').click(); await p.waitForTimeout(200);
const htmlB = await popupHtml(() => p.getByRole('menuitem', { name: 'Tulosta QR-tarra' }).click());
checks['B: ei vahvistusdialogia yhdelle laitteelle'] = dlgMsg === '';
checks['B: public_qr_token tallennettu (lyhyt 8 merkkiä)'] = patches.length === 1 && patches[0].id === devices[1].id && SHORT.test(patches[0].body.public_qr_token || '');
checks['B: tarra tulostui (KB-2)'] = !!htmlB && htmlB.includes('KB-2');
const codeB = patches[0]?.body.public_qr_token;
// Rivivalikko: Kopioi QR-linkki (vanha pitkä token säilyy)
await menuOf('Kylmiö A').click(); await p.waitForTimeout(200);
await p.getByRole('menuitem', { name: 'Kopioi QR-linkki' }).click(); await p.waitForTimeout(600);
checks['A: kopioitu vanha pitkä linkki'] = (await p.evaluate(() => navigator.clipboard.readText())) === `https://bestcool.eu/q/${TOKEN}`;
await menuOf('Kylmiö B').click(); await p.waitForTimeout(200);
await p.getByRole('menuitem', { name: 'Kopioi QR-linkki' }).click(); await p.waitForTimeout(600);
checks['B: kopioitu lyhyt linkki'] = (await p.evaluate(() => navigator.clipboard.readText())) === `https://bestcool.eu/q/${codeB}`;
checks['B: kopiointi ei luo uutta koodia'] = patches.length === 1;
// Laitekortin QR-osio
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${devices[0].id}`); await p.waitForTimeout(5500);
const root2 = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
const panel = root2.getByTestId('device-qr-panel');
checks['laitekortti: QR-osio näkyy'] = (await panel.count()) === 1;
checks['laitekortti: Tulosta QR-tarra / PNG / PDF'] = (await panel.getByRole('button', { name: 'Tulosta QR-tarra' }).count()) === 1 && (await panel.getByRole('button', { name: 'Lataa PNG' }).count()) === 1 && (await panel.getByRole('button', { name: 'Lataa PDF' }).count()) === 1;
const urlInput = panel.getByTestId('device-qr-url');
checks['laitekortti: linkki näkyvissä tekstinä'] = (await urlInput.inputValue()) === `https://bestcool.eu/q/${TOKEN}`;
await panel.getByRole('button', { name: 'Kopioi linkki' }).click(); await p.waitForTimeout(500);
checks['laitekortti: Kopioi linkki'] = (await p.evaluate(() => navigator.clipboard.readText())) === `https://bestcool.eu/q/${TOKEN}`;
checks['laitekortti: Vaihda lyhyeen linkkiin tarjolla vanhalle'] = (await panel.getByRole('button', { name: 'Vaihda lyhyeen linkkiin' }).count()) === 1;
checks['ei muita kirjoituksia'] = otherWrites.length === 0;
checks['ei sivuvirheitä'] = errs.length === 0;
console.log(checks);
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
