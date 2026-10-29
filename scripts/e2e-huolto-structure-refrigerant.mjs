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

// ---- D: lauhdutustapa + lauhduttimien määrä Lauhdutin-moduulissa, höyrystimet piireittäin (ei tallennusta)
async function openNew(snapshot, type) {
  dev.device_type = type; dev.huolto_technical_snapshot = { laiteTyyppi: type, kylmaaineTyyppi: 'R-449A', ...snapshot };
  const X = await mkCtx([], true);
  await X.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await X.p.waitForTimeout(3000);
  await vis(X.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await X.p.waitForTimeout(4000);
  return X;
}
const stepTexts = async (X) => {
  const chips = vis(X.p).locator('.maintenance-step-chip'); const n = await chips.count(); const out = [];
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click(); await X.p.waitForTimeout(600);
    out.push({ i, title: (await chips.nth(i).innerText()).replace(/^\d+\s+/, '').replace(/\s+(Valmis|Kesken|Vika)$/, '').trim(), text: await vis(X.p).locator('.maintenance-report-document').innerText() });
  }
  return out;
};
const kylmio = await openNew({ kylmaainePiireja: '2', hoyrystimetPiireittain: '2,1', hoyrystimienMaara: '3', lauhduttimienMaara: '2', laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'erillinen_ilma' } }, TYPE);
const ks = await stepTexts(kylmio);
console.log('D vaiheet:', ks.map((x) => x.title).join(' > '));
check(!/Lauhdutustapa|Höyrystimiä|Lauhduttimia|Kokoonpano/.test(ks[0].text), 'D: Perustiedoissa ei lauhdutustapaa, määriä eikä Kokoonpanoa');
const lauh = ks.find((x) => /^Lauhdutin/.test(x.title));
check(!!lauh && /Lauhdutustapa/.test(lauh.text) && /Lauhduttimia/.test(lauh.text), 'D: lauhdutustapa ja Lauhduttimia Lauhdutin-moduulissa');
await ks.find(() => true) && await vis(kylmio.p).locator('.maintenance-step-chip').filter({ hasText: /^\s*\d+\s*Lauhdutin/ }).first().click(); await kylmio.p.waitForTimeout(600);
const cfg = await vis(kylmio.p).evaluate((root) => { const sel = root.querySelector('.huolto-condenser-config select'); const out = root.querySelector('.huolto-condenser-config .huolto-count-value'); const r = (el) => el && Math.round(el.getBoundingClientRect().height); return { value: sel?.value, count: out?.textContent, selH: r(sel), selF: sel && getComputedStyle(sel).fontSize, btnH: r(root.querySelector('.huolto-condenser-config .konvektori-yesno-btn')), selTop: sel && Math.round(sel.getBoundingClientRect().top), outTop: out && Math.round(out.getBoundingClientRect().top) }; });
check(cfg.value === 'erillinen_ilma', `D: lauhdutustapa esitäyttyy laitekortilta (${cfg.value})`);
check(cfg.count === '2', `D: lauhduttimien määrä esitäyttyy (${cfg.count})`);
check(cfg.selH === 48 && cfg.selF === '16px' && cfg.btnH === 48 && Math.abs(cfg.selTop - cfg.outTop) <= 1, `D: kentät 48/16 px ja samalla rivillä (${JSON.stringify(cfg)})`);
const circ = ks.filter((x) => /^Piiri \d/.test(x.title));
check(circ.length === 2 && circ.every((x) => /Höyrystimiä/.test(x.text)), `D: Höyrystimiä-määrä jokaisella piirillä (${circ.map((x) => x.title)})`);
const counts = [];
for (const c of circ) { await vis(kylmio.p).locator('.maintenance-step-chip').filter({ hasText: new RegExp(c.title) }).first().click(); await kylmio.p.waitForTimeout(500); counts.push(await vis(kylmio.p).locator('.huolto-count-value').first().innerText()); }
check(counts.join() === '2,1', `D: piirikohtaiset määrät laitekortilta 2,1 (${counts})`);
await vis(kylmio.p).locator('button[aria-label="Höyrystimiä +"]').click(); await kylmio.p.waitForTimeout(500);
await vis(kylmio.p).locator('.maintenance-step-chip').filter({ hasText: /Höyrystin/ }).first().click(); await kylmio.p.waitForTimeout(800);
const hy = await vis(kylmio.p).locator('.maintenance-report-document').innerText();
check(/Piiri 1 — Höyrystin 1/.test(hy) && /Piiri 1 — Höyrystin 2/.test(hy) && /Piiri 2 — Höyrystin 1/.test(hy) && /Piiri 2 — Höyrystin 2/.test(hy), 'D: höyrystimet ryhmittyvät piireittäin (+1 piirille 2)');
await kylmio.ctx.close();

// vanha laitekortti: vain kokonaismäärä → piirille 1; yksi piiri → yksi määrä
const vanha = await openNew({ kylmaainePiireja: '1', hoyrystimienMaara: '3' }, TYPE);
const vs = await stepTexts(vanha);
check(!/Höyrystimiä/.test(vs[0].text), 'D: vanha kortti: ei globaalia Höyrystimiä-valitsinta Perustiedoissa');
await vis(vanha.p).locator('.maintenance-step-chip').filter({ hasText: /Kylmäainepiiri/ }).first().click(); await vanha.p.waitForTimeout(500);
check((await vis(vanha.p).locator('.huolto-count-value').first().innerText()) === '3', 'D: vanha kortti: yhden piirin Höyrystimiä = 3');
await vanha.ctx.close();

// VJK: lauhdutustapa Lauhdutin-vaiheessa, ei Kokoonpanossa
const vjk = await openNew({ kylmaainePiireja: '1', laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'koneseen_integroitu' } }, 'vedenjäähdytyskone');
const js = await stepTexts(vjk);
console.log('D VJK vaiheet:', js.map((x) => x.title).join(' > '));
check(!/Lauhdutustapa/.test(js[0].text), 'D: VJK: Perustiedoissa ei lauhdutustapaa');
check(!!js.find((x) => /^Lauhdutin/.test(x.title) && /Lauhdutustapa/.test(x.text)), 'D: VJK: Lauhdutin-vaiheessa lauhdutustapa');
await vjk.ctx.close();
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
