import type { EntityPreviewRow, EntityType } from './types';

export function parseIds(text: string) {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )];
}

export function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function suggestCompanySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function formatEquipmentLabel(
  equipment: { name?: string | null; tag?: string | null } | null | undefined,
) {
  if (!equipment) return '—';
  return [equipment.tag, equipment.name].filter(Boolean).join(' · ') || '—';
}

export function formatEntityRow(entityType: EntityType, row: Record<string, unknown>): EntityPreviewRow {
  const id = String(row.id);

  switch (entityType) {
    case 'work_reports':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel: (row.title as string | null) ?? '—',
      };
    case 'maintenance_reports':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel:
          (row.title as string | null)?.trim()
          || formatEquipmentLabel(row.equipment as { name?: string | null; tag?: string | null } | null),
      };
    case 'customers':
      return {
        id,
        customerLabel: (row.name as string | null) ?? '—',
        detailLabel: '—',
      };
    case 'quote_requests':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel: (row.title as string | null) ?? '—',
      };
  }
}

export function pickDefaultDuplicateTarget(
  customers: { id: string; equipmentCount: number; workReportCount: number; maintenanceReportCount: number; created_at: string }[],
) {
  return [...customers].sort((a, b) => {
    const scoreA = a.equipmentCount + a.workReportCount + a.maintenanceReportCount;
    const scoreB = b.equipmentCount + b.workReportCount + b.maintenanceReportCount;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.created_at.localeCompare(b.created_at);
  })[0]?.id ?? customers[0]?.id ?? '';
}
