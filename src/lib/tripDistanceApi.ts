import type { SupabaseClient } from '@supabase/supabase-js';

export type TripDistanceLegInput = { from: string; to: string };

export type TripDistanceLegResult =
  | { distance_km: number; error?: undefined }
  | { distance_km?: undefined; error: string };

type TripDistanceResponse = {
  results?: TripDistanceLegResult[];
  error?: string;
};

/** Palvelin katkaisee itse hitaat haut ~60 s; selain luovuttaa hieman sen jälkeen, ettei nappi jää "Lasketaan…"-tilaan. */
export const TRIP_DISTANCE_CLIENT_TIMEOUT_MS = 75_000;

async function postTripDistance(accessToken: string, legs: TripDistanceLegInput[]): Promise<TripDistanceResponse> {
  if (import.meta.env.DEV) {
    const res = await fetch('/api/calculate-trip-distance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ legs }),
      signal: AbortSignal.timeout(TRIP_DISTANCE_CLIENT_TIMEOUT_MS),
    });
    return (await res.json()) as TripDistanceResponse;
  }

  return { error: 'Tuotannossa käytä calculateTripLegDistances(supabase, …).' };
}

export async function calculateTripLegDistances(
  supabase: SupabaseClient,
  legs: TripDistanceLegInput[],
): Promise<TripDistanceLegResult[]> {
  if (legs.length === 0) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Kirjaudu uudelleen ja yritä reittilaskentaa.');
  }

  if (import.meta.env.DEV) {
    const payload = await postTripDistance(accessToken, legs);
    if (payload.error) throw new Error(payload.error);
    return payload.results ?? [];
  }

  const { data, error } = await supabase.functions.invoke<TripDistanceResponse>('calculate-trip-distance', {
    body: { legs },
    timeout: TRIP_DISTANCE_CLIENT_TIMEOUT_MS,
  });

  if (error) throw new Error(await describeInvokeError(error));
  if (data?.error) throw new Error(data.error);
  const results = data?.results ?? [];
  if (results.length === 0) throw new Error('Reittipalvelu ei palauttanut tulosta. Yritä uudelleen tai syötä km käsin.');
  return results;
}

/** Selkeä suomenkielinen virhe myös silloin, kun funktio ei vastaa lainkaan. */
async function describeInvokeError(error: unknown): Promise<string> {
  const name = (error as { name?: string } | null)?.name ?? '';
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* ei JSON-runkoa */
    }
    if (context.status === 401) return 'Kirjautuminen vanhentunut. Kirjaudu uudelleen ja yritä reittilaskentaa.';
    if (context.status === 546 || context.status === 504) return 'Reittilaskenta kesti liian kauan. Yritä uudelleen tai syötä km käsin.';
  }
  const ctxName = (context as { name?: string } | null | undefined)?.name ?? '';
  if (/abort|timeout/i.test(name) || /abort|timeout/i.test(ctxName) || /abort|timed? ?out/i.test((error as Error | null)?.message ?? '')) {
    return 'Reittilaskenta kesti liian kauan. Yritä uudelleen tai syötä km käsin.';
  }
  return 'Reittipalvelua ei saatu yhteyteen. Tarkista verkkoyhteys ja yritä uudelleen tai syötä km käsin.';
}
