// Laitekortti: yksi huoltohistoria uusin ensin, kesken-raportti näkyy ja aukeaa, ei linkitystä/koodeja.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co npx vite --port 5294 & BASE=http://localhost:5294 node scripts/e2e-device-card-history.mjs (Supabase täysin mockattu, ei kirjoituksia).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5294';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const dev = { id: '00000000-0000-4000-8000-0000000000e1', customer_id: customer.id, owner_company_id: cid, name: 'JK-1', tag: 'JK-1', model: 'M', serial_number: 'S1', location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: 'X'.repeat(43), created_at: '2026-01-01T00:00:00Z', huolto_technical_snapshot: {} };
const R = (id, status, pvm, updated) => ({ id, status, title: null, equipment_id: dev.id, equipment: { name: 'JK-1', tag: 'JK-1' }, data: { huoltoPaivamaara: pvm }, created_at: updated, updated_at: updated, completed_at: null });
const reports = [
  R('00000000-0000-4000-8000-0000000000a1', 'submitted', '2026-04-14', '2026-10-27T10:00:00Z'), // vanha, muokattu tänään → päivä silti 14.4.
  R('00000000-0000-4000-8000-0000000000a2', 'draft', '2026-10-27', '2026-10-26T23:30:00Z'),
];
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
  if (u.pathname.endsWith('/equipment')) return json(single ? dev : [dev]);
  if (u.pathname.endsWith('/maintenance_reports')) {
    const id = u.searchParams.get('id')?.replace('eq.', '');
    const list = id ? reports.filter((r) => r.id === id) : reports;
    return json(single ? list[0] ?? null : list);
  }
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await p.waitForTimeout(5000);
const vis = '.keep-alive-panel:not([hidden])';
const root = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
const hist = root.getByTestId('device-history');
const rows = await hist.locator('.device-history-row').allInnerTexts();
console.log('rows', JSON.stringify(rows));
const txt = await root.innerText();
const checks = {
  latestFirstIsDraft: /27\.10\.2026/.test(rows[0] || '') && /Kesken/.test(rows[0] || ''),
  oldDateFromReport: /14\.4\.2026/.test(rows[1] || ''),
  noLinking: !/Linkit/i.test(txt),
  noCodeButton: !/Uusi koodi/.test(txt) && !txt.includes('X'.repeat(10)),
  qrPrint: /Tulosta QR-tarra/.test(txt),
  noCheckbox: (await root.locator('input[type=checkbox]:visible').count()) === 0,
};
await hist.locator('a.device-history-row').first().click(); await p.waitForTimeout(2500);
checks.latestOpens = p.url().includes('/huoltoraportit/00000000-0000-4000-8000-0000000000a2');
checks.noWrites = writes.length === 0;
console.log(JSON.stringify(checks), 'url', p.url(), 'writes', writes, 'errors', errs.slice(0, 3));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
