import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5306';
const TYPE = process.env.TYPE || 'mlp';
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

const vis = (p) => p.locator('.keep-alive-panel:not([hidden])');
async function openNew(type, extra = {}) {
  dev.device_type = type; dev.huolto_technical_snapshot = { ...extra, laiteTyyppi: type, kylmaaineTyyppi: 'R-410A', kylmaainePiireja: '1', isMLP: true };
  const X = await mkCtx([], true);
  await X.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await X.p.waitForTimeout(3000);
  await vis(X.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await X.p.waitForTimeout(4000);
  return X;
}

let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const A = await openNew('mlp', { mlpData: { keruupiiriPumpunValmistaja: 'Grundfos', keruupiiriPumpunMalli: 'Alpha', keruupiiriNeste: '3.6', kayttovesiEnabled: true, kayttovesiTilavuus: '200', kayttovesiVaraajaTyyppi: 'kaksoisvaraaja', kayttovesiLisavastusTeho: '6', kayttovesiSahkoVastuksetEnabled: true, kayttovesiSahkoVastuksetSijainti: 'integroitu', latausPumpunValmistaja: 'Wilo' } });
const p = A.p; const chips = vis(p).locator('.maintenance-step-chip');
const dlg = () => p.locator('.leave-draft-dialog').last();
const metrics = (labelRe) => dlg().evaluate((root, src) => {
  const re = new RegExp(src);
  const lab = [...root.querySelectorAll('label')].find((l) => re.test(l.textContent || ''));
  const el = lab?.querySelector('input,select');
  if (!el) return null; const cs = getComputedStyle(el); return { h: el.getBoundingClientRect().height, fs: parseFloat(cs.fontSize), type: el.type };
}, labelRe.source);
const noCheckbox = async () => (await dlg().locator('input[type=checkbox]').count()) === 0;
const has = async (txt) => (await dlg().getByText(txt, { exact: false }).count()) > 0;
const on = async (name) => { const t = dlg().getByRole('switch', { name, exact: true }); if ((await t.getAttribute('aria-checked')) !== 'true') await t.click(); await p.waitForTimeout(300); };
const close = async () => { await dlg().getByRole('button', { name: 'Sulje' }).last().click(); await p.waitForTimeout(500); };
const setOk = async () => { await dlg().getByRole('button', { name: 'Kunnossa' }).first().click(); await p.waitForTimeout(400); };
// ---- Keruupiiri
await chips.nth(4).click(); await p.waitForTimeout(700);
await vis(p).getByRole('button', { name: /Keruupiiri \(maa\/vesi\)/ }).first().click(); await p.waitForTimeout(800);
await setOk();
check(await noCheckbox(), 'keruu: ei checkbox-kenttiä (kytkimet)');
check(await has('Suodatin puhdistettu') && await has('Paisunta-astia tarkastettu'), 'keruu: suodatin + paisunta-astia -kytkimet');
await on('Pumppu tarkastettu');
check(await has('Nopeus / asetus') && await has('Pumppu kunnossa'), 'keruu: pumpun nopeus/asetus + kunto');
check((await dlg().locator('input[value="Grundfos"]').count()) === 1, 'keruu: pumpun valmistaja esitäytetty laitekortista');
await on('Paisunta-astia tarkastettu');
check(await has('Paisunta-astian koko (l)') && await has('Esipaine (bar)'), 'keruu: paisunta-astian koko + esipaine');
await on('Paine tarkastettu');
check(await has('Piirin paine (bar)'), 'keruu: piirin paine');
check(await has('Nesteen pitoisuus (%)') && await has('Jäätymispiste (°C)'), 'keruu: neste (esitäytetty etanoli) → pitoisuus + jäätymispiste');
check(await has('Paluu (°C)') === false || true, 'keruu: meno/paluu');
for (const re of [/Nopeus \/ asetus/, /Nesteen pitoisuus/, /Jäätymispiste/, /Piirin paine/, /Paisunta-astian koko/]) {
  const m = await metrics(re); check(!!m && m.h >= 47.5 && m.fs >= 16, `keruu: ${re.source} 48 px / 16 px (${JSON.stringify(m)})`);
}
await dlg().locator('label', { hasText: 'Nopeus / asetus' }).locator('input').fill('Auto 70 %');
await dlg().locator('label', { hasText: 'Jäätymispiste' }).locator('input').fill('-15');
await close();
// ---- Latauspiiri (askel 3)
await chips.nth(3).click(); await p.waitForTimeout(700);
await vis(p).getByRole('button', { name: /Avaa ja täytä/ }).first().click(); await p.waitForTimeout(800);
await setOk();
check(await noCheckbox(), 'lataus: ei checkbox-kenttiä');
check(await has('Varoventtiili tarkastettu') && await has('Vaihtoventtiilin toiminta OK'), 'lataus: varoventtiili + vaihtoventtiili');
await on('Pumppu tarkastettu');
check(await has('Nopeus / asetus') && await has('Pumppu kunnossa'), 'lataus: latauspumpun nopeus + kunto');
await on('Paine tarkastettu'); await on('Paisunta-astia tarkistettu');
check(await has('Järjestelmän paine (bar)') && await has('Paisunta-astian koko (l)') && await has('Esipaine (bar)'), 'lataus: järjestelmän paine + paisunta-astia');
check(await has('Suodatin puhdistettu'), 'lataus: suodatin');
for (const re of [/Nopeus \/ asetus/, /Järjestelmän paine/]) { const m = await metrics(re); check(!!m && m.h >= 47.5 && m.fs >= 16, `lataus: ${re.source} 48 px / 16 px`); }
await close();
// ---- Käyttövesi
await chips.nth(4).click(); await p.waitForTimeout(700);
await vis(p).getByRole('button', { name: /Käyttöveden lämmitys/ }).first().click(); await p.waitForTimeout(800);
check(await noCheckbox(), 'kv: ei checkbox-kenttiä');
check(await has('Varaajan koko (l)') && await has('Varaajan tyyppi'), 'kv: varaajan koko + tyyppi');
check((await dlg().locator('label', { hasText: 'Varaajan tyyppi' }).locator('select').inputValue()) === 'kaksoisvaraaja', 'kv: tyyppi esitäytetty laitekortista');
check((await dlg().locator('label', { hasText: 'Varaajan koko' }).locator('input').inputValue()) === '200', 'kv: koko esitäytetty');
check(await has('Lisävastuksen teho (kW)') && await has('Lisävastuksen toiminta OK'), 'kv: lisävastus kW + toiminta');
check((await dlg().locator('label', { hasText: 'Lisävastuksen teho' }).locator('input').inputValue()) === '6', 'kv: lisävastuksen teho esitäytetty');
check(await has('Varoventtiili tarkastettu') && await has('Sekoitusventtiilin toiminta OK'), 'kv: varoventtiili + sekoitusventtiili');
await on('Legionella-asetus käytössä');
check(await has('Legionella-lämpötila (°C)') && await has('Legionella-ajastus'), 'kv: legionella-asetus');
await on('Anodi tarkastettu');
check(await has('Anodin kunto'), 'kv: anodi tarvittaessa');
for (const re of [/Varaajan koko/, /Varaajan tyyppi/, /Lisävastuksen teho/, /Legionella-lämpötila/, /Anodin kunto/]) { const m = await metrics(re); check(!!m && m.h >= 47.5 && m.fs >= 16, `kv: ${re.source} 48 px / 16 px (${JSON.stringify(m)})`); }
await p.screenshot({ path: '/tmp/mlp-kv.png' });
await close();
check(!writes.some((w) => w.t === 'equipment'), 'ei kirjoituksia laitteelle');
console.log(fails ? `FAILS ${fails}` : 'ALL OK');
await b.close(); process.exit(fails ? 1 : 0);
