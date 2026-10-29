import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:5293';
const TYPE = process.env.TYPE || 'pakastin';
const writes = [];
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', phone: '', email: '', business_id: '', notes: '', owner_company_id: cid, created_at: new Date().toISOString(), subscriber_id: null };
const dev = { id: '00000000-0000-4000-8000-0000000000e1', customer_id: customer.id, owner_company_id: cid, name: 'JK1', tag: 'JK1', model: 'X1', serial_number: 'S1', location: 'Halli', device_type: TYPE, manufacturer: 'Tecumseh', refrigerant: 'R-449A', refrigerant_charge_kg: 5, public_qr_token: null, created_at: new Date().toISOString(),
  huolto_technical_snapshot: { laiteTyyppi: TYPE, kylmaaineTyyppi: 'R-404A', kylmaaineMaaraYhteensa: '9', kylmaainePiireja: '1', laiteKayttotarkoitus: 'Huone', laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'erillinen_ilma' } } };
const company = { id: cid, name: 'Testifirma', modules: null };
const reports = new Map(); let seq = 0;
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const eqParam = (u, k) => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
async function mkCtx(seedRows = [], noSave = false) {
  const reports = new Map(seedRows.map((r) => [r.id, r]));
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    let pd = {}; if (req.method() !== 'GET') { try { pd = req.postDataJSON(); pd = Array.isArray(pd) ? pd[0] : pd; } catch {} }
    if (u.pathname.endsWith('/maintenance_reports') && req.method() !== 'GET') {
      if (req.method() === 'POST' && noSave) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'nosave' }) });
      if (req.method() === 'POST') { const id = `00000000-0000-4000-8000-00000000aa0${++seq}`; const row = { id, created_at: new Date().toISOString(), ...pd, updated_at: new Date().toISOString() }; reports.set(id, row); writes.push({ t: 'report', op: 'POST', pd }); return json(single ? row : [row]); }
      if (req.method() === 'PATCH') { const id = eqParam(u, 'id'); const row = reports.get(id); if (row) Object.assign(row, pd); writes.push({ t: 'report', op: 'PATCH', pd }); return json(single ? row : row ? [row] : []); }
      return json([]);
    }
    if (u.pathname.endsWith('/equipment') && req.method() !== 'GET') { writes.push({ t: 'equipment', op: req.method(), pd }); return json(single ? {} : []); }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/')) return json(single ? {} : []);
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    if (u.pathname.endsWith('/companies')) return json(single ? company : [company]);
    if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
    if (u.pathname.endsWith('/equipment')) { const id = eqParam(u, 'id'); const list = id ? [dev].filter((d) => d.id === id) : [dev]; return json(single ? list[0] ?? null : list); }
    if (u.pathname.endsWith('/maintenance_reports')) {
      let list = [...reports.values()]; const id = eqParam(u, 'id'); if (id) list = list.filter((r) => r.id === id);
      list = list.map((r) => ({ ...r, category: 'kylma' }));
      return json(single ? list[0] ?? null : list);
    }
    return json(single ? null : []);
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  return { ctx, p, reports };
}
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const vis = (p) => p.locator('.keep-alive-panel:not([hidden])');

// ---- A: uusi raportti laitekortilta: kortin kylmäaine voittaa vanhentuneen snapshotin
const A = await mkCtx();
await A.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await A.p.waitForTimeout(3000);
await vis(A.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await A.p.waitForTimeout(6000);
await vis(A.p).locator('.maintenance-step-chip').nth(1).click(); await A.p.waitForTimeout(6000);
const post = writes.find((w) => w.t === 'report' && w.op === 'POST');
check(!!post, 'A: luonnos tallentui');
const d = post?.pd?.data ?? {};
check(d.kylmaaineTyyppi === 'R-449A', `A: esitäyttö käyttää laitekortin kylmäainetta (${d.kylmaaineTyyppi})`);
const ePatches = writes.filter((w) => w.t === 'equipment' && w.op === 'PATCH');
check(!ePatches.some((w) => w.pd.refrigerant && w.pd.refrigerant !== 'R-449A'), 'A: raportti ei ylikirjoita korttia kun kylmäainetta ei muokattu');
check(!ePatches.some((w) => w.pd.huolto_technical_snapshot?.kylmaaineTyyppi === 'R-404A'), 'A: snapshot ei jää vanhaan arvoon');
await A.ctx.close();


// ---- C: kentät 48 px / 16 px ja yksi Lauhdutin-vaihe (ei tallennusta)
const C = await mkCtx([], true);
await C.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await C.p.waitForTimeout(3000);
await vis(C.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await C.p.waitForTimeout(4000);
const chips = vis(C.p).locator('.maintenance-step-chip');
const n = await chips.count(); const titles = [];
let badFields = []; let measured = 0;
for (let i = 0; i < n; i++) {
  await chips.nth(i).click(); await C.p.waitForTimeout(700);
  titles.push((await chips.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  const all = await vis(C.p).evaluate((root) => [...root.querySelectorAll('.huolto-field-module input:not([type=checkbox]):not([type=hidden]), .huolto-field-module select')].filter((el) => el.offsetParent).map((el) => ({ h: Math.round(el.getBoundingClientRect().height), f: getComputedStyle(el).fontSize, n: el.name || el.getAttribute('aria-label') || el.type })));
  measured += all.length; const bad = all.filter((x) => x.h !== 48 || x.f !== '16px');
  badFields.push(...bad.map((b) => ({ ...b, step: i })));
}
console.log('C vaiheet:', titles.join(' > '));
check(measured > 0, `C: mitattiin ${measured} kenttää`);
check(badFields.length === 0, `C: kentät 48 px / 16 px (${JSON.stringify(badFields.slice(0, 4))})`);
const kylmaIdx = titles.findIndex((t) => /Kylmäaine/.test(t)), lauhIdx = titles.findIndex((t) => /Lauhdutin/.test(t)), hoyIdx = titles.findIndex((t) => /Höyrystin/.test(t)), ohjIdx = titles.findIndex((t) => /Ohjaus/.test(t));
check(kylmaIdx >= 0 && kylmaIdx < lauhIdx && lauhIdx < hoyIdx && hoyIdx < ohjIdx, 'C: järjestys kylmäaine → lauhdutin → höyrystin → ohjaus');
check(titles.filter((t) => /Lauhdut/.test(t)).length === 1, 'C: lauhdutin vain yhdessä vaiheessa');
await C.ctx.close();
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
