// Kylmäainepullon lyhyt linkki /p/<8 hex>: ohjaus, näkyvä linkki + Kopioi linkki (rivi + tiedot), tarra 60×24 mm. Supabase mockattu.
// Ajo (kopioi Playwright-kansioon): BASE=http://localhost:5306 node e2e-cylinder-short-link.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5306';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const CYL_ID = '3f9a1c7e-5b2d-4c81-9a0e-7d6f12345678';
const cyl = { id: CYL_ID, company_id: cid, serial_number: 'PULLO-77', bottle_size: '10kg', non_recyclable: false, refrigerant_type: 'R-410A', purchased_kg: 10, remaining_kg: 6.5, capacity_kg: 10, owner_user_id: null, ownership_type: 'own', rental_supplier: null, stock_source: 'purchase', customer_id: null, location: 'Varasto', status: 'in_stock', purchase_date: null, returned_at: null, notes: null, image_path: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', owner_user: null, customer: null };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch(); const checks = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki', permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => {
  window.print = () => {}; window.close = () => {};
  const orig = window.open.bind(window);
  window.open = (...a) => { const w = orig(...a); if (w) { const dw = w.document.write.bind(w.document); w.document.write = (h) => { (window.__prints ||= []).push(String(h)); return dw(h); }; } return w; };
});
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const writes = [], rangeQueries = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { writes.push(req.method() + ' ' + u.pathname); return json(single ? {} : []); }
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
  if (u.pathname.endsWith('/refrigerant_cylinders')) {
    const raw = u.search; const idParams = u.searchParams.getAll('id');
    if (idParams.some((v) => v.startsWith('gte.'))) { rangeQueries.push(idParams.join('&')); return json(CYL_ID.startsWith(idParams[0].slice(4, 12)) ? [cyl] : []); }
    if (idParams.some((v) => v === `eq.${CYL_ID}`)) return json(single ? cyl : [cyl]);
    return json(single ? null : [cyl]);
  }
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const expectedUrl = 'https://bestcool.eu/p/3f9a1c7e';
// 1) Lyhyt linkki ohjaa pulloon ja avaa tiedot
await p.goto(`${BASE}/p/3f9a1c7e`); await p.waitForTimeout(6000);
checks['/p/<koodi> ohjasi varastoon'] = p.url().includes(`/varasto?cylinder=${CYL_ID}`) || p.url().includes('/varasto');
checks['haku UUID-etuliitevälillä'] = rangeQueries.length >= 1 && /gte\.3f9a1c7e-0000/.test(rangeQueries[0]) && /lte\.3f9a1c7e-ffff/.test(rangeQueries[0]);
const link = p.getByTestId('cylinder-link');
checks['tiedoissa linkki näkyy tekstinä'] = (await link.count()) === 1 && (await link.inputValue()) === expectedUrl;
await p.getByRole('button', { name: 'Kopioi linkki' }).first().click(); await p.waitForTimeout(500);
checks['tiedot: Kopioi linkki'] = (await p.evaluate(() => navigator.clipboard.readText())) === expectedUrl;
// 2) Vanha linkki toimii edelleen
await p.goto(`${BASE}/varasto?cylinder=${CYL_ID}`); await p.waitForTimeout(5000);
checks['vanha linkki avaa tiedot'] = (await p.getByTestId('cylinder-link').count()) === 1;
await p.getByRole('button', { name: 'Sulje' }).first().click(); await p.waitForTimeout(300);
// 3) Rivin valikko: Kopioi linkki
await p.evaluate(() => navigator.clipboard.writeText('x'));
await p.getByRole('button', { name: /Toiminnot: PULLO-77/ }).click(); await p.waitForTimeout(200);
await p.getByRole('menuitem', { name: 'Kopioi linkki' }).click(); await p.waitForTimeout(500);
checks['rivi: Kopioi linkki'] = (await p.evaluate(() => navigator.clipboard.readText())) === expectedUrl;
// 4) QR-dialogi: linkki + tarra
await p.getByRole('button', { name: /Toiminnot: PULLO-77/ }).click(); await p.waitForTimeout(200);
await p.getByRole('menuitem', { name: 'QR-koodi ja tarra' }).click(); await p.waitForTimeout(1200);
const dlg = p.getByRole('dialog');
checks['QR-dialogi: linkki näkyy'] = (await dlg.locator('input[readonly]').inputValue()) === expectedUrl;
await dlg.getByRole('button', { name: 'Tulosta tarra' }).click(); await p.waitForTimeout(2500);
const html = await p.evaluate(() => (window.__prints || []).slice(-1)[0] || null);
checks['tarra 60×24 mm'] = !!html && /size:\s*60mm 24mm/.test(html);
checks['tarra: pullon tunnus + teksti'] = !!html && html.includes('PULLO-77') && html.includes('Kylmäainepullo');
const [dl] = await Promise.all([p.waitForEvent('download'), dlg.getByRole('button', { name: 'Tarra PNG' }).click()]);
checks['tarra PNG ladattu'] = /\.png$/.test(dl.suggestedFilename());
checks['ei kirjoituksia'] = writes.length === 0;
checks['ei sivuvirheitä'] = errs.length === 0;
console.log(checks, errs);
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
