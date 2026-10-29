// Asennuskehote: beforeinstallprompt kaapataan heti, banneri + pysyvä 'Asenna sovellus' -painike, sulkeminen vain 7 pv. Supabase mockattu.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5296 & BASE=http://localhost:5296 node scripts/e2e-pwa-install.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5296';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const checks = {};
async function run(label, ua, fn) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', userAgent: ua });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    return json(single ? null : []);
  });
  const p = await ctx.newPage();
  await fn(p, ctx); await ctx.close();
}
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
await run('android', ANDROID, async (p) => {
  await p.addInitScript(() => localStorage.setItem('bc-smartapp-pwa-install-dismissed', '1')); // vanha pysyvä piilotus
  await p.goto(BASE + '/'); await p.waitForTimeout(3000);
  await p.evaluate(() => { window.__prompted = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await p.waitForTimeout(800);
  checks['android: banneri näkyy vanhan piilotuksen jälkeen'] = (await p.getByTestId('pwa-install-banner').count()) === 1;
  await p.getByTestId('pwa-install-banner').getByRole('button', { name: 'Asenna', exact: true }).click(); await p.waitForTimeout(500);
  checks['android: natiivi asennusdialogi avattiin'] = (await p.evaluate(() => window.__prompted)) === 1;
  checks['android: banneri poistuu asennuksen jälkeen'] = (await p.getByTestId('pwa-install-banner').count()) === 0;
});
await run('ios', IPHONE, async (p) => {
  await p.goto(BASE + '/'); await p.waitForTimeout(3000);
  const t = await p.getByTestId('pwa-install-banner').innerText().catch(() => '');
  checks['ios: ohje näkyy ensimmäisellä käynnillä'] = /Jaa/.test(t) && /Koti/.test(t);
  await p.getByTestId('pwa-install-banner').getByRole('button', { name: 'Selvä' }).click(); await p.waitForTimeout(300);
  checks['ios: sulkeminen piilottaa'] = (await p.getByTestId('pwa-install-banner').count()) === 0;
  await p.reload(); await p.waitForTimeout(2500);
  checks['ios: pysyy piilossa uudelleenlatauksessa (7 pv)'] = (await p.getByTestId('pwa-install-banner').count()) === 0;
  await p.getByRole('button', { name: 'Avaa valikko' }).click(); await p.waitForTimeout(500);
  const btn = p.getByTestId('install-app-button');
  if (await btn.count()) { await btn.first().click(); await p.waitForTimeout(400); }
  checks['ios: Asenna sovellus -painike palauttaa ohjeen'] = (await btn.count()) > 0 && (await p.getByTestId('pwa-install-banner').count()) === 1;
});
console.log(JSON.stringify(checks, null, 1));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
