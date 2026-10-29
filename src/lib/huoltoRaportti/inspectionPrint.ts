import {
  HUOLTO_INSPECTION_STATUS_LABELS,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';

export function inspectionStatusMark(status: HuoltoInspectionStatus): { mark: string; cls: string } {
  if (status === 'ok') return { mark: '✓', cls: 'st-ok' };
  if (status === 'faulty') return { mark: '✗', cls: 'st-bad' };
  if (status === 'na') return { mark: '', cls: 'st-na' };
  return { mark: '', cls: 'st-na' };
}

/** Tarkastuksen tilamerkki (kortin otsikkoon): ✓ Kunnossa / ✗ Vika / Ei sovellu. */
export function inspectionChipHtml(status: HuoltoInspectionStatus | unknown, esc: (v: unknown) => string): string {
  const normalized = normalizeHuoltoInspectionStatus(status);
  if (normalized === null) return '';
  const { mark, cls } = inspectionStatusMark(normalized);
  const text = HUOLTO_INSPECTION_STATUS_LABELS[normalized];
  return `<span class="st ${cls}">${mark ? `${mark} ` : ''}${esc(text)}</span>`;
}

/** Tarkastusrivi: nimi vasemmalla, tilamerkki oikealla. */
export function renderInspectionStatusRow(
  status: HuoltoInspectionStatus | unknown,
  label: string,
  esc: (v: unknown) => string,
): string {
  const chip = inspectionChipHtml(status, esc);
  if (!chip) return '';
  return `<div class="kvr"><span>${esc(label)}</span><span>${chip}</span></div>`;
}

export function renderInspectionHuomioRow(
  huomio: string | undefined,
  esc: (v: unknown) => string,
): string {
  const text = String(huomio ?? '').trim();
  if (!text) return '';
  return `<div class="warn bad">Vikakuvaus: ${esc(text)}</div>`;
}
