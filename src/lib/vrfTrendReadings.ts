import { supabase } from './supabase';
import {
  VRF_READING_QUERY_MAX,
  VRF_READING_SELECT,
  sortReadingsByTime,
  trendReadingLimit,
  type VrfReading,
} from './vrfMonitoring';

/** PostgREST / Supabase oletus — yksi sivu kerrallaan. */
export const VRF_TREND_READ_PAGE_SIZE = 1000;

export async function fetchVrfTrendReadings(opts: {
  deviceId: string;
  sinceIso: string;
  untilIso?: string;
  hours?: number;
  maxRows?: number;
}): Promise<VrfReading[]> {
  const { deviceId, sinceIso, untilIso } = opts;
  const sinceMs = new Date(sinceIso).getTime();
  const maxRows = opts.maxRows ?? (opts.hours != null ? trendReadingLimit(opts.hours) : VRF_READING_QUERY_MAX);
  const collected: VrfReading[] = [];

  for (let page = 0; collected.length < maxRows; page += 1) {
    const from = page * VRF_TREND_READ_PAGE_SIZE;
    const to = from + VRF_TREND_READ_PAGE_SIZE - 1;

    let query = supabase
      .from('vrf_readings')
      .select(VRF_READING_SELECT)
      .eq('device_id', deviceId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
      .range(from, to);

    if (untilIso) {
      query = query.lte('recorded_at', untilIso);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batch = (data as VrfReading[] | null) ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      if (collected.length >= maxRows) break;
      collected.push(row);
    }

    const oldestInBatch = batch[batch.length - 1];
    const oldestMs = new Date(oldestInBatch.recorded_at).getTime();
    if (batch.length < VRF_TREND_READ_PAGE_SIZE || oldestMs <= sinceMs) break;
  }

  return sortReadingsByTime(collected);
}
