import { supabase } from './supabase';
import { resolvePublicShareOrigin } from './workReportPrintShareLink';

/** Laitteen julkinen huoltokortti (QR-tarra). Token: equipment.public_qr_token. */

export type DevicePublicCard = {
  device: {
    name: string | null;
    tag: string | null;
    model: string | null;
    serialNumber: string | null;
    location: string | null;
    deviceType: string | null;
    manufacturer: string | null;
    refrigerant: string | null;
    refrigerantChargeKg: number | null;
  };
  appLink: { customerId: string | null; equipmentId: string } | null;
  branding: { companyName: string; logoUrl: string | null };
  history: { id: string; date: string | null }[];
  report: { id: string; date: string | null; data: Record<string, unknown> } | null;
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

async function callFunction(body: Record<string, unknown>): Promise<unknown> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(devicePublicCardFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    body: JSON.stringify(body),
  });
  if (response.status === 404 || response.status === 400) throw new DeviceQrNotFoundError();
  if (!response.ok) throw new Error('Tietojen haku epäonnistui. Yritä hetken kuluttua uudelleen.');
  return response.json();
}

export async function loadDevicePublicCard(token: string, reportId?: string): Promise<DevicePublicCard> {
  if (!DEVICE_QR_TOKEN_RE.test(token)) throw new DeviceQrNotFoundError();
  const parsed = (await callFunction(reportId ? { token, reportId } : { token })) as DevicePublicCard | null;
  if (!parsed || typeof parsed !== 'object' || !parsed.device) throw new DeviceQrNotFoundError();
  return {
    ...parsed,
    history: Array.isArray(parsed.history) ? parsed.history : [],
    branding: parsed.branding ?? { companyName: '', logoUrl: null },
    report: parsed.report ?? null,
    appLink: parsed.appLink ?? null,
  };
}

export async function loadDevicePublicImageUrls(token: string, reportId: string, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  try {
    const out = (await callFunction({ token, reportId, paths })) as { imageUrls?: Record<string, string> };
    return out?.imageUrls ?? {};
  } catch {
    return {};
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
