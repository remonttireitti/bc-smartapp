// Asiakasportaalin dokumentit: PDF-painike, Tulostettu-merkintä, ei sisäistä vierityslaatikkoa, Poista yrityksen näkymässä. Supabase mockattu, ei oikeita kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5303 & BASE=http://localhost:5303 node scripts/e2e-portal-documents.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5303';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1', custId = '00000000-0000-4000-8000-0000000000d1';
const mkProfile = (role) => ({ id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: null, role, company_id: cid, subscriber_id: null, customer_id: role === 'customer' ? custId : null, is_global_admin: false, must_change_password: false, companies: { name: 'UKH' } });
const customer = { id: custId, name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const license = { enrollment: 'legacy', effective_status: 'active', status: 'active', base_active: true, modules: {} };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const mkReport = (i, title) => ({ id: `00000000-0000-4000-8000-0000000000a${i}`, status: 'submitted', title, data: { huoltoPaivamaara: '2026-10-0' + i, laiteTunnus: 'KM-' + i, reportCategory: 'kylma', osoite: 'Messuaukio 1' }, updated_at: `2026-10-0${i}T10:00:00Z`, created_at: `2026-10-0${i}T10:00:00Z`, customer_id: custId, subscriber_id: null, subscriber_portal_visibility: null, equipment_id: null, owner_company_id: cid, created_by_company_id: cid, assigned_user_id: null, branding_company_id: cid, customers: { name: 'Messukeskus', subscriber_id: null }, equipment: { name: 'Koneikko ' + i, tag: 'KM-' + i }, owner_company: { name: 'UKH' }, branding_company: { name: 'UKH' } });
const b = await chromium.launch();
const checks = {};

async function run(label, { role, path, logSupported, reports }) {
  const profile = mkProfile(role);
  const log = new Map([[`maintenance_report:${reports[0]?.id}`, '2026-10-03T08:00:00Z']]);
  const upserts = [], deletes = [], otherWrites = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki', acceptDownloads: true });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const m = req.method();
    if (u.pathname.endsWith('/document_print_log')) {
      if (!logSupported) return json({ code: '42P01', message: 'relation "public.document_print_log" does not exist' }, 404);
      if (m === 'POST') { const body = JSON.parse(req.postData() || '{}'); upserts.push(body); log.set(`${body.kind}:${body.doc_id}`, body.printed_at); return json([body], 201); }
      const kind = (u.searchParams.get('kind') || '').replace('eq.', '');
      return json([...log.entries()].filter(([k]) => k.startsWith(kind + ':')).map(([k, v]) => ({ doc_id: k.split(':')[1], printed_at: v })));
    }
    if (m === 'DELETE') {
      deletes.push(u.pathname + u.search);
      const id = (u.searchParams.get('id') || '').replace('eq.', '');
      const idx = reports.findIndex((r) => r.id === id);
      if (idx >= 0 && u.pathname.endsWith('/maintenance_reports')) { reports.splice(idx, 1); return json([{ id }]); }
      return json([]);
    }
    if (m !== 'GET' && m !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { otherWrites.push(m + ' ' + u.pathname); return json(single ? {} : []); }
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', logo_url: null, modules: null } : [{ id: cid, name: 'UKH', logo_url: null, modules: null }]);
    if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
    if (u.pathname.endsWith('/maintenance_reports')) {
      const rawId = u.searchParams.get('id') || ''; const id = rawId.startsWith('eq.') ? rawId.slice(3) : null;
      const sel = u.searchParams.get('select') || '';
      let l = id ? reports.filter((r) => r.id === id) : reports.filter((r) => !u.searchParams.get('customer_id') || r.customer_id === custId);
      if (sel.startsWith('id, data, branding')) l = l.map((r) => ({ id: r.id, data: r.data, branding_company_id: r.branding_company_id, owner_company_id: r.owner_company_id, customer_id: r.customer_id }));
      return json(single ? l[0] ?? null : l);
    }
    if (u.pathname.endsWith('/work_reports')) {
      const w = { id: '00000000-0000-4000-8000-0000000000f1', title: 'Venttiilin vaihto', heading: 'Venttiilin vaihto', description: 'Vaihdettiin venttiili', orderer_name: 'Matti', location_text: 'Halli', status: 'completed', scheduled_start: '2026-10-06T08:00:00Z', scheduled_end: null, completed_at: '2026-10-06T12:00:00Z', created_at: '2026-10-06T08:00:00Z', updated_at: '2026-10-06T12:00:00Z', owner_company_id: cid, created_by_company_id: cid, created_by_user_id: uid, branding_company_id: cid, partnership_id: null, customer_id: custId, equipment_id: null, assigned_user_id: null, subscriber_portal_visibility: null, customers: { name: 'Messukeskus' }, equipment: null, owner_company: { name: 'UKH' }, branding_company: { name: 'UKH' }, created_by_company: { name: 'UKH' } };
      return json(single ? w : [w]);
    }
    if (u.pathname.endsWith('/quote_requests')) {
      const q = { id: '00000000-0000-4000-8000-0000000000b1', title: 'Tarjous huollosta', status: 'sent', data: { type: 'huolto', customerName: 'Messukeskus', description: 'Kylmälaitteiden huolto' }, created_at: '2026-10-04T10:00:00Z', updated_at: '2026-10-04T10:00:00Z', equipment_id: null, owner_company_id: cid, created_by_company_id: cid, branding_company_id: cid, customer_id: custId, equipment: null, customers: { name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki' } };
      return json(single ? q : [q]);
    }
    if (u.pathname.includes('/rpc/')) return json(/license|trial/.test(u.pathname) ? license : null);
    return json(single ? null : []);
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}${path}`); await p.waitForTimeout(5000);
  const vis = '.keep-alive-panel:not([hidden])';
  const root = (await p.locator(vis).count()) ? p.locator(vis) : p.locator('body');
  return { p, ctx, root, errs, upserts, deletes, otherWrites, label };
}

// 1) Asiakasportaali, loki käytössä
{
  const reports = [mkReport(3, 'Huolto 3'), mkReport(5, 'Huolto 5')];
  const t = await run('portaali', { role: 'customer', path: '/huoltoraportit', logSupported: true, reports });
  const { p, root } = t;
  const txt = await root.innerText();
  checks['portaali: PDF-painike jokaisella rivillä (2)'] = (await root.getByRole('button', { name: 'PDF', exact: true }).count()) === 2;
  checks['portaali: Tulostettu 3.10.2026'] = /Tulostettu 3\.10\.2026/.test(txt);
  checks['portaali: Ei tulostettu toisella'] = /Ei tulostettu/.test(txt);
  checks['portaali: lyhyt otsikkoteksti (ei pitkää ohjetta)'] = !/Varmista, että asiakaskohde/.test(txt) && !/Luonnokset eivät näy/.test(txt);
  const scroll = await p.evaluate(() => { const el = document.querySelector('.data-table-scroll'); if (!el) return null; const cs = getComputedStyle(el); return { maxH: cs.maxHeight, oy: cs.overflowY, fits: el.scrollHeight <= el.clientHeight + 1 }; });
  checks['portaali: ei sisäistä pystyvieritystä'] = !!scroll && scroll.maxH === 'none' && scroll.oy !== 'scroll' && scroll.fits;
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }).catch(() => null), root.getByRole('button', { name: 'PDF', exact: true }).nth(1).click()]);
  checks['portaali: PDF latautuu suoraan (.pdf)'] = !!dl && /\.pdf$/i.test(dl.suggestedFilename());
  if (dl) { const path = await dl.path(); const fs = await import('node:fs'); checks['portaali: tiedosto on PDF'] = fs.readFileSync(path).subarray(0, 5).toString() === '%PDF-'; }
  await p.waitForTimeout(1500);
  checks['portaali: tulostus kirjattu (upsert)'] = t.upserts.length === 1 && t.upserts[0].kind === 'maintenance_report';
  const today = new Date(); const todayFi = `${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
  checks['portaali: merkintä päivittyi tänään'] = (await root.innerText()).includes(`Tulostettu ${todayFi}`);
  checks['portaali: ei muita kirjoituksia'] = t.otherWrites.length === 0 && t.deletes.length === 0;
  checks['portaali: ei Poista-nappeja'] = (await root.getByRole('button', { name: /Poista/ }).count()) === 0;
  checks['portaali: ei sivuvirheitä'] = t.errs.length === 0;
  await t.ctx.close();
}
// 2) Loki puuttuu (SQL ajamatta): ei merkintää, PDF silti
{
  const reports = [mkReport(3, 'Huolto 3')];
  const t = await run('ei-lokia', { role: 'customer', path: '/huoltoraportit', logSupported: false, reports });
  const txt = await t.root.innerText();
  checks['ei-lokia: PDF-painike näkyy'] = (await t.root.getByRole('button', { name: 'PDF', exact: true }).count()) === 1;
  checks['ei-lokia: ei Tulostettu-merkintää'] = !/Tulostettu|Ei tulostettu/.test(txt);
  checks['ei-lokia: ei sivuvirheitä'] = t.errs.length === 0;
  await t.ctx.close();
}
// 3) Yrityksen näkymä: Poista dokumentille
{
  const reports = [mkReport(3, 'Huolto 3'), mkReport(5, 'Huolto 5')];
  const t = await run('yritys', { role: 'admin', path: `/asiakkaat/${custId}`, logSupported: true, reports });
  const { p } = t; let root = t.root;
  await root.getByText(/Huoltoraportit \(2\)/).first().click().catch(() => null); await p.waitForTimeout(800);
  checks['yritys: Poista-painikkeet (2)'] = (await root.getByRole('button', { name: 'Poista', exact: true }).count()) === 2;
  checks['yritys: ei PDF-painiketta henkilökunnalle'] = (await root.getByRole('button', { name: 'PDF', exact: true }).count()) === 0;
  p.once('dialog', (d) => d.dismiss());
  await root.getByRole('button', { name: 'Poista', exact: true }).first().click(); await p.waitForTimeout(600);
  checks['yritys: peruutus ei poista'] = t.deletes.length === 0;
  let confirmMsg = '';
  p.once('dialog', (d) => { confirmMsg = d.message(); d.accept(); });
  await root.getByRole('button', { name: 'Poista', exact: true }).first().click(); await p.waitForTimeout(1500);
  checks['yritys: vahvistusdialogi + DELETE kutsuttu'] = /pysyvästi/.test(confirmMsg) && t.deletes.length === 1 && /maintenance_reports/.test(t.deletes[0]);
  checks['yritys: rivi poistui listalta'] = (await root.getByRole('button', { name: 'Poista', exact: true }).count()) === 1;
  checks['yritys: ei sivuvirheitä'] = t.errs.length === 0;
  await t.ctx.close();
}
// 4) Tarjous (asiakasportaali): PDF tulostussivun kautta
{
  const t = await run('tarjous', { role: 'customer', path: '/tarjoukset', logSupported: true, reports: [] });
  const { p, root } = t;
  const n = await root.getByRole('button', { name: 'PDF', exact: true }).count();
  checks['tarjous: PDF-painike'] = n === 1;
  checks['tarjous: Ei tulostettu'] = /Ei tulostettu/.test(await root.innerText());
  if (n === 1) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }).catch(() => null), root.getByRole('button', { name: 'PDF', exact: true }).click()]);
    checks['tarjous: PDF latautuu (.pdf)'] = !!dl && /\.pdf$/i.test(dl.suggestedFilename());
    if (dl) { const fs = await import('node:fs'); const buf = fs.readFileSync(await dl.path()); checks['tarjous: tiedosto on PDF'] = buf.subarray(0, 5).toString() === '%PDF-'; console.log('quote pdf', dl.suggestedFilename(), buf.length); }
    await p.waitForTimeout(1500);
    checks['tarjous: tulostus kirjattu'] = t.upserts.length === 1 && t.upserts[0].kind === 'quote_request';
  }
  checks['tarjous: ei sivuvirheitä'] = t.errs.length === 0;
  await t.ctx.close();
}
// 5) Työraportti (asiakasportaali)
{
  const t = await run('tyo', { role: 'customer', path: '/tyoraportit', logSupported: true, reports: [] });
  const { p, root } = t;
  const n = await root.getByRole('button', { name: 'PDF', exact: true }).count();
  checks['työ: PDF-painike'] = n >= 1;
  if (n >= 1) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }).catch(() => null), root.getByRole('button', { name: 'PDF', exact: true }).first().click()]);
    checks['työ: PDF latautuu (.pdf)'] = !!dl && /\.pdf$/i.test(dl.suggestedFilename());
    if (dl) { const fs = await import('node:fs'); const buf = fs.readFileSync(await dl.path()); checks['työ: tiedosto on PDF'] = buf.subarray(0, 5).toString() === '%PDF-'; console.log('work pdf', dl.suggestedFilename(), buf.length); }
    await p.waitForTimeout(1500);
    checks['työ: tulostus kirjattu'] = t.upserts.length === 1 && t.upserts[0].kind === 'work_report';
  } else console.log((await root.innerText()).slice(0, 400));
  checks['työ: ei sivuvirheitä'] = t.errs.length === 0;
  await t.ctx.close();
}
await b.close();
console.log(checks);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
