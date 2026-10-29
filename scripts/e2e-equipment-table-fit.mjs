// Asiakkaan laitelista mahtuu 1024/1366 px leveyteen ilman vaakavieritystä; toiminnot ⋯-valikossa. Supabase mockattu, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5304 & BASE=http://localhost:5304 node scripts/e2e-equipment-table-fit.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5304';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const ymd = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const rows = [
  ['Pääkerttiö biojäte huone', 'Pääkerttiö biojäte huone', 'L\'Unite koneikko SILAE4450ZFZ', 'Huollot unneli', 200, 'R-449A', 2],
  ['Päämuuntamon varakone Liebert Hiross', 'Päämuuntamon varakone Liebert Hiross', 'Liebert Hiross 46UA1000000P0', 'Huollot unneli', 3, 'R-407C', 20],
  ['Toimistotalo serverihuone JK1', 'Toimistotalo serverihuone JK1', 'Mitsubishi Heavy SRC80ZM-S', 'Pieni huoltounneli toimitoalossa', 100, 'R-410A', 3],
  ['Toimistotalo serverihuone JK2', 'JK2', 'Mitsubishi Heavy SRC80ZM-S', 'Pieni huoltounneli toimitoalossa', 100, 'R-410A', 3],
  ['Vastaanottokylmiö', 'Vastaanottokylmiö', 'Silensys SILFH4531ZTZ', 'Sisäpihalla', 2, 'R-452A', 4],
  ['VJK-450', 'VJK-450', 'Clivet WSH-XSC150F', 'D-osa IV konehuone', 800, 'R-410A', 46],
];
const devices = rows.map(([n, tag, model, loc, , , ], i) => ({ id: `00000000-0000-4000-8000-0000000000e${i + 1}`, customer_id: customer.id, owner_company_id: cid, name: n, tag, model, serial_number: i === 1 ? '2995900001' : null, location: loc, device_type: 'kylmäkoneikko', public_qr_token: null, created_at: '2026-01-01T00:00:00Z', huolto_technical_snapshot: {}, refrigerant: rows[i][5], refrigerant_amount_kg: rows[i][6] }));
const reports = rows.map(([n, , , , ago], i) => ({ id: `00000000-0000-4000-8000-0000000000a${i + 1}`, status: 'submitted', title: null, equipment_id: devices[i].id, equipment: { name: n, tag: n }, data: { huoltoPaivamaara: ymd(ago) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null }));
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const checks = {};
const writes = [];
async function open(width, height = 900) {
  const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki' });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
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
  await root.getByText(/Laitteet \(\d+\)/).first().click(); await p.waitForTimeout(1500);
  return { ctx, p, root, errs };
}

for (const w of [1024, 1366]) {
  const { ctx, p, root, errs } = await open(w);
  const m = await p.evaluate(() => {
    const list = document.querySelector('.customer-equipment-list');
    const sc = list.querySelector('.data-table-scroll');
    const out = { docOverflow: document.documentElement.scrollWidth - window.innerWidth, scrollOverflow: sc.scrollWidth - sc.clientWidth, rows: 0, brokenWords: [], overlap: 0, chipsBelow: true, subtitles: [], actionsVisible: true, plainDelete: 0 };
    const meas = document.createElement('span'); meas.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:600'; document.body.appendChild(meas);
    list.querySelectorAll('tbody tr').forEach((tr) => {
      out.rows++;
      const nameEl = tr.querySelector('.customer-equipment-name');
      const cs = getComputedStyle(nameEl); meas.style.font = cs.font; meas.style.fontWeight = '600';
      const longest = nameEl.textContent.split(/\s+/).sort((a, b) => b.length - a.length)[0]; meas.textContent = longest;
      if (meas.getBoundingClientRect().width > nameEl.getBoundingClientRect().width + 1) out.brokenWords.push(longest);
      // sijainti/malli: sanat eivät katkea
      tr.querySelectorAll('td:nth-child(2), td:nth-child(4)').forEach((td) => {
        const c = getComputedStyle(td); meas.style.font = c.font; meas.style.fontWeight = c.fontWeight;
        const lw = td.innerText.split(/\s+/).sort((a, b) => b.length - a.length)[0]; meas.textContent = lw;
        const inner = td.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
        if (meas.getBoundingClientRect().width > inner + 1) out.brokenWords.push(lw);
      });
      const tg = tr.querySelector('.toggle-switch'); const tn = tr.querySelector('.customer-equipment-name-text');
      const a = tg.getBoundingClientRect(), bb = tn.getBoundingClientRect();
      if (a.right > bb.left + 0.5 && a.left < bb.right && a.bottom > bb.top && a.top < bb.bottom) out.overlap++;
      const chip = tr.querySelector('.device-chip'); if (chip && chip.getBoundingClientRect().top < nameEl.getBoundingClientRect().bottom - 1) out.chipsBelow = false;
      out.subtitles.push(tr.querySelectorAll('.customer-equipment-name-text small.muted').length);
      const btn = [...tr.querySelectorAll('a,button')].find((x) => x.textContent.trim() === 'Uusi huolto'); const r = btn?.getBoundingClientRect();
      if (!r || r.right > window.innerWidth || r.width === 0) out.actionsVisible = false;
      const mb = tr.querySelector('.row-action-menu-btn')?.getBoundingClientRect(); if (!mb || mb.right > window.innerWidth) out.actionsVisible = false;
      out.plainDelete += [...tr.querySelectorAll('button')].filter((x) => ['Poista', 'Poista käytöstä'].includes(x.textContent.trim())).length;
    });
    return out;
  });
  console.log(w, JSON.stringify(m));
  console.log(w, 'cols', JSON.stringify(await p.evaluate(() => ({ main: document.querySelector('.main')?.getBoundingClientRect().width, scroll: document.querySelector('.customer-equipment-list .data-table-scroll').clientWidth, ths: [...document.querySelectorAll('.customer-equipment-list thead th')].map((t) => t.textContent + ':' + Math.round(t.getBoundingClientRect().width)) }))));
  checks[`${w}: ei sivun vaakavieritystä`] = m.docOverflow <= 0;
  checks[`${w}: taulukko ei vaakavieritä`] = m.scrollOverflow <= 0;
  checks[`${w}: sanat eivät katkea`] = m.brokenWords.length === 0;
  checks[`${w}: kytkin ei peitä nimeä`] = m.overlap === 0;
  checks[`${w}: tilamerkit nimen alla`] = m.chipsBelow;
  checks[`${w}: Uusi huolto + ⋯ näkyvissä`] = m.actionsVisible && m.rows === rows.length;
  checks[`${w}: Poista/Poista käytöstä vain valikossa`] = m.plainDelete === 0;
  checks[`${w}: tuplanimiöt piilossa (vain 2 alaotsikkoa: JK2 + ...)`] = m.subtitles.filter((n) => n > 0).length === 1;
  // valikko
  await root.locator('.row-action-menu-btn').first().click(); await p.waitForTimeout(300);
  const items = await p.locator('.row-action-menu-panel [role=menuitem]').allInnerTexts();
  console.log(w, 'menu', JSON.stringify(items));
  checks[`${w}: valikko sisältää toiminnot`] = ['Tulosta laitekortti', 'Tulosta huoltohistoria', 'Poista käytöstä', 'Poista'].every((x) => items.includes(x));
  const pr = await p.locator('.row-action-menu-panel').boundingBox();
  checks[`${w}: valikko näkyy ruudulla`] = !!pr && pr.x >= 0 && pr.x + pr.width <= w;
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  checks[`${w}: Esc sulkee valikon`] = (await p.locator('.row-action-menu-panel').count()) === 0;
  checks[`${w}: ei sivuvirheitä`] = errs.length === 0;
  await ctx.close();
}
// Mobiili: ei vaakavieritystä
{
  const { ctx, p } = await open(390, 844);
  const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  checks['390: ei vaakavieritystä'] = o <= 0;
  await ctx.close();
}
checks['ei kirjoituksia'] = writes.length === 0;
await b.close();
console.log(checks);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
