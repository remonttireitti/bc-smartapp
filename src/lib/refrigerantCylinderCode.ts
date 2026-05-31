import type { SupabaseClient } from '@supabase/supabase-js';

import type { RefrigerantCylinder } from '../types/inventory';

export const CYLINDER_SCAN_PREFIX = 'bc-smartapp:cylinder:';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CylinderScanParseResult = {
  cylinderId: string | null;
  serialHint: string | null;
};

export function buildCylinderScanUrl(cylinderId: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/varasto?cylinder=${encodeURIComponent(cylinderId)}`;
  }
  return `${CYLINDER_SCAN_PREFIX}${cylinderId}`;
}

export function parseCylinderScanText(text: string): CylinderScanParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { cylinderId: null, serialHint: null };

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get('cylinder')?.trim();
      if (id) return { cylinderId: id, serialHint: null };
    } catch {
      /* ignore malformed URL */
    }
  }

  if (trimmed.startsWith(CYLINDER_SCAN_PREFIX)) {
    return { cylinderId: trimmed.slice(CYLINDER_SCAN_PREFIX.length).trim(), serialHint: null };
  }

  if (UUID_RE.test(trimmed)) {
    return { cylinderId: trimmed, serialHint: null };
  }

  return { cylinderId: null, serialHint: trimmed };
}

export function findCylinderInList(
  cylinders: RefrigerantCylinder[],
  scanText: string,
): RefrigerantCylinder | null {
  const parsed = parseCylinderScanText(scanText);
  if (parsed.cylinderId) {
    return cylinders.find((c) => c.id === parsed.cylinderId) ?? null;
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
  } else if (parsed.serialHint) {
    query = query.ilike('serial_number', parsed.serialHint);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as unknown as RefrigerantCylinder;
}
