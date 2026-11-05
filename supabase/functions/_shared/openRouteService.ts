// Ajomatkan km-laskenta. Sama tiedosto: src/lib/openRouteServiceCore.ts ja supabase/functions/_shared/openRouteService.ts
// (pidä identtisinä, scripts/test-trip-distance.mjs tarkistaa). Ei riippuvuuksia, toimii Denossa ja Nodessa.
//
// 1) OpenRouteService (jos avain on) — 2) varalle OpenStreetMap: Nominatim/Photon-geokoodaus + OSRM-reititys.
// Jokaisella pyynnöllä on aikakatkaisu, jottei yksi jumittunut palvelu jätä laskentaa "Lasketaan…"-tilaan.

const ORS_BASE = 'https://api.openrouteservice.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_BASE = 'https://photon.komoot.io';
const OSRM_BASE = 'https://router.project-osrm.org';

const REQUEST_TIMEOUT_MS = 8000;
const LEG_DEADLINE_MS = 22000;
const TOTAL_DEADLINE_MS = 60000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TripDistanceOptions = {
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
  legDeadlineMs?: number;
  totalDeadlineMs?: number;
  /** Nominatimin käyttöehdot: max 1 haku/s. Testeissä 0. */
  nominatimGapMs?: number;
};

export type TripDistanceLegInput = { from: string; to: string };

export type TripDistanceLegResult =
  | { distance_km: number; source?: 'ors' | 'osm'; error?: undefined }
  | { distance_km?: undefined; source?: undefined; error: string };

type Ctx = {
  fetchImpl: FetchLike;
  requestTimeoutMs: number;
  legDeadlineMs: number;
  nominatimGapMs: number;
  totalEnd: number;
  geoCache: Map<string, Promise<[number, number]>>;
  nominatimChain: Promise<unknown>;
};

class NotFoundError extends Error {}
class ServiceError extends Error {}

function normalizeAddress(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/suomi|finland/i.test(trimmed)) return trimmed;
  return `${trimmed}, Finland`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(ctx: Ctx, label: string, url: string, init: RequestInit, deadline: number): Promise<T> {
  const remaining = Math.min(deadline, ctx.totalEnd) - Date.now();
  if (remaining < 500) throw new ServiceError(`${label}: aikaa ei jäänyt`);
  const ms = Math.min(ctx.requestTimeoutMs, remaining);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await ctx.fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 120);
      throw new ServiceError(`${label} epäonnistui (${res.status}) ${detail}`.trim());
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (controller.signal.aborted) throw new ServiceError(`${label}: ei vastausta ${Math.max(1, Math.round(ms / 1000))} s kuluessa`);
    throw new ServiceError(`${label}: ${err instanceof Error ? err.message : 'verkkovirhe'}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- OpenRouteService ----------
async function orsGeocode(ctx: Ctx, apiKey: string, text: string, deadline: number): Promise<[number, number]> {
  const url = new URL(`${ORS_BASE}/geocode/search`);
  url.searchParams.set('text', normalizeAddress(text));
  url.searchParams.set('size', '1');
  url.searchParams.set('boundary.country', 'FIN');
  const data = await fetchJson<{ features?: { geometry?: { coordinates?: [number, number] } }[] }>(
    ctx, 'ORS-geokoodaus', url.toString(), { headers: { Authorization: apiKey } }, deadline,
  );
  const c = data.features?.[0]?.geometry?.coordinates;
  if (!c || c.length < 2) throw new NotFoundError(text);
  return [c[0], c[1]];
}

async function orsDistanceKm(ctx: Ctx, apiKey: string, from: [number, number], to: [number, number], deadline: number): Promise<number> {
  const data = await fetchJson<{ routes?: { summary?: { distance?: number } }[] }>(
    ctx, 'ORS-reittihaku', `${ORS_BASE}/v2/directions/driving-car`,
    {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ coordinates: [from, to] }),
    },
    deadline,
  );
  const meters = data.routes?.[0]?.summary?.distance;
  if (meters == null || !(meters > 0)) throw new NotFoundError('reitti');
  return meters;
}

// ---------- OpenStreetMap (varalla) ----------
async function osmGeocodeUncached(ctx: Ctx, text: string, deadline: number): Promise<[number, number]> {
  const q = normalizeAddress(text);
  const nominatim = new URL(`${NOMINATIM_BASE}/search`);
  nominatim.searchParams.set('q', q);
  nominatim.searchParams.set('format', 'jsonv2');
  nominatim.searchParams.set('limit', '1');
  nominatim.searchParams.set('countrycodes', 'fi');
  try {
    // Nominatim: max 1 haku/s, siksi jonotetaan.
    const run = ctx.nominatimChain.then(() =>
      fetchJson<{ lat?: string; lon?: string }[]>(ctx, 'Nominatim-geokoodaus', nominatim.toString(), { headers: { Accept: 'application/json' } }, deadline),
    );
    ctx.nominatimChain = run.then(() => sleep(ctx.nominatimGapMs), () => sleep(ctx.nominatimGapMs));
    const rows = await run;
    const r = rows?.[0];
    if (r?.lat && r?.lon) return [Number(r.lon), Number(r.lat)];
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    // jatketaan Photoniin
  }
  const photon = new URL(`${PHOTON_BASE}/api/`);
  photon.searchParams.set('q', q);
  photon.searchParams.set('limit', '1');
  const data = await fetchJson<{ features?: { geometry?: { coordinates?: [number, number] } }[] }>(
    ctx, 'Photon-geokoodaus', photon.toString(), { headers: { Accept: 'application/json' } }, deadline,
  );
  const c = data.features?.[0]?.geometry?.coordinates;
  if (!c || c.length < 2) throw new NotFoundError(text);
  return [c[0], c[1]];
}

function osmGeocode(ctx: Ctx, text: string, deadline: number): Promise<[number, number]> {
  const key = normalizeAddress(text).toLowerCase();
  let hit = ctx.geoCache.get(key);
  if (!hit) {
    hit = osmGeocodeUncached(ctx, text, deadline);
    ctx.geoCache.set(key, hit);
    hit.catch(() => ctx.geoCache.delete(key));
  }
  return hit;
}

async function osrmDistanceKm(ctx: Ctx, from: [number, number], to: [number, number], deadline: number): Promise<number> {
  const url = `${OSRM_BASE}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=false`;
  const data = await fetchJson<{ code?: string; routes?: { distance?: number }[] }>(ctx, 'OSRM-reittihaku', url, {}, deadline);
  const meters = data.routes?.[0]?.distance;
  if (data.code !== 'Ok' || meters == null || !(meters > 0)) throw new NotFoundError('reitti');
  return meters;
}

const toKm = (meters: number) => Math.round(meters / 100) / 10;

function friendlyError(from: string, to: string, errors: unknown[]): string {
  const notFound = errors.find((e) => e instanceof NotFoundError) as NotFoundError | undefined;
  const onlyNotFound = errors.length > 0 && errors.every((e) => e instanceof NotFoundError);
  if (onlyNotFound && notFound) {
    return notFound.message === 'reitti'
      ? `Reittiä ei löytynyt osoitteiden “${from}” ja “${to}” välille. Tarkenna osoitteita tai syötä km käsin.`
      : `Osoitetta ei löytynyt: “${notFound.message}”. Tarkenna osoitetta (katu, numero, kaupunki) tai syötä km käsin.`;
  }
  return 'Reittipalvelu ei vastaa juuri nyt. Yritä hetken päästä uudelleen tai syötä km käsin.';
}

async function calculateLeg(ctx: Ctx, apiKey: string, from: string, to: string): Promise<TripDistanceLegResult> {
  const deadline = Date.now() + ctx.legDeadlineMs;
  const errors: unknown[] = [];

  if (apiKey) {
    try {
      const [a, b] = await Promise.all([
        orsGeocode(ctx, apiKey, from, deadline),
        orsGeocode(ctx, apiKey, to, deadline),
      ]);
      return { distance_km: toKm(await orsDistanceKm(ctx, apiKey, a, b, deadline)), source: 'ors' };
    } catch (err) {
      errors.push(err);
    }
  }

  try {
    const [a, b] = await Promise.all([osmGeocode(ctx, from, deadline), osmGeocode(ctx, to, deadline)]);
    return { distance_km: toKm(await osrmDistanceKm(ctx, a, b, deadline)), source: 'osm' };
  } catch (err) {
    errors.push(err);
  }

  console.error('trip-distance: kaikki palvelut epäonnistuivat', errors.map((e) => (e instanceof Error ? e.message : String(e))));
  return { error: friendlyError(from, to, errors) };
}

export async function calculateTripLegDistances(
  apiKey: string,
  legs: TripDistanceLegInput[],
  options: TripDistanceOptions = {},
): Promise<TripDistanceLegResult[]> {
  const ctx: Ctx = {
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    requestTimeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    legDeadlineMs: options.legDeadlineMs ?? LEG_DEADLINE_MS,
    nominatimGapMs: options.nominatimGapMs ?? 1100,
    totalEnd: Date.now() + (options.totalDeadlineMs ?? TOTAL_DEADLINE_MS),
    geoCache: new Map(),
    nominatimChain: Promise.resolve(),
  };
  const key = (apiKey ?? '').trim();

  return Promise.all(
    legs.map(async (leg): Promise<TripDistanceLegResult> => {
      const from = leg.from?.trim() ?? '';
      const to = leg.to?.trim() ?? '';
      if (!from || !to) return { error: 'Täytä lähtö ja kohde ennen reittilaskentaa.' };
      try {
        return await calculateLeg(ctx, key, from, to);
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.' };
      }
    }),
  );
}
