// Asiakas-/tilaajaportaali ohittaa pakettiportin; henkilökunta (vanhentunut kokeilu) näkee sen edelleen. Supabase mockattu, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5302 & BASE=http://localhost:5302 node scripts/e2e-portal-license-gate.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5302';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1', custId = '00000000-0000-4000-8000-0000000000d1';
const mkProfile = (role) => ({ id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: null, role, company_id: cid, subscriber_id: null, customer_id: role === 'customer' ? custId : null, is_global_admin: false, must_change_password: false });
const license = { enrollment: 'self_serve', effective_status: 'expired', status: 'expired', trial_days: 14, trial_ends_at: '2026-01-01T00:00:00Z', modules: [], module_trials: [] };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const checks = {};
for (const role of ['customer', 'admin']) {
  const profile = mkProfile(role);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
    if (/rpc\/(company_license_snapshot|start_company_trial_on_login)/.test(u.pathname)) return json(license);
    if (u.pathname.includes('/rpc/')) return json(null);
    return json(single ? null : []);
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/tyoraportit`); await p.waitForTimeout(5000);
  const body = await p.locator('body').innerText();
  const locked = /ei ole käytössä/.test(body) && /Ilmainen kokeilujakso/.test(body);
  checks[`${role}: paketti-portti ${role === 'customer' ? 'EI näy' : 'näkyy'}`] = role === 'customer' ? !locked : locked;
  checks[`${role}: ei sivuvirheitä`] = errs.length === 0;
  await ctx.close();
}
await b.close();
console.log(checks);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
