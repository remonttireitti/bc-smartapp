import { resolveCompanyLogoUrl } from './companyLogo';
import { openSimplePrintHtml, openSimplePrintPlaceholder } from './openPrintWindow';
import { embedPrintThumbnail } from './printImageEmbed';
import { supabase } from './supabase';
import type { VrfBinaryLaneKey, VrfDevice } from './vrfMonitoring';
import type { VrfStateCounters } from './vrfStateCounters';
import type { VrfTrendData, VrfTrendSignalKey } from './vrfTrendData';
import { buildVrfTrendPrintHtml } from './vrfTrendPrint';

function formatSeen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' });
}

/** Trendi-ikkunan "Tulosta / PDF": ikkuna avataan heti klikkauksesta, otsikkotiedot haetaan sen jälkeen. */
export async function printVrfTrendReport(input: {
  device: VrfDevice | null;
  deviceId: string;
  companyName: string;
  /** Jakolinkki: ei tietokantahakuja (ei oikeuksia). */
  shared: boolean;
  startMs: number;
  endMs: number;
  data: VrfTrendData;
  signals: VrfTrendSignalKey[];
  lanes: VrfBinaryLaneKey[];
  axisLimits: Record<string, { min: number | null; max: number | null }>;
  counters: VrfStateCounters | null;
  countersNote: string | null;
}): Promise<void> {
  const printWindow = openSimplePrintPlaceholder('Muodostetaan trendiraporttia…');
  const device = input.device;
  let companyName = input.companyName;
  let logoUrl: string | null = null;
  let customerName: string | null = null;

  if (!input.shared && device) {
    try {
      const [{ data: company }, customer] = await Promise.all([
        supabase.from('companies').select('name, logo_url').eq('id', device.company_id).maybeSingle(),
        device.customer_id
          ? supabase.from('customers').select('name').eq('id', device.customer_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const row = company as { name?: string | null; logo_url?: string | null } | null;
      if (row?.name) companyName = row.name;
      const resolved = await resolveCompanyLogoUrl(row?.logo_url ?? null);
      if (resolved) logoUrl = await embedPrintThumbnail(resolved, 600).catch(() => resolved);
      customerName = (customer.data as { name?: string | null } | null)?.name ?? null;
    } catch {
      /* otsikkotiedot ovat lisätietoa — tulostetaan ilman */
    }
  }

  const html = buildVrfTrendPrintHtml({
    companyName: companyName || 'BC SmartApp',
    logoUrl,
    siteName: device?.name?.trim() || 'VRF-laite',
    siteRows: [{ label: 'Asiakas', value: customerName }],
    deviceRows: [
      { label: 'Laitetunniste', value: input.shared ? null : device?.device_key ?? null },
      { label: 'Laitteisto', value: device?.hardware_id ?? null },
      { label: 'Firmware', value: device?.firmware_version ?? null },
      { label: 'Viimeksi yhteydessä', value: formatSeen(device?.last_seen_at) },
    ],
    startMs: input.startMs,
    endMs: input.endMs,
    data: input.data,
    signals: input.signals,
    lanes: input.lanes,
    axisLimits: input.axisLimits,
    counters: input.counters,
    countersNote: input.countersNote,
  });
  openSimplePrintHtml(html, { printWindow });
}
