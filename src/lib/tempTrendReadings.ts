import { supabase } from './supabase';
import { TEMP_READING_SELECT, type TempReading } from './tempMonitoring';
import {
  tempTrendReadingLimit,
  trendPresetSinceIso,
  type ZoneTrendPreset,
} from './tempZoneMonitoring';

export const TEMP_TREND_READ_PAGE_SIZE = 1000;

export async function fetchTempZoneTrendReadings(opts: {
  deviceId: string;
  preset: ZoneTrendPreset;
  maxRows?: number;
}): Promise<TempReading[]> {
  const sinceIso = trendPresetSinceIso(opts.preset);
  const sinceMs = new Date(sinceIso).getTime();
  const maxRows = opts.maxRows ?? tempTrendReadingLimit(opts.preset);
  const collected: TempReading[] = [];

  for (let page = 0; collected.length < maxRows; page += 1) {
    const from = page * TEMP_TREND_READ_PAGE_SIZE;
    const to = from + TEMP_TREND_READ_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('temp_readings')
      .select(TEMP_READING_SELECT)
      .eq('device_id', opts.deviceId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const batch = (data as TempReading[] | null) ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      if (collected.length >= maxRows) break;
      collected.push(row);
    }

    const oldestInBatch = batch[batch.length - 1];
    const oldestMs = new Date(oldestInBatch.recorded_at).getTime();
    if (batch.length < TEMP_TREND_READ_PAGE_SIZE || oldestMs <= sinceMs) break;
  }

  return collected.sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

/** Hae vain uudet rivit taustapäivitystä varten. */
export async function fetchTempZoneTrendDelta(opts: {
  deviceId: string;
  afterIso: string;
  limit?: number;
}): Promise<TempReading[]> {
  const { data, error } = await supabase
    .from('temp_readings')
    .select(TEMP_READING_SELECT)
    .eq('device_id', opts.deviceId)
    .gt('recorded_at', opts.afterIso)
    .order('recorded_at', { ascending: true })
    .limit(opts.limit ?? 200);

  if (error) throw new Error(error.message);
  return (data as TempReading[] | null) ?? [];
}
