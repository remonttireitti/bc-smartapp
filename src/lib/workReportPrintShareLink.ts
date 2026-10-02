/** Julkisen tulostelinkin (/j/:token) puhtaat apurit — ei Supabase-riippuvuutta (testattavissa). */
import type { WorkReport, WorkReportDailyLog } from '../types';
import type { WorkReportEquipmentLink } from './workReportEquipment';
import { sanitizeWorkReportPublicPrintLogs } from '../../supabase/functions/_shared/workReportPublicPrint.ts';

export type WorkReportPrintShareBundle = {
  /** Edge-funktion versio; puuttuu vanhasta julkaisusta. */
  version?: string;
  report: WorkReport;
  logs: WorkReportDailyLog[];
  logImages: Record<string, Array<{ fileName: string; url: string; caption: string }>>;
  equipmentLinks?: WorkReportEquipmentLink[] | null;
  meta: {
    companyName: string;
    logoUrl: string | null;
  };
};

/** Tuotannon osoite: asiakkaalle jaettava linkki ei saa osoittaa localhostiin tai esikatselu-buildiin. */
export const PUBLIC_APP_ORIGIN = 'https://bc-smartapp.pages.dev';

export function workReportPrintSharePath(token: string): string {
  return `/j/${encodeURIComponent(token)}`;
}

/**
 * Asiakkaalle jaettavan linkin origin. Oma domain säilyy; localhost, IP-osoitteet,
 * Cloudflare-esikatselut (<hash>.bc-smartapp.pages.dev) ja sovelluskääreet → tuotanto-osoite.
 */
export function resolvePublicShareOrigin(currentOrigin: string | null | undefined): string {
  const raw = String(currentOrigin ?? '').trim();
  if (!raw) return PUBLIC_APP_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return PUBLIC_APP_ORIGIN;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return PUBLIC_APP_ORIGIN;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    || host.includes(':')
    || host.endsWith('.local')
  ) {
    return PUBLIC_APP_ORIGIN;
  }
  if (host.endsWith('.bc-smartapp.pages.dev')) return PUBLIC_APP_ORIGIN;
  if (url.protocol !== 'https:') return PUBLIC_APP_ORIGIN;
  return url.origin;
}

export function workReportPrintShareUrl(token: string, currentOrigin?: string | null): string {
  const origin =
    currentOrigin !== undefined
      ? currentOrigin
      : typeof window === 'undefined'
        ? null
        : window.location.origin;
  return `${resolvePublicShareOrigin(origin)}${workReportPrintSharePath(token)}`;
}

/** Tulkitse edge-funktion vastaus (myös ei-JSON-virhesivut) ja varmista asiakasturvallinen data. */
export function parseWorkReportPrintShareResponse(status: number, bodyText: string): WorkReportPrintShareBundle {
  type RawResponse = Partial<WorkReportPrintShareBundle> & { error?: string; code?: string; message?: string };
  let data: RawResponse | null = null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    data = parsed && typeof parsed === 'object' ? (parsed as RawResponse) : null;
  } catch {
    data = null;
  }

  if (status < 200 || status >= 300 || !data) {
    const message = data?.error ?? data?.message;
    if (status === 404 && !message) {
      throw new Error('Tulostepalvelu ei vastaa (work-report-print-share puuttuu).');
    }
    throw new Error(message ?? `Jaetun tulosteen lataus epäonnistui (${status}).`);
  }

  if (!data.report || !Array.isArray(data.logs)) {
    throw new Error('Jaetun tulosteen lataus epäonnistui (tyhjä vastaus).');
  }

  return {
    version: data.version,
    report: data.report,
    // Idempotentti: uusi funktio on jo poistanut summat; vanhan funktion vastauksesta poistetaan tässä.
    logs: sanitizeWorkReportPublicPrintLogs(data.logs as unknown as Record<string, unknown>[], {
      linkedQuoteRequest: false,
    }) as unknown as WorkReportDailyLog[],
    logImages: data.logImages ?? {},
    equipmentLinks: data.equipmentLinks ?? null,
    meta: {
      companyName: data.meta?.companyName ?? '—',
      logoUrl: data.meta?.logoUrl ?? null,
    },
  };
}
