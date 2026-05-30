import type { SupabaseClient } from '@supabase/supabase-js';

export type TripDistanceLegInput = { from: string; to: string };

export type TripDistanceLegResult =
  | { distance_km: number; error?: undefined }
  | { distance_km?: undefined; error: string };

type TripDistanceResponse = {
  results?: TripDistanceLegResult[];
  error?: string;
};

async function postTripDistance(accessToken: string, legs: TripDistanceLegInput[]): Promise<TripDistanceResponse> {
  if (import.meta.env.DEV) {
    const res = await fetch('/api/calculate-trip-distance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ legs }),
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
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data?.results ?? [];
}
