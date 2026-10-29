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
// 1) Tavallinen työkirjaus → Urakka-kytkin Takuun vieressä.
await p.locator('.work-report-entry-tile', { hasText: 'Kylmälaitehuolto' }).first().click(); await p.waitForTimeout(800);
const dlg = p.locator('[role="dialog"], .leave-draft-overlay, .daily-log-dialog').last();
const urakkaSw = p.getByRole('switch', { name: 'Urakka', exact: true });
const takuuSw = p.getByRole('switch', { name: 'Takuu', exact: true });
checks['Urakka-kytkin näkyy'] = (await urakkaSw.count()) === 1;
checks['Takuu-kytkin näkyy'] = (await takuuSw.count()) >= 1;
checks['ei pikatekstejä'] = !(await body()).includes('Hälytys kuitattu') && !(await body()).includes('Höyrystin sulatettu');
const sameRow = await p.evaluate(() => { const u = [...document.querySelectorAll('button[role=switch]')].find((e) => e.parentElement?.textContent?.trim() === 'Urakka'); const t = [...document.querySelectorAll('button[role=switch]')].find((e) => e.parentElement?.textContent?.trim() === 'Takuu'); return !!u && !!t && u.parentElement.parentElement === t.parentElement.parentElement && u.parentElement.className === t.parentElement.className; });
checks['Urakka ja Takuu samaa tyyliä vierekkäin'] = sameRow;
checks['hinta piilossa ennen kytkintä'] = (await p.getByText('Urakkahinta (€, alv 0 %)').count()) === 0;
await urakkaSw.click(); await p.waitForTimeout(400);
const priceLabel = p.locator('label', { hasText: 'Urakkahinta (€, alv 0 %)' }).first();
checks['Urakkahinta-kenttä näkyy'] = (await priceLabel.count()) > 0;
const priceInput = priceLabel.locator('input');
const hoursSw = p.getByRole('switch', { name: 'Laskutettava (tunnit)' });
checks['tunnit: Laskutettava näkyy urakassa, oletus pois'] = (await hoursSw.count()) === 1 && (await hoursSw.getAttribute('aria-checked')) === 'false';
await hoursSw.click(); await p.waitForTimeout(200);
checks['tunnit: Laskutettava päälle'] = (await hoursSw.getAttribute('aria-checked')) === 'true';
await priceInput.fill('3000');
const box = await priceInput.evaluate((el) => ({ h: el.getBoundingClientRect().height, fs: getComputedStyle(el).fontSize }));
console.log('box', JSON.stringify(box)); checks['kenttä 48 px / 16 px'] = Math.round(box.h) === 48 && box.fs === '16px';
await p.getByRole('button', { name: 'Tallenna muutokset' }).click(); await p.waitForTimeout(1200);
const patch1 = writes.find((w) => w.path === 'work_report_daily_logs' && w.method === 'PATCH');
console.log('patch1', JSON.stringify(patch1?.body)?.slice(0, 400));
checks['tallennus: fixed_price + hinta'] = patch1?.body?.entry_type === 'fixed_price' && Number(patch1?.body?.customer_fixed_price_amount) === 3000 && Number(patch1?.body?.fixed_price_amount) === 2700;
checks['tallennus: hours_row_billed'] = patch1?.body?.partner_billing?.hours_row_billed === true;
checks['tallennus: urakka_all_in'] = patch1?.body?.partner_billing?.urakka_all_in === true;
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
