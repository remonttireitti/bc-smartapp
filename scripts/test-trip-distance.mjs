// Ajomatkan km-laskenta: aikakatkaisut, varapalvelu (OSM), selkeät virheet. Ei oikeita verkkopyyntöjä.
// Ajo: npx tsx scripts/test-trip-distance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateTripLegDistances } from '../src/lib/openRouteServiceCore.ts';

let fails = 0;
async function test(name, fn) {
  try { await fn(); console.log(`OK ${name}`); } catch (e) { fails++; console.error(`FAIL ${name}`, e.message); }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// hang: ei vastaa koskaan, mutta noudattaa AbortSignalia kuten oikea fetch
const hang = (init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

function fakeNet({ ors = 'ok', osm = 'ok', calls = [] } = {}) {
  return async (url, init) => {
    const u = new URL(url); calls.push(u.host + u.pathname);
    if (u.host === 'api.openrouteservice.org') {
      if (ors === 'hang') return hang(init);
      if (ors === 'down') return json({ error: 'quota' }, 429);
      if (u.pathname.includes('geocode')) return json({ features: [{ geometry: { coordinates: [24.9 + (u.searchParams.get('text').includes('Vaasa') ? -3 : 0), 60.4] } }] });
      return json({ routes: [{ summary: { distance: 401234 } }] });
    }
    if (u.host === 'nominatim.openstreetmap.org') {
      if (osm === 'hang') return hang(init);
      if (osm === 'down') return json({}, 503);
      if (osm === 'notfound') return json([]);
      return json([{ lat: '60.35', lon: '24.99' }]);
    }
    if (u.host === 'photon.komoot.io') {
      if (osm === 'hang') return hang(init);
      if (osm === 'notfound') return json({ features: [] });
      return json({ features: [{ geometry: { coordinates: [21.5, 63.09] } }] });
    }
    if (u.host === 'router.project-osrm.org') {
      if (osm === 'hang') return hang(init);
      if (osm === 'down') return json({}, 502);
      return json({ code: 'Ok', routes: [{ distance: 400342.7 }] });
    }
    throw new Error('odottamaton ' + url);
  };
}
const opt = (net) => ({ fetchImpl: fakeNet(net), requestTimeoutMs: 150, legDeadlineMs: 2000, totalDeadlineMs: 5000, nominatimGapMs: 0 });
const leg = { from: 'Tapionpöydänkuja 6, Tuusula', to: 'Teollisuuskatu 1, Vaasa' };
const KEY = 'test-key-not-real';

await test('ORS toimii: km pyöristetty 0,1 km', async () => {
  const [r] = await calculateTripLegDistances(KEY, [leg], opt());
  assert.equal(r.distance_km, 401.2); assert.equal(r.source, 'ors');
});
await test('ORS jumittuu (alkuperäinen vika): aikakatkaisu + OSM-varapalvelu antaa km:n nopeasti', async () => {
  const t = Date.now();
  const [r] = await calculateTripLegDistances(KEY, [leg], opt({ ors: 'hang' }));
  assert.equal(r.distance_km, 400.3); assert.equal(r.source, 'osm');
  assert.ok(Date.now() - t < 2000, `kesti ${Date.now() - t} ms`);
});
await test('ORS kiintiö täynnä (429): varapalvelu', async () => {
  const [r] = await calculateTripLegDistances(KEY, [leg], opt({ ors: 'down' }));
  assert.equal(r.source, 'osm'); assert.ok(r.distance_km > 0);
});
await test('ei avainta: suoraan OSM, ei ORS-kutsuja', async () => {
  const calls = [];
  const [r] = await calculateTripLegDistances('', [leg], opt({ calls }));
  assert.equal(r.source, 'osm'); assert.ok(!calls.some((c) => c.includes('openrouteservice')));
});
await test('kaikki palvelut jumissa: selkeä suomenkielinen virhe, ei jumitu', async () => {
  const t = Date.now();
  const [r] = await calculateTripLegDistances(KEY, [leg], opt({ ors: 'hang', osm: 'hang' }));
  assert.ok(r.error?.startsWith('Reittipalvelu ei vastaa'), r.error); assert.ok(Date.now() - t < 2500, `kesti ${Date.now() - t} ms`);
});
await test('kaikki palvelut alhaalla: sama virhe', async () => {
  const [r] = await calculateTripLegDistances(KEY, [leg], opt({ ors: 'down', osm: 'down' }));
  assert.ok(r.error?.includes('syötä km käsin'), r.error);
});
await test('osoitetta ei löydy: kertoo osoitteen', async () => {
  const [r] = await calculateTripLegDistances('', [{ from: 'Xxxx 1', to: 'Yyyy 2' }], opt({ osm: 'notfound' }));
  assert.ok(r.error?.startsWith('Osoitetta ei löytynyt'), r.error);
});
await test('tyhjä lähtö/kohde ei kutsu verkkoa', async () => {
  const calls = [];
  const [r] = await calculateTripLegDistances(KEY, [{ from: '', to: 'x' }], opt({ calls }));
  assert.equal(r.error, 'Täytä lähtö ja kohde ennen reittilaskentaa.'); assert.equal(calls.length, 0);
});
await test('useita osuuksia: toimivat tulokset säilyvät vaikka yksi epäonnistuu; samat osoitteet haetaan kerran', async () => {
  const calls = [];
  const rs = await calculateTripLegDistances('', [leg, { from: leg.to, to: leg.from }, { from: '', to: '' }], opt({ calls }));
  assert.ok(rs[0].distance_km > 0 && rs[1].distance_km > 0 && rs[2].error);
  assert.equal(calls.filter((c) => c.includes('nominatim')).length, 2, calls.join(','));
});
await test('src/lib ja supabase/_shared ovat identtiset', () => {
  assert.equal(readFileSync('src/lib/openRouteServiceCore.ts', 'utf8'), readFileSync('supabase/functions/_shared/openRouteService.ts', 'utf8'));
});
process.exit(fails ? 1 : 0);
