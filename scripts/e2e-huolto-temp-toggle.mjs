import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5293';
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
// Asetukset/hälytysrajat eivät ole mittauksia → saavat jäädä näkyviin.
const SETPOINT = /asetus|hälytysraja|Lopetus|pakkaskest|Testauslämpö/i;
async function scan(p) {
  return p.evaluate(() => [...document.querySelectorAll('label')].filter((l) => l.offsetParent && /°C/.test(l.textContent || '') && l.querySelector('input,select'))
    .map((l) => (l.textContent || '').replace(/\s+/g, ' ').trim()));
}
const sw = (p) => p.getByRole('switch', { name: 'Lämpötilat mitattu' });
/** Käy läpi askeleen moduulit (popupit): kutsuu cb(title, nimi) kun moduuli on auki. */
async function eachModule(p, cb) {
  const doc = vis(p).locator('.maintenance-report-document');
  const total = await doc.locator('button').count();
  await cb('askel', null);
  for (let k = 0; k < total; k++) {
    const btn = doc.locator('button').nth(k);
    const txt = ((await btn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (!/Avaa ja täytä|Kesken|Valmis|Vika|Mittaukset|Lauhdutin|Tarkasta/.test(txt) || /Tiiveyskoe|Tyhjiöinti|Huomiot|Huoltotiedot/.test(txt)) continue;
    await btn.click().catch(() => {}); await p.waitForTimeout(600);
    const dlg = p.locator('.leave-draft-dialog').last();
    if (await dlg.count()) {
      await cb(txt, dlg);
      const close = dlg.getByRole('button', { name: /^(Sulje|Valmis)$/ }).last();
      if (await close.count()) await close.click(); else await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    }
  }
}
async function openNew(type, extra = {}) {
  dev.device_type = type; dev.huolto_technical_snapshot = { ...extra, laiteTyyppi: type, kylmaaineTyyppi: 'R-449A', kylmaainePiireja: '1', laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'erillinen_ilma' } };
  const X = await mkCtx([], true);
  await X.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await X.p.waitForTimeout(3000);
  await vis(X.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await X.p.waitForTimeout(4000);
  return X;
}
// ---- A: uusi raportti: mittauslämpötilat piilossa, kytkin per moduuli, Tulistus (K) pois
const A = await openNew(TYPE);
const chips = vis(A.p).locator('.maintenance-step-chip'); const n = await chips.count();
const leftovers = []; let toggles = 0; let tulistus = false; const toggleSteps = [];
for (let i = 0; i < n; i++) {
  await chips.nth(i).click(); await A.p.waitForTimeout(700);
  const title = (await chips.nth(i).innerText()).replace(/\s+/g, ' ').trim();
  await eachModule(A.p, async (name) => {
    const tg = sw(A.p); const c = await tg.count(); toggles += c;
    if (c) toggleSteps.push({ i, title: `${title} / ${name}`, c });
    for (let k = 0; k < c; k++) if ((await tg.nth(k).getAttribute('aria-checked')) !== 'false') leftovers.push(`${title}/${name}: kytkin alkaa päällä`);
    leftovers.push(...(await scan(A.p)).filter((l) => !SETPOINT.test(l)).map((l) => `${title}/${name}: ${l}`));
    if (/Höyrystin/.test(title) && /Tulistus \(K\)/.test(await A.p.evaluate(() => (document.querySelector('.leave-draft-dialog')?.textContent) ?? ''))) tulistus = true;
  });
}
console.log('A kytkimet:', JSON.stringify(toggleSteps));
check(toggles >= 2, `A: Lämpötilat mitattu -kytkin höyrystimessä ja lauhduttimessa (${toggles})`);
check(leftovers.length === 0, `A: ei näkyviä mittauslämpötiloja oletuksena (${JSON.stringify(leftovers.slice(0, 6))})`);
check(!tulistus, 'A: Paisuntaventtiilin Tulistus (K) -kenttää ei kysytä');
// kytkin avaa kentät (höyrystin)
await chips.nth(toggleSteps.find((x) => /Höyrystin/.test(x.title)).i).click(); await A.p.waitForTimeout(600);
await vis(A.p).getByRole('button', { name: /Avaa ja täytä/ }).first().click(); await A.p.waitForTimeout(800);
const before = (await scan(A.p)).length;
await sw(A.p).first().click(); await A.p.waitForTimeout(500);
const after = (await scan(A.p)).length;
check(after > before, `A: kytkin paljastaa lämpötilakentät (${before} → ${after})`);
await A.ctx.close();
// ---- B: esitäytetty / vanha arvo → kytkin alkaa päällä (laitteen snapshotissa on jo lämpötiloja)
const B = await openNew(TYPE, { evaporatorData: [{ ilmaTuloLampotila: '-18', ilmaPoistoLampotila: '-22' }], condenserData: [{ lauhtumisLampotila: '40' }] });
const bchips = vis(B.p).locator('.maintenance-step-chip'); const bn = await bchips.count();
const on = [];
for (let i = 0; i < bn; i++) {
  await bchips.nth(i).click(); await B.p.waitForTimeout(600);
  const t = (await bchips.nth(i).innerText()).replace(/\s+/g, ' ').trim();
  await eachModule(B.p, async (name) => { const tg = sw(B.p); if (await tg.count()) on.push(`${t}/${name}=${await tg.first().getAttribute('aria-checked')}`); });
}
console.log('B:', on.join(' | '));
check(on.some((x) => /Höyrystin.*=true/.test(x)), 'B: höyrystin alkaa päällä, kun arvoja on jo');
check(on.some((x) => /Lauhdutin.*=true/.test(x)), 'B: lauhdutin alkaa päällä, kun arvoja on jo');
check(on.some((x) => /Kylmäainepiiri.*=false/.test(x)), 'B: arvoton moduuli alkaa pois päältä');
await B.ctx.close();
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
