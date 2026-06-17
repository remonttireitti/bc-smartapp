import { formatHuomioPrintHtml, huomioPrintTextStyle } from './formatHuomioPrintHtml';
import { SISAYKSIKKO_TARKASTUS_ITEMS, sisayksikkoTarkastusSummary } from './sisayksikkoTarkastus';
import {
  sisayksikkoImageUrl,
  sisayksikkoOverlayPositions,
  sisayksikkoPaineOverlay,
  sisayksikkoSupportsSchematic,
  sisayksikkoTempOverlay,
  sisayksikkoTyyppiLabel,
} from './sisayksikkoTypes';
import type { MittausSisayksikkoData, SisayksikkoData } from './types';

const CHECK_SHORT: Record<string, string> = {
  asennettu: 'Asenn',
  kennoPuhdas: 'Kenno',
  eiAania: 'Ääni',
  kondenssiTestattu: 'Kond',
};

function anchorStyle(anchor: { top?: string; bottom?: string; left?: string; right?: string }): string {
  const parts = ['position:absolute', 'z-index:2', 'pointer-events:none'];
  if (anchor.top) parts.push(`top:${anchor.top}`);
  if (anchor.bottom) parts.push(`bottom:${anchor.bottom}`);
  if (anchor.left) parts.push(`left:${anchor.left}`);
  if (anchor.right) parts.push(`right:${anchor.right}`);
  return parts.join(';');
}

function overlayChip(text: string): string {
  return `<div style="padding:1px 3px;border-radius:2px;background:rgba(255,255,255,0.96);border:1px solid #cbd5e1;font-size:6px;font-weight:600;color:#0f172a;white-space:nowrap;line-height:1.25;">${text}</div>`;
}

function renderOverlayColumn(
  anchor: { top?: string; bottom?: string; left?: string; right?: string },
  lines: string[],
): string {
  if (lines.length === 0) return '';
  return `<div style="${anchorStyle(anchor)};display:flex;flex-direction:column;gap:2px;align-items:flex-start;max-width:48%;">
    ${lines.map((line) => overlayChip(line)).join('')}
  </div>`;
}

function renderTestCheckMark(checked: boolean | undefined): string {
  if (checked === true) return '<span style="color:#16a34a;font-weight:700;">✓</span>';
  if (checked === false) return '<span style="color:#dc2626;font-weight:700;">✗</span>';
  return '<span style="color:#9ca3af;">–</span>';
}

function renderCheckMark(checked: boolean | null | undefined): string {
  if (checked === true) return '<span style="color:#16a34a;font-weight:700;">✓</span>';
  if (checked === false) return '<span style="color:#dc2626;font-weight:700;">✗</span>';
  return '<span style="color:#9ca3af;">–</span>';
}

function renderSisayksikkoTestSummary(
  testInfo: SisayksikkoPrintTestInfo | undefined,
  esc: (v: unknown) => string,
): string {
  if (!testInfo) return '';
  const parts: string[] = [];
  if (testInfo.jaahdytysTestattu === true || testInfo.jaahdytysTestattu === false) {
    parts.push(`${renderTestCheckMark(testInfo.jaahdytysTestattu)} Jäähdytys testattu`);
  }
  if (testInfo.lammitysTestattu === true || testInfo.lammitysTestattu === false) {
    parts.push(`${renderTestCheckMark(testInfo.lammitysTestattu)} Lämmitys testattu`);
  }
  const testausLampo = String(testInfo.testausLampotila ?? '').trim();
  if (testausLampo) parts.push(`Testilämpö ${esc(testausLampo)} °C`);
  const ulkoLampo = String(testInfo.ulkoLampotila ?? '').trim();
  if (ulkoLampo) parts.push(`Ulko ${esc(ulkoLampo)} °C`);
  if (parts.length === 0) return '';
  return `<div style="font-size:7px;color:#334155;line-height:1.35;margin:0 0 6px 0;padding:4px 6px;background:#fff7ed;border:1px solid #fed7aa;border-radius:3px;">${parts.join(' · ')}</div>`;
}

function cardColors(unit: SisayksikkoData): { background: string; border: string } {
  const summary = sisayksikkoTarkastusSummary(unit);
  const isVika = unit.huomioTyyppi === 'vika' || summary.anyNo;
  if (isVika) return { background: '#fef2f2', border: '#fca5a5' };
  if (summary.complete && summary.allYes) return { background: '#f0fdf4', border: '#86efac' };
  return { background: '#fff', border: '#cbd5e1' };
}

function renderSisayksikkoCheckLegend(esc: (v: unknown) => string): string {
  const rows = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => {
    const short = CHECK_SHORT[item.field] ?? item.field;
    return `<div style="margin:0 0 2px 0;"><strong>${esc(short)}</strong> — ${esc(item.label)}</div>`;
  }).join('');

  return `
    <div style="font-size:7px;color:#334155;line-height:1.35;margin:0 0 6px 0;padding:5px 7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;">
      <div style="font-weight:700;margin-bottom:4px;color:#E65100;">Tarkastuskohdat (✓ = OK, ✗ = ei OK, – = ei vastattu)</div>
      ${rows}
      <div style="margin-top:4px;color:#64748b;">Ruudun tausta: vihreä = kaikki OK · punertava = vika tai jokin kohta pois päältä. Kuvassa lämpötilat ja paineet.</div>
    </div>`;
}

function renderSisayksikkoCard(
  unit: SisayksikkoData,
  mittaus: MittausSisayksikkoData | undefined,
  index: number,
  esc: (v: unknown) => string,
  escAttr: (v: unknown) => string,
  origin: string,
): string {
  const typeLabel = sisayksikkoTyyppiLabel(unit.tyyppi) || 'Sisäyksikkö';
  const schematic = sisayksikkoSupportsSchematic(unit.tyyppi);
  const metaParts = [unit.malli?.trim(), unit.sarjanumero?.trim()].filter(Boolean);
  const kondenssi =
    unit.kondenssivesi === 'pumpulla'
      ? `Kondenssivesi: pumpulla${unit.pumppuMalli?.trim() ? ` (${unit.pumppuMalli.trim()})` : ''}`
      : unit.kondenssivesi === 'painovoimainen'
        ? 'Kondenssivesi: painovoimainen'
        : '';

  const checks = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => {
    const short = CHECK_SHORT[item.field] ?? item.field;
    const val = unit[item.field];
    return `<span title="${esc(item.label)}" style="margin-right:3px;">${esc(short)} ${renderCheckMark(val)}</span>`;
  }).join('');

  const isVika = unit.huomioTyyppi === 'vika';
  const huom = unit.huomio?.trim()
    ? formatHuomioPrintHtml(unit.huomio, esc)
    : '<span style="color:#94a3b8;">—</span>';
  const huomioStyle = [huomioPrintTextStyle, isVika ? 'color:#b91c1c;' : ''].filter(Boolean).join(' ');

  const colors = cardColors(unit);

  let schematicHtml = '';
  if (schematic) {
    const overlay = sisayksikkoOverlayPositions(unit.tyyppi);
    const temps = sisayksikkoTempOverlay(unit, mittaus);
    const paineet = sisayksikkoPaineOverlay(mittaus);
    const imgUrl = sisayksikkoImageUrl(unit.tyyppi, origin);
    const paineLines = [
      paineet.imuJ ? `Imu (J) ${esc(paineet.imuJ)}` : '',
      paineet.kpJ ? `KP (J) ${esc(paineet.kpJ)}` : '',
      paineet.imuL ? `Imu (L) ${esc(paineet.imuL)}` : '',
      paineet.kpL ? `KP (L) ${esc(paineet.kpL)}` : '',
    ].filter(Boolean);
    const overlayHtml = [
      renderOverlayColumn(overlay.paineet, paineLines),
      temps.huone ? `<div style="${anchorStyle(overlay.huone)}">${overlayChip(`Huone ${esc(temps.huone)}`)}</div>` : '',
      temps.puhallus ? `<div style="${anchorStyle(overlay.puhallus)}">${overlayChip(`Puhallus ${esc(temps.puhallus)}`)}</div>` : '',
      temps.paluu ? `<div style="${anchorStyle(overlay.paluu)}">${overlayChip(`Paluu ${esc(temps.paluu)}`)}</div>` : '',
    ].filter(Boolean).join('');

    schematicHtml = `
      <div style="position:relative;width:100%;height:88px;margin-bottom:3px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;overflow:visible;">
        <img src="${escAttr(imgUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;" />
        ${overlayHtml}
      </div>`;
  }

  const techLine = [kondenssi].filter(Boolean).join(' · ');
  const paineet = sisayksikkoPaineOverlay(mittaus);
  const paineLine = !schematic
    ? [
        paineet.imuJ ? `Imu (J) ${paineet.imuJ}` : '',
        paineet.kpJ ? `KP (J) ${paineet.kpJ}` : '',
        paineet.imuL ? `Imu (L) ${paineet.imuL}` : '',
        paineet.kpL ? `KP (L) ${paineet.kpL}` : '',
      ].filter(Boolean).join(' · ')
    : '';

  return `
    <div style="border:1px solid ${colors.border};border-radius:4px;padding:4px;background:${colors.background};page-break-inside:avoid;display:flex;flex-direction:column;min-height:0;">
      <div style="font-size:7px;font-weight:700;color:#E65100;line-height:1.2;margin-bottom:2px;">${index + 1}. ${esc(typeLabel)}</div>
      <div style="font-size:6px;color:#334155;line-height:1.25;margin-bottom:3px;word-wrap:break-word;">${metaParts.length ? esc(metaParts.join(' · ')) : '—'}</div>
      ${techLine ? `<div style="font-size:6px;color:#475569;line-height:1.25;margin-bottom:3px;">${esc(techLine)}</div>` : ''}
      ${paineLine ? `<div style="font-size:6px;color:#475569;line-height:1.25;margin-bottom:3px;">${esc(paineLine)}</div>` : ''}
      ${schematicHtml}
      <div style="font-size:5.5px;line-height:1.3;color:#475569;margin-bottom:2px;flex-wrap:wrap;">${checks}</div>
      <div style="font-size:6px;line-height:1.25;border-top:1px solid #e2e8f0;padding-top:2px;margin-top:auto;${huomioStyle}">${huom}</div>
    </div>`;
}

export type SisayksikkoPrintTestInfo = {
  jaahdytysTestattu?: boolean;
  lammitysTestattu?: boolean;
  testausLampotila?: string;
  ulkoLampotila?: string;
};

export function generateSisayksikotGridPrintHtml(
  units: SisayksikkoData[] | undefined | null,
  mittaukset: MittausSisayksikkoData[] | undefined | null,
  esc: (v: unknown) => string,
  options?: {
    origin?: string;
    columns?: number;
    escAttr?: (v: unknown) => string;
    unitCount?: number;
    testInfo?: SisayksikkoPrintTestInfo;
  },
): string {
  const count = options?.unitCount ?? units?.length ?? 0;
  const list = (units ?? []).slice(0, count).filter((row) => row && typeof row === 'object');
  if (list.length === 0) return '';

  const origin = options?.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const columns = Math.min(options?.columns ?? 3, list.length);
  const escAttr = options?.escAttr ?? esc;
  const mittausList = mittaukset ?? [];

  const cards = list
    .map((unit, idx) => renderSisayksikkoCard(unit, mittausList[idx], idx, esc, escAttr, origin))
    .join('');

  return `
  <div class="box-content" style="border-color:#E65100;page-break-inside:avoid;margin-top:6px;">
    <div style="border-bottom:2px solid #E65100;padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:12px;color:#E65100;">SISÄYKSIKÖT</strong>
    </div>
    ${renderSisayksikkoCheckLegend(esc)}
    ${renderSisayksikkoTestSummary(options?.testInfo, esc)}
    <div style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:6px;align-items:stretch;">
      ${cards}
    </div>
  </div>`;
}
