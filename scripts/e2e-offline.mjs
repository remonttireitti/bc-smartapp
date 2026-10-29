// Offline-käyttö: lataus, offline-täyttö (jono), synkronointi, idempotenssi, ristiriita. Supabase täysin mockattu (tilallinen palvelin muistissa).
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npm run build && npx vite preview --port 5297 --strictPort & BASE=http://localhost:5297 node scripts/e2e-offline.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5297';
const DBG = !!process.env.DBG;
const uid = '00000000-0000-4000-8000-000000000001', cid = '00000000-0000-4000-8000-0000000000c1';
const custId = '00000000-0000-4000-8000-0000000000d1';
const profile = { id: uid, display_name: 'Testi', email: 't@example.com', tukes_number: 'T1', role: 'admin', company_id: cid, subscriber_id: null, customer_id: null, is_global_admin: true, must_change_password: false };
const company = { id: cid, name: 'UKH', modules: null };
const customer = { id: custId, name: 'Messukeskus', address: 'Messuaukio 1', postal_code: '00520', city: 'Helsinki', phone: '', email: '', business_id: '', notes: '', owner_company_id: cid, created_at: '2026-01-01T00:00:00Z', subscriber_id: null };
const mkDev = (n, i) => ({ id: `00000000-0000-4000-8000-0000000000e${i}`, customer_id: custId, owner_company_id: cid, name: n, tag: n, model: 'M1', serial_number: `S${i}`, location: 'Halli', device_type: 'kylmäkoneikko', public_qr_token: null, notes: null, is_onboarding_demo: false, manufacturer: 'Tecumseh', refrigerant: 'R-449A', refrigerant_charge_kg: 5, installed_on: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  huolto_technical_snapshot: { laiteTyyppi: 'kylmäkoneikko', kylmaaineTyyppi: 'R-449A', kylmaainePiireja: '1' } });
const D1 = mkDev('JK10', 1), D2 = mkDev('JK14', 2);
const R1id = '00000000-0000-4000-8000-0000000000a1';
const mkReport = (id, eq, status, extra = {}) => ({ id, status, title: null, equipment_id: eq.id, customer_id: custId, owner_company_id: cid, created_by_company_id: cid, branding_company_id: null, partnership_id: null, subscriber_id: null, subscriber_portal_visibility: null, assigned_user_id: uid,
  data: { laiteTyyppi: 'kylmäkoneikko', asiakas: 'Messukeskus', customerId: custId, laiteTunnus: eq.tag, laiteMalli: 'M1', huomiot: 'alku', ...extra }, created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z', completed_at: null });

const db = { profiles: [profile], companies: [company], customers: [customer], equipment: [D1, D2], maintenance_reports: [mkReport(R1id, D1, 'draft')], equipment_notes: [] };
const log = []; // palvelimelle tulleet kirjoitukset
const hooks = { dropNextPostResponse: false };
const rowsOf = (t) => db[t] ?? [];
function applyFilters(list, u) {
  let out = [...list];
  for (const [k, v] of u.searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (k.includes('.')) continue;
    const m = v.match(/^(not\.)?(\w+)\.(.*)$/); if (!m) continue;
    const [, neg, op, val] = m;
    out = out.filter((r) => {
      let ok;
      if (op === 'eq') ok = r[k] != null && String(r[k]) === val;
      else if (op === 'neq') ok = r[k] == null || String(r[k]) !== val;
      else if (op === 'in') ok = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(r[k]));
      else if (op === 'is') ok = val === 'null' ? r[k] == null : String(r[k]) === val;
      else ok = true;
      return neg ? !ok : ok;
    });
  }
  const ord = u.searchParams.get('order');
  if (ord) { const [col, dir] = ord.split(',')[0].split('.'); out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
  const lim = u.searchParams.get('limit'), off = Number(u.searchParams.get('offset') || 0);
  if (lim) out = out.slice(off, off + Number(lim)); else if (off) out = out.slice(off);
  return out;
}
const withEmbeds = (t, rows, select) => rows.map((r) => {
  const o = { ...r };
  if (t === 'maintenance_reports' && /equipment\(/.test(select || '')) { const e = db.equipment.find((x) => x.id === r.equipment_id); o.equipment = e ? { name: e.name, tag: e.tag } : null; }
  return o;
});

const now = Math.floor(Date.now() / 1000);
const fakeJwt = (o) => 'e30.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';
const session = { access_token: fakeJwt({ sub: uid, exp: now + 36000, role: 'authenticated' }), token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r', user: { id: uid, email: 't@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Helsinki' });
await ctx.addInitScript((s) => { if (!sessionStorage.getItem('sb-mock-auth-token')) sessionStorage.setItem('sb-mock-auth-token', JSON.stringify(s)); }, session);
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url()); const m = req.method();
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const prefer = req.headers()['prefer'] || '';
  const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname.includes('/auth/v1/user')) return json(session.user);
  if (u.pathname.includes('/auth/v1/')) return json({});
  if (u.pathname.includes('/rpc/')) return json(null);
  const t = u.pathname.replace('/rest/v1/', '');
  if (m === 'GET' || m === 'HEAD') {
    const list = withEmbeds(t, applyFilters(rowsOf(t), u), u.searchParams.get('select'));
    if (single) return list.length === 1 ? json(list[0]) : json({ code: 'PGRST116', message: 'x' }, 406);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' }, body: m === 'HEAD' ? '' : JSON.stringify(list) });
  }
  if (!db[t]) return json(single ? {} : []);
  if (m === 'POST') {
    const body = req.postDataJSON(); const arr = Array.isArray(body) ? body : [body]; const made = [];
    for (const r of arr) {
      const id = r.id ?? crypto.randomUUID();
      if (db[t].some((x) => x.id === id)) return json({ code: '23505', message: 'duplicate key' }, 409);
      const row = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r, id }; db[t].push(row); made.push(row);
      log.push({ op: 'insert', table: t, id, equipment_id: row.equipment_id, status: row.status });
    }
    if (hooks.dropNextPostResponse && t === 'maintenance_reports') { hooks.dropNextPostResponse = false; return route.abort('failed'); }
    if (prefer.includes('return=representation')) return json(single ? made[0] : made, 201);
    return route.fulfill({ status: 201, body: '' });
  }
  if (m === 'PATCH') {
    const targets = applyFilters(db[t], u); const patch = req.postDataJSON();
    for (const r of targets) { Object.assign(r, patch, { updated_at: new Date().toISOString() }); log.push({ op: 'update', table: t, id: r.id, equipment_id: r.equipment_id }); }
    if (prefer.includes('return=representation')) return json(single ? targets[0] ?? null : targets);
    return route.fulfill({ status: 204, body: '' });
  }
  return json(single ? {} : []);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
if (DBG) p.on('console', (msg) => { if (msg.type() === 'error') console.log('console.error', msg.text().slice(0, 200)); if (/\[offline\] (rows|url)/.test(msg.text())) console.log('CONSOLE', msg.text().slice(0, 170)); });
const checks = {};
const vis = '.keep-alive-panel:not([hidden])';
const root = () => p.locator(vis).count().then((n) => (n ? p.locator(vis) : p.locator('body')));
const wait = (ms) => p.waitForTimeout(ms);
const dumpOutbox = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('bc-smartapp-offline'); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res(q.result.map((e) => ({ table: e.table, op: e.op, id: e.id, state: e.state, error: e.error, payload: e.payload }))); }; }));

// 1) Online: lataa asiakas offline-käyttöön
await p.goto(`${BASE}/asiakkaat/${custId}`); await wait(5000);
await p.evaluate(() => navigator.serviceWorker.ready).catch(() => null);
await (await root()).getByText('Laitteet (2)').first().click(); await wait(1000);
const toggle = (await root()).getByTestId('offline-customer-toggle').getByRole('switch');
checks['toggle näkyy'] = (await toggle.count()) === 1;
await toggle.click(); await wait(5000);
const infoTxt = await (await root()).getByTestId('offline-customer-info').innerText().catch(() => '');
checks['lataus valmis (2 laitetta, 1 pöytäkirjaa)'] = /2 laitetta · 1 pöytäkirjaa/.test(infoTxt);
if (DBG) console.log('info', infoTxt);

// avaa pöytäkirja kerran verkossa (lämmittää muut kyselyt)
await p.goto(`${BASE}/huoltoraportit/${R1id}`); await wait(6000);
const openHuomiot = async () => { await p.locator('button:visible', { hasText: /Ohjaus ja mittaukset/ }).first().click().catch(() => {}); await wait(800); };
const huomiotLoc = () => p.locator('textarea:visible').first();
await p.evaluate(() => navigator.serviceWorker.ready);

if (DBG) await p.evaluate(() => localStorage.setItem('bc-offline-debug', '1'));
// 2) Offline: lataa sivu uudelleen ja muokkaa
await ctx.setOffline(true); await wait(500);
await p.reload(); await wait(6000); await openHuomiot();
const offlineBody = await p.locator('body').innerText();
checks['sovellus aukeaa offline (app shell)'] = !/ERR_INTERNET_DISCONNECTED/.test(offlineBody) && offlineBody.length > 50;
checks['tilarivi: Offline'] = /Offline/.test(await p.getByTestId('offline-status').innerText().catch(() => ''));
checks['pöytäkirja avautuu offline-välimuistista'] = (await huomiotLoc().count()) >= 1;
await huomiotLoc().fill('OFFLINE-TEKSTI'); await huomiotLoc().blur(); await wait(1000);
await p.locator('button:visible', { hasText: 'Tallenna luonnos' }).first().click(); await wait(4000);
if (DBG) { const ob = await dumpOutbox(); console.log('OUTBOX', ob.map((e) => `${e.table}/${e.op}/${e.state}/${e.error ?? ''} text=${JSON.stringify(e.payload).includes('OFFLINE-TEKSTI')}`).join(' ; ')); console.log('BANNER', (await p.locator('body').innerText()).match(/Tallenn[^\n]*|Virhe[^\n]*|epäonnistui[^\n]*/g)); }
const st1 = await p.getByTestId('offline-status').innerText().catch(() => '');
if (DBG) console.log('status offline', st1);
checks['tilarivi: Offline – N tallentamatta'] = /Offline – [1-9]\d* tallentamatta/.test(st1);
checks['palvelin ei saanut mitään offline-aikana'] = log.length === 0;
if (DBG) console.log('saved text', (await p.locator('body').innerText()).match(/Tallennettu[^\n]*|Tallentamatta|Offline – tallennettu selaimeen/)?.[0]);

// 3) Verkko palaa → synkronointi
await ctx.setOffline(false);
const synced = await p.getByTestId('offline-status').filter({ hasText: 'Synkronoitu' }).waitFor({ timeout: 20000 }).then(() => true, () => false);
const srvR1 = db.maintenance_reports.find((r) => r.id === R1id);
checks['synkronoitu: palvelimella offline-muutos'] = JSON.stringify(srvR1.data).includes('OFFLINE-TEKSTI');
checks['synkronoitu: ei kopioita (1 pöytäkirja)'] = db.maintenance_reports.length === 1;
checks['tilarivi: Synkronoitu'] = synced;
checks['palvelimen rivi sidottu laitteeseen'] = srvR1.equipment_id === D1.id;
await wait(1000);


// 4) Uusi pöytäkirja laitteelta offline-tilassa: sidonta laitteeseen säilyy, ei kaksoiskappaleita
const spaGo = (path) => p.evaluate((path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
await ctx.setOffline(true); await wait(500);
await spaGo(`/asiakkaat/${custId}/laitteet/${D2.id}`); await wait(3500);
const newBtn = (await root()).getByRole('link', { name: /Uusi huoltoraportti/ });
if (DBG) console.log('CARD', (await (await root()).innerText()).slice(0, 500).replace(/\n+/g, ' | '));
checks['laitekortti avautuu offline'] = (await newBtn.count()) > 0;
if (await newBtn.count()) { await newBtn.first().click(); await wait(7000); }
const newUrlId = p.url().match(/huoltoraportit\/([0-9a-f-]{36})/)?.[1] ?? null;
if (!newUrlId) { await p.locator('button:visible', { hasText: 'Tallenna luonnos' }).first().click().catch(() => {}); await wait(5000); }
const newId = newUrlId ?? p.url().match(/huoltoraportit\/([0-9a-f-]{36})/)?.[1] ?? null;
if (DBG) { console.log('NEW URL', p.url()); const ob = await dumpOutbox(); console.log('OUTBOX2', ob.map((e) => `${e.table}/${e.op}/${e.state}/${e.id.slice(-4)}/eq=${e.payload.equipment_id?.slice(-3)}`).join(' ; ')); }
checks['uusi pöytäkirja sai id:n offline'] = Boolean(newId);
const before = db.maintenance_reports.length;
checks['palvelin ei saanut uutta offline-aikana'] = before === 1;
await ctx.setOffline(false);
await p.getByTestId('offline-status').filter({ hasText: 'Synkronoitu' }).waitFor({ timeout: 20000 }).catch(() => {});
await wait(1500);
const created = db.maintenance_reports.filter((r) => r.id === newId);
checks['uusi pöytäkirja synkronoitu täsmälleen kerran'] = created.length === 1 && db.maintenance_reports.length === 2;
checks['uusi pöytäkirja sidottu OIKEAAN laitteeseen (JK14)'] = created[0]?.equipment_id === D2.id;
checks['laite JK14 ei saanut JK10:n raporttia (ei ristiin)'] = db.maintenance_reports.filter((r) => r.equipment_id === D1.id).length === 1;

// 5) Ristiriita: offline-muokkaus + palvelimella uudempi muutos → molemmat säilyvät
await p.goto(`${BASE}/huoltoraportit/${R1id}`); await wait(5000);
await ctx.setOffline(true); await wait(500);
await p.reload(); await wait(6000); await openHuomiot();
await huomiotLoc().fill('KONFLIKTI-OFFLINE').catch(() => {}); await huomiotLoc().blur(); await wait(1000);
await p.locator('button:visible', { hasText: 'Tallenna luonnos' }).first().click().catch(() => {}); await wait(5000);
Object.assign(srvR1.data, { huomiot: 'SERVER-MUUTOS' }); srvR1.updated_at = new Date().toISOString();
const countBefore = db.maintenance_reports.length;
await ctx.setOffline(false);
const conflictShown = await p.getByTestId('offline-status').filter({ hasText: 'Ristiriita' }).waitFor({ timeout: 25000 }).then(() => true, () => false);
await wait(1000);
const copy = db.maintenance_reports.find((r) => r.data?.offlineKopioAlkuperaisesta === R1id);
checks['ristiriita: kopio luotu (molemmat säilyvät)'] = Boolean(copy) && db.maintenance_reports.length === countBefore + 1;
checks['ristiriita: kopiossa offline-teksti'] = JSON.stringify(copy?.data ?? {}).includes('KONFLIKTI-OFFLINE');
checks['ristiriita: alkuperäinen pitää palvelimen muutoksen'] = srvR1.data.huomiot === 'SERVER-MUUTOS' && !JSON.stringify(srvR1.data).includes('KONFLIKTI-OFFLINE');
checks['ristiriita: kopio on luonnos samalla laitteella'] = copy?.status === 'draft' && copy?.equipment_id === D1.id;
checks['ristiriita: tilarivi kertoo'] = conflictShown;

// 6) Vastaus katoaa (palvelin tallensi, yhteys katkesi): jonotus + uusintayritys ei tee kaksoiskappaletta
hooks.dropNextPostResponse = true;
const lenBefore = db.maintenance_reports.length;
await spaGo(`/asiakkaat/${custId}/laitteet/${D2.id}`); await wait(3500);
const link2 = (await root()).getByRole('link', { name: /Uusi huoltoraportti/ });
if (await link2.count()) { await link2.first().click(); await wait(8000); }
await p.getByTestId('offline-status').filter({ hasText: 'Synkronoitu' }).waitFor({ timeout: 25000 }).catch(() => {});
await wait(1500);
const d2Reports = db.maintenance_reports.filter((r) => r.equipment_id === D2.id);
checks['kadonnut vastaus: ei kaksoiskappaletta samalla id:llä'] = new Set(d2Reports.map((r) => r.id)).size === d2Reports.length && db.maintenance_reports.length <= lenBefore + 1;
checks['sivuvirheitä ei tullut'] = errs.length === 0;

console.log(JSON.stringify({ log, errs: errs.slice(0, 3) }));
console.log(JSON.stringify(checks, null, 1));
console.log(Object.values(checks).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
