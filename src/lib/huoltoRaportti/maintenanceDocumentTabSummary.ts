import { konvektoriTarkastusSummary, konvektoriRowIsFaulty } from './konvektoriTarkastus';
import { hideMaintenancePrintWarnings } from './defaults';
import { isKonvektoritDevice, usesRefrigerantServiceExtras } from './deviceModuleLogic';
import type { MaintenanceReportTabId } from './maintenanceReportTabs';
import { maintenanceSectionHasPrintSettings } from './maintenanceReportSectionCatalog';
import type { HuoltoReportData, RefrigerantCircuitData } from './types';
import { getEvaporatorCircuitCount } from './evaporatorHelpers';

function trim(val: unknown): string {
  return String(val ?? '').trim();
}

function has(val: unknown): boolean {
  return trim(val) !== '';
}

function joinParts(parts: string[], separator = ' · '): string {
  return parts.filter(Boolean).join(separator);
}

function formatCircuitPressures(circuit: RefrigerantCircuitData | null | undefined): string {
  if (!circuit?.onKaytossa) return '';
  const low = trim(circuit.imupaine);
  const high = trim(circuit.korkeapaine);
  if (!low && !high) return '';
  return `${low || '—'}/${high || '—'} bar`;
}

function circuitSummaryLine(
  label: string,
  circuit: RefrigerantCircuitData | null | undefined,
): string {
  const pressures = formatCircuitPressures(circuit);
  if (!pressures) return '';
  return `${label}: ${pressures}`;
}

function kylmaaineAmountSummary(form: HuoltoReportData): string {
  const type = trim(form.kylmaaineTyyppi);
  const circuits = trim(form.kylmaainePiireja) || '1';
  const single = circuits === '1';
  if (single) {
    const charge = trim(form.kylmaaineMaaraPiiri1) || trim(form.kylmaaineValmistajaMaara);
    return joinParts([type, charge ? `${charge} kg` : '']);
  }
  const count = Math.min(4, Math.max(1, parseInt(circuits, 10) || 1));
  const amounts = [
    form.kylmaaineMaaraPiiri1,
    form.kylmaaineMaaraPiiri2,
    form.kylmaaineMaaraPiiri3,
    form.kylmaaineMaaraPiiri4,
  ]
    .slice(0, count)
    .map((value) => trim(value))
    .filter(Boolean);
  return joinParts([type, amounts.length > 0 ? `${amounts.join(' / ')} kg` : `${count} piiriä`]);
}

function kylmaainePiiriSummary(form: HuoltoReportData): string {
  const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const circuits = [form.kylmaainePiiri1, form.kylmaainePiiri2, form.kylmaainePiiri3].slice(0, count);
  const lines = circuits
    .map((circuit, index) => circuitSummaryLine(`P${index + 1}`, circuit))
    .filter(Boolean);
  return lines.join(' · ') || `${count} piiriä`;
}

function deviceLabel(form: HuoltoReportData): string {
  return joinParts([trim(form.laiteValmistaja), trim(form.laiteMalli)], ' ');
}

function huoltotiedotSummary(form: HuoltoReportData): string {
  const parts: string[] = [];
  if (trim(form.huoltoPaivamaara)) {
    parts.push(new Date(form.huoltoPaivamaara).toLocaleDateString('fi-FI'));
  }
  if (form.huoltoSuoritettu) parts.push('Huolto suoritettu');
  if (form.huoltoLaiteessaVika) parts.push('Huomioita');
  if (hideMaintenancePrintWarnings(form)) parts.push('Varoitukset piilotettu');
  return parts.join(' · ') || 'Päivämäärä ja suorittaja';
}

function konvektoritSummary(form: HuoltoReportData): string {
  const rows = form.konvektoriRows ?? [];
  if (rows.length === 0) return 'Ei konvektoreita';
  const faulty = rows.filter((row) => konvektoriRowIsFaulty(row)).length;
  const complete = rows.filter((row) => konvektoriTarkastusSummary(row).complete).length;
  const base = `${rows.length} kpl`;
  if (faulty > 0) return `${base} · ${faulty} viallista`;
  if (complete < rows.length) return `${base} · ${complete}/${rows.length} valmis`;
  return `${base} · valmis`;
}

function inspectionCountSummary(count: number, label: string): string {
  if (count <= 0) return label;
  return `${count} ${label}`;
}

export function buildMaintenanceDocumentTabSummary(
  tabId: MaintenanceReportTabId,
  form: HuoltoReportData,
): string {
  switch (tabId) {
    case 'raportointi':
      if (isKonvektoritDevice(form.laiteTyyppi)) {
        return joinParts([
          trim(form.asiakas) || 'Asiakas puuttuu',
          trim(form.laiteKayttotarkoitus) || 'Verkosto puuttuu',
          konvektoritSummary(form),
        ]);
      }
      return joinParts([trim(form.asiakas) || 'Asiakas puuttuu', deviceLabel(form) || 'Laite puuttuu']);

    case 'kylmaaine':
      return kylmaaineAmountSummary(form) || 'Täytä kylmäaine';

    case 'kylmaainePiiri':
      return kylmaainePiiriSummary(form);

    case 'hoyrystin': {
      const count = getEvaporatorCircuitCount(form);
      return inspectionCountSummary(count, count === 1 ? 'höyrystin' : 'höyrystintä');
    }

    case 'lauhdutin': {
      const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
      return inspectionCountSummary(count, count === 1 ? 'lauhdutin' : 'lauhdutinta');
    }

    case 'lauhdutuspiiri':
      return trim(form.lauhdutuspiiriData?.pumppuMalli)
        ? `Pumppu ${trim(form.lauhdutuspiiriData?.pumppuMalli)}`
        : 'Lauhdutuspiiri';

    case 'nestelauhduttimet': {
      const units = form.nestelauhduttimetVj ?? [];
      return units.length > 0 ? `${units.length} kpl` : 'Nestelauhduttimet';
    }

    case 'jaahdytysvesi':
      return trim(form.jaahdytysvesiData?.pumppuMalli)
        ? `Pumppu ${trim(form.jaahdytysvesiData?.pumppuMalli)}`
        : 'Jäähdytysvesi';

    case 'vapaajahdytys':
      return form.vapaajahdytysKaytossa ? 'Käytössä' : 'Ei käytössä';

    case 'konvektorit':
      return konvektoritSummary(form);

    case 'lampopumppu':
      return joinParts([
        deviceLabel(form) || trim(form.ulkoyksikkoMalli),
        trim(form.ulkoyksikkoJaahdytysTeho) ? `${trim(form.ulkoyksikkoJaahdytysTeho)} kW` : '',
      ]);

    case 'mlp':
    case 'kiinteistoJahdytys':
    case 'energia':
      return deviceLabel(form) || 'MLP / chiller';

    case 'huomiot':
      return trim(form.huomiot) ? 'Huomioita kirjattu' : 'Ei huomioita';

    case 'huoltotiedot':
      return huoltotiedotSummary(form);

    default: {
      const customId = tabId.startsWith('custom:') ? tabId.slice('custom:'.length) : '';
      const module = (form.customModules ?? []).find((entry) => entry.id === customId);
      if (!module) return '';
      const filled = module.fields.filter((field) => {
        const value = module.values[field.id];
        if (field.type === 'checkbox') return value === true;
        return has(value);
      }).length;
      return filled > 0 ? `${filled}/${module.fields.length} kenttää` : module.title;
    }
  }
}

export function maintenanceTabHasPrintSettings(
  tabId: MaintenanceReportTabId,
  form: HuoltoReportData,
): boolean {
  return maintenanceSectionHasPrintSettings(tabId, form);
}

export function circuitPrintSettingsSummary(form: HuoltoReportData): string {
  const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const circuits = [form.kylmaainePiiri1, form.kylmaainePiiri2, form.kylmaainePiiri3].slice(0, count);
  const on = circuits.filter(
    (circuit) => circuit?.tulistusTulosteeseen || circuit?.alijahdytysTulosteeseen,
  ).length;
  if (on === 0) return 'Laskelmat pois tulosteesta';
  return `Tulosteeseen ${on}/${count} piiriä`;
}

export function huoltotiedotPrintSettingsSummary(form: HuoltoReportData): string {
  const parts: string[] = [];
  if (form.huoltoReportDocumentKind === 'kayttoonotto') parts.push('Käyttöönotto');
  if (usesRefrigerantServiceExtras(form.laiteTyyppi) && hideMaintenancePrintWarnings(form)) {
    parts.push('Varoitukset piilotettu');
  }
  return parts.join(' · ') || 'Raportti- ja tulostusasetukset';
}
