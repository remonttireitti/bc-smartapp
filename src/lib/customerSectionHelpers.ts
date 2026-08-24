import { customerAddressLine } from './customers';
import { subscriberLabel } from './subscribers';
import type { Customer } from '../types';
import type { CustomerLinkedDocument } from './customerDocuments';
import { CUSTOMER_DOCUMENT_KIND_LABELS } from './customerDocuments';
import type { Equipment } from '../types';

export const CUSTOMER_SECTION_COLORS = {
  info: '#1976D2',
  portal: '#6366F1',
  sharing: '#64748B',
  equipment: '#388E3C',
  documents: '#D97706',
} as const;

export const CUSTOMER_LIST_TILE_COLORS = [
  '#1976D2',
  '#388E3C',
  '#0D9488',
  '#7C3AED',
  '#D97706',
  '#6366F1',
  '#0891B2',
  '#BE185D',
] as const;

export function customerListTileColor(index: number): string {
  return CUSTOMER_LIST_TILE_COLORS[index % CUSTOMER_LIST_TILE_COLORS.length];
}

export function customerInfoSubtitle(customer: Customer): string {
  const address = customerAddressLine(customer);
  if (address && address !== '—') return address;
  if (customer.phone?.trim()) return customer.phone.trim();
  return subscriberLabel(customer.subscriber ?? null);
}

export function customerEquipmentSubtitle(count: number): string {
  if (count === 0) return 'Ei laitteita';
  return count === 1 ? '1 laite' : `${count} laitetta`;
}

export function customerDocumentsSubtitle(documents: CustomerLinkedDocument[]): string {
  if (documents.length === 0) return 'Ei dokumentteja';
  const work = documents.filter((doc) => doc.kind === 'work_report').length;
  const maintenance = documents.filter((doc) => doc.kind === 'maintenance_report').length;
  const parts: string[] = [];
  if (work > 0) parts.push(`${work} työrap.`);
  if (maintenance > 0) parts.push(`${maintenance} huolto`);
  if (parts.length > 0) return parts.join(' · ');
  return documents.length === 1 ? '1 dokumentti' : `${documents.length} dokumenttia`;
}

export function customerSharingSubtitle(sharedCount: number, totalPartners: number): string {
  if (totalPartners === 0) return 'Ei kumppaneita';
  if (sharedCount === 0) return `${totalPartners} kumppania · ei jaettu`;
  return `${sharedCount}/${totalPartners} jaettu`;
}

export function equipmentTileSubtitle(
  equipment: Equipment,
  latestMaintenanceLabel: string | null,
): string {
  const parts = [equipment.tag, equipment.model, equipment.serial_number].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' · ') : equipment.location?.trim() || '—';
  if (latestMaintenanceLabel) return `${base} · huolto ${latestMaintenanceLabel}`;
  return base;
}

export function documentTileSubtitle(doc: CustomerLinkedDocument): string {
  const parts = [CUSTOMER_DOCUMENT_KIND_LABELS[doc.kind]];
  if (doc.subtitle) parts.push(doc.subtitle);
  if (doc.statusLabel) parts.push(doc.statusLabel);
  parts.push(new Date(doc.date).toLocaleDateString('fi-FI'));
  if (doc.equipmentLabel) parts.push(doc.equipmentLabel);
  return parts.join(' · ');
}

export const CUSTOMER_DOCUMENT_TILE_COLORS: Record<string, string> = {
  work_report: '#1976D2',
  maintenance_report: '#388E3C',
  quote_request: '#D97706',
  temp_monitor_report: '#0891B2',
  file: '#64748B',
};
