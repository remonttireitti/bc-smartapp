import type { SupabaseClient } from '@supabase/supabase-js';

import type { RefrigerantCylinder } from '../types/inventory';
import { resolvePublicShareOrigin } from './workReportPrintShareLink';

export const CYLINDER_SCAN_PREFIX = 'bc-smartapp:cylinder:';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CylinderScanParseResult = {
  cylinderId: string | null;
  /** Lyhyt koodi (/p/<8 hex>) = UUID:n 8 ensimmäistä merkkiä. */
  shortCode: string | null;
  serialHint: string | null;
};

/** Pullon lyhyt koodi: UUID:n 8 ensimmäistä heksamerkkiä (ei vaadi tallennusta; vanhat pitkät linkit toimivat edelleen). */
export function cylinderShortCode(cylinderId: string): string {
  return cylinderId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** Lyhyt julkinen osoite, esim. https://bestcool.eu/p/3f9a1c7e (vaatii kirjautumisen, ohjaa pulloon). */
export function buildCylinderShortUrl(cylinderId: string, origin?: string): string {
  const base = resolvePublicShareOrigin(origin ?? (typeof window !== 'undefined' ? window.location.origin : ''));
  return `${base}/p/${cylinderShortCode(cylinderId)}`;
}

/** UUID-väli, jonka sisään kaikki samalla 8 merkin etuliitteellä alkavat id:t osuvat. */
export function cylinderShortCodeRange(code: string): { from: string; to: string } {
  const c = code.toLowerCase();
  return { from: `${c}-0000-0000-0000-000000000000`, to: `${c}-ffff-ffff-ffff-ffffffffffff` };
}

export function parseCylinderShortCodeFromUrl(text: string): string | null {
  try {
    const url = new URL(text.trim());
    const m = url.pathname.match(/^\/p\/([0-9a-f]{8})\/?$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function buildCylinderScanUrl(cylinderId: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/varasto?cylinder=${encodeURIComponent(cylinderId)}`;
  }
  return `${CYLINDER_SCAN_PREFIX}${cylinderId}`;
}

export function parseCylinderScanText(text: string): CylinderScanParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { cylinderId: null, shortCode: null, serialHint: null };

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get('cylinder')?.trim();
      if (id) return { cylinderId: id, shortCode: null, serialHint: null };
      const short = parseCylinderShortCodeFromUrl(trimmed);
      if (short) return { cylinderId: null, shortCode: short, serialHint: null };
    } catch {
      /* ignore malformed URL */
    }
  }

  if (trimmed.startsWith(CYLINDER_SCAN_PREFIX)) {
    return { cylinderId: trimmed.slice(CYLINDER_SCAN_PREFIX.length).trim(), shortCode: null, serialHint: null };
  }

  if (UUID_RE.test(trimmed)) {
    return { cylinderId: trimmed, shortCode: null, serialHint: null };
  }

  return { cylinderId: null, shortCode: null, serialHint: trimmed };
}

export function findCylinderInList(
  cylinders: RefrigerantCylinder[],
  scanText: string,
): RefrigerantCylinder | null {
  const parsed = parseCylinderScanText(scanText);
  if (parsed.cylinderId) {
    return cylinders.find((c) => c.id === parsed.cylinderId) ?? null;
  }
  if (parsed.shortCode) {
    const matches = cylinders.filter((c) => cylinderShortCode(c.id) === parsed.shortCode);
    return matches.length === 1 ? matches[0] : null;
  }
  if (parsed.serialHint) {
    const hint = parsed.serialHint.toLowerCase();
    const matches = cylinders.filter((c) => (c.serial_number || '').trim().toLowerCase() === hint);
    return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

export async function resolveCylinderFromScan(
  supabase: SupabaseClient,
  warehouseCompanyId: string,
  scanText: string,
  localCylinders: RefrigerantCylinder[],
  select: string,
): Promise<RefrigerantCylinder | null> {
  const local = findCylinderInList(localCylinders, scanText);
  if (local) return local;

  const parsed = parseCylinderScanText(scanText);
  let query = supabase.from('refrigerant_cylinders').select(select).eq('company_id', warehouseCompanyId);

  if (parsed.cylinderId) {
    query = query.eq('id', parsed.cylinderId);
  } else if (parsed.shortCode) {
    const range = cylinderShortCodeRange(parsed.shortCode);
    query = query.gte('id', range.from).lte('id', range.to);
  } else if (parsed.serialHint) {
    query = query.ilike('serial_number', parsed.serialHint);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as unknown as RefrigerantCylinder;
}
