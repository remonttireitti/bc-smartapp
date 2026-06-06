import { KONVEKTORI_TARKASTUS_ITEMS } from './konvektoriTarkastus';
import {
  formatKonvektoriLampotila,
  konvektoriImageUrl,
  konvektoriOutputMeasurement,
  konvektoriOverlayPositions,
  konvektoriTyyppiLabel,
  normalizeKonvektoriTyyppi,
} from './konvektoriTypes';
import type { KonvektoriRowData } from './types';

const CHECK_SHORT: Record<string, string> = {
  suodatinPuhdistettu: 'Suod',
  kennoPuhdistettu: 'Kenno',
  kondenssiTarkastettu: 'Kond',
  puhallinTarkastettu: 'Puh',
  venttiiliTarkastettu: 'Vent',
  ohjausToimii: 'Ohj',
};

function posStyle(pos: { top?: string; bottom?: string; left?: string; right?: string }): string {
  const parts = ['position:absolute', 'max-width:46%', 'line-height:1.15', 'padding:1px 2px', 'border-radius:2px', 'background:rgba(255,255,255,0.92)', 'border:1px solid #cbd5e1', 'font-size:6px', 'font-weight:600', 'color:#0f172a', 'white-space:nowrap'];
  if (pos.top) parts.push(`top:${pos.top}`);
  if (pos.bottom) parts.push(`bottom:${pos.bottom}`);
  if (pos.left) parts.push(`left:${pos.left}`);
  if (pos.right) parts.push(`right:${pos.right}`);
  return parts.join(';');
}

function renderCheckMark(checked: boolean | null | undefined): string {
  if (checked === true) return '<span style="color:#16a34a;font-weight:700;">✓</span>';
  if (checked === false) return '<span style="color:#dc2626;font-weight:700;">✗</span>';
  return '<span style="color:#9ca3af;">–</span>';
}

function renderKonvektoriCard(
  row: KonvektoriRowData,
  index: number,
  esc: (v: unknown) => string,
  escAttr: (v: unknown) => string,
  origin: string,
): string {
  const tyyppi = normalizeKonvektoriTyyppi(row.tyyppi) || 'seina';
  const typeLabel = konvektoriTyyppiLabel(tyyppi) || 'Konvektori';
  const imgUrl = konvektoriImageUrl(tyyppi, origin);
  const overlay = konvektoriOverlayPositions(tyyppi);
  const tulo = formatKonvektoriLampotila(row.tuloLampotila);
  const meno = formatKonvektoriLampotila(row.menoLampotila);
  const output = konvektoriOutputMeasurement(row);

  const metaParts = [
    row.tunnus?.trim(),
    row.huone?.trim(),
    [row.valmistaja, row.malli].filter((v) => String(v ?? '').trim()).join(' ').trim(),
    row.sarjanumero?.trim(),
  ].filter(Boolean);

  const checks = KONVEKTORI_TARKASTUS_ITEMS.map((item) => {
    const short = CHECK_SHORT[item.field] ?? item.field;
    const val = row[item.field as keyof KonvektoriRowData];
    return `<span title="${esc(item.label)}" style="margin-right:3px;">${esc(short)} ${renderCheckMark(val as boolean | null | undefined)}</span>`;
  }).join('');

  const isVika = row.huomioTyyppi === 'vika';
  const huom = row.huomio?.trim()
    ? isVika
      ? `<span style="color:#b91c1c;font-weight:700;">${esc(row.huomio)}</span>`
      : esc(row.huomio)
    : '<span style="color:#94a3b8;">—</span>';

  const overlayHtml = [
    tulo ? `<div style="${posStyle(overlay.tulo)}">Tulo ${esc(tulo)}</div>` : '',
    meno ? `<div style="${posStyle(overlay.meno)}">Meno ${esc(meno)}</div>` : '',
    output ? `<div style="${posStyle(overlay.output)}">${esc(output.label)} ${esc(output.value)}</div>` : '',
  ].filter(Boolean).join('');

  return `
    <div style="border:1px solid #cbd5e1;border-radius:4px;padding:4px;background:#fff;page-break-inside:avoid;display:flex;flex-direction:column;min-height:0;">
      <div style="font-size:7px;font-weight:700;color:#00838F;line-height:1.2;margin-bottom:2px;">${index + 1}. ${esc(typeLabel)}</div>
      <div style="font-size:6px;color:#334155;line-height:1.25;margin-bottom:3px;word-wrap:break-word;">${metaParts.length ? esc(metaParts.join(' · ')) : '—'}</div>
      <div style="position:relative;width:100%;height:72px;margin-bottom:3px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;overflow:hidden;">
        <img src="${escAttr(imgUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;" />
        ${overlayHtml}
      </div>
      <div style="font-size:5.5px;line-height:1.3;color:#475569;margin-bottom:2px;flex-wrap:wrap;">${checks}</div>
      <div style="font-size:6px;line-height:1.25;color:#1e293b;border-top:1px solid #e2e8f0;padding-top:2px;margin-top:auto;word-wrap:break-word;">${huom}</div>
    </div>`;
}

export function generateKonvektoritGridPrintHtml(
  rows: KonvektoriRowData[] | undefined | null,
  esc: (v: unknown) => string,
  options?: { origin?: string; columns?: number; escAttr?: (v: unknown) => string },
): string {
  const list = (rows ?? []).filter((row) => row && typeof row === 'object');
  if (list.length === 0) return '';

  const origin = options?.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const columns = options?.columns ?? 4;
  const escAttr = options?.escAttr ?? esc;

  const cards = list.map((row, idx) => renderKonvektoriCard(row, idx, esc, escAttr, origin)).join('');

  return `
  <div class="box-content" style="border-color:#00838F;page-break-inside:avoid;margin-top:6px;">
    <div style="border-bottom:2px solid #00838F;padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:12px;color:#00838F;">KONVEKTORIT</strong>
    </div>
    <p style="font-size:8px;color:#444;margin:0 0 6px 0;line-height:1.25;">
      Suod.–Ohj.: ✓/✗ = tarkastettu OK / ei OK. Mittaukset näkyvät kuvan päällä.
    </p>
    <div style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:6px;align-items:stretch;">
      ${cards}
    </div>
  </div>`;
}
