// Laitekohdistus tallentuu heti (toggle + Valitse kaikki). Supabase mockattu, ei oikeita kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5296 & BASE=http://localhost:5296 node scripts/e2e-work-urakka.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5296';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1', rid = '00000000-0000-4000-8000-0000000000f1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const report = { id: rid, title: 'Huolto', heading: 'Huolto', description: null, orderer_name: null, location_text: null, status: 'in_progress', scheduled_start: null, scheduled_end: null, completed_at: null, owner_company_id: cid, created_by_company_id: cid, created_by_user_id: uid, branding_company_id: cid, partnership_id: null, customer_id: 'cust-1', equipment_id: null, assigned_user_id: uid, delegate_company_id: null, delegated_at: null, created_at: '2026-10-27T08:00:00Z', subscriber_id: null, subscriber_portal_visibility: null, customers: { name: 'Wärtsilä', address: null, postal_code: null, city: null, subscriber_id: null }, equipment: null, owner_company: { name: 'UKH' }, branding_company: { name: 'UKH' }, created_by_company: { name: 'UKH' }, delegate_company: null, assigned_user: { display_name: 'Testi' }, created_by_user: { display_name: 'Testi', email: 't@example.com' } };
const baseLog = { work_report_id: rid, log_start_time: '08:00', hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: uid, fixed_price_amount: null, customer_fixed_price_amount: null, partner_urakka_margin_percent: null, hourly_rate_override: null, customer_hourly_rate_override: null, commission_amount: 0, commission_note: null, customer_extra_beyond_quote: false, customer_extra_billing: {}, trip_legs: [], refrigerant_lines: [], partner_purchase_lines: [], author: { display_name: 'Testi' }, author_name_snapshot: null, author_deleted: false };
const exp = (id, logId, i, d, p) => ({ id, daily_log_id: logId, expense_type: 'material', description: d, qty: 1, unit_price: p, bill_to_partner: true, bill_to_customer: true, customer_unit_price: p, extra_billable: false, extra_billing_allowed: false, customer_margin_percent: null, warehouse_company_id: null, warehouse_cost_deducted: false, sort_order: i });
const equipment = ['JK F81','JK F82','JK F83','JK F84','JK F85'].map((name, i) => ({ id: `eq-${i + 1}`, name, tag: name, model: null, serial_number: null, location: null, customer_id: 'cust-1', device_type: null }));
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
  if (u.pathname.endsWith('/work_report_daily_logs')) return json([]);
  if (u.pathname.endsWith('/equipment')) return json(equipment);
  if (u.pathname.includes('/rpc/')) return json(null);
  return json(single ? null : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/tyoraportit/${rid}`); await p.waitForTimeout(5000);
const checks = {};
await p.locator('.work-report-section-tile', { hasText: 'Perustiedot' }).first().click(); await p.waitForTimeout(800);
const dlg = p.locator('.work-report-section-dialog');
const rows = dlg.locator('.work-report-equipment-assign-row');
checks['5 laitetta + Valitse kaikki'] = (await rows.count()) === 6 && (await dlg.getByRole('switch', { name: 'Valitse kaikki' }).count()) === 1;
// Yksittäinen valinta tallentuu heti
writes.length = 0;
await dlg.getByRole('switch', { name: /JK F81/ }).first().click(); await p.waitForTimeout(1200);
const single = writes.filter((w) => w.path === 'work_report_equipment');
console.log('single', JSON.stringify(writes.map((w) => [w.method, w.path, w.body])).slice(0, 600));
checks['yksi laite: linkit tallennettu heti (poisto + lisäys)'] = single.some((w) => w.method === 'DELETE') && single.some((w) => w.method === 'POST' && Array.isArray(w.body) && w.body.length === 1 && w.body[0].equipment_id === 'eq-1');
checks['yksi laite: työraportin equipment_id'] = writes.some((w) => w.path === 'work_reports' && w.method === 'PATCH' && w.body?.equipment_id === 'eq-1');
checks['ilmoitus tallennettu'] = (await dlg.getByText('Laitekohdistus tallennettu').count()) === 1;
// Valitse kaikki
writes.length = 0;
await dlg.getByRole('switch', { name: 'Valitse kaikki' }).click(); await p.waitForTimeout(1200);
const all = writes.find((w) => w.path === 'work_report_equipment' && w.method === 'POST');
console.log('all', JSON.stringify(all?.body));
checks['Valitse kaikki: kaikki 5 tallentuu yhdellä kertaa'] = Array.isArray(all?.body) && all.body.length === 5 && all.body.map((r) => r.equipment_id).sort().join() === 'eq-1,eq-2,eq-3,eq-4,eq-5';
const sw = await dlg.locator('.work-report-equipment-assign-row:not(.work-report-equipment-assign-all) button[role=switch]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
checks['kaikki kytkimet päällä'] = sw.length === 5 && sw.every((v) => v === 'true');
checks['Valitse kaikki päällä'] = (await dlg.getByRole('switch', { name: 'Valitse kaikki' }).getAttribute('aria-checked')) === 'true';
// Pois
writes.length = 0;
await dlg.getByRole('switch', { name: 'Valitse kaikki' }).click(); await p.waitForTimeout(1200);
checks['Valitse kaikki pois: tyhjä kohdistus tallentuu'] = writes.some((w) => w.path === 'work_report_equipment' && w.method === 'DELETE') && !writes.some((w) => w.path === 'work_report_equipment' && w.method === 'POST');
checks['PATCH equipment_id null'] = writes.some((w) => w.path === 'work_reports' && w.method === 'PATCH' && w.body?.equipment_id === null);
console.log(JSON.stringify(checks, null, 1), 'errors', errs.slice(0, 3));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
