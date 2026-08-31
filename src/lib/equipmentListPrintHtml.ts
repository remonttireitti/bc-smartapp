import type { Equipment } from '../types';
import { deviceTypeLabel, parseEquipmentSnapshot, snapVal } from './huoltoRaportti/equipmentSnapshotDisplay';
import { buildStyledPrintDocumentHtml, escapeHtmlPrint, type PrintBranding } from './printDocumentShell';

export type EquipmentListPrintRow = {
  name: string;
  tag: string;
  type: string;
  effectArea: string;
  location: string;
  refrigerant: string;
  refrigerantQty: string;
  co2Ekv: string;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || '—';
}

function formatRefrigerantQty(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '—';
  if (/kg/i.test(trimmed)) return trimmed;
  return `${trimmed} kg`;
}

function formatCo2Ekv(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '—';
  if (/t\b/i.test(trimmed) || trimmed.toLowerCase().includes('co')) return trimmed;
  return `${trimmed} t`;
}

export function buildEquipmentListPrintRow(equipment: Equipment): EquipmentListPrintRow {
  const snapshot = parseEquipmentSnapshot(equipment.huolto_technical_snapshot);
  const snapshotLocation = snapshot ? displayValue(snapVal(snapshot.laiteSijainti)) : '—';
  const location =
    equipment.location?.trim()
    || (snapshotLocation !== '—' ? snapshotLocation : '');

  const refrigerant = snapshot
    ? displayValue(snapshot.kylmaaineTyyppi || snapshot.kylmaaineLaatu)
    : '—';

  return {
    name: displayValue(equipment.name),
    tag: displayValue(equipment.tag),
    type: deviceTypeLabel(equipment.device_type),
    effectArea: snapshot ? displayValue(snapshot.laiteKayttotarkoitus) : '—',
    location: displayValue(location),
    refrigerant,
    refrigerantQty: snapshot ? formatRefrigerantQty(snapshot.kylmaaineMaaraYhteensa) : '—',
    co2Ekv: snapshot ? formatCo2Ekv(snapshot.kylmaaineCO2Ekv) : '—',
  };
}

function compareEquipmentForList(a: Equipment, b: Equipment): number {
  const tagCmp = displayValue(a.tag).localeCompare(displayValue(b.tag), 'fi');
  if (tagCmp !== 0) return tagCmp;
  return displayValue(a.name).localeCompare(displayValue(b.name), 'fi');
}

export function buildEquipmentListPrintHtml(input: {
  customerName: string;
  equipment: Equipment[];
  branding: PrintBranding;
}): string {
  const rows = [...input.equipment].sort(compareEquipmentForList).map(buildEquipmentListPrintRow);
  const printedAt = new Date().toLocaleString('fi-FI');

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtmlPrint(row.name)}</td>
          <td>${escapeHtmlPrint(row.tag)}</td>
          <td>${escapeHtmlPrint(row.type)}</td>
          <td>${escapeHtmlPrint(row.effectArea)}</td>
          <td>${escapeHtmlPrint(row.location)}</td>
          <td>${escapeHtmlPrint(row.refrigerant)}</td>
          <td style="text-align:right">${escapeHtmlPrint(row.refrigerantQty)}</td>
          <td style="text-align:right">${escapeHtmlPrint(row.co2Ekv)}</td>
        </tr>`,
    )
    .join('');

  const mainHtml =
    rows.length === 0
      ? '<p class="print-card-muted">Ei laitteita luettelossa.</p>'
      : `
        <p class="print-card-lead">${rows.length} laitetta</p>
        <div class="table-wrap">
          <table class="tbl" style="font-size:10px">
            <thead>
              <tr>
                <th>Laite</th>
                <th>Tunnus</th>
                <th>Tyyppi</th>
                <th>Vaikutusalue</th>
                <th>Sijainti</th>
                <th>Kylmäaine</th>
                <th style="text-align:right">Kylmäaine määrä</th>
                <th style="text-align:right">t CO₂ ekv</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>`;

  return buildStyledPrintDocumentHtml({
    documentTitle: `Laiteluettelo — ${input.customerName}`,
    pageH1: 'Laiteluettelo',
    subtitleEscaped: escapeHtmlPrint(input.customerName),
    badge: 'Asiakas',
    rightColumnHtml: `<div>Tulostettu: <strong>${escapeHtmlPrint(printedAt)}</strong></div>`,
    mainHtml,
    footerHtml: `${escapeHtmlPrint(printedAt)} · ${rows.length} laitetta`,
    branding: input.branding,
  });
}
