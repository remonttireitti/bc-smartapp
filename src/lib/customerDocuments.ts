import type { SupabaseClient } from '@supabase/supabase-js';
import { maintenanceReportListTitle } from './huoltoRaportti/defaults';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { QUOTE_TYPE_LABELS } from './quoteRequest/constants';
import { QUOTE_STATUS_LABELS, normalizeQuoteRequestData } from './quoteRequest/defaults';
import type { QuoteRequestData } from './quoteRequest/types';
import { getMaintenanceReportStatusLabel, getWorkStatusLabel, type WorkStatus } from '../types';

export type CustomerLinkedDocumentKind =
  | 'work_report'
  | 'maintenance_report'
  | 'quote_request'
  | 'file';

export type CustomerLinkedDocument = {
  id: string;
  kind: CustomerLinkedDocumentKind;
  title: string;
  subtitle?: string;
  date: string;
  status?: string;
  statusLabel?: string;
  equipmentId?: string | null;
  equipmentLabel?: string | null;
  href: string;
  printHref?: string;
};

export type CustomerDocumentFilter = 'all' | CustomerLinkedDocumentKind;

export const CUSTOMER_DOCUMENT_KIND_LABELS: Record<CustomerLinkedDocumentKind, string> = {
  work_report: 'Työraportti',
  maintenance_report: 'Huoltoraportti',
  quote_request: 'Tarjouspyyntö',
  file: 'Tiedosto',
};


function relationEquipment(value: unknown): { name: string; tag: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (!first || typeof first !== 'object' || !('name' in first)) return null;
    const row = first as { name: string; tag?: string | null };
    return { name: row.name, tag: row.tag ?? null };
  }
  const row = value as { name?: string; tag?: string | null };
  if (!row.name) return null;
  return { name: row.name, tag: row.tag ?? null };
}

function formatEquipmentLabel(row: { name: string; tag?: string | null } | null | undefined): string | null {
  if (!row?.name) return null;
  return row.tag ? `${row.tag} — ${row.name}` : row.name;
}

function sortByDateDesc(rows: CustomerLinkedDocument[]): CustomerLinkedDocument[] {
  return [...rows].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export async function loadCustomerLinkedDocuments(
  supabase: SupabaseClient,
  customerId: string,
): Promise<CustomerLinkedDocument[]> {
  const [workResult, maintenanceResult, quoteResult, fileResult] = await Promise.all([
    supabase
      .from('work_reports')
      .select('id, title, status, created_at, updated_at, equipment_id, equipment(name, tag)')
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('maintenance_reports')
      .select('id, status, data, created_at, updated_at, equipment_id, equipment(name, tag)')
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('quote_requests')
      .select('id, title, status, data, created_at, updated_at, equipment_id, equipment(name, tag)')
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('documents')
      .select('id, file_name, file_path, mime_type, created_at, equipment_id, equipment(name, tag)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
  ]);

  if (workResult.error) console.error(workResult.error);
  if (maintenanceResult.error) console.error(maintenanceResult.error);
  if (quoteResult.error) console.error(quoteResult.error);
  if (fileResult.error) console.error(fileResult.error);

  const linked: CustomerLinkedDocument[] = [];

  for (const row of workResult.data ?? []) {
    const report = row as unknown as {
      id: string;
      title: string | null;
      status: WorkStatus;
      created_at: string;
      updated_at: string;
      equipment_id: string | null;
      equipment: unknown;
    };
    linked.push({
      id: report.id,
      kind: 'work_report',
      title: report.title?.trim() || 'Työraportti',
      date: report.updated_at || report.created_at,
      status: report.status,
      statusLabel: getWorkStatusLabel(report.status),
      equipmentId: report.equipment_id,
      equipmentLabel: formatEquipmentLabel(relationEquipment(report.equipment)),
      href: `/tyoraportit/${report.id}`,
      printHref: `/tyoraportit/${report.id}/tuloste`,
    });
  }

  for (const row of maintenanceResult.data ?? []) {
    const report = row as unknown as {
      id: string;
      status: string;
      data: HuoltoReportData;
      created_at: string;
      updated_at: string;
      equipment_id: string | null;
      equipment: unknown;
    };
    linked.push({
      id: report.id,
      kind: 'maintenance_report',
      title: maintenanceReportListTitle(report.data ?? ({} as HuoltoReportData)),
      date: report.updated_at || report.created_at,
      status: report.status,
      statusLabel: getMaintenanceReportStatusLabel(report.status),
      equipmentId: report.equipment_id,
      equipmentLabel: formatEquipmentLabel(relationEquipment(report.equipment)),
      href: `/huoltoraportit/${report.id}`,
      printHref: `/huoltoraportit/${report.id}/tuloste`,
    });
  }

  for (const row of quoteResult.data ?? []) {
    const quote = row as unknown as {
      id: string;
      title: string | null;
      status: string;
      data: QuoteRequestData;
      created_at: string;
      updated_at: string;
      equipment_id: string | null;
      equipment: unknown;
    };
    const data = normalizeQuoteRequestData(quote.data);
    const typeLabel = QUOTE_TYPE_LABELS[data.type] ?? 'Tarjous';
    linked.push({
      id: quote.id,
      kind: 'quote_request',
      title: quote.title?.trim() || typeLabel,
      subtitle: typeLabel,
      date: quote.updated_at || quote.created_at,
      status: quote.status,
      statusLabel: QUOTE_STATUS_LABELS[quote.status] ?? quote.status,
      equipmentId: quote.equipment_id,
      equipmentLabel: formatEquipmentLabel(relationEquipment(quote.equipment)),
      href: `/tarjouspyynnot/${quote.id}`,
      printHref: `/tarjouspyynnot/${quote.id}/tuloste`,
    });
  }

  for (const row of fileResult.data ?? []) {
    const doc = row as unknown as {
      id: string;
      file_name: string;
      file_path: string;
      mime_type: string | null;
      created_at: string;
      equipment_id: string | null;
      equipment: unknown;
    };
    linked.push({
      id: doc.id,
      kind: 'file',
      title: doc.file_name,
      date: doc.created_at,
      equipmentId: doc.equipment_id,
      equipmentLabel: formatEquipmentLabel(relationEquipment(doc.equipment)),
      href: doc.file_path,
    });
  }

  return sortByDateDesc(linked);
}

export function filterCustomerLinkedDocuments(
  rows: CustomerLinkedDocument[],
  filter: CustomerDocumentFilter,
): CustomerLinkedDocument[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.kind === filter);
}

export function countCustomerLinkedDocumentsByKind(
  rows: CustomerLinkedDocument[],
): Record<CustomerLinkedDocumentKind, number> {
  return rows.reduce(
    (acc, row) => {
      acc[row.kind] += 1;
      return acc;
    },
    {
      work_report: 0,
      maintenance_report: 0,
      quote_request: 0,
      file: 0,
    },
  );
}
