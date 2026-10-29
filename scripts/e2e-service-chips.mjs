// Laitelistan ja laitekortin huoltotilan tekstit. Supabase täysin mockattu, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5295 & BASE=http://localhost:5295 node scripts/e2e-service-chips.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5295';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const ymd = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const cases = [['Tanaan', 0, 'Huollettu tänään'], ['Viisi', 5, 'Huollettu 5 pv sitten'], ['Kuusviik', 42, 'Huollettu 6 vk sitten'], ['Kolmekk', 100, 'Huollettu 3 kk sitten'], ['Myohassa', 800, 'Huolto myöhässä']];
const devices = cases.map(([n], i) => ({ id: `00000000-0000-4000-8000-0000000000e${i + 1}`, customer_id: customer.id, owner_company_id: cid, name: n, tag: n, model: 'M', serial_number: null, location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: null, created_at: '2026-01-01T00:00:00Z', huolto_technical_snapshot: {} }));
const reports = cases.map(([n, ago], i) => ({ id: `00000000-0000-4000-8000-0000000000a${i + 1}`, status: 'submitted', title: null, equipment_id: devices[i].id, equipment: { name: n, tag: n }, data: { huoltoPaivamaara: ymd(ago) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null }));
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki' });
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const writes = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { writes.push(u.pathname); return json(single ? {} : []); }
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
  if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
  if (u.pathname.endsWith('/equipment')) { const id = u.searchParams.get('id')?.replace('eq.', ''); const l = id ? devices.filter((d) => d.id === id) : devices; return json(single ? l[0] ?? null : l); }
  if (u.pathname.endsWith('/maintenance_reports')) return json(single ? reports[0] : reports);
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/asiakkaat/${customer.id}`); await p.waitForTimeout(6000);
const vis = '.keep-alive-panel:not([hidden])';
const root = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
await root.getByText('Laitteet (5)').first().click(); await p.waitForTimeout(1500);
const chips = await root.locator('.device-chip').allInnerTexts();
console.log('chips', JSON.stringify(chips));
const checks = {};
for (const [n, , want] of cases) checks['list ' + want] = chips.includes(want);
checks.noOldLabel = !chips.some((c) => /^Myöhässä$|^Erääntyy$/.test(c));
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${devices[4].id}`); await p.waitForTimeout(5000);
const root2 = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
checks['card myöhässä'] = (await root2.getByTestId('service-status').first().innerText()) === 'Huolto myöhässä';
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${devices[1].id}`); await p.waitForTimeout(5000);
const root3 = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
checks['card huollettu'] = (await root3.getByTestId('service-status').first().innerText()) === 'Huollettu 5 pv sitten';
checks.noWrites = writes.length === 0;
console.log(JSON.stringify(checks), 'errors', errs.slice(0, 3));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
