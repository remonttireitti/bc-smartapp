// Ajomatkat: km-laskenta ei jää "Lasketaan…"-tilaan. Mockattu Supabase + mockattu reittifunktio, ei kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build -c scripts/e2e-harness/vite.config.mjs
//      (cd /tmp/trip-harness-dist && python3 -m http.server 5312 &) ; BASE=http://localhost:5312 node scripts/e2e-trip-distance.mjs
//      Rakennus käyttää tuotantopolkua (DEV=false) eli oikeaa supabase.functions.invoke-kutsua.
// (HANG=0 ohittaa 80 s jumituskokeen)
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5311';
const uid = '00000000-0000-4000-8000-000000000001';
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const b = await chromium.launch();
const writes = [];

async function scenario(name, handler, fn) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  const bodies = [];
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.endsWith('/functions/v1/calculate-trip-distance')) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
      bodies.push(req.postDataJSON());
      return handler(route);
    }
    if (u.pathname.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) });
    if (req.method() !== 'GET' && req.method() !== 'HEAD') writes.push(`${req.method()} ${u.pathname}`);
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/scripts/e2e-harness/trip-legs.html`);
  await p.getByText('Lasketaan').count(); await p.getByRole('button', { name: 'Laske kaikki reitit' }).waitFor({ timeout: 15000 });
  console.log(`\n# ${name}`);
  await fn(p, bodies);
  check(errs.length === 0, `${name}: ei sivuvirheitä ${errs.join('|')}`);
  await ctx.close();
}
const cors = { 'access-control-allow-origin': '*' };
const ok = (body, status = 200, delay = 0) => async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) }); };
const kmVal = (p) => p.locator('.trip-leg-km-field input').first().inputValue();

await scenario('onnistuu (viive 1,5 s)', ok({ results: [{ distance_km: 401.2, source: 'ors' }] }, 200, 1500), async (p, bodies) => {
  await p.getByRole('button', { name: 'Laske kaikki reitit' }).click();
  check(await p.getByRole('button', { name: 'Lasketaan…' }).isVisible(), 'näyttää Lasketaan… laskennan aikana');
  await p.getByText('401.2 km yhteensä').waitFor({ timeout: 10000 });
  check((await kmVal(p)) === '401.2', 'km-kenttään 401.2');
  check(await p.getByRole('button', { name: 'Laske kaikki reitit' }).isVisible(), 'nappi palaa normaaliksi');
  check(await p.getByText('Km-korvaus').count() >= 0 && !(await p.locator('.trip-leg-calc-error').count()), 'ei virhettä');
  check(bodies[0]?.legs?.[0]?.from === 'Tapionpöydänkuja 6, Tuusula' && bodies[0].legs[0].to === 'Teollisuuskatu 1, Vaasa', 'lähetettiin oikea lähtö ja kohde');
});

await scenario('osuuskohtainen virhe (reittipalvelu ei vastaa)', ok({ results: [{ error: 'Reittipalvelu ei vastaa juuri nyt. Yritä hetken päästä uudelleen tai syötä km käsin.' }] }), async (p) => {
  await p.getByRole('button', { name: 'Laske kaikki reitit' }).click();
  await p.locator('.trip-leg-calc-error').waitFor({ timeout: 10000 });
  check(/Reittipalvelu ei vastaa/.test(await p.locator('.trip-leg-calc-error').innerText()), 'selkeä virhe näkyy');
  check(await p.getByRole('button', { name: 'Laske kaikki reitit' }).isVisible() && (await kmVal(p)) === '', 'nappi vapautuu, km pysyy tyhjänä (käsin syötettävissä)');
  await p.locator('.trip-leg-km-field input').first().fill('402');
  check((await kmVal(p)) === '402', 'km voi syöttää käsin');
});

await scenario('palvelin 500 + virheteksti', ok({ error: 'Jokin meni pieleen palvelimella.' }, 500), async (p) => {
  await p.getByRole('button', { name: 'Laske reitti' }).click();
  await p.locator('.trip-leg-calc-error').waitFor({ timeout: 10000 });
  check(/Jokin meni pieleen palvelimella/.test(await p.locator('.trip-leg-calc-error').innerText()), 'palvelimen suomenkielinen virheteksti näkyy');
  check(await p.getByRole('button', { name: 'Laske reitti' }).isVisible(), 'rivin nappi vapautuu');
});

await scenario('verkkovirhe', (route) => route.abort('failed'), async (p) => {
  await p.getByRole('button', { name: 'Laske kaikki reitit' }).click();
  await p.locator('.trip-leg-calc-error').waitFor({ timeout: 15000 });
  check(/Reittipalvelua ei saatu yhteyteen/.test(await p.locator('.trip-leg-calc-error').innerText()), 'verkkovirhe selitetty');
  check(await p.getByRole('button', { name: 'Laske kaikki reitit' }).isVisible(), 'nappi vapautuu');
});

if (process.env.HANG !== '0') {
  await scenario('funktio ei vastaa lainkaan (jumitus)', () => new Promise(() => {}), async (p) => {
    const t = Date.now();
    await p.getByRole('button', { name: 'Laske kaikki reitit' }).click();
    check(await p.getByRole('button', { name: 'Lasketaan…' }).isVisible(), 'Lasketaan… alkaa');
    await p.locator('.trip-leg-calc-error').waitFor({ timeout: 90000 });
    const s = Math.round((Date.now() - t) / 1000);
    check(/kesti liian kauan/.test(await p.locator('.trip-leg-calc-error').innerText()) && s >= 70 && s <= 85, `aikakatkaisu ${s} s: selkeä virhe`);
    check(await p.getByRole('button', { name: 'Laske kaikki reitit' }).isVisible(), 'nappi vapautuu aikakatkaisun jälkeen');
  });
}
check(writes.length === 0, `ei kirjoituksia Supabaseen (${writes.join(',')})`);
await b.close(); process.exit(fails ? 1 : 0);
