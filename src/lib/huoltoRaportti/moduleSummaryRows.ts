import { mlpNesteLabel } from './constants';
import { isKonvektoritDevice } from './deviceModuleLogic';
import { konvektoriRowIsFaulty, konvektoriTarkastusSummary } from './konvektoriTarkastus';
import {
  lauhdutuspiiriInspectionStatus,
  nestelauhdutinInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import type {
  HuoltoReportData,
  KonvektoriRowData,
  LauhdutuspiiriData,
  NestelauhdutinUnitData,
  NestepiiriData,
  RefrigerantCircuitData,
  VapaajahdytysData,
} from './types';

export type ModuleSummaryRow = { label: string; value: string };

function trim(val: unknown): string {
  return String(val ?? '').trim();
}

function inspectionLabel(status: HuoltoInspectionStatus): string {
  if (status === 'ok') return 'Kunnossa';
  if (status === 'faulty') return 'Vika';
  if (status === 'na') return 'Ei kuulu';
  return '';
}

function pushRow(rows: ModuleSummaryRow[], label: string, value: unknown) {
  const text = trim(value);
  if (text) rows.push({ label, value: text });
}

function nestepiiriBaseRows(data: NestepiiriData, status: HuoltoInspectionStatus): ModuleSummaryRow[] {
  const rows: ModuleSummaryRow[] = [];
  const statusText = inspectionLabel(status);
  if (statusText) rows.push({ label: 'Tarkastus', value: statusText });

  pushRow(rows, 'Neste', data.neste ? mlpNesteLabel(data.neste) : '');
  pushRow(rows, 'Virtaus', data.virtaus ? `${data.virtaus} m³/h` : '');
  pushRow(rows, 'Meno', data.meno ? `${data.meno} °C` : '');
  pushRow(rows, 'Paluu', data.tulo ? `${data.tulo} °C` : '');

  if (data.pumppuTarkastettu) {
    pushRow(
      rows,
      'Pumppu',
      [data.pumppuValmistaja, data.pumppuMalli].map(trim).filter(Boolean).join(' · '),
    );
  }

  return rows;
}

export function nestepiiriSummaryRows(data: NestepiiriData): ModuleSummaryRow[] {
  const status =
    normalizeHuoltoInspectionStatus(data.tarkastusTila) ?? nestepiiriInspectionStatus(data);
  return nestepiiriBaseRows(data, status);
}

export function lauhdutuspiiriSummaryRows(data: LauhdutuspiiriData): ModuleSummaryRow[] {
  const status =
    normalizeHuoltoInspectionStatus(data.tarkastusTila) ?? lauhdutuspiiriInspectionStatus(data);
  const rows = nestepiiriBaseRows(data, status);
  if (data.painesäätimenTarkistettu && trim(data.painesäätimenMalli)) {
    pushRow(rows, 'Painesäädin', data.painesäätimenMalli);
  }
  if (data.virtausRiittävä === false && trim(data.virtausOngelma)) {
    pushRow(rows, 'Virtaus', data.virtausOngelma);
  }
  return rows;
}

export function vapaajahdytysSummaryRows(data: VapaajahdytysData): ModuleSummaryRow[] {
  const rows: ModuleSummaryRow[] = [];
  const status =
    normalizeHuoltoInspectionStatus(data.tarkastusTila) ??
    (data.neste || data.virtaus ? 'ok' : null);
  const statusText = status ? inspectionLabel(status) : '';
  if (statusText) rows.push({ label: 'Tarkastus', value: statusText });

  if (data.ohjaus === 'kone') rows.push({ label: 'Ohjaus', value: 'Kone ohjaa' });
  if (data.ohjaus === 'taloautomaatio') rows.push({ label: 'Ohjaus', value: 'Taloautomaatio' });

  pushRow(rows, 'Neste', data.neste ? mlpNesteLabel(data.neste) : '');
  pushRow(rows, 'Virtaus', data.virtaus ? `${data.virtaus} m³/h` : '');
  pushRow(rows, 'Meno', data.meno ? `${data.meno} °C` : '');
  pushRow(rows, 'Paluu', data.tulo ? `${data.tulo} °C` : '');

  if (data.pumppuTarkastettu) {
    pushRow(
      rows,
      'Pumppu',
      [data.pumppuValmistaja, data.pumppuMalli].map(trim).filter(Boolean).join(' · '),
    );
  }

  return rows;
}

export function nestelauhdutinUnitSummaryRows(unit: NestelauhdutinUnitData, index: number): ModuleSummaryRow[] {
  const rows: ModuleSummaryRow[] = [];
  const status =
    normalizeHuoltoInspectionStatus(unit.tarkastusTila) ?? nestelauhdutinInspectionStatus(unit);
  const statusText = inspectionLabel(status);
  if (statusText) rows.push({ label: 'Tarkastus', value: statusText });

  pushRow(rows, 'Valmistaja', unit.valmistaja);
  pushRow(rows, 'Malli', unit.malli);
  pushRow(rows, 'Sarjanumero', unit.sarjanumero);
  if ((unit.puhaltimienMaara ?? 0) > 0) {
    pushRow(rows, 'Puhaltimet', `${unit.puhaltimienMaara} kpl`);
  }

  if (rows.length === (statusText ? 1 : 0)) {
    rows.unshift({ label: 'Yksikkö', value: `Nestelauhdutin ${index + 1}` });
  } else if (index > 0) {
    rows.unshift({ label: 'Yksikkö', value: `#${index + 1}` });
  }

  return rows;
}

export function nestelauhduttimetSummaryRows(units: NestelauhdutinUnitData[]): ModuleSummaryRow[] {
  if (units.length === 0) return [];
  if (units.length === 1) return nestelauhdutinUnitSummaryRows(units[0], 0);

  const rows: ModuleSummaryRow[] = [{ label: 'Lukumäärä', value: `${units.length} kpl` }];
  units.forEach((unit, index) => {
    const label = [unit.valmistaja, unit.malli].map(trim).filter(Boolean).join(' ');
    rows.push({
      label: `Nestelauhdutin ${index + 1}`,
      value: label || (inspectionLabel(nestelauhdutinInspectionStatus(unit)) || '—'),
    });
  });
  return rows;
}

export function moduleSummaryComplete(status: HuoltoInspectionStatus): boolean {
  return status === 'ok' || status === 'na';
}

function formatCircuitPressures(circuit: RefrigerantCircuitData | null | undefined): string {
  if (!circuit?.onKaytossa) return '';
  const low = trim(circuit.imupaine);
  const high = trim(circuit.korkeapaine);
  if (!low && !high) return '';
  return `${low || '—'}/${high || '—'} bar`;
}

export function refrigerantCircuitsSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const circuits = [form.kylmaainePiiri1, form.kylmaainePiiri2, form.kylmaainePiiri3].slice(0, count);
  const rows: ModuleSummaryRow[] = [];

  circuits.forEach((circuit, index) => {
    const label = count > 1 ? `Piiri ${index + 1}` : 'Piiri';
    if (!circuit?.onKaytossa) {
      rows.push({ label, value: 'Ei käytössä' });
      return;
    }
    const pressures = formatCircuitPressures(circuit);
    if (pressures) rows.push({ label: `${label} — paineet`, value: pressures });
    const compCount = trim(circuit.kompressorienMaara) || '1';
    rows.push({ label: `${label} — kompressorit`, value: `${compCount} kpl` });
  });

  return rows;
}

export function refrigerantCircuitsSummaryComplete(form: HuoltoReportData): boolean {
  const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const circuits = [form.kylmaainePiiri1, form.kylmaainePiiri2, form.kylmaainePiiri3].slice(0, count);
  if (circuits.length === 0) return false;
  return circuits.every((circuit) => {
    if (!circuit?.onKaytossa) return true;
    return Boolean(formatCircuitPressures(circuit));
  });
}

export function evaporatorsSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const count = form.evaporatorData?.length ?? 0;
  if (count === 0) return [];
  return [{ label: 'Höyrystimiä', value: `${count} kpl` }];
}

export function condensersSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  return [{ label: 'Lauhduttimia', value: `${count} kpl` }];
}

export function lampopumppuSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const rows: ModuleSummaryRow[] = [];
  pushRow(rows, 'Ulkoyksikkö', [form.ulkoyksikkoValmistaja, form.ulkoyksikkoMalli].filter(Boolean).join(' '));
  pushRow(rows, 'Teho', form.ulkoyksikkoJaahdytysTeho ? `${form.ulkoyksikkoJaahdytysTeho} kW` : '');
  const sisaCount = form.sisayksikkoMaara ?? form.sisayksikkoData?.length ?? 0;
  if (sisaCount > 0) pushRow(rows, 'Sisäyksiköt', `${sisaCount} kpl`);
  return rows;
}

export function mlpSummaryRows(form: HuoltoReportData, part?: 'kiinteisto' | 'energia'): ModuleSummaryRow[] {
  const mlp = form.mlpData;
  if (!mlp) return [];
  const rows: ModuleSummaryRow[] = [];
  if (!part || part === 'kiinteisto') {
    pushRow(rows, 'Keruupiiri', mlp.keruupiiriVirtaus ? `${mlp.keruupiiriVirtaus} m³/h` : '');
    pushRow(rows, 'Lämpöpiirit', mlp.lampoPiireja || '');
  }
  if (!part || part === 'energia') {
    pushRow(rows, 'Latauspiiri', mlp.latausVirtaus ? `${mlp.latausVirtaus} m³/h` : '');
    pushRow(rows, 'Teho', mlp.keruupiiriTehoLaskenta ? `${mlp.keruupiiriTehoLaskenta} kW` : '');
  }
  return rows;
}

export function konvektoritSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const rows = form.konvektoriRows ?? [];
  const summaryRows: ModuleSummaryRow[] = [];
  pushRow(summaryRows, 'Konvektoreita', rows.length > 0 ? `${rows.length} kpl` : '');
  const faulty = rows.filter((row) => konvektoriRowIsFaulty(row)).length;
  if (faulty > 0) {
    pushRow(summaryRows, 'Viallisia', `${faulty} kpl`);
  }
  const incomplete = rows.filter((row) => !konvektoriTarkastusSummary(row).complete).length;
  if (incomplete > 0) {
    pushRow(summaryRows, 'Kesken', `${incomplete} kpl`);
  }
  return summaryRows;
}

export function konvektoritTabComplete(rows: KonvektoriRowData[] | undefined | null): boolean {
  const list = rows ?? [];
  if (list.length === 0) return false;
  return list.every((row) => konvektoriTarkastusSummary(row).complete);
}

export function raportointiSummaryRows(form: HuoltoReportData): ModuleSummaryRow[] {
  const rows: ModuleSummaryRow[] = [];
  pushRow(rows, 'Asiakas', form.asiakas);
  pushRow(rows, 'Osoite', form.osoite);
  if (isKonvektoritDevice(form.laiteTyyppi)) {
    pushRow(rows, 'Verkosto', form.laiteKayttotarkoitus);
    pushRow(rows, 'Alue', form.laiteSijainti);
  } else {
    pushRow(rows, 'Laite', [form.laiteValmistaja, form.laiteMalli, form.laiteTunnus].filter(Boolean).join(' · '));
  }
  return rows;
}
