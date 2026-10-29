// Kolme laitetta peräkkäin laitteelta "Uusi huoltoraportti": jokainen raportti pysyy omalla laitteellaan.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co npx vite --port 5293 & BASE=http://localhost:5293 node scripts/e2e-report-equipment-binding.mjs (Supabase täysin mockattu).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5293';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', phone: '', email: '', business_id: '', notes: '', owner_company_id: cid, created_at: new Date().toISOString(), subscriber_id: null };
const mk = (n, i) => ({ id: `00000000-0000-4000-8000-0000000000e${i}`, customer_id: customer.id, owner_company_id: cid, name: n, tag: n, model: n, serial_number: null, location: '5 laiturin lippa', device_type: 'kylmäkoneikko', manufacturer: 'Tecumseh', refrigerant: 'R-449A', refrigerant_charge_kg: 5, public_qr_token: null, created_at: new Date().toISOString(),
  huolto_technical_snapshot: { laiteTyyppi: 'kylmäkoneikko', kylmaaineTyyppi: 'R-449A', kylmaainePiireja: '1', laiteKayttotarkoitus: `Välikerroksen huone ${n.slice(2)}`, laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'erillinen_ilma' } } });
const devices = [mk('JK10', 1), mk('JK14', 2), mk('JK15', 3), mk('Vastaanotto', 4)].slice(0, Number(process.env.N || 4));
const company = { id: cid, name: 'Testifirma', modules: null };
const reports = new Map(); const writes = []; let seq = 0;
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const eqParam = (u, k) => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname.endsWith('/maintenance_reports') && req.method() !== 'GET') {
    let pd = {}; try { pd = req.postDataJSON(); pd = Array.isArray(pd) ? pd[0] : pd; } catch {}
    if (req.method() === 'POST') { const id = pd.id ?? `00000000-0000-4000-8000-00000000aa0${++seq}`; const row = { id, created_at: new Date().toISOString(), ...pd, updated_at: new Date().toISOString() }; reports.set(id, row); writes.push({ op: 'insert', id, equipment_id: pd.equipment_id, at: location0() }); return json(single ? row : [row]); }
    if (req.method() === 'PATCH') { const id = eqParam(u, 'id'); const row = reports.get(id); if (row) { Object.assign(row, pd, { updated_at: new Date().toISOString() }); writes.push({ op: 'update', id, equipment_id: pd.equipment_id, tunnus: pd.data?.laiteTunnus, at: location0() }); } return json(single ? row : row ? [row] : []); }
    return json([]);
  }
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/')) return json(single ? {} : []);
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? company : [company]);
  if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
  if (u.pathname.endsWith('/equipment')) { const id = eqParam(u, 'id'); const list = id ? devices.filter((d) => d.id === id) : devices; return json(single ? list[0] ?? null : list); }
  if (u.pathname.endsWith('/maintenance_reports')) {
    if (u.search.includes('category')) return json(single ? { category: 'kylma' } : [{ category: 'kylma' }]);
    let list = [...reports.values()]; const id = eqParam(u, 'id'), eid = eqParam(u, 'equipment_id'), st = eqParam(u, 'status');
    if (id) list = list.filter((r) => r.id === id); if (eid) list = list.filter((r) => r.equipment_id === eid); if (st) list = list.filter((r) => r.status === st);
    return json(single ? list[0] ?? null : list);
  }
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
function location0() { try { return new URL(p.url()).pathname + new URL(p.url()).search; } catch { return ''; } }
const vis = '.keep-alive-panel:not([hidden])';
const spaGo = (path) => p.evaluate((path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${devices[0].id}`); await p.waitForTimeout(4000);
const created = {};
for (const d of devices) {
  await spaGo(`/asiakkaat/${customer.id}/laitteet/${d.id}`); await p.waitForTimeout(2500);
  const btn = p.locator(vis).getByRole('link', { name: /Uusi huoltoraportti/ });
  if (!(await btn.count())) { console.log('NO BUTTON for', d.name, (await p.locator(vis).innerText()).slice(0, 300)); break; }
  await btn.first().click(); await p.waitForTimeout(6000);
  const m = p.url().match(/huoltoraportit\/([0-9a-f-]{36})/);
  if (!m) { // force a save by editing a field if insert has not happened yet
    await p.locator(vis).getByRole('button', { name: 'Tallenna luonnos' }).click(); await p.waitForTimeout(3000);
    await p.locator(vis).getByRole('button', { name: /2Kylmäaine/ }).click().catch(() => {}); await p.waitForTimeout(3000);
  }
  if (process.env.DBG) { console.log('TXT', (await p.locator(vis).innerText()).slice(0, 900).replace(/\n+/g,' | ')); console.log('INPUTS', JSON.stringify(await p.locator(`${vis} input:visible, ${vis} textarea:visible, ${vis} button:visible`).evaluateAll(es=>es.slice(0,40).map(e=>e.tagName+':'+(e.getAttribute('aria-label')||e.name||e.textContent||'').slice(0,30))))); }
  const m2 = p.url().match(/huoltoraportit\/([0-9a-f-]{36})/);
  created[d.name] = m2?.[1] ?? null;
  console.log(d.name, '->', created[d.name], p.url());
}
await p.waitForTimeout(4000);
let fail = 0;
for (const d of devices) {
  const id = created[d.name]; const row = id && reports.get(id);
  const ok = row && row.equipment_id === d.id;
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'FAIL', d.name, id, 'equipment_id', row?.equipment_id, 'tunnus', row?.data?.laiteTunnus);
}
const cross = writes.filter((w) => w.op === 'update' && w.equipment_id && reports.get(w.id) && created && Object.entries(created).some(([n, rid]) => rid === w.id && devices.find((x) => x.name === n).id !== w.equipment_id));
console.log('writes', writes.length, 'cross-device updates', cross.length, JSON.stringify(cross.slice(0, 5)));
// Laitelistan Huollettu-tila: viimeisin huolto lasketaan raporteista laitteen id:llä
for (const d of devices) console.log('Huollettu', d.name, [...reports.values()].some((r) => r.equipment_id === d.id && r.data?.huoltoPaivamaara));
console.log('errors', errs.slice(0, 3));
console.log(fail || cross.length ? 'RESULT FAIL' : 'RESULT PASS');
await b.close();
