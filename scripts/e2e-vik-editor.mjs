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
const FUNCS = { vakJaahdytys: true, vakLammitys: true, vakLammitysTyyppi: 'sahko', vakLammitysKw: '6', kostutus: true, vakKostutinTyyppi: 'hoyrysylinteri', vakKostutinMalli: 'Carel UE018', kuivaus: true, vakKuivausKw: '3' };
const FIXED = { ilmapuoli: { suodatinTyyppi: 'F7', puhallinTyyppi: 'EC' }, vakOhjaus: { saadin: 'Carel pCO5' }, kostutus: { sylinteriTyyppi: 'Avattava' } };
const SNAPS = {
  nestekierto: { laiteKokoonpano: { ...FUNCS, vakVariantti: 'nestekierto', vakKylmaainepiiri: false }, kylmaainePiireja: '1', kenttaKiinteat: { ...FIXED, vesikenno: { neste: 'Glykoli 30 %' } } },
  dx_ilma: { laiteKokoonpano: { ...FUNCS, vakVariantti: 'dx_ilma', vakKylmaainepiiri: true }, kylmaainePiireja: '2', lauhdutinTyyppiLaite: 'erillinen_ilma', kenttaKiinteat: FIXED },
  dx_neste: { laiteKokoonpano: { ...FUNCS, vakVariantti: 'dx_neste', vakKylmaainepiiri: true, vakVesiventtiili: 'paineohjattu', vakVesikenno: true }, kylmaainePiireja: '2', lauhdutinTyyppiLaite: 'nestekiertoinen_vain_lmv', kenttaKiinteat: { ...FIXED, vesikenno: { neste: 'Glykoli 30 %' } } },
};
const ev = (p) => ({ p, vis: vis(p) });
async function stepsOf(p) { return (await vis(p).locator('.maintenance-step-chip').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim().replace(/^\d+\s+/, '').replace(/\s+(Valmis|Kesken|Vika|Huomio)$/, '')); }
async function gotoStep(p, re) { const names = await stepsOf(p); const i = names.findIndex((n) => re.test(n)); await vis(p).locator('.maintenance-step-chip').nth(i).click(); await p.waitForTimeout(700); return i; }
const has = async (p, txt) => (await vis(p).getByText(txt, { exact: false }).count()) > 0;
const sel = (p, re) => vis(p).evaluate((root, src) => { const re = new RegExp(src); const lab = [...root.querySelectorAll('label')].find((l) => re.test((l.textContent || '').trim())); const el = lab?.querySelector('input,select'); if (!el) return null; const cs = getComputedStyle(el); return { h: el.getBoundingClientRect().height, fs: parseFloat(cs.fontSize), v: el.value }; }, re.source);
async function m48(p, re, expectV) { const m = await sel(p, re); check(!!m && m.h >= 47.5 && m.fs >= 16 && (expectV === undefined || m.v === expectV), `${re.source}: 48 px / 16 px${expectV !== undefined ? ` / "${expectV}"` : ''} (${JSON.stringify(m)})`); }
const sw = (p, name) => vis(p).getByRole('switch', { name, exact: true });

const TOIMINNOT = ['Lämpötilan asetusarvo', 'Säätöalue / neutraalivyöhyke', 'Jäähdytyksen toiminta', 'Lämmityksen toiminta', 'Lämmitysvastusten virta',
  'Kostutuksen asetusarvo', 'Säätöalue / hystereesi', 'Mitattu kosteus', 'Sylinterin tyyppi', 'Höyrysylinterin kunto', 'Sylinterin käyttötunnit', 'Sylinterin virta', 'Höyryletku ja kondenssi', 'Vesiliitäntä ja tyhjennys', 'Veden johtokyky',
  'Kuivauksen asetusarvo', 'Kuivauksen toiminta', 'Vastusten virta L1', 'Ylilämpösuoja testattu',
  'Puhaltimen tyyppi', 'Puhaltimen toiminta', 'Puhaltimen virta', 'Pyörimisnopeus / EC-asetus', 'Laakerit ja kiinnitys', 'Juoksupyörä puhdas',
  'Suodattimien tyyppi', 'Suodattimen paine-ero', 'Tukkeutumishälytys', 'Suodattimet vaihdettu', 'Kondenssivesi / vesilukko', 'Säädin (valmistaja / malli)', 'Hälytykset kuitattu'];
const VESIKENNO = ['Neste', 'Menovesi', 'Paluuvesi', 'Virtaus', 'Vesipiirin paine', 'Venttiilin ja toimilaitteen toiminta', 'Kennon kunto', 'Kenno puhdistettu', 'Ilmaus tehty', 'Likasuodatin puhdistettu', 'Putkisto ja liitokset (vuodot)'];

for (const variant of ['nestekierto', 'dx_ilma', 'dx_neste']) {
  console.log(`\n===== ${variant} =====`);
  const A = await openNew('vakioilmastointtikone', SNAPS[variant]); const p = A.p;
  const names = await stepsOf(p); console.log('steps:', names.join(' | '));
  const isDx = variant !== 'nestekierto';
  check(isDx === names.some((n) => /^Kylmäaine$/.test(n)), `${variant}: Kylmäaine-vaihe ${isDx ? 'on' : 'EI ole (ei kylmäainepiiriä)'}`);
  check(isDx === (names.some((n) => /^Piiri 1$/.test(n)) && names.some((n) => /^Piiri 2$/.test(n))), `${variant}: kylmäainepiirit ${isDx ? 'Piiri 1 + Piiri 2' : 'puuttuvat'}`);
  check(isDx === names.some((n) => /^Lauhdutin$|^Lauhdutuspiiri$/.test(n)), `${variant}: Lauhdutin-vaihe ${isDx ? 'on' : 'ei ole'}`);
  check(isDx === names.some((n) => /^Höyrystin$|^Jäähdytys$/.test(n)), `${variant}: höyrystin ${isDx ? 'on' : 'ei ole'}`);
  const hasWater = variant !== 'dx_ilma';
  check(hasWater === names.some((n) => /Jäähdytysvesikenno|^Jäähdytys$/.test(n)), `${variant}: vesikenno ${hasWater ? 'on' : 'ei ole'}`);
  check(names.some((n) => /^Toiminnot$/.test(n)), `${variant}: Toiminnot-vaihe`);
  // Kokoonpano
  await gotoStep(p, /^Perustiedot$/);
  check((await vis(p).locator('input[type=checkbox]').count()) === 0, `${variant}: kokoonpano ei checkbox-kenttiä`);
  await m48(p, /^Jäähdytystapa/, variant);
  if (isDx) await m48(p, /^Lauhdutustapa/, { dx_ilma: 'erillinen_ilma', dx_neste: 'nestekiertoinen_vain_lmv' }[variant]);
  else check((await sel(p, /^Lauhdutustapa/)) === null, 'nestekierto: ei lauhdutustapaa');
  check(((await sel(p, /^Lauhdutusveden venttiili/)) !== null) === (variant === 'dx_neste'), `${variant}: lauhdutusveden venttiili vain nestelauhdutuksella`);
  if (variant === 'dx_neste') await m48(p, /^Lauhdutusveden venttiili/, 'paineohjattu');
  check((await sw(p, 'Lisäksi vesikenno (dual fluid)').count()) === (isDx ? 1 : 0), `${variant}: dual fluid -kytkin ${isDx ? 'näkyy' : 'ei näy'}`);
  if (isDx) check((await sw(p, 'Lisäksi vesikenno (dual fluid)').getAttribute('aria-checked')) === String(variant === 'dx_neste'), `${variant}: dual fluid -kytkimen tila laitekortista`);
  for (const n of ['Jäähdytys', 'Lämmitys', 'Kostutus', 'Kuivaus']) check((await sw(p, n).getAttribute('aria-checked')) === 'true', `${variant}: kytkin ${n} päällä`);
  await m48(p, /^Lämmityksen tyyppi/, 'sahko'); await m48(p, /^Lämmitysteho/, '6'); await m48(p, /^Kostuttimen tyyppi/, 'hoyrysylinteri'); await m48(p, /^Kostuttimen malli/, 'Carel UE018'); await m48(p, /^Kuivauksen vastusteho/, '3');
  // Lauhdutin-vaihe: ei toistoa
  if (isDx) {
    await gotoStep(p, /^Lauhdutin$|^Lauhdutuspiiri$/);
    const lt = await vis(p).innerText();
    check(!/Lauhdutustapa|Vapaajäähdytys käytössä/.test(lt), `${variant}: Lauhdutin-vaiheessa ei lauhdutustavan/vapaajäähdytyksen toistoa`);
    if (variant === 'dx_ilma') check(/Lauhdutin/.test(lt) && !/Lauhdutuspiiri/.test(lt) && !/Vesiventtiilin asetus/.test(lt), 'dx_ilma: ilmalauhdutin-moduuli, ei vesipiiriä');
    if (variant === 'dx_neste') {
      await vis(p).getByRole('button', { name: /Avaa ja täytä/ }).first().click(); await p.waitForTimeout(800);
      const dlg = p.locator('.leave-draft-dialog').last();
      await dlg.getByRole('button', { name: 'Kunnossa' }).first().click(); await p.waitForTimeout(300);
      await dlg.getByRole('switch', { name: 'Ohitus- / paineensäätöventtiili tarkistettu', exact: true }).click(); await p.waitForTimeout(300);
      check((await dlg.getByText('Vesiventtiilin asetus (bar)').count()) > 0 && (await dlg.getByText('Lämmönsiirtimen kunto').count()) > 0, 'dx_neste: lauhdutuspiiri: vesiventtiilin asetus + lämmönsiirtimen kunto');
      check((await dlg.locator('input[type=checkbox]').count()) === 0, 'dx_neste: lauhdutuspiirin dialogissa ei checkbox-kenttiä');
      await dlg.getByRole('button', { name: 'Sulje' }).last().click(); await p.waitForTimeout(300);
    }
    // höyrystin
    await gotoStep(p, /^Höyrystin$|^Jäähdytys$/);
    await vis(p).getByRole('button', { name: variant === 'dx_neste' ? /^Höyrystin/ : /Avaa ja täytä/ }).first().click(); await p.waitForTimeout(800);
    const dlg = p.locator('.leave-draft-dialog').last();
    check((await dlg.locator('label', { hasText: 'Lämmönvaihtimen tyyppi' }).locator('select').inputValue()) === 'suorahoyrystin', `${variant}: höyrystin oletus suorahöyrystin`);
    await dlg.getByRole('button', { name: 'Sulje' }).last().click(); await p.waitForTimeout(300);
  }
  // Vesikenno
  if (hasWater) {
    await gotoStep(p, /Jäähdytysvesikenno|^Jäähdytys$/);
    const t = await vis(p).innerText();
    if (variant === 'dx_neste') { await vis(p).getByRole('button', { name: /Avaa ja täytä/ }).first().count(); }
    for (const l of VESIKENNO.filter((x) => !/Menovesi|Paluuvesi/.test(x))) check(await has(p, l) || t.includes(l), `${variant}: vesikenno: ${l}`);
    check(!(await has(p, 'Menovesi')), `${variant}: vesikenno: menovesi piilossa ennen "Lämpötilat mitattu"`);
    await m48(p, /^Neste/, 'Glykoli 30 %'); await m48(p, /^Virtaus/);
    await sw(p, 'Lämpötilat mitattu').click(); await p.waitForTimeout(300);
    check((await has(p, 'Menovesi')) && (await has(p, 'Paluuvesi')), `${variant}: vesikenno: Lämpötilat mitattu paljastaa meno/paluu`);
    await sw(p, 'Ilmaus tehty').click(); await p.waitForTimeout(200);
    check((await sw(p, 'Ilmaus tehty').getAttribute('aria-checked')) === 'true', `${variant}: vesikenno: ilmaus-kytkin toimii`);
  } else check(!names.some((n) => /vesikenno/i.test(n)), 'dx_ilma: ei vesikennoa');
  // Toiminnot
  await gotoStep(p, /^Toiminnot$/);
  check((await vis(p).locator('input[type=checkbox]').count()) === 0, `${variant}: toiminnot ei checkbox-kenttiä`);
  for (const l of TOIMINNOT) check(await has(p, l), `${variant}: toiminnot: ${l}`);
  await sw(p, 'Lämpötilat mitattu').click(); await p.waitForTimeout(300);
  await m48(p, /^Kostutuksen asetusarvo/); await m48(p, /^Suodattimien tyyppi/, 'F7'); await m48(p, /^Säädin/, 'Carel pCO5'); await m48(p, /^Pyörimisnopeus/); await m48(p, /^Sylinterin tyyppi/, 'Avattava');
  check((await has(p, 'Tuntilaskuri nollattu')) === false, `${variant}: tuntilaskuri vain kun sylinteri vaihdettu`);
  await vis(p).locator('label', { hasText: 'Höyrysylinterin kunto' }).locator('select').selectOption('Vaihdettu'); await p.waitForTimeout(300);
  check(await has(p, 'Tuntilaskuri nollattu'), `${variant}: tuntilaskuri-kytkin näkyy kun sylinteri vaihdettu`);
  await vis(p).locator('label', { hasText: 'Kostutuksen asetusarvo' }).locator('input').fill('50');
  await gotoStep(p, /^Perustiedot$/); await gotoStep(p, /^Toiminnot$/);
  check((await vis(p).locator('label', { hasText: 'Kostutuksen asetusarvo' }).locator('input').inputValue()) === '50', `${variant}: arvo säilyy vaiheiden välillä`);
  // laitekortti
  const rows = await p.evaluate(async (snap) => { const m = await import('/src/lib/huoltoRaportti/equipmentSnapshotDisplay.ts'); return m.vakKokoonpanoRows({ laiteTyyppi: 'vakioilmastointtikone', ...snap }); }, SNAPS[variant]);
  const rt = rows.map((r) => `${r.label}: ${r.value}`).join(' | '); console.log('laitekortti:', rt);
  check(new RegExp(`Jäähdytystapa: ${{ nestekierto: 'Nestekiertoinen', dx_ilma: 'Kylmäainepiiri \\+ ilmalauhdutin', dx_neste: 'Kylmäainepiiri \\+ nestelauhdutus' }[variant]}`).test(rt)
    && /Lämmitys: Sähkövastukset · 6 kW/.test(rt) && /Kostutus: Höyrysylinteri · Carel UE018/.test(rt) && /Suodattimien tyyppi: F7/.test(rt) && /Puhallin: EC/.test(rt)
    && (isDx ? /Kylmäainepiirit: 2 kpl.*Höyrystin: Suora kylmäaine/.test(rt) : !/Höyrystin|Lauhdutustapa|Kylmäainepiirit/.test(rt))
    && (variant === 'dx_neste' ? /Lauhdutusveden venttiili: Paineohjattu.*Vesikenno: Kyllä/.test(rt) : !/Lauhdutusveden venttiili|Vesikenno/.test(rt)), `${variant}: laitekortin kokoonpanorivit`);
  check(!writes.some((w) => w.t === 'equipment'), `${variant}: ei kirjoituksia laitteelle`);
  await A.ctx.close();
}

// ---- vain jäähdytys: ei kostutus/kuivaus/lämmitys -kenttiä
{
  const B = await openNew('vakioilmastointtikone', { laiteKokoonpano: { vakVariantti: 'dx_ilma', vakKylmaainepiiri: true, vakJaahdytys: true, vakLammitys: false, kostutus: false, kuivaus: false }, kylmaainePiireja: '1', lauhdutinTyyppiLaite: 'erillinen_ilma' });
  const pb = B.p;
  await gotoStep(pb, /^Perustiedot$/); const bt = await vis(pb).innerText();
  check(!/Lämmityksen tyyppi|Kostuttimen tyyppi|Kuivauksen vastusteho/.test(bt), 'vain jäähdytys: ei lämmitys-/kostutin-/kuivauskenttiä kokoonpanossa');
  await gotoStep(pb, /^Toiminnot$/); const bt2 = await vis(pb).innerText();
  check(/Jäähdytyksen toiminta/.test(bt2) && !/Lämmityksen toiminta|Kostutuksen asetusarvo|Kuivauksen asetusarvo|Lämmitysvastusten virta|Sylinterin/.test(bt2), 'vain jäähdytys: Toiminnot kysyy vain jäähdytyksen');
  check(/Puhaltimen toiminta/.test(bt2) && /Suodattimen paine-ero/.test(bt2) && /Hälytykset kuitattu/.test(bt2), 'vain jäähdytys: puhallin, suodattimet ja ohjaus aina');
  // variantin vaihto Kokoonpanossa: DX ilma → nestekierto poistaa kylmäainevaiheet, takaisin DX palauttaa piirin
  await gotoStep(pb, /^Perustiedot$/);
  await vis(pb).locator('label', { hasText: 'Jäähdytystapa' }).locator('select').selectOption('nestekierto'); await pb.waitForTimeout(700);
  let n2 = await stepsOf(pb);
  check(!n2.some((n) => /Kylmäaine|Piiri|Lauhdutin|Höyrystin/.test(n)) && n2.some((n) => /Jäähdytysvesikenno/.test(n)), `variantin vaihto → nestekierto: ei kylmäainevaiheita, vesikenno tulee (${n2.join(' | ')})`);
  await vis(pb).locator('label', { hasText: 'Jäähdytystapa' }).locator('select').selectOption('dx_neste'); await pb.waitForTimeout(700);
  n2 = await stepsOf(pb);
  check(n2.some((n) => /^Kylmäaine$/.test(n)) && n2.some((n) => /^Lauhdutin$|^Lauhdutuspiiri$/.test(n)), `variantin vaihto → dx_neste: kylmäainevaiheet takaisin (${n2.join(' | ')})`);
  const ls = await vis(pb).locator('label', { hasText: 'Lauhdutustapa' }).locator('select').inputValue();
  check(ls === 'nestekiertoinen_vain_lmv', `variantin vaihto → dx_neste: lauhdutustapa vaihtuu nestelauhdutukseen (${ls})`);
  await B.ctx.close();
}
// ---- vanha VAK-luonnos ilman variantti-kenttää: päätellään datasta
{
  const L = await openNew('vakioilmastointtikone', { laiteKokoonpano: { vakKylmaainepiiri: false, kostutus: true } , kylmaainePiireja: '1' });
  const nl = await stepsOf(L.p);
  check(!nl.some((n) => /Kylmäaine|Piiri|Lauhdutin/.test(nl.join())) || !nl.some((n) => /^Kylmäaine$/.test(n)), `vanha kokoonpano (vakKylmaainepiiri=false) → nestekierto (${nl.join(' | ')})`);
  await gotoStep(L.p, /^Perustiedot$/);
  check((await sel(L.p, /^Jäähdytystapa/))?.v === 'nestekierto', 'vanha kokoonpano: Jäähdytystapa päätellään nestekierroksi');
  await L.ctx.close();
}
console.log(fails ? `FAILS ${fails}` : 'ALL OK');
await b.close(); process.exit(fails ? 1 : 0);
