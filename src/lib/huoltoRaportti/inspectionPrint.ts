import {
  HUOLTO_INSPECTION_STATUS_LABELS,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';

export function inspectionStatusMark(status: HuoltoInspectionStatus): { mark: string; color: string } {
  if (status === 'ok') return { mark: '✓', color: '#16a34a' };
  if (status === 'faulty') return { mark: '✗', color: '#dc2626' };
  if (status === 'na') return { mark: 'N/A', color: '#64748b' };
  return { mark: '–', color: '#9ca3af' };
}

export function renderInspectionStatusRow(
  status: HuoltoInspectionStatus | unknown,
  label: string,
  esc: (v: unknown) => string,
): string {
  const normalized = normalizeHuoltoInspectionStatus(status);
  if (normalized === null) return '';
  const { mark, color } = inspectionStatusMark(normalized);
  const text = HUOLTO_INSPECTION_STATUS_LABELS[normalized];
  return `<div style="padding:2px 0;"><span style="color:${color};font-weight:700;">${mark}</span> ${esc(label)}: ${esc(text)}</div>`;
}

export function renderInspectionHuomioRow(
  huomio: string | undefined,
  esc: (v: unknown) => string,
): string {
  const text = String(huomio ?? '').trim();
  if (!text) return '';
  return `<div style="padding:2px 0;color:#b91c1c;">Vikakuvaus: ${esc(text)}</div>`;
}
