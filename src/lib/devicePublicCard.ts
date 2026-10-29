import { supabase } from './supabase';
import { resolvePublicShareOrigin } from './workReportPrintShareLink';

/** Laitteen julkinen huoltokortti (QR-tarra). Token: equipment.public_qr_token. */

export type DevicePublicRow = { id: string; date: string | null; type: string; installer: string | null; tukes: string | null; text: string };
export type DevicePublicDevice = {
  tag: string | null;
  name: string | null;
  model: string | null;
  manufacturer: string | null;
  refrigerant: string | null;
  chargeKg: number | null;
  /** Laitekortin GWP-ylikirjoitus; muuten lasketaan kylmäaineesta. */
  gwp: number | null;
  owner: string | null;
  address: string | null;
  location: string | null;
};
export type DevicePublicCard = { device: DevicePublicDevice; rows: DevicePublicRow[] };

/** Lyhyen koodin aakkosto: ei sekoittuvia merkkejä (ei 0/O, 1/I/L). 32 merkkiä → tasainen jakauma. */
export const DEVICE_QR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DEVICE_QR_CODE_LENGTH = 8;

/** Lyhyt koodi vs. vanha pitkä token. */
export function isShortDeviceQrCode(token: string | null | undefined): boolean {
  return !!token && token.length <= 16;
}

export class DeviceQrNotFoundError extends Error {
  constructor() {
    super('Linkki ei ole voimassa.');
  }
}

export function devicePublicCardFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/device-public-card`;
}

export function devicePublicPath(token: string): string {
  return `/q/${encodeURIComponent(token)}`;
}

export function devicePublicUrl(token: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${resolvePublicShareOrigin(origin)}${devicePublicPath(token)}`;
}

/** Lyhyt satunnainen koodi (8 merkkiä, 32 merkin aakkosto → 40 bittiä). */
export function generateDeviceQrCode(length = DEVICE_QR_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += DEVICE_QR_CODE_ALPHABET[b & 31];
  return out;
}

const FETCH_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 1500;
/** Vain selvästi virheellinen merkistö hylätään selaimessa; muun ratkaisee palvelin (vanha selainvälimuisti ei saa hylätä uutta koodia). */
const DEVICE_QR_TOKEN_SANE_RE = /^[A-Za-z0-9_-]{1,128}$/;

class TransientFetchError extends Error {}

async function fetchDevicePublicCardOnce(token: string): Promise<DevicePublicCard> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(devicePublicCardFunctionUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
  } catch {
    throw new TransientFetchError('Tietojen haku epäonnistui.');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 404) {
    // Selvä "ei voimassa" vain funktion omasta vastauksesta; yhdyskäytävän 404 (kylmäkäynnistys) yritetään uudelleen.
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === 'not_found') throw new DeviceQrNotFoundError();
    throw new TransientFetchError('Tietojen haku epäonnistui.');
  }
  if (!response.ok) throw new TransientFetchError('Tietojen haku epäonnistui.');
  let parsed: DevicePublicCard | null;
  try {
    parsed = (await response.json()) as DevicePublicCard | null;
  } catch {
    throw new TransientFetchError('Tietojen haku epäonnistui.');
  }
  if (!parsed?.device) throw new TransientFetchError('Tietojen haku epäonnistui.');
  return { device: parsed.device, rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
}

/**
 * Julkinen haku: ei kirjautumista, vain luku. Token mitätön (palvelimen 404 not_found) → DeviceQrNotFoundError.
 * Verkkovirhe, aikakatkaisu tai palvelinvirhe → yksi uusintayritys, sitten tavallinen virhe.
 */
export async function loadDevicePublicCard(token: string): Promise<DevicePublicCard> {
  if (!DEVICE_QR_TOKEN_SANE_RE.test(token)) throw new DeviceQrNotFoundError();
  try {
    return await fetchDevicePublicCardOnce(token);
  } catch (err) {
    if (!(err instanceof TransientFetchError)) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  try {
    return await fetchDevicePublicCardOnce(token);
  } catch (err) {
    if (err instanceof TransientFetchError) throw new Error(err.message);
    throw err;
  }
}

/** Token-sarake on valinnainen (vaatii tietokantapäivityksen). undefined = saraketta ei ole. */
export async function fetchDeviceQrTokens(equipmentIds: string[]): Promise<Record<string, string | null> | undefined> {
  if (!equipmentIds.length) return {};
  const { data, error } = await supabase.from('equipment').select('id, public_qr_token').in('id', equipmentIds);
  if (error) return undefined;
  const out: Record<string, string | null> = {};
  for (const row of (data ?? []) as { id: string; public_qr_token: string | null }[]) out[row.id] = row.public_qr_token ?? null;
  return out;
}

export async function setDeviceQrToken(equipmentId: string, token: string | null): Promise<void> {
  const { error } = await supabase.from('equipment').update({ public_qr_token: token }).eq('id', equipmentId);
  if (error) throw new Error(error.message);
}

/**
 * Tallenna laitteelle uusi lyhyt koodi. Uniikki-indeksi (equipment_public_qr_token_key) torjuu törmäykset → yritetään uudelleen.
 * Palauttaa tallennetun koodin.
 */
export async function assignNewDeviceQrCode(equipmentId: string): Promise<string> {
  let lastMessage = 'QR-linkin luonti epäonnistui.';
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateDeviceQrCode();
    const { error } = await supabase.from('equipment').update({ public_qr_token: code }).eq('id', equipmentId);
    if (!error) return code;
    lastMessage = error.message;
    if (error.code !== '23505') break;
  }
  throw new Error(lastMessage);
}

/** Palauta laitteen nykyinen koodi tai luo lyhyt koodi, jos puuttuu (ensimmäinen kopiointi/tulostus). */
export async function ensureDeviceQrCode(equipmentId: string, existing?: string | null): Promise<string> {
  if (existing) return existing;
  return assignNewDeviceQrCode(equipmentId);
}

/** CO₂-ekvivalentti tonneina: määrä (kg) × GWP / 1000. null, jos määrä tai GWP puuttuu / ei ole positiivinen. */
export function co2EquivalentTonnes(chargeKg: number | null | undefined, gwp: number | null | undefined): number | null {
  if (chargeKg == null || gwp == null) return null;
  if (!Number.isFinite(chargeKg) || !Number.isFinite(gwp) || chargeKg <= 0 || gwp <= 0) return null;
  return (chargeKg * gwp) / 1000;
}

/** "96,0 t CO2e" (suomalainen desimaalipilkku, 1 desimaali); tyhjä, jos ei laskettavissa. */
export function formatCo2Equivalent(chargeKg: number | null | undefined, gwp: number | null | undefined): string | null {
  const t = co2EquivalentTonnes(chargeKg, gwp);
  if (t == null) return null;
  return `${t.toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t CO2e`;
}
