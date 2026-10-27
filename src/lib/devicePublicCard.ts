import { supabase } from './supabase';
import { resolvePublicShareOrigin } from './workReportPrintShareLink';

/** Laitteen julkinen huoltokortti (QR-tarra). Token: equipment.public_qr_token. */

export type DevicePublicRow = { id: string; date: string | null; type: string; company: string | null; text: string; reportId: string | null; draft?: boolean };
export type DevicePublicCard = {
  device: { name: string | null; tag: string | null };
  appLink: { customerId: string | null; equipmentId: string } | null;
  rows: DevicePublicRow[];
};

export const DEVICE_QR_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

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

/** 32 satunnaista tavua → 43 merkin base64url. */
export function generateDeviceQrToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class DeviceQrLoginRequiredError extends Error {
  constructor() {
    super('Kirjaudu sisään.');
  }
}

export async function loadDevicePublicCard(token: string): Promise<DevicePublicCard> {
  if (!DEVICE_QR_TOKEN_RE.test(token)) throw new DeviceQrNotFoundError();
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new DeviceQrLoginRequiredError();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(devicePublicCardFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: anonKey },
    body: JSON.stringify({ token }),
  });
  if (response.status === 401) throw new DeviceQrLoginRequiredError();
  if (response.status === 404 || response.status === 400) throw new DeviceQrNotFoundError();
  if (!response.ok) throw new Error('Tietojen haku epäonnistui.');
  const parsed = (await response.json()) as DevicePublicCard | null;
  if (!parsed?.device) throw new DeviceQrNotFoundError();
  return { device: parsed.device, appLink: parsed.appLink ?? null, rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
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

/** Asiakasportaalin tunnuspyyntö laitteen omistajayritykselle (ei kirjautumista). */
export async function sendPortalAccessRequest(
  token: string,
  form: { name: string; email: string; phone: string; message: string; website: string; elapsedMs: number },
): Promise<void> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(devicePublicCardFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    body: JSON.stringify({ token, action: 'portal_request', ...form }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Lähetys epäonnistui.');
  }
}
