import type { SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types';
import { maintenanceReportListTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { buildEquipmentCardPrintMainHtml } from './huoltoRaportti/equipmentCardPrintHtml';
import { deviceTypeLabel } from './huoltoRaportti/equipmentSnapshotDisplay';
import type { HuoltoReportData } from './huoltoRaportti/types';
import {
  buildStyledPrintDocumentHtml,
  escapeHtmlPrint,
  type PrintBranding,
} from './printDocumentShell';

export type MaintenanceHistoryEntry = {
  kind: 'työraportti' | 'huoltoraportti';
  sortMs: number;
  dateLabel: string;
  summary: string;
  huomiotHighlight?: string;
  huomiotComment?: string;
};

type MaintenanceReportRow = {
  id: string;
  equipment_id: string | null;
  data: HuoltoReportData;
  updated_at: string;
  completed_at: string | null;
  created_at: string;
};

type WorkReportRow = {
  id: string;
  equipment_id: string | null;
  title: string;
  description: string | null;
  scheduled_start: string | null;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
};

export function parseMaintenanceDateMs(value: unknown): number {
  const s = String(value ?? '').trim();
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s.slice(0, 10));
    return Number.isNaN(t) ? 0 : t;
  }
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const t = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function formatMaintenanceDateFi(value: unknown): string {
  const ms = parseMaintenanceDateMs(value);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('fi-FI');
}

function maintenanceDateYmd(row: MaintenanceReportRow, data: HuoltoReportData): string {
  const fromData = String(data.huoltoPaivamaara || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(fromData)) return fromData.slice(0, 10);
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(fromData)) {
    const ms = parseMaintenanceDateMs(fromData);
    if (ms) return new Date(ms).toISOString().slice(0, 10);
  }
  if (row.completed_at) return row.completed_at.slice(0, 10);
  return row.updated_at.slice(0, 10);
}

function huoltoReportMatchesEquipment(data: HuoltoReportData, eq: Equipment): boolean {
  const dt = String(eq.tag || eq.name || '').trim();
  const sn = String(eq.serial_number || '').trim();
  const rTunnus = String(data.laiteTunnus || '').trim();
  const rSn = String(data.laiteSarjanumero || '').trim();
  if (dt && rTunnus && dt === rTunnus) return true;
  if (sn && rSn && sn === rSn) return true;
  if (sn && rTunnus && sn === rTunnus) return true;
  if (dt && rSn && dt === rSn) return true;
  return false;
}

function equipmentLabel(eq: Equipment): string {
  const tag = eq.tag?.trim();
  const name = eq.name?.trim() || 'Laite';
  return tag ? `${tag} — ${name}` : name;
}

function huoltoSummary(data: HuoltoReportData): { summary: string; huomiotHighlight?: string; huomiotComment?: string } {
  const summary = maintenanceReportListTitle(data);
  const notes = String(data.huomiot || '').trim();
  const isFault = data.huomiotLuonne === 'vika';
  return {
    summary,
    huomiotHighlight: isFault && notes ? notes : undefined,
    huomiotComment: !isFault && notes ? notes : undefined,
  };
}

function workDateLabel(row: WorkReportRow): string {
  const raw = row.scheduled_start || row.completed_at || row.updated_at || row.created_at;
  if (!raw) return '—';
  return new Date(raw).toLocaleString('fi-FI');
}

function workSortMs(row: WorkReportRow): number {
  const raw = row.scheduled_start || row.completed_at || row.updated_at || row.created_at;
  return raw ? Date.parse(raw) : 0;
}

function huoltoSortMs(row: MaintenanceReportRow, data: HuoltoReportData): number {
  const fromData = parseMaintenanceDateMs(data.huoltoPaivamaara);
  if (fromData) return fromData;
  if (row.completed_at) return Date.parse(row.completed_at);
  return Date.parse(row.updated_at || row.created_at);
}

export async function loadCustomerMaintenanceContext(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ maintenanceRows: MaintenanceReportRow[]; workRows: WorkReportRow[] }> {
  const [maintenanceResult, workResult] = await Promise.all([
    supabase
      .from('maintenance_reports')
      .select('id, equipment_id, data, updated_at, completed_at, created_at')
      .eq('customer_id', customerId),
    supabase
      .from('work_reports')
      .select('id, equipment_id, title, description, scheduled_start, completed_at, updated_at, created_at')
      .eq('customer_id', customerId),
  ]);

  if (maintenanceResult.error) console.error(maintenanceResult.error);
  if (workResult.error) console.error(workResult.error);

  return {
    maintenanceRows: (maintenanceResult.data as MaintenanceReportRow[]) ?? [],
    workRows: (workResult.data as WorkReportRow[]) ?? [],
  };
}

export function buildLatestMaintenanceByEquipment(
  equipment: Equipment[],
  maintenanceRows: MaintenanceReportRow[],
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const row of maintenanceRows) {
    const data = normalizeHuoltoReportData(row.data);
    const ymd = maintenanceDateYmd(row, data);
    if (!ymd) continue;

    if (row.equipment_id) {
      const prev = out[row.equipment_id];
      if (!prev || ymd > prev) out[row.equipment_id] = ymd;
    }

    for (const eq of equipment) {
      if (row.equipment_id && row.equipment_id !== eq.id) continue;
      if (!row.equipment_id && !huoltoReportMatchesEquipment(data, eq)) continue;
      const prev = out[eq.id];
      if (!prev || ymd > prev) out[eq.id] = ymd;
    }
  }

  return out;
}

export function buildMaintenanceHistoryForEquipment(
  equipment: Equipment,
  maintenanceRows: MaintenanceReportRow[],
  workRows: WorkReportRow[],
): MaintenanceHistoryEntry[] {
  const entries: MaintenanceHistoryEntry[] = [];

  for (const row of workRows) {
    if (row.equipment_id && row.equipment_id !== equipment.id) continue;
    if (!row.equipment_id) continue;
    entries.push({
      kind: 'työraportti',
      sortMs: workSortMs(row),
      dateLabel: workDateLabel(row),
      summary: [row.title, row.description].filter(Boolean).join(' — ') || 'Työraportti',
    });
  }

  for (const row of maintenanceRows) {
    const data = normalizeHuoltoReportData(row.data);
    const matches =
      (row.equipment_id && row.equipment_id === equipment.id) ||
      (!row.equipment_id && huoltoReportMatchesEquipment(data, equipment));
    if (!matches) continue;
    const huolto = huoltoSummary(data);
    entries.push({
      kind: 'huoltoraportti',
      sortMs: huoltoSortMs(row, data),
      dateLabel: formatMaintenanceDateFi(data.huoltoPaivamaara || row.completed_at || row.updated_at),
      summary: huolto.summary,
      huomiotHighlight: huolto.huomiotHighlight,
      huomiotComment: huolto.huomiotComment,
    });
  }

  entries.sort((a, b) => a.sortMs - b.sortMs);
  return entries;
}

export function buildMaintenanceHistorySectionsForEquipmentList(
  equipmentList: Equipment[],
  maintenanceRows: MaintenanceReportRow[],
  workRows: WorkReportRow[],
): Array<{ deviceLabel: string; entries: MaintenanceHistoryEntry[] }> {
  return equipmentList.map((eq) => ({
    deviceLabel: equipmentLabel(eq),
    entries: buildMaintenanceHistoryForEquipment(eq, maintenanceRows, workRows),
  }));
}

export function buildMaintenanceHistoryPrintHtml(input: {
  customerName: string;
  sections: Array<{ deviceLabel: string; entries: MaintenanceHistoryEntry[] }>;
  branding: PrintBranding;
}): string {
  const printedAt = new Date().toLocaleString('fi-FI');
  const sectionsHtml = input.sections
    .map((sec) => {
      const rows =
        sec.entries.length === 0
          ? `<tr><td colspan="3">Ei merkintöjä.</td></tr>`
          : sec.entries
              .map((entry) => {
                const huomVika = entry.huomiotHighlight
                  ? `<div style="margin-top:4px;color:#b91c1c;font-weight:700">Vika / huomio: ${escapeHtmlPrint(entry.huomiotHighlight)}</div>`
                  : '';
                const huomKom = entry.huomiotComment
                  ? `<div style="margin-top:4px;color:#b91c1c;font-weight:700;font-size:12px">Huomautukset: ${escapeHtmlPrint(entry.huomiotComment)}</div>`
                  : '';
                return `<tr><td>${escapeHtmlPrint(entry.dateLabel)}</td><td>${escapeHtmlPrint(
                  entry.kind === 'työraportti' ? 'Työraportti' : 'Huoltopöytäkirja',
                )}</td><td>${escapeHtmlPrint(entry.summary)}${huomVika}${huomKom}</td></tr>`;
              })
              .join('');
      return `<h2 class="sec-h2">${escapeHtmlPrint(sec.deviceLabel)}</h2>
        <table class="tbl"><thead><tr><th>Päivämäärä / aika</th><th>Tyyppi</th><th>Kuvaus</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  return buildStyledPrintDocumentHtml({
    documentTitle: `Huoltohistoria — ${input.customerName}`,
    pageH1: 'Huoltohistoria',
    subtitleEscaped: escapeHtmlPrint(input.customerName),
    badge: 'Asiakas',
    rightColumnHtml: `<div>Tulostettu: <strong>${escapeHtmlPrint(printedAt)}</strong></div>`,
    mainHtml: sectionsHtml,
    footerHtml: `${escapeHtmlPrint(printedAt)} · Työraportit ja huoltopöytäkirjat aikajärjestyksessä (vanhin ensin).`,
    branding: input.branding,
  });
}

export function buildEquipmentCardPrintHtml(input: {
  customerName: string;
  equipment: Equipment;
  latestMaintenanceYmd?: string | null;
  branding: PrintBranding;
}): string {
  const { customerName, equipment, latestMaintenanceYmd, branding } = input;
  const label = equipmentLabel(equipment);
  const printedAt = new Date().toLocaleString('fi-FI');
  const latestMaintenanceLabel = latestMaintenanceYmd
    ? formatMaintenanceDateFi(latestMaintenanceYmd)
    : 'Ei kirjattua huoltopöytäkirjaa';

  const mainHtml = buildEquipmentCardPrintMainHtml({
    customerName,
    deviceTypeLabel: deviceTypeLabel(equipment.device_type),
    equipment,
    latestMaintenanceLabel,
  });

  return buildStyledPrintDocumentHtml({
    documentTitle: `Laitekortti — ${label}`,
    pageH1: 'Laitekortti',
    subtitleEscaped: escapeHtmlPrint(label),
    badge: 'Huollettava laite',
    rightColumnHtml: `<div>Tulostettu: <strong>${escapeHtmlPrint(printedAt)}</strong></div>`,
    mainHtml,
    footerHtml: `${escapeHtmlPrint(printedAt)} · Laitekortti`,
    branding,
  });
}

export { equipmentLabel };
