import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5307';
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
  dev.device_type = type; dev.huolto_technical_snapshot = { laiteTyyppi: type, kylmaaineTyyppi: 'R-410A', kylmaainePiireja: '1', ...extra };
  const X = await mkCtx([], true);
  await X.p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${dev.id}`); await X.p.waitForTimeout(3000);
  await vis(X.p).getByRole('link', { name: /Uusi huoltoraportti/ }).first().click(); await X.p.waitForTimeout(4000);
  return X;
}



let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const KOK = { vakKylmaainepiiri: true, vakJaahdytys: true, vakLammitys: true, vakLammitysTyyppi: 'sahko', vakLammitysKw: '6', kostutus: true, vakKostutinTyyppi: 'hoyrysylinteri', vakKostutinMalli: 'Carel UE018', kuivaus: true, vakKuivausKw: '3', vakVesiventtiili: 'paineohjattu' };
const SNAP = { laiteKokoonpano: KOK, kylmaainePiireja: '2', lauhdutinTyyppiLaite: 'nestekiertoinen_vain_lmv', laiteKonfiguraatio: { lauhdutinTyyppiLaite: 'nestekiertoinen_vain_lmv' }, kenttaKiinteat: { ilmapuoli: { suodatinTyyppi: 'F7' }, vakOhjaus: { saadin: 'Carel pCO5' } } };
const A = await openNew('vakioilmastointtikone', SNAP);
const p = A.p; const chips = vis(p).locator('.maintenance-step-chip');
const stepNames = (await chips.allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
console.log('steps:', stepNames.join(' | '));
const stepIdx = (re) => stepNames.findIndex((x) => re.test(x));
check(stepIdx(/Piiri 1/) >= 0 && stepIdx(/Piiri 2/) >= 0, 'kaksi kylmäainepiiriä → Piiri 1 ja Piiri 2');
check(stepIdx(/Höyrystin/) >= 0, 'Höyrystin-vaihe');
check(stepIdx(/Toiminnot/) >= 0, 'Toiminnot-vaihe');
const panel = () => vis(p).locator('.maintenance-report-tab-section, .maintenance-report-document').first();
const has = async (txt) => (await vis(p).getByText(txt, { exact: false }).count()) > 0;
const metrics = (labelRe) => vis(p).evaluate((root, src) => {
  const re = new RegExp(src);
  const lab = [...root.querySelectorAll('label')].find((l) => re.test((l.textContent || '').trim()));
  const el = lab?.querySelector('input,select'); if (!el) return null;
  const cs = getComputedStyle(el); return { h: el.getBoundingClientRect().height, fs: parseFloat(cs.fontSize), v: el.value };
}, labelRe.source);
const sw = (name) => vis(p).getByRole('switch', { name, exact: true });
const checkM = async (re, expectV) => { const m = await metrics(re); check(!!m && m.h >= 47.5 && m.fs >= 16 && (expectV === undefined || m.v === expectV), `${re.source}: 48 px / 16 px${expectV !== undefined ? ` / esitäytetty "${expectV}"` : ''} (${JSON.stringify(m)})`); };
// ---- Perustiedot / Kokoonpano
await chips.nth(stepIdx(/Perustiedot/)).click(); await p.waitForTimeout(700);
check((await vis(p).locator('input[type=checkbox]').count()) === 0, 'kokoonpano: ei checkbox-kenttiä');
for (const n of ['Jäähdytys', 'Lämmitys', 'Kostutus', 'Kuivaus']) check((await sw(n).getAttribute('aria-checked')) === 'true', `kokoonpano: kytkin ${n} päällä (laitekortista)`);
await checkM(/^Lämmityksen tyyppi/, 'sahko'); await checkM(/^Lämmitysteho/, '6');
await checkM(/^Kostuttimen tyyppi/, 'hoyrysylinteri'); await checkM(/^Kostuttimen malli/, 'Carel UE018');
await checkM(/^Kuivauksen vastusteho/, '3'); await checkM(/^Lauhdutusveden venttiili/, 'paineohjattu');
// ---- Höyrystin
await chips.nth(stepIdx(/Höyrystin/)).click(); await p.waitForTimeout(700);
await vis(p).getByRole('button', { name: /Avaa ja täytä/ }).first().click(); await p.waitForTimeout(800);
const dlg = () => p.locator('.leave-draft-dialog').last();
const evSel = await dlg().locator('label', { hasText: 'Lämmönvaihtimen tyyppi' }).locator('select').inputValue(); console.log('evSel', JSON.stringify(evSel), JSON.stringify(await dlg().evaluate(r=>[...r.querySelectorAll('select')].map(e=>[e.value,[...e.options].map(o=>o.value).join(',')]))));
check(evSel === 'suorahoyrystin', 'höyrystin: VAK oletus Suorahöyrystin');
await dlg().getByRole('button', { name: 'Sulje' }).last().click(); await p.waitForTimeout(400);
// ---- Lauhdutuspiiri
await chips.nth(stepIdx(/Lauhdutin/)).click(); await p.waitForTimeout(700);
await vis(p).getByRole('button', { name: /Lauhdutuspiiri/ }).first().click(); await p.waitForTimeout(800);
await dlg().getByRole('button', { name: 'Kunnossa' }).first().click(); await p.waitForTimeout(400);
const dsw = (n) => dlg().getByRole('switch', { name: n, exact: true });
check((await dlg().locator('input[type=checkbox]').count()) === 0, 'lauhdutuspiiri: ei checkbox-kenttiä');
check((await dsw('Lämmönsiirrin puhdistettu').count()) === 1 && (await dlg().getByText('Lämmönsiirtimen kunto').count()) > 0, 'lauhdutuspiiri: lämmönsiirrin puhdistettu + kunto');
await dsw('Ohitus- / paineensäätöventtiili tarkistettu').click(); await p.waitForTimeout(300);
check((await dlg().getByText('Vesiventtiilin asetus (bar)').count()) > 0, 'lauhdutuspiiri: vesiventtiilin asetus (bar) kun venttiili tarkastettu');
const dm = await dlg().evaluate((r) => { const l = [...r.querySelectorAll('label')].find((x) => /Vesiventtiilin asetus/.test(x.textContent || '')); const e = l?.querySelector('input'); const cs = e && getComputedStyle(e); return e ? { h: e.getBoundingClientRect().height, fs: parseFloat(cs.fontSize) } : null; });
check(!!dm && dm.h >= 47.5 && dm.fs >= 16, `lauhdutuspiiri: vesiventtiilin asetus 48 px / 16 px (${JSON.stringify(dm)})`);
await dlg().getByRole('button', { name: 'Sulje' }).last().click(); await p.waitForTimeout(400);
// ---- Toiminnot
await chips.nth(stepIdx(/Toiminnot/)).click(); await p.waitForTimeout(800);
check((await vis(p).locator('input[type=checkbox]').count()) === 0, 'toiminnot: ei checkbox-kenttiä');
for (const t of ['Lämpötilan asetusarvo', 'Säätöalue / neutraalivyöhyke', 'Jäähdytyksen toiminta', 'Lämmityksen toiminta', 'Lämmitysvastusten virta',
  'Kostutuksen asetusarvo', 'Säätöalue / hystereesi', 'Mitattu kosteus', 'Höyrysylinterin kunto', 'Sylinterin virta', 'Vesiliitäntä ja tyhjennys', 'Veden johtokyky',
  'Kuivauksen asetusarvo', 'Kuivauksen toiminta', 'Suodattimien tyyppi', 'Suodattimet vaihdettu', 'Puhaltimen toiminta', 'Kondenssivesi / vesilukko', 'Säädin (valmistaja / malli)', 'Hälytykset kuitattu']) {
  check(await has(t), `toiminnot: ${t}`);
}
check(!(await has('Tuloilma')), 'toiminnot: tulo-/poistoilma piilossa kunnes "Lämpötilat mitattu"');
await sw('Lämpötilat mitattu').click(); await p.waitForTimeout(400);
check((await has('Tuloilma')) && (await has('Poistoilma')), 'toiminnot: Lämpötilat mitattu paljastaa tulo-/poistoilman');
await checkM(/^Kostutuksen asetusarvo/); await checkM(/^Säätöalue \/ hystereesi/); await checkM(/^Suodattimien tyyppi/, 'F7'); await checkM(/^Säädin/, 'Carel pCO5'); await checkM(/^Tuloilma/);
check((await sw('Suodattimet vaihdettu').getAttribute('aria-checked')) === 'false', 'ilmapuoli: suodattimet vaihdettu -kytkin alussa pois');
await sw('Suodattimet vaihdettu').click(); await p.waitForTimeout(300);
await vis(p).locator('label', { hasText: 'Kostutuksen asetusarvo' }).locator('input').fill('50');
await chips.nth(stepIdx(/Perustiedot/)).click(); await p.waitForTimeout(500);
await chips.nth(stepIdx(/Toiminnot/)).click(); await p.waitForTimeout(600);
check((await sw('Suodattimet vaihdettu').getAttribute('aria-checked')) === 'true', 'toiminnot: kytkimen arvo säilyy vaiheiden välillä');
check((await vis(p).locator('label', { hasText: 'Kostutuksen asetusarvo' }).locator('input').inputValue()) === '50', 'toiminnot: kostutuksen asetusarvo säilyy');
// ---- laitekortti
const rows = await p.evaluate(async (snap) => { const m = await import('/src/lib/huoltoRaportti/equipmentSnapshotDisplay.ts'); return m.vakKokoonpanoRows({ laiteTyyppi: 'vakioilmastointtikone', ...snap }); }, SNAP);
const rt = rows.map((r) => `${r.label}: ${r.value}`).join(' | '); console.log('laitekortti:', rt);
check(/Lauhdutustapa: .*ilman nestelauhdutinta/.test(rt) && /Lauhdutusveden venttiili: Paineohjattu/.test(rt) && /Höyrystin: Suora kylmäaine/.test(rt) && /Lämmitys: Sähkövastukset · 6 kW/.test(rt) && /Kostutus: Höyrysylinteri · Carel UE018/.test(rt) && /Kuivaus: 3 kW/.test(rt) && /Suodattimien tyyppi: F7/.test(rt), 'laitekortti: kokoonpanorivit');
await A.ctx.close();
// ---- B: vain jäähdytys → ei kostutus/kuivaus/lämmitys -kenttiä
const B = await openNew('vakioilmastointtikone', { laiteKokoonpano: { vakKylmaainepiiri: true, vakJaahdytys: true, vakLammitys: false, kostutus: false, kuivaus: false }, kylmaainePiireja: '1' });
const pb = B.p; const bch = vis(pb).locator('.maintenance-step-chip'); const bn = (await bch.allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
await bch.nth(bn.findIndex((x) => /Perustiedot/.test(x))).click(); await pb.waitForTimeout(600);
const bt = await vis(pb).innerText();
check(!/Lämmityksen tyyppi|Kostuttimen tyyppi|Kuivauksen vastusteho/.test(bt), 'B: ei lämmitys-/kostutin-/kuivauskenttiä kun toiminnot pois');
await bch.nth(bn.findIndex((x) => /Toiminnot/.test(x))).click(); await pb.waitForTimeout(700);
const bt2 = await vis(pb).innerText();
check(/Jäähdytyksen toiminta/.test(bt2) && !/Lämmityksen toiminta|Kostutuksen asetusarvo|Kuivauksen asetusarvo|Lämmitysvastusten virta/.test(bt2), 'B: Toiminnot kysyy vain jäähdytyksen (ei kostutus/kuivaus/lämmitys)');
check(/Ilmapuoli/.test(bt2) && /Ohjaus/.test(bt2), 'B: ilmapuoli ja ohjaus aina');
await B.ctx.close();
console.log(fails ? `FAILS ${fails}` : 'ALL OK');
await b.close(); process.exit(fails ? 1 : 0);
