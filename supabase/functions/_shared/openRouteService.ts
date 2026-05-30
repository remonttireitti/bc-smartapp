const ORS_BASE = 'https://api.openrouteservice.org';

function normalizeAddress(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/suomi|finland/i.test(trimmed)) return trimmed;
  return `${trimmed}, Finland`;
}

async function geocodeAddress(apiKey: string, text: string): Promise<[number, number]> {
  const url = new URL(`${ORS_BASE}/geocode/search`);
  url.searchParams.set('text', normalizeAddress(text));
  url.searchParams.set('size', '1');
  url.searchParams.set('boundary.country', 'FIN');

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Geokoodaus epäonnistui (${res.status}): ${detail.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    features?: { geometry?: { coordinates?: [number, number] } }[];
  };

  const coords = data.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    throw new Error(`Osoitetta ei löytynyt: “${text}”. Tarkenna osoitetta (esim. katu, postinumero, kaupunki).`);
  }

  return [coords[0], coords[1]];
}

async function drivingDistanceKm(apiKey: string, from: [number, number], to: [number, number]): Promise<number> {
  const res = await fetch(`${ORS_BASE}/v2/directions/driving-car`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ coordinates: [from, to] }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Reittihaku epäonnistui (${res.status}): ${detail.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    routes?: { summary?: { distance?: number } }[];
  };

  const meters = data.routes?.[0]?.summary?.distance;
  if (meters == null || !(meters > 0)) {
    throw new Error('Reittiä ei löytynyt annetuille osoitteille.');
  }

  return Math.round(meters / 100) / 10;
}

export type TripDistanceLegInput = { from: string; to: string };

export type TripDistanceLegResult =
  | { distance_km: number; error?: undefined }
  | { distance_km?: undefined; error: string };

export async function calculateTripLegDistances(
  apiKey: string,
  legs: TripDistanceLegInput[],
): Promise<TripDistanceLegResult[]> {
  if (!apiKey.trim()) {
    throw new Error('OpenRouteService API-avain puuttuu (OPENROUTESERVICE_API_KEY).');
  }

  const results: TripDistanceLegResult[] = [];

  for (const leg of legs) {
    const from = leg.from?.trim() ?? '';
    const to = leg.to?.trim() ?? '';
    if (!from || !to) {
      results.push({ error: 'Täytä lähtö ja kohde ennen reittilaskentaa.' });
      continue;
    }

    try {
      const [fromCoord, toCoord] = await Promise.all([
        geocodeAddress(apiKey, from),
        geocodeAddress(apiKey, to),
      ]);
      const distance_km = await drivingDistanceKm(apiKey, fromCoord, toCoord);
      results.push({ distance_km });
    } catch (err) {
      results.push({ error: err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.' });
    }
  }

  return results;
}
