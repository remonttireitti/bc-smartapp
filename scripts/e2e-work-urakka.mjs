// Työraportin rivin muokkaus: Urakka-kytkin, Urakkahinta, Laskutettava-rivikytkimet, pikatekstit pois. Supabase mockattu, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5296 & BASE=http://localhost:5296 node scripts/e2e-work-urakka.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5296';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1', rid = '00000000-0000-4000-8000-0000000000f1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const report = { id: rid, title: 'Huolto', heading: 'Huolto', description: null, orderer_name: null, location_text: null, status: 'in_progress', scheduled_start: null, scheduled_end: null, completed_at: null, owner_company_id: cid, created_by_company_id: cid, created_by_user_id: uid, branding_company_id: cid, partnership_id: null, customer_id: null, equipment_id: null, assigned_user_id: uid, delegate_company_id: null, delegated_at: null, created_at: '2026-10-27T08:00:00Z', subscriber_id: null, subscriber_portal_visibility: null, customers: null, equipment: null, owner_company: { name: 'UKH' }, branding_company: { name: 'UKH' }, created_by_company: { name: 'UKH' }, delegate_company: null, assigned_user: { display_name: 'Testi' }, created_by_user: { display_name: 'Testi', email: 't@example.com' } };
const baseLog = { work_report_id: rid, log_start_time: '08:00', hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: uid, fixed_price_amount: null, customer_fixed_price_amount: null, partner_urakka_margin_percent: null, hourly_rate_override: null, customer_hourly_rate_override: null, commission_amount: 0, commission_note: null, customer_extra_beyond_quote: false, customer_extra_billing: {}, trip_legs: [], refrigerant_lines: [], partner_purchase_lines: [], author: { display_name: 'Testi' }, author_name_snapshot: null, author_deleted: false };
const exp = (id, logId, i, d, p) => ({ id, daily_log_id: logId, expense_type: 'material', description: d, qty: 1, unit_price: p, bill_to_partner: true, bill_to_customer: true, customer_unit_price: p, extra_billable: false, extra_billing_allowed: false, customer_margin_percent: null, warehouse_company_id: null, warehouse_cost_deducted: false, sort_order: i });
const logs = [
  { ...baseLog, id: 'l1', log_date: '2026-10-27', created_at: '2026-10-27T08:00:00Z', entry_type: 'regular', hours_regular: 8, work_done: 'Kylmälaitehuolto', partner_billing: null, expense_lines: [] },
  { ...baseLog, id: 'l2', log_date: '2026-10-28', created_at: '2026-10-28T08:00:00Z', entry_type: 'fixed_price', hours_regular: 4, fixed_price_amount: 2500, work_done: 'Urakkatyö', partner_billing: { urakka_all_in: true }, expense_lines: [exp('x1', 'l2', 0, 'Putki', 100), exp('x2', 'l2', 1, 'Kaapeli', 40)] },
  { ...baseLog, id: 'l3', log_date: '2026-10-29', created_at: '2026-10-29T08:00:00Z', entry_type: 'regular', hours_regular: 1, work_done: 'Takuukäynti', partner_billing: { warranty: true }, expense_lines: [exp('w1', 'l3', 0, 'Venttiili', 60)] },
];
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki' });
await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
const writes = [];
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) {
    let body = null; try { body = req.postDataJSON(); } catch { /* ei jsonia */ }
    writes.push({ method: req.method(), path: u.pathname.split('/').pop(), url: u.search, body });
    return json(single ? { id: 'new-1' } : []);
  }
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
  if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null, settings: {} } : [{ id: cid, name: 'UKH', modules: null, settings: {} }]);
  if (u.pathname.endsWith('/work_reports')) return json(single ? report : [report]);
  if (u.pathname.endsWith('/work_report_daily_logs')) return json(logs);
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/tyoraportit/${rid}`); await p.waitForTimeout(5000);
const checks = {};
const body = async () => (await p.locator('body').innerText());
checks['sivu latautui'] = (await body()).includes('Kylmälaitehuolto');
checks['urakka-merkki ruudussa'] = (await p.locator('.work-report-entry-tile-marker', { hasText: 'urakka' }).count()) > 0;
// 1) Työkirjauksen ikkunassa EI Urakka/Takuu-kytkimiä eikä urakkahintaa (koko raportin asia).
await p.locator('.work-report-entry-tile', { hasText: 'Kylmälaitehuolto' }).first().click(); await p.waitForTimeout(800);
checks['kirjauksessa ei Urakka-kytkintä'] = (await p.getByRole('switch', { name: 'Urakka', exact: true }).count()) === 0;
checks['kirjauksessa ei Takuu-kytkintä'] = (await p.getByRole('switch', { name: 'Takuu', exact: true }).count()) === 0;
checks['kirjauksessa ei urakkahintaa'] = (await p.getByText('Urakkahinta (€', { exact: false }).count()) === 0;
checks['ei pikatekstejä'] = !(await body()).includes('Hälytys kuitattu') && !(await body()).includes('Höyrystin sulatettu');
const exSw = p.getByRole('switch', { name: 'Lisälaskutus (urakan päälle)' });
const exSwLabel = p.locator('label', { hasText: 'Lisälaskutus (urakan päälle)' }).first();
checks['kirjauksessa Lisälaskutus-kytkin urakkaraportissa'] = (await exSwLabel.count()) === 1;
// Kytkimet eivät mene päällekkäin / leikkaannu.
const rects = await p.evaluate(() => [...document.querySelectorAll('.daily-log-toggle-row .compact-option')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: e.scrollWidth, cw: e.clientWidth, h: r.height }; }));
let overlap = false; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const A = rects[i], B = rects[j]; if (A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b) overlap = true; }
checks['kytkimet eivät ole päällekkäin'] = !overlap && rects.every((r) => r.w <= r.cw + 1);
checks['kytkinrivi 48 px'] = rects.every((r) => Math.round(r.h) >= 48);
await p.getByRole('button', { name: 'Peruuta' }).click(); await p.waitForTimeout(400);

// 2) Koko raportin Urakka ja takuu -ruutu.
await p.locator('.work-report-section-tile', { hasText: 'Urakka ja takuu' }).first().click(); await p.waitForTimeout(600);
const udlg = p.locator('.work-report-section-dialog');
checks['Urakka ja takuu -ikkuna'] = (await udlg.count()) === 1;
checks['Urakka päällä (raportissa urakkakirjaus)'] = (await udlg.getByRole('switch', { name: 'Urakka', exact: true }).getAttribute('aria-checked')) === 'true';
checks['Takuu päällä (l3 on takuukirjaus)'] = (await udlg.getByRole('switch', { name: 'Takuu', exact: true }).getAttribute('aria-checked')) === 'true';
const direct = udlg.locator('.urakka-report-field input').first();
checks['suora kumppanihinta 2500'] = (await direct.inputValue()) === '2500';
const fbox = await direct.evaluate((el) => ({ h: el.getBoundingClientRect().height, fs: getComputedStyle(el).fontSize }));
checks['kenttä 48 px / 16 px'] = Math.round(fbox.h) === 48 && fbox.fs === '16px';
// Käänteinen laskenta: asiakashinta 5000, 90 % kumppanilta.
await udlg.getByRole('switch', { name: 'Laske asiakashinnasta' }).click(); await p.waitForTimeout(200);
await udlg.locator('.urakka-report-field input').first().fill('5000');
checks['90 % oletus'] = (await udlg.locator('.urakka-report-field input').nth(1).inputValue()) === '90';
const billTxt = (await udlg.getByTestId('urakka-partner-bill').innerText()).replace(/\s/g, ' ');
const keepTxt = (await udlg.getByTestId('urakka-partner-keeps').innerText()).replace(/\s/g, ' ');
console.log('calc', billTxt, '|', keepTxt);
checks['kumppanille 4 500,00 €'] = billTxt.includes('4500,00') || billTxt.includes('4 500,00');
checks['jää kumppanille 500,00 €'] = keepTxt.includes('500,00');
await udlg.locator('.urakka-report-field input').nth(1).fill('85'); await p.waitForTimeout(100);
checks['85 % → 4 250'] = (await udlg.getByTestId('urakka-partner-bill').innerText()).includes('4250,00');
await udlg.locator('.urakka-report-field input').nth(1).fill('90');
writes.length = 0;
await udlg.getByRole('button', { name: 'Tallenna' }).click(); await p.waitForTimeout(1200);
const pr = writes.find((w) => w.path === 'work_report_daily_logs' && w.method === 'PATCH');
console.log('price patch', JSON.stringify(pr?.body), pr?.url, 'writes', JSON.stringify(writes).slice(0,500), 'dlg', (await p.locator('.work-report-section-dialog').innerText().catch(() => 'none')).slice(0, 300), 'errs', errs.slice(0,3));
checks['hinta tallentuu urakkakirjaukselle l2'] = pr?.url.includes('l2') && Number(pr?.body?.customer_fixed_price_amount) === 5000 && Number(pr?.body?.fixed_price_amount) === 4500 && Number(pr?.body?.partner_urakka_margin_percent) === 10;
// Takuu koko raportille.
await p.locator('.work-report-section-tile', { hasText: 'Urakka ja takuu' }).first().click(); await p.waitForTimeout(600);
writes.length = 0;
await p.locator('.work-report-section-dialog').getByRole('switch', { name: 'Takuu', exact: true }).click(); await p.waitForTimeout(1500);
const wp = writes.filter((w) => w.path === 'work_report_daily_logs' && w.method === 'PATCH');
console.log('warranty patches', wp.length, JSON.stringify(wp.map((w) => [w.url, w.body?.partner_billing])));
checks['takuu pois: kaikki 3 kirjausta päivittyvät, lippu pois'] = wp.length === 3 && wp.every((w) => !w.body?.partner_billing?.warranty && !w.body?.partner_billing?.trips_warranty);
const l3p = wp.find((w) => w.url.includes('l3'));
checks['takuu pois: kulurivin takuu pois'] = l3p?.body?.customer_extra_billing?.supply_line_flags?.[0]?.warranty === undefined && Array.isArray(l3p?.body?.customer_extra_billing?.supply_line_flags);
// Urakka pois → kaikki urakkakirjaukset tavallisiksi, hinta pois.
writes.length = 0;
await p.locator('.work-report-section-dialog').getByRole('switch', { name: 'Urakka', exact: true }).click(); await p.waitForTimeout(1200);
const up = writes.filter((w) => w.path === 'work_report_daily_logs' && w.method === 'PATCH');
checks['urakka pois: urakkakirjaus tavalliseksi, hinta tyhjä'] = up.length === 1 && up[0].body?.entry_type === 'regular' && up[0].body?.fixed_price_amount === null;
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// 3) + Lisää laite toimii kuten + Lisää kulu.
const addDev = p.getByRole('button', { name: '+ Lisää laite' });
checks['+ Lisää laite -nappi'] = (await addDev.count()) === 1;
checks['ei vanhaa + Laite -ruutua'] = (await p.locator('.work-report-entry-tile', { hasText: '+ Laite' }).count()) === 0;
await addDev.click(); await p.waitForTimeout(800);
checks['Lisää laite -ikkuna (päivä + laite)'] = (await p.getByText('Lisää laite', { exact: true }).count()) >= 1 && (await p.getByRole('button', { name: '+ Lisää laite' }).count()) >= 1;
await p.getByRole('button', { name: 'Peruuta' }).click(); await p.waitForTimeout(400);
checks['ei "Tilaaja myy laitteen" -nappia'] = !(await body()).includes('Tilaaja myy laitteen');

// 2) Urakkakirjauksen kulurivit: Laskutettava oletuksena pois, päälle → tallentuu urakka_billed.
writes.length = 0;
await p.goto(`${BASE}/tyoraportit/${rid}`); await p.waitForTimeout(4000);
const matTile = p.locator('.work-report-entry-tile', { hasText: 'Putki' });
console.log('tiles', JSON.stringify(await p.locator('.work-report-entry-tile').allInnerTexts()));
await matTile.first().click(); await p.waitForTimeout(800);
const rowSw = p.getByRole('switch', { name: 'Laskutettava' });
checks['rivillä Laskutettava'] = (await rowSw.count()) === 2;
checks['Laskutettava oletuksena pois'] = (await rowSw.first().getAttribute('aria-checked')) === 'false';
await rowSw.nth(1).click(); await p.waitForTimeout(300);
checks['Laskutettava päälle'] = (await rowSw.nth(1).getAttribute('aria-checked')) === 'true';
await p.getByRole('button', { name: 'Muokkaa' }).nth(1).click(); await p.waitForTimeout(500);
checks['rivin muokkausikkunassa Laskutettava'] = (await rowSw.count()) === 3;
await p.getByRole('button', { name: 'Valmis' }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Tallenna/ }).click(); await p.waitForTimeout(1200);
const flagsWrite = writes.find((w) => w.path === 'work_report_daily_logs' && w.body?.customer_extra_billing?.supply_line_flags);
console.log('flags', JSON.stringify(flagsWrite?.body?.customer_extra_billing?.supply_line_flags));
const f = flagsWrite?.body?.customer_extra_billing?.supply_line_flags;
checks['tallennus: urakka_billed vain 2. riville'] = Array.isArray(f) && f.length === 2 && !f[0].urakka_billed && f[1].urakka_billed === true;
// 3) Takuu-kirjaus: rivillä Laskutettava (takuun ulkopuolinen) → pois päältä = takuu.
writes.length = 0;
await p.goto(`${BASE}/tyoraportit/${rid}`); await p.waitForTimeout(4000);
await p.locator('.work-report-entry-tile', { hasText: 'Takuukäynti' }).first().click(); await p.waitForTimeout(800);
checks['takuu: tunnit Laskutettava näkyy, oletus pois'] = (await p.getByRole('switch', { name: 'Laskutettava (tunnit)' }).count()) === 1 && (await p.getByRole('switch', { name: 'Laskutettava (tunnit)' }).getAttribute('aria-checked')) === 'false';
await p.getByRole('button', { name: 'Peruuta' }).click(); await p.waitForTimeout(400);
await p.locator('.work-report-entry-tile', { hasText: 'Venttiili' }).first().click(); await p.waitForTimeout(800);
const wSw = p.getByRole('switch', { name: 'Laskutettava' });
checks['takuu: rivillä Laskutettava'] = (await wSw.count()) === 1;
await wSw.first().click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Tallenna/ }).click(); await p.waitForTimeout(1200);
const wf = writes.find((w) => w.path === 'work_report_daily_logs' && w.body?.customer_extra_billing?.supply_line_flags)?.body?.customer_extra_billing?.supply_line_flags;
checks['takuu: Laskutettava pois → warranty'] = Array.isArray(wf) && wf[0]?.warranty === true;
checks['ei oikeita kirjoituksia (kaikki mockattu)'] = true;
console.log(JSON.stringify(checks, null, 1), 'errors', errs.slice(0, 3));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
