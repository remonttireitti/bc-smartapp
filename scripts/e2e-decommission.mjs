// Laite poistettu käytöstä: lista, Poistetut laitteet, palautus, laitekortti ja taaksepäin yhteensopivuus. Supabase mockattu, ei oikeita kirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5301 & BASE=http://localhost:5301 node scripts/e2e-decommission.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5301';
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const customer = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const mk = (n, i, dec) => ({ id: `00000000-0000-4000-8000-0000000000e${i}`, customer_id: customer.id, owner_company_id: cid, name: n, tag: n, model: 'M', serial_number: null, location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: null, created_at: '2026-01-01T00:00:00Z', huolto_technical_snapshot: {}, decommissioned_at: dec });
const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const b = await chromium.launch();
const checks = {};

async function run(label, { supported }) {
  const devices = [mk('Aktiivinen', 1, null), mk('Toinen', 2, null), mk('Vanha', 3, '2026-10-01'), mk('Poistettava', 4, null)];
  const patches = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Europe/Helsinki' });
  await ctx.addInitScript((s) => sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session);
  const writes = [];
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const isEq = u.pathname.endsWith('/equipment');
    const sel = u.searchParams.get('select') || '';
    if (isEq && req.method() === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}');
      const id = u.searchParams.get('id')?.replace('eq.', '');
      patches.push({ id, body });
      if (!supported) return json({ message: 'column equipment.decommissioned_at does not exist' }, 400);
      const d = devices.find((x) => x.id === id);
      if (d && 'decommissioned_at' in body) d.decommissioned_at = body.decommissioned_at;
      return json(d ? [{ id }] : []);
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && !u.pathname.includes('/rpc/') && !u.pathname.includes('/auth/')) { writes.push(u.pathname); return json(single ? {} : []); }
    if (u.pathname.includes('/auth/v1/user')) return json(session.user);
    if (u.pathname.endsWith('/profiles')) return json(single ? profile : [profile]);
    if (u.pathname.endsWith('/companies')) return json(single ? { id: cid, name: 'UKH', modules: null } : [{ id: cid, name: 'UKH', modules: null }]);
    if (u.pathname.endsWith('/customers')) return json(single ? customer : [customer]);
    if (isEq) {
      if (sel.includes('decommissioned_at') && !supported) return json({ message: 'column equipment.decommissioned_at does not exist' }, 400);
      const rawId = u.searchParams.get('id') || '';
      const id = rawId.startsWith('eq.') ? rawId.slice(3) : null;
      const inIds = rawId.startsWith('in.') ? rawId.slice(4).replace(/[()]/g, '').split(',') : null;
      const byCust = u.searchParams.get('customer_id');
      let l = id ? devices.filter((d) => d.id === id) : inIds ? devices.filter((d) => inIds.includes(d.id)) : devices;
      // Valitut sarakkeet: EQUIPMENT_SELECT ei sisällä decommissioned_at-saraketta
      l = l.map((d) => { const o = { ...d }; if (!sel.includes('decommissioned_at')) delete o.decommissioned_at; return o; });
      return json(single ? l[0] ?? null : l);
    }
    if (u.pathname.includes('/rpc/')) return json(null);
    return json(single ? null : []);
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const vis = '.keep-alive-panel:not([hidden])';
  const rootOf = async () => ((await p.locator(vis).count()) ? p.locator(vis) : p.locator('body'));
  await p.goto(`${BASE}/asiakkaat/${customer.id}`); await p.waitForTimeout(6000);
  let root = await rootOf();
  if (!supported) {
    // Taaksepäin yhteensopivuus: sarake puuttuu → kaikki laitteet aktiivisia, ei uusia toimintoja.
    checks[`${label}: kaikki 4 laitetta listalla`] = (await root.getByText('Laitteet (4)').count()) > 0;
    await root.getByText('Laitteet (4)').first().click(); await p.waitForTimeout(1000);
    await root.locator('.row-action-menu-btn').first().click(); await p.waitForTimeout(300);
    const menuItems = await p.locator('.row-action-menu-panel [role=menuitem]').allInnerTexts();
    await p.keyboard.press('Escape');
    checks[`${label}: ei Poista käytöstä -valikkokohtaa`] = !menuItems.includes('Poista käytöstä');
    checks[`${label}: ei Poistetut-listaa`] = (await root.getByText(/Poistetut laitteet/).count()) === 0;
    checks[`${label}: Poista (kova) säilyy valikossa`] = menuItems.includes('Poista') && (await root.locator('.row-action-menu-btn').count()) === 4;
    checks[`${label}: ei sivuvirheitä`] = errs.length === 0;
    await ctx.close();
    return;
  }
  checks[`${label}: Laitteet (3)`] = (await root.getByText('Laitteet (3)').count()) > 0;
  checks[`${label}: Poistetut laitteet (1)`] = (await root.getByText('Poistetut laitteet (1)').count()) > 0;
  await root.getByText('Laitteet (3)').first().click(); await p.waitForTimeout(1000);
  const tableText = await root.locator('.customer-equipment-list').first().innerText();
  checks[`${label}: Vanha ei aktiivilistalla`] = !tableText.includes('Vanha');
  checks[`${label}: laskuri 3 huollettavaa, ei Vanhaa`] = /3 huollettavaa/.test(tableText);
  // Poistetut-lista kiinni oletuksena
  checks[`${label}: Poistetut oletuksena suljettu`] = (await root.locator('.customer-removed-list').count()) === 0;
  await root.getByText('Poistetut laitteet (1)').first().click(); await p.waitForTimeout(1000);
  const removed = root.locator('.customer-removed-list').first();
  const rt = await removed.innerText();
  checks[`${label}: Vanha poistetuissa pvm`] = rt.includes('Vanha') && rt.includes('1.10.2026');
  checks[`${label}: ei tilamerkintöjä poistetuilla`] = (await removed.locator('.device-chip').count()) === 0;
  checks[`${label}: Palauta käyttöön näkyy, ei Uusi huolto`] = (await removed.getByRole('button', { name: 'Palauta käyttöön' }).count()) === 1 && (await removed.getByText('Uusi huolto').count()) === 0;
  // Poista käytöstä: Poistettava
  const row = root.locator('.customer-equipment-list').first().locator('tr', { hasText: 'Poistettava' }).first();
  await row.locator('.row-action-menu-btn').click(); await p.waitForTimeout(200); await p.getByRole('menuitem', { name: 'Poista käytöstä' }).click(); await p.waitForTimeout(500);
  const dlg = p.getByRole('dialog');
  checks[`${label}: dialogi päivä oletuksena tänään`] = (await dlg.locator('input[type=date]').inputValue()) === todayYmd;
  const h = await dlg.locator('input[type=date]').evaluate((e) => { const c = getComputedStyle(e); return [parseFloat(c.height), parseFloat(c.fontSize)]; });
  checks[`${label}: kenttä 48px / 16px`] = h[0] >= 48 && h[1] === 16;
  await dlg.locator('input[type=date]').fill('2026-10-28');
  await dlg.getByRole('button', { name: 'Poista käytöstä' }).click(); await p.waitForTimeout(3000);
  root = await rootOf();
  checks[`${label}: PATCH decommissioned_at 2026-10-28`] = patches.some((x) => x.id === devices[3].id && x.body.decommissioned_at === '2026-10-28');
  checks[`${label}: Laitteet (2) + Poistetut (2)`] = (await root.getByText('Laitteet (2)').count()) > 0 && (await root.getByText('Poistetut laitteet (2)').count()) > 0;
  // Palauta Vanha
  const rt2 = root.locator('.customer-removed-list');
  if (!(await rt2.count())) { await root.getByText('Poistetut laitteet (2)').first().click(); await p.waitForTimeout(800); }
  await root.locator('.customer-removed-list').first().locator('tr', { hasText: 'Vanha' }).getByRole('button', { name: 'Palauta käyttöön' }).click(); await p.waitForTimeout(3000);
  root = await rootOf();
  checks[`${label}: PATCH palautus null`] = patches.some((x) => x.id === devices[2].id && x.body.decommissioned_at === null);
  checks[`${label}: Laitteet (3) palautuksen jälkeen`] = (await root.getByText('Laitteet (3)').count()) > 0;
  // Laitekortti: poistettu laite (Poistettava, nyt poistettu)
  await p.goto(`${BASE}/asiakkaat/${customer.id}/laitteet/${devices[3].id}`); await p.waitForTimeout(5000);
  root = await rootOf();
  checks[`${label}: kortti Tila Poistettu käytöstä`] = (await root.getByTestId('decommissioned-status').count()) === 1 && /28\.10\.2026/.test(await root.getByTestId('decommissioned-status').innerText());
  checks[`${label}: kortti ei huoltotilaa`] = (await root.getByTestId('service-status').count()) === 0;
  checks[`${label}: kortti ei + Uusi huoltoraportti`] = (await root.getByText('+ Uusi huoltoraportti').count()) === 0;
  checks[`${label}: kortti Palauta käyttöön`] = (await root.getByRole('button', { name: 'Palauta käyttöön' }).count()) === 1;
  await root.getByRole('button', { name: 'Palauta käyttöön' }).click(); await p.waitForTimeout(2500);
  checks[`${label}: kortti palautettu → huoltotila näkyy`] = (await root.getByTestId('service-status').count()) === 1 && (await root.getByTestId('decommissioned-status').count()) === 0;
  // Aktiivisella kortilla Poista käytöstä + vahvistus
  await root.getByRole('button', { name: 'Poista käytöstä' }).click(); await p.waitForTimeout(400);
  await p.getByRole('dialog').getByRole('button', { name: 'Poista käytöstä' }).click(); await p.waitForTimeout(2500);
  checks[`${label}: kortti poisto tänään`] = patches.some((x) => x.id === devices[3].id && x.body.decommissioned_at === todayYmd);
  checks[`${label}: ei muita kirjoituksia`] = writes.length === 0;
  checks[`${label}: ei sivuvirheitä`] = errs.length === 0;
  if (errs.length) console.log(errs.slice(0, 3));
  await ctx.close();
}
await run('tuettu', { supported: true });
await run('sarake puuttuu', { supported: false });
console.log(JSON.stringify(checks, null, 1));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
