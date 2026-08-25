import {
  filterFaultyKonvektoriRows,
  KONVEKTORI_TARKASTUS_ITEMS,
  konvektoriFaultLabels,
  konvektoriTarkastusSummary,
} from './konvektoriTarkastus';
import { buildMaintenanceReportPrintTitle } from './defaults';
import { buildStyledPrintDocumentHtml, escapeHtmlPrint } from '../printDocumentShell';
import {
  formatKonvektoriLampotila,
  formatKonvektoriTeho,
  formatKonvektoriVirtaus,
  konvektoriImageUrl,
  konvektoriJaahdytysNesteLabel,
  konvektoriOverlayPositions,
  konvektoriTyyppiLabel,
  normalizeKonvektoriTyyppi,
} from './konvektoriTypes';
import { getKonvektoriCalculationLines, resolveKonvektoriTehoKw } from './konvektoriTeho';
import { formatHuomioPrintHtml, huomioPrintTextStyle } from './formatHuomioPrintHtml';
import type { HuoltoReportData, KonvektoriRowData } from './types';

export type KonvektoriVerkostoKoide = {
  kuvaus?: string;
  alue?: string;
  tunnus?: string;
};

export function konvektoriVerkostoKoideFromReport(
  data: Pick<HuoltoReportData, 'laiteKayttotarkoitus' | 'laiteSijainti' | 'laiteTunnus'>,
): KonvektoriVerkostoKoide {
  return {
    kuvaus: String(data.laiteKayttotarkoitus ?? '').trim(),
    alue: String(data.laiteSijainti ?? '').trim(),
    tunnus: String(data.laiteTunnus ?? '').trim(),
  };
}

function renderKonvektoriVerkostoSummary(
  koide: KonvektoriVerkostoKoide,
  rowCount: number,
  esc: (v: unknown) => string,
): string {
  const cells = [
    `<div><div style="color:#64748b;font-size:6px;margin-bottom:1px;">Konvektoreita</div><div style="font-weight:700;color:#0f766e;">${rowCount}</div></div>`,
  ];

  if (koide.kuvaus) {
    cells.push(
      `<div style="grid-column:span 2;"><div style="color:#64748b;font-size:6px;margin-bottom:1px;">Kuvaus</div><div style="font-weight:600;color:#0f172a;word-wrap:break-word;">${esc(koide.kuvaus)}</div></div>`,
    );
  }
  if (koide.alue) {
    cells.push(
      `<div><div style="color:#64748b;font-size:6px;margin-bottom:1px;">Alue</div><div style="font-weight:600;color:#0f172a;">${esc(koide.alue)}</div></div>`,
    );
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;font-size:7px;line-height:1.35;margin:0 0 6px 0;padding:5px 7px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:3px;">
      ${cells.join('')}
    </div>`;
}

const CHECK_SHORT: Record<string, string> = {
  suodatinPuhdistettu: 'Suod',
  kennoPuhdistettu: 'Kenno',
  kondenssiTarkastettu: 'Kond',
  puhallinTarkastettu: 'Puh',
  venttiiliTarkastettu: 'Vent',
  ohjausToimii: 'Ohj',
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

function renderWaterOverlayColumn(
  anchor: { top?: string; bottom?: string; left?: string; right?: string },
  lines: string[],
): string {
  if (lines.length === 0) return '';
  return `<div style="${anchorStyle(anchor)};display:flex;flex-direction:column;gap:2px;align-items:flex-start;max-width:48%;">
    ${lines.map((line) => overlayChip(line)).join('')}
  </div>`;
}

function konvektoriImageAirOutput(row: KonvektoriRowData): { label: string; value: string } | null {
  if (resolveKonvektoriTehoKw(row)) return null;
  const puh = formatKonvektoriLampotila(row.puhallusLampotila);
  if (puh) return { label: 'Puhallus', value: puh };
  const teho = formatKonvektoriTeho(row.mitattuTeho);
  if (teho) return { label: 'Teho', value: teho };
  return null;
}

function renderCheckMark(checked: boolean | null | undefined): string {
  if (checked === true) return '<span style="color:#16a34a;font-weight:700;">✓</span>';
  return '';
}

function konvektoriCardColors(row: KonvektoriRowData): { background: string; border: string } {
  const summary = konvektoriTarkastusSummary(row);
  const isVika = row.huomioTyyppi === 'vika' || summary.anyNo;
  if (isVika) {
    return { background: '#fef2f2', border: '#fca5a5' };
  }
  if (summary.complete && summary.allYes) {
    return { background: '#f0fdf4', border: '#86efac' };
  }
  return { background: '#fff', border: '#cbd5e1' };
}

function renderKonvektoriCheckLegend(esc: (v: unknown) => string): string {
  const rows = KONVEKTORI_TARKASTUS_ITEMS.map((item) => {
    const short = CHECK_SHORT[item.field] ?? item.field;
    return `<div style="margin:0 0 2px 0;"><strong>${esc(short)}</strong> — ${esc(item.label)}</div>`;
  }).join('');

  return `
    <div style="font-size:7px;color:#334155;line-height:1.35;margin:0 0 6px 0;padding:5px 7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;">
      <div style="font-weight:700;margin-bottom:4px;color:#00838F;">Tarkastuskohdat (✓ = OK, ✗ = ei OK, – = ei vastattu)</div>
      ${rows}
      <div style="margin-top:4px;color:#64748b;">Ruudun tausta: vihreä = kaikki OK · punertava = vika tai jokin kohta Ei. Kuvan päällä: Huone = imuilma, vasemmalla pino = tulo/virtaus/meno. Neste, virtaus ja laskettu teho otsikkorivillä.</div>
    </div>`;
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
  const huoneLampo = formatKonvektoriLampotila(row.huoneLampotila);
  const airOutput = konvektoriImageAirOutput(row);

  const metaParts = [
    row.tunnus?.trim(),
    row.huone?.trim(),
    [row.valmistaja, row.malli].filter((v) => String(v ?? '').trim()).join(' ').trim(),
    row.sarjanumero?.trim(),
  ].filter(Boolean);

  const nesteLabel = konvektoriJaahdytysNesteLabel(row.jaahdytysNeste, row.jaahdytysNesteMuu);
  const virtausLabel = formatKonvektoriVirtaus(row.virtausLs);
  const ilmanVirtausRaw = String(row.ilmanVirtausM3h ?? '').trim();
  const ilmanVirtausLabel = ilmanVirtausRaw
    ? (/m³\/h|m3\/h/i.test(ilmanVirtausRaw) ? ilmanVirtausRaw : `${ilmanVirtausRaw} m³/h`)
    : '';
  const calcLines = getKonvektoriCalculationLines(row);
  const nesteVirtausParts = [
    nesteLabel ? `Neste: ${nesteLabel}` : '',
    virtausLabel ? `Vesivirtaus: ${virtausLabel}` : '',
    ilmanVirtausLabel ? `Ilmavirtaus: ${ilmanVirtausLabel}` : '',
    ...calcLines,
  ].filter(Boolean);
  const nesteVirtausHtml = nesteVirtausParts.length
    ? `<div style="font-size:6px;color:#475569;line-height:1.25;margin-bottom:3px;word-wrap:break-word;">${esc(nesteVirtausParts.join(' · '))}</div>`
    : '';

  const checks = KONVEKTORI_TARKASTUS_ITEMS
    .filter((item) => row[item.field as keyof KonvektoriRowData] === true)
    .map((item) => {
    const short = CHECK_SHORT[item.field] ?? item.field;
    return `<span title="${esc(item.label)}" style="margin-right:3px;">${esc(short)} ${renderCheckMark(true)}</span>`;
  }).join('');

  const isVika = row.huomioTyyppi === 'vika';
  const huom = row.huomio?.trim()
    ? formatHuomioPrintHtml(row.huomio, esc)
    : '<span style="color:#94a3b8;">—</span>';
  const huomioStyle = [
    huomioPrintTextStyle,
    isVika ? 'color:#b91c1c;' : '',
  ].filter(Boolean).join('');

  const waterLines = [
    tulo ? `Tulo ${esc(tulo)}` : '',
    virtausLabel ? `Virtaus ${esc(virtausLabel)}` : '',
    meno ? `Meno ${esc(meno)}` : '',
  ].filter(Boolean);

  const overlayHtml = [
    renderWaterOverlayColumn(overlay.water, waterLines),
    huoneLampo
      ? `<div style="${anchorStyle(overlay.imu)}">${overlayChip(`Huone ${esc(huoneLampo)}`)}</div>`
      : '',
    airOutput
      ? `<div style="${anchorStyle(overlay.output)}">${overlayChip(`${esc(airOutput.label)} ${esc(airOutput.value)}`)}</div>`
      : '',
  ].filter(Boolean).join('');

  const cardColors = konvektoriCardColors(row);

  return `
    <div style="border:1px solid ${cardColors.border};border-radius:4px;padding:4px;background:${cardColors.background};page-break-inside:avoid;display:flex;flex-direction:column;min-height:0;">
      <div style="font-size:7px;font-weight:700;color:#00838F;line-height:1.2;margin-bottom:2px;">${index + 1}. ${esc(typeLabel)}</div>
      <div style="font-size:6px;color:#334155;line-height:1.25;margin-bottom:3px;word-wrap:break-word;">${metaParts.length ? esc(metaParts.join(' · ')) : '—'}</div>
      ${nesteVirtausHtml}
      <div style="position:relative;width:100%;height:80px;margin-bottom:3px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;overflow:visible;">
        <img src="${escAttr(imgUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;" />
        ${overlayHtml}
      </div>
      <div style="font-size:5.5px;line-height:1.3;color:#475569;margin-bottom:2px;flex-wrap:wrap;">${checks}</div>
      <div style="font-size:6px;line-height:1.25;border-top:1px solid #e2e8f0;padding-top:2px;margin-top:auto;${huomioStyle}">${huom}</div>
    </div>`;
}

function konvektoriFaultPrintSubtitle(data: HuoltoReportData): string {
  const parts = [
    data.asiakas?.trim(),
    data.osoite?.trim(),
    konvektoriVerkostoKoideFromReport(data).kuvaus,
  ].filter(Boolean);
  return parts.join(' · ');
}

function renderKonvektoriFaultTable(
  rows: KonvektoriRowData[],
  esc: (v: unknown) => string,
): string {
  const body = rows
    .map((row, index) => {
      const malli = row.malli?.trim() || '—';
      const sarja = row.sarjanumero?.trim() || '—';
      const faults = konvektoriFaultLabels(row);
      const faultsHtml = faults.length
        ? `<ul style="margin:0;padding-left:14px;line-height:1.35;">${faults
            .map((label) => `<li>${esc(label)}</li>`)
            .join('')}</ul>`
        : `<span style="color:#94a3b8;">—</span>`;

      return `<tr>
        <td style="width:6%;text-align:center;">${index + 1}</td>
        <td style="width:22%;">${esc(malli)}</td>
        <td style="width:22%;">${esc(sarja)}</td>
        <td>${faultsHtml}</td>
      </tr>`;
    })
    .join('');

  return `
    <h2 class="sec-h2">Vialliset konvektorit</h2>
    <table class="tbl">
      <thead>
        <tr>
          <th>#</th>
          <th>Malli</th>
          <th>Sarjanumero</th>
          <th>Viallisuudet</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

export function generateKonvektoriFaultPrintHtml(
  data: HuoltoReportData,
  options: {
    companyName: string;
    logoUrl?: string | null;
  },
): string {
  const esc = escapeHtmlPrint;
  const faultyRows = filterFaultyKonvektoriRows(data.konvektoriRows);
  const huoltoPvm = data.huoltoPaivamaara?.trim();
  const rightColumnHtml = huoltoPvm
    ? `<div>Huoltopäivä: <strong>${esc(huoltoPvm)}</strong></div>`
    : undefined;
  const subtitle = konvektoriFaultPrintSubtitle(data);
  const mainHtml =
    faultyRows.length > 0
      ? renderKonvektoriFaultTable(faultyRows, esc)
      : '<p class="print-card-muted">Ei viallisia konvektoreita.</p>';

  return buildStyledPrintDocumentHtml({
    documentTitle: `${buildMaintenanceReportPrintTitle(data)} — vialliset`,
    pageH1: 'Konvektorit — vialliset',
    subtitleEscaped: subtitle ? esc(subtitle) : '&nbsp;',
    badge: faultyRows.length ? `${faultyRows.length} kpl` : undefined,
    rightColumnHtml,
    mainHtml,
    branding: {
      companyName: options.companyName,
      logoUrl: options.logoUrl,
    },
  });
}

export function generateKonvektoritGridPrintHtml(
  rows: KonvektoriRowData[] | undefined | null,
  esc: (v: unknown) => string,
  options?: {
    origin?: string;
    columns?: number;
    escAttr?: (v: unknown) => string;
    verkosto?: KonvektoriVerkostoKoide;
  },
): string {
  const list = (rows ?? []).filter((row) => row && typeof row === 'object');
  if (list.length === 0) return '';

  const origin = options?.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const columns = options?.columns ?? 4;
  const escAttr = options?.escAttr ?? esc;
  const verkostoSummary = renderKonvektoriVerkostoSummary(options?.verkosto ?? {}, list.length, esc);

  const cards = list.map((row, idx) => renderKonvektoriCard(row, idx, esc, escAttr, origin)).join('');

  return `
  <div class="box-content" style="border-color:#00838F;page-break-inside:avoid;margin-top:6px;">
    <div style="border-bottom:2px solid #00838F;padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:12px;color:#00838F;">KONVEKTORIT</strong>
    </div>
    ${verkostoSummary}
    <p style="font-size:8px;color:#444;margin:0 0 4px 0;line-height:1.25;">
      Yksittäisten konvektorien tiedot alla. Lyhenteet viittaavat tarkastuskohteisiin.
    </p>
    ${renderKonvektoriCheckLegend(esc)}
    <div style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:6px;align-items:stretch;">
      ${cards}
    </div>
  </div>`;
}
