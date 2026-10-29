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

/** Lyhyt koodi (8 merkkiä) tai vanha pitkä token (43 merkkiä) — molemmat kelpaavat. */
export const DEVICE_QR_TOKEN_RE = /^[A-Za-z0-9_-]{6,128}$/;

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

/** Julkinen haku: ei kirjautumista, vain luku. Token mitätön → DeviceQrNotFoundError. */
export async function loadDevicePublicCard(token: string): Promise<DevicePublicCard> {
  if (!DEVICE_QR_TOKEN_RE.test(token)) throw new DeviceQrNotFoundError();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(devicePublicCardFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    body: JSON.stringify({ token }),
  });
  if (response.status === 404 || response.status === 400) throw new DeviceQrNotFoundError();
  if (!response.ok) throw new Error('Tietojen haku epäonnistui.');
  const parsed = (await response.json()) as DevicePublicCard | null;
  if (!parsed?.device) throw new DeviceQrNotFoundError();
  return { device: parsed.device, rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
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
