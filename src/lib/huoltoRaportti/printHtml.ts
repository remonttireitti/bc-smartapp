import type {
  CompressorData,
  CondenserFanData,
  EvaporatorData,
  HuoltoReportData,
  HuomiotImageAttachment,
  KonvektoriRowData,
  LauhdutuspiiriData,
  NestepiiriData,
  RefrigerantCircuitData,
  SisayksikkoData,
  VapaajahdytysData,
} from './types';
import type { MaintenanceReportPhotoItem } from '../maintenanceReportImages';
import {
  resolveMaintenancePrintPhotoHref,
} from '../maintenanceReportPrintImages';
import { renderCustomModulesPrintHtml } from './customModulePrintHtml';
import { hideMaintenancePrintWarnings } from './defaults';
import { expansionValveTypes, lauhdutinTypeLabel, LAUHDUTIN_PAINEVENTTIILI_LABEL, LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL } from './constants';
import {
  hasExternalNestelauhdutin,
  isChillerLikeDevice,
  isKonvektoritDevice,
  isSharedEvaporatorAcrossCircuits,
  usesRefrigerantServiceExtras,
  isWaterCooledChiller,
  refrigerantCircuitHasMagnetValve,
} from './deviceModuleLogic';
import {
  evapTyyppiLabel,
  evaporatorShowsFansAndDefrost,
  isHeatExchangerEvaporatorType,
} from './evaporatorHelpers';
import {
  formatTyhjiointiLoppupaine,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from './kokeAikaUtils';
import {
  buildRefrigerantCircuitWarnings,
  computeChillerEnergyFromMlp,
} from './mlpEnergyCalc';
import {
  circuitSubcoolingPrintEnabled,
  circuitSuperheatPrintEnabled,
} from './refrigerantCircuitPrint';
import {
  generateKonvektoritGridPrintHtml,
  konvektoriVerkostoKoideFromReport,
} from './konvektoriPrint';
import { formatHuomioPrintHtml } from './formatHuomioPrintHtml';
import { generateIlpPrintHtml } from './ilpPrint';
import { deviceTypes } from './constants';
import {
  PRINT_SHELL_CSS,
  keepHeadingWithFirst,
  renderInfoColumns,
  renderPrintHeader,
  renderSignatureRow,
  renderVerdictBand,
  verdictHtml,
} from './printShell';

function deviceTypeLabel(t: string): string {
  return (deviceTypes as ReadonlyArray<{ value: string; label: string }>).find((d) => d.value === t)?.label ?? t;
}
import { generateMlpFullPrintHtml } from './printMlpFull';
import { renderCompressorCurrentHtml, renderFanPhaseCardHtml } from './printPhaseHelpers';
import {
  calculateSubcoolingFromMeasurements,
  calculateSuperheatFromMeasurements,
  getRefrigerantGWP,
  renderCheckbox,
  renderVuototarkastusStatus,
} from './utils';
import { renderInspectionHuomioRow, renderInspectionStatusRow } from './inspectionPrint';
import {
  compressorInspectionStatus,
  condenserInspectionStatus,
  entityInspectionStatus,
  lauhdutuspiiriInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  normalizeLegacyInspectionStatus,
  ulkoyksikkoInspectionStatus,
  vapaajahdytysInspectionStatus,
} from './huoltoInspectionStatus';
import { hasPrintableValue, normalizePrintText } from './printFieldVisibility';
import {
  SISAYKSIKKO_TARKASTUS_ITEMS,
  sisayksikkoKohtaEiTarkastettu,
  sisayksikkoTarkastusSummary,
} from './sisayksikkoTarkastus';

export interface MaintenancePrintMeta {
  companyName: string;
  logoUrl?: string;
  /** storagePath → signed/public URL for print */
  imageUrls?: Record<string, string>;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function field(data: HuoltoReportData, key: string): unknown {
  return data[key];
}

function strField(data: HuoltoReportData, key: string): string {
  return normalizePrintText(field(data, key));
}

function box(title: string, _color: string, inner: string): string {
  if (!inner.trim()) return '';
  return `<section class="sec"><div class="sec-body">${keepHeadingWithFirst(`<h2>${esc(title)}</h2>`, inner)}</div></section>`;
}

function row(label: string, val: unknown, _borderColor = '#ccc'): string {
  if (!hasPrintableValue(val)) return '';
  if (!label) return `<div class="kvr full">${esc(val)}</div>`;
  return `<div class="kvr"><span>${esc(label)}</span><span>${esc(val)}</span></div>`;
}

function gridField(label: string, val: unknown): string {
  if (!hasPrintableValue(val)) return '';
  return `<div style="break-inside:avoid;page-break-inside:avoid;"><div style="color:#666;margin-bottom:2px;">${esc(label)}</div>
    <div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${esc(val)}</div></div>`;
}

function checkRow(checked: boolean | undefined, label: string): string {
  const html = renderCheckbox(checked, label);
  return html ? `<div style="padding:2px 0;">${html}</div>` : '';
}

function getSulatusText(sulatus: string): string {
  if (sulatus === 'ilma') return 'Ilmasulatus';
  if (sulatus === 'sahko') return 'Sähkösulatus';
  return 'Kuumakaasu sulatus';
}

function getLauhdutinTypeText(tyyppi: string): string {
  return lauhdutinTypeLabel(tyyppi);
}

function getOhjausText(ohjaus: string, muu?: string): string {
  const map: Record<string, string> = {
    nopeussäädin: 'Nopeussäädin',
    taajusmuuntaja: 'Taajusmuuntaja',
    kp_pressostaatti: 'KP-pressostaatti',
    kompressorin_yhtaaikaa: 'Puhallin toimii kompressorin kanssa yhtä aikaa',
    muu: muu ? `Muu: ${muu}` : 'Muu',
  };
  return map[ohjaus] ?? ohjaus;
}

function renderCondenserFanBlock(fan: Partial<CondenserFanData>, index: number, syotto?: '230' | '400'): string {
  return renderFanPhaseCardHtml(fan, index, 'condenser', syotto);
}

function renderEvaporatorFanBlock(fan: Partial<CondenserFanData>, index: number): string {
  return renderFanPhaseCardHtml(fan, index, 'evaporator', fan.jannite === '400' ? '400' : undefined);
}

function renderChillerEnergy(data: HuoltoReportData): string {
  if (!isChillerLikeDevice(data.laiteTyyppi)) return '';
  const m = data.mlpData;
  if (!m) return '';

  const { qCoolKw, pInKw, qCondKw, cop } = computeChillerEnergyFromMlp(m, data.kylmaainePiiri1);
  if (qCoolKw == null && pInKw == null && !hasPrintableValue(m.keruupiiriVirtaus)) return '';

  const copBgColor =
    (cop ?? 0) >= 5 ? '#e8f5e9' : (cop ?? 0) >= 3.5 ? '#fffde7' : (cop ?? 0) >= 2.5 ? '#fff3e0' : '#ffebee';
  const copBorderColor =
    (cop ?? 0) >= 5 ? '#4caf50' : (cop ?? 0) >= 3.5 ? '#ffc107' : (cop ?? 0) >= 2.5 ? '#ff9800' : '#f44336';
  const copTextColor =
    (cop ?? 0) >= 5 ? '#2e7d32' : (cop ?? 0) >= 3.5 ? '#f9a825' : (cop ?? 0) >= 2.5 ? '#e65100' : '#c62828';

  return box(
    'ENERGIATEHOKKUUS',
    '#7B1FA2',
    `
    <div style="background:${copBgColor};border:2px solid ${copBorderColor};border-radius:8px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:13px;font-weight:bold;">Jäähdytyksen COP</div>
        <div style="font-size:10px;color:#666;">jäähdytysteho / sähköteho</div>
      </div>
      <div style="font-size:28px;font-weight:bold;color:${copTextColor};">${cop != null && cop > 0 ? cop.toFixed(2) : '—'}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:10px;">
      <div style="padding:8px;background:#e0f7fa;border-radius:4px;text-align:center;">
        <div style="color:#00838f;">Q_cool</div>
        <div style="font-weight:bold;">${qCoolKw != null ? `${qCoolKw.toFixed(2)} kW` : '—'}</div>
      </div>
      <div style="padding:8px;background:#fff8e1;border-radius:4px;text-align:center;">
        <div style="color:#ff8f00;">P_in</div>
        <div style="font-weight:bold;">${pInKw != null ? `${pInKw.toFixed(2)} kW` : '—'}</div>
      </div>
      <div style="padding:8px;background:#fff3e0;border-radius:4px;text-align:center;">
        <div style="color:#e65100;">Q_cond</div>
        <div style="font-weight:bold;">${qCondKw != null ? `${qCondKw.toFixed(2)} kW` : '—'}</div>
      </div>
    </div>`,
  );
}

function renderCompressorBlock(comp: Partial<CompressorData>, index: number): string {
  const parts = [
    gridField('Valmistaja', comp.valmistaja),
    gridField('Malli', comp.malli),
    gridField('Ohjaustapa', comp.ohjaustapa),
    gridField('Kontaktori', comp.kontaktoriTyyppi),
    gridField('Pehmokäynnistin', comp.pehmokaynnistinTyyppi),
    gridField('Taajuusmuuttaja', comp.taajuusmuuttajaTyyppi),
  ].filter(Boolean);
  const checks = [checkRow(comp.oljyMaaraOikea, 'Öljy määrä oikea'), checkRow(comp.oljyKirkas, 'Öljy kirkas')].filter(Boolean);
  const inspection = [
    renderInspectionStatusRow(comp.tarkastusTila ?? compressorInspectionStatus(comp), 'Tarkastus', esc),
    renderInspectionHuomioRow(comp.tarkastusHuomio, esc),
  ].filter(Boolean).join('');
  const virta = renderCompressorCurrentHtml(comp);
  if (!parts.length && !checks.length && !virta && !inspection) return '';
  return `<div style="margin-bottom:8px;padding:8px;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;">
    <div style="font-weight:bold;color:#E64A19;margin-bottom:4px;">Kompressori ${index}</div>
    ${inspection}
    ${parts.length ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:6px;">${parts.join('')}</div>` : ''}
    ${checks.join('')}${virta}
  </div>`;
}

function renderCircuitHtml(
  circuitNum: number,
  kp: RefrigerantCircuitData | null | undefined,
  refrigerant: string,
  laiteTyyppi: string,
): string {
  if (!kp || !kp.onKaytossa) return '';
  const printSuperheat = circuitSuperheatPrintEnabled(kp);
  const printSubcooling = circuitSubcoolingPrintEnabled(kp);
  const sh = printSuperheat
    ? calculateSuperheatFromMeasurements(
        parseFloat(kp.imupaine) || 0,
        parseFloat(kp.imuLampotila) || 0,
        refrigerant,
      )?.toFixed(1) ?? '-'
    : '';
  const sc = printSubcooling
    ? calculateSubcoolingFromMeasurements(
        parseFloat(kp.korkeapaine) || 0,
        parseFloat(kp.nestePutkiLampotila) || 0,
        refrigerant,
      )?.toFixed(1) ?? '-'
    : '';
  const calcLine =
    printSuperheat || printSubcooling
      ? `<div style="margin-bottom:6px;font-size:11px;">${
          printSuperheat ? `Tulistus: <strong>${esc(sh || '—')} K</strong>` : ''
        }${printSuperheat && printSubcooling ? ' · ' : ''}${
          printSubcooling ? `Alijäähdytys: <strong>${esc(sc || '—')} K</strong>` : ''
        }</div>`
      : '';

  const paineGrid = [
    gridField('Imupaine (bar)', kp.imupaine),
    gridField('Korkeapaine (bar)', kp.korkeapaine),
    gridField('Imulämpötila (°C)', kp.imuLampotila),
    gridField('Nesteputki (°C)', kp.nestePutkiLampotila),
    gridField('Kuumakaasu (°C)', kp.kuumakaasuLampotila),
  ]
    .filter(Boolean)
    .join('');

  const compCount = parseInt(kp.kompressorienMaara || '1', 10) || 1;
  let compressors = '';
  for (let i = 1; i <= compCount; i++) {
    const comp = kp[`kompressori${i}` as keyof RefrigerantCircuitData] as CompressorData | undefined;
    if (comp) compressors += renderCompressorBlock(comp, i);
  }

  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, kp.paisuntaventtiiliTyyppi);
  const pvLabel =
    expansionValveTypes.find((t) => t.value === kp.paisuntaventtiiliTyyppi)?.label ??
    kp.paisuntaventtiiliTyyppi;
  const configRows = [
    row('Ohjaustapa', kp.ohjaustapa, '#E64A19'),
    row('Paisuntaventtiili', pvLabel, '#E64A19'),
    row('PV valmistaja', kp.paisuntaventtiiliValmistaja, '#E64A19'),
    row('PV malli', kp.paisuntaventtiiliMalli, '#E64A19'),
    row('Kuivain valmistaja', kp.kuivainValmistaja, '#E64A19'),
    row('Kuivain malli', kp.kuivainMalli, '#E64A19'),
    ...(showMagnetValve ? [checkRow(kp.magneettiventtiiliTestattu, 'Magneettiventtiili testattu')] : []),
    checkRow(kp.nestelasiKuiva, 'Nestelasi kuiva'),
    checkRow(kp.kuivainOK, 'Kuivain OK'),
  ]
    .filter(Boolean)
    .join('');

  return box(
    `KYLMÄAINEPIIRI ${circuitNum}`,
    '#E64A19',
    `
    ${paineGrid ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">${paineGrid}</div>` : ''}
    ${calcLine}
    ${configRows}
    ${compressors ? `<div style="margin-top:8px;"><strong>Kompressorit</strong>${compressors}</div>` : ''}
  `,
  );
}

function renderSingleEvaporatorHtml(
  ev: EvaporatorData,
  index: number,
  deviceType: string,
  sharedAcrossCircuits?: boolean,
): string {
  const title =
    deviceType === 'kylmäkoneikko'
      ? `HÖYRYSTIN ${index + 1}`
      : sharedAcrossCircuits
        ? 'HÖYRYSTIN (yhteinen)'
        : `HÖYRYSTIN — PIIRI ${index + 1}`;
  const chillerHx = isChillerLikeDevice(deviceType) && isHeatExchangerEvaporatorType(ev.tyyppi);
  const showDefrost = evaporatorShowsFansAndDefrost(ev.tyyppi);
  const fanHtml = showDefrost && Array.isArray(ev.puhaltimet)
    ? `<div style="margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${ev.puhaltimet
        .map((fan, fi) => renderEvaporatorFanBlock(fan, fi + 1))
        .filter(Boolean)
        .join('')}</div>`
    : '';
  const defrostHtml = showDefrost && ev.sulatus === 'sahko'
    ? [
        row('Sähköjännite', ev.sahkoJannite, '#00838F'),
        checkRow(ev.sahkoVirtaMitattu, 'Sähkövirta mitattu'),
        ev.sahkoVirtaMitattu ? row('L1 (A)', ev.sahkoVirtaL1, '#00838F') : '',
        ev.sahkoVirtaMitattu ? row('L2 (A)', ev.sahkoVirtaL2, '#00838F') : '',
        ev.sahkoVirtaMitattu ? row('L3 (A)', ev.sahkoVirtaL3, '#00838F') : '',
        row('Sulatusohjaus', ev.sulatusOhjaus, '#00838F'),
        row('Sulatuskertoja/pv', ev.sulatusKertojaPäivässä, '#00838F'),
        row('Sulatusaika', ev.sulatusAika, '#00838F'),
      ]
        .filter(Boolean)
        .join('')
    : showDefrost
      ? [
          row('Sulatusohjaus', ev.sulatusOhjaus, '#00838F'),
          row('Sulatuskello', ev.sulatusKelloMalli, '#00838F'),
          row('Sulatusaika', ev.sulatusAika, '#00838F'),
        ]
          .filter(Boolean)
          .join('')
      : '';
  const inner = [
    renderInspectionStatusRow(ev.tarkastusTila ?? entityInspectionStatus(ev), 'Tarkastus', esc),
    renderInspectionHuomioRow(ev.tarkastusHuomio, esc),
    gridField(chillerHx ? 'Lämmönvaihdin' : 'Tyyppi', evapTyyppiLabel(ev.tyyppi)),
    !chillerHx ? gridField('Huoneen tunnus', ev.huoneenTunnus) : '',
    showDefrost ? gridField('Sulatus', getSulatusText(ev.sulatus)) : '',
    gridField('Valmistaja', ev.valmistaja),
    gridField('Malli', ev.malli),
    gridField('Sarjanumero', ev.sarjanumero),
  ]
    .filter(Boolean)
    .join('');
  if (!inner.trim() && !fanHtml && !defrostHtml) return '';
  return box(
    title,
    '#00838F',
    `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>${defrostHtml}${fanHtml}`,
  );
}

function renderEvaporators(data: HuoltoReportData): string {
  if (!data.selectedModules.hoyrystin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  if (isChillerLikeDevice(data.laiteTyyppi)) return '';
  return data.evaporatorData
    .map((ev, i) => renderSingleEvaporatorHtml(ev, i, data.laiteTyyppi))
    .join('');
}

function renderCircuitsHtml(data: HuoltoReportData): string {
  if (isKonvektoritDevice(data.laiteTyyppi)) return '';
  if (!data.selectedModules.kylmaainePiiri || data.kylmaainePiireja === '0') return '';

  const inlineEvaporators =
    isChillerLikeDevice(data.laiteTyyppi) &&
    !isWaterCooledChiller(data.laiteTyyppi) &&
    (data.selectedModules.hoyrystin || data.laiteTyyppi === 'pakastin' || data.laiteTyyppi === 'kylmäkoneikko');
  const sharedEvaporator = isSharedEvaporatorAcrossCircuits(
    data.laiteTyyppi,
    data.hoyrystinYhteinenPiireissa,
  );

  let html = '';
  html += renderCircuitHtml(1, data.kylmaainePiiri1, data.kylmaaineTyyppi, data.laiteTyyppi);
  if (inlineEvaporators && data.evaporatorData[0]) {
    html += renderSingleEvaporatorHtml(data.evaporatorData[0], 0, data.laiteTyyppi, sharedEvaporator);
  }

  if (data.kylmaainePiireja !== '1' && data.kylmaainePiiri2) {
    html += renderCircuitHtml(2, data.kylmaainePiiri2, data.kylmaaineTyyppi, data.laiteTyyppi);
    if (inlineEvaporators && !sharedEvaporator && data.evaporatorData[1]) {
      html += renderSingleEvaporatorHtml(data.evaporatorData[1], 1, data.laiteTyyppi, false);
    }
  }

  if ((data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4') && data.kylmaainePiiri3) {
    html += renderCircuitHtml(3, data.kylmaainePiiri3, data.kylmaaineTyyppi, data.laiteTyyppi);
    if (inlineEvaporators && !sharedEvaporator && data.evaporatorData[2]) {
      html += renderSingleEvaporatorHtml(data.evaporatorData[2], 2, data.laiteTyyppi, false);
    }
  }

  return html;
}

function renderCondensers(data: HuoltoReportData): string {
  if (!data.selectedModules.lauhdutin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  return data.condenserData
    .map((co, i) => {
      const fanHtml = (co.puhaltimet ?? []).length
        ? `<div style="margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${(co.puhaltimet ?? [])
            .map((fan, fi) => renderCondenserFanBlock(fan, fi + 1, fan.jannite === '400' ? '400' : undefined))
            .filter(Boolean)
            .join('')}</div>`
        : '';
      const inner = [
        renderInspectionStatusRow(co.tarkastusTila ?? condenserInspectionStatus(co), 'Tarkastus', esc),
        renderInspectionHuomioRow(co.tarkastusHuomio, esc),
        gridField('Tyyppi', co.tyyppi ? getLauhdutinTypeText(co.tyyppi) : ''),
        gridField('Puhaltimien määrä', co.puhaltimienMaara),
        gridField('Ohjaus', co.puhallinOhjaus ? getOhjausText(co.puhallinOhjaus, co.puhallinOhjausMuu) : ''),
        gridField('Nopeussäädin', co.nopeussäädinMalli),
        gridField('Taajuusmuuntaja', co.taajusmuuntajaMalli),
        checkRow(co.lauhdutinPuhdistettu, 'Lauhdutin puhdistettu'),
        checkRow(co.painesäätimenTarkistettu, LAUHDUTIN_PAINEVENTTIILI_LABEL),
        checkRow(co.virtausRiittävä, 'Virtaus riittävä'),
        checkRow(co.talvivarustus, 'Talvivarustus'),
        fanHtml,
      ]
        .filter(Boolean)
        .join('');
      return box(`LAUHDUTIN ${i + 1}`, '#1565C0', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>`);
    })
    .join('');
}

function renderNestepiiriFields(color: string, piiri: NestepiiriData | LauhdutuspiiriData | undefined): string {
  if (!piiri) return '';
  const isLauhdutus = 'painesäätimenTarkistettu' in piiri;
  const status = isLauhdutus
    ? lauhdutuspiiriInspectionStatus(piiri as LauhdutuspiiriData)
    : nestepiiriInspectionStatus(piiri);
  const rows = [
    renderInspectionStatusRow(piiri.tarkastusTila ?? status, 'Tarkastus', esc),
    renderInspectionHuomioRow(piiri.tarkastusHuomio, esc),
    row('Neste', piiri.neste, color),
    row('Virtaus (m³/h)', piiri.virtaus, color),
    row('Meno (°C)', piiri.meno, color),
    row('Paluu (°C)', piiri.tulo, color),
    checkRow(piiri.pumppuTarkastettu, 'Pumppu tarkastettu'),
    piiri.pumppuTarkastettu ? row('Pumpun valmistaja', piiri.pumppuValmistaja, color) : '',
    piiri.pumppuTarkastettu ? row('Pumpun malli', piiri.pumppuMalli, color) : '',
    checkRow(piiri.paisuntaAstiaTarkistettu, 'Paisunta-astia tarkistettu'),
    piiri.paisuntaAstiaTarkistettu ? row('Paisunta-astia koko', piiri.paisuntaAstiaKoko, color) : '',
    piiri.paisuntaAstiaTarkistettu ? row('Esipaine (bar)', piiri.paisuntaAstiaEsipaine, color) : '',
    checkRow(piiri.paineTarkastettu, 'Paine tarkastettu'),
    piiri.paineTarkastettu ? row('Mitattu paine (bar)', piiri.paineBar, color) : '',
    checkRow(piiri.automaattinenIlmausTarkistettu, 'Automaattinen ilmaus tarkistettu'),
    checkRow(piiri.mutapussiPuhdistettu, 'Mutapussi puhdistettu'),
    checkRow(piiri.toimilaitteetOK, 'Toimilaitteet OK'),
  ];
  const lp = piiri as LauhdutuspiiriData;
  if ('painesäätimenTarkistettu' in lp) {
    rows.push(
      checkRow(lp.painesäätimenTarkistettu, LAUHDUTIN_PAINEVENTTIILI_LABEL),
      lp.painesäätimenTarkistettu ? row(LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL, lp.painesäätimenMalli, color) : '',
      checkRow(lp.virtausRiittävä !== false, 'Virtaus riittävä'),
      lp.virtausRiittävä === false && lp.virtausOngelma
        ? row('Virtausongelma', lp.virtausOngelma, color)
        : '',
    );
  }
  return rows.filter(Boolean).join('');
}

function renderLiquidCircuitFields(color: string, piiri: VapaajahdytysData | undefined): string {
  if (!piiri) return '';
  const status = vapaajahdytysInspectionStatus(piiri);
  return [
    renderInspectionStatusRow(piiri.tarkastusTila ?? status, 'Tarkastus', esc),
    renderInspectionHuomioRow(piiri.tarkastusHuomio, esc),
    row('Neste', piiri.neste, color),
    row('Virtaus (m³/h)', piiri.virtaus, color),
    row('Meno (°C)', piiri.meno, color),
    row('Paluu (°C)', piiri.tulo, color),
    checkRow(piiri.pumppuTarkastettu, 'Pumppu tarkastettu'),
    piiri.pumppuTarkastettu ? row('Pumpun valmistaja', piiri.pumppuValmistaja, color) : '',
    piiri.pumppuTarkastettu ? row('Pumpun malli', piiri.pumppuMalli, color) : '',
    piiri.ohjaus === 'kone'
      ? row('Ohjaus', 'Kone', color)
      : piiri.ohjaus === 'taloautomaatio'
        ? row('Ohjaus', 'Taloautomaatio', color)
        : '',
  ]
    .filter(Boolean)
    .join('');
}

function renderVapaajahdytys(data: HuoltoReportData): string {
  if (!data.selectedModules.vapaajahdytys) return '';
  const inner = renderLiquidCircuitFields('#0891b2', data.vapaajahdytysData);
  if (!inner) return '';
  return box('VAPAAJÄÄHDYTYS', '#0891b2', inner);
}

function renderJaahdytysvesi(data: HuoltoReportData): string {
  if (!data.selectedModules.vedenjajahdytyskone) return '';
  const inner = renderNestepiiriFields('#01579B', data.jaahdytysvesiData);
  if (!inner) return '';
  const title =
    data.laiteTyyppi === 'vedenjäähdytyskone' || data.laiteTyyppi === 'vakioilmastointtikone'
      ? 'JÄÄHDYTYSPIIRI'
      : 'JÄÄHDYTYSVESEN PIIRI';
  return box(title, '#01579B', inner);
}

function renderLauhdutuspiiri(data: HuoltoReportData): string {
  if (!data.selectedModules.lauhdutin || !hasExternalNestelauhdutin(data.lauhdutinTyyppiLaite)) return '';
  const inner = renderNestepiiriFields('#1565C0', data.lauhdutuspiiriData);
  if (!inner) return '';
  return box('LAUHDUTUSPIIRI', '#1565C0', inner);
}

function renderNestelauhduttimet(data: HuoltoReportData): string {
  const units = field(data, 'nestelauhduttimetVj');
  if (!data.selectedModules.nestelauhduttimet || !Array.isArray(units) || units.length === 0) return '';
  return units
    .map((u: Record<string, unknown>, i: number) => {
      const inner = [
        gridField('Valmistaja', u.valmistaja),
        gridField('Malli', u.malli),
        gridField('Sarjanumero', u.sarjanumero),
        gridField('Puhaltimien määrä', u.puhaltimienMaara),
        checkRow(u.lauhdutinPuhdistettu as boolean | undefined, 'Puhdistettu'),
      ]
        .filter(Boolean)
        .join('');
      return box(`NESTELAUHDUTIN ${i + 1}`, '#5D4037', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>`);
    })
    .join('');
}

function renderKonvektoritTable(data: HuoltoReportData): string {
  const rows = field(data, 'konvektoriRows') ?? field(data, 'konvektoritData');
  if (!isKonvektoritDevice(data.laiteTyyppi) || !Array.isArray(rows) || rows.length === 0) return '';
  return generateKonvektoritGridPrintHtml(rows as KonvektoriRowData[], esc, {
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    escAttr,
    verkosto: konvektoriVerkostoKoideFromReport(data),
  });
}

function konvektoriPrintSubtitle(data: HuoltoReportData): string {
  const koide = konvektoriVerkostoKoideFromReport(data);
  return koide.kuvaus || koide.alue || koide.tunnus || '';
}

/**
 * ILP: tulosteen yleistulos ei saa väittää "Ei vikaa", jos laitteen omat tarkastukset näyttävät vian
 * (ulkoyksikkö, sisäyksikkö, hylätty tiiveyskoe / tyhjiöinti).
 */
export function lampopumppuHasDeviceFault(data: HuoltoReportData): boolean {
  if (data.laiteTyyppi !== 'lämpöpumppu') return false;
  const ulko = normalizeHuoltoInspectionStatus(data.ulkoyksikkoTarkastusTila) ?? ulkoyksikkoInspectionStatus(data);
  if (ulko === 'faulty') return true;
  const count = data.sisayksikkoMaara > 0 ? data.sisayksikkoMaara : 1;
  const units = (data.sisayksikkoData ?? []).slice(0, count);
  if (units.some((u) => u.huomioTyyppi === 'vika' || sisayksikkoTarkastusSummary(u).anyFaulty)) return true;
  if (data.selectedModules?.tiiveyskoe && data.tiiveyskoeData?.tulos === 'hylatty') return true;
  if (data.selectedModules?.tyhjiointi && data.tyhjiointiData?.tulos === 'hylatty') return true;
  return false;
}

function renderLampopumppuSections(data: HuoltoReportData): string {
  if (data.laiteTyyppi !== 'lämpöpumppu') return '';

  const ulko = [
    renderInspectionStatusRow(data.ulkoyksikkoTarkastusTila ?? ulkoyksikkoInspectionStatus(data), 'Tarkastus', esc),
    renderInspectionHuomioRow(data.ulkoyksikkoTarkastusHuomio, esc),
    row('Malli', strField(data, 'ulkoyksikkoMalli'), '#E64A19'),
    row('Sarjanumero', strField(data, 'ulkoyksikkoSarjanumero'), '#E64A19'),
    row('Jäähdytysteho (kW)', strField(data, 'ulkoyksikkoJaahdytysTeho'), '#E64A19'),
    row('Lämmitysteho (kW)', strField(data, 'ulkoyksikkoLammitysTeho'), '#E64A19'),
    checkRow(field(data, 'ulkoyksikkoKennosPuhdas') as boolean | undefined, 'Kenno puhdistettu'),
    checkRow(field(data, 'ulkoyksikkoTurvakytkin') as boolean | undefined, 'Turvakytkin'),
    checkRow(field(data, 'ulkoyksikkoSuojakotelo') as boolean | undefined, 'Suojakotelo'),
  ]
    .filter(Boolean)
    .join('');

  const sisayksikot = field(data, 'sisayksikkoData');
  let sisaHtml = '';
  if (Array.isArray(sisayksikot) && sisayksikot.length > 0) {
    sisaHtml = sisayksikot
      .map((u: Record<string, unknown>, i: number) => {
        const inner = [
          row('Tyyppi', u.tyyppi, '#00838F'),
          row('Malli', u.malli, '#00838F'),
          row('Sarjanumero', u.sarjanumero, '#00838F'),
          row('Kondenssivesi', u.kondenssivesi, '#00838F'),
          ...SISAYKSIKKO_TARKASTUS_ITEMS.map((item) =>
            sisayksikkoKohtaEiTarkastettu(u as unknown as SisayksikkoData, item.field)
              ? `<div style="padding:2px 0;color:#64748b;">${esc(item.label)}: ei tarkastettu</div>`
              : renderInspectionStatusRow(normalizeLegacyInspectionStatus(u[item.field]), item.label, esc),
          ),
        ]
          .filter(Boolean)
          .join('');
        return `<div style="margin-top:6px;padding:6px;background:#e0f7fa;border-radius:4px;"><strong>Sisäyksikkö ${i + 1}</strong>${inner}</div>`;
      })
      .join('');
  }

  const mittaus = [
    checkRow(field(data, 'mittausJaahdytysTestattu') as boolean | undefined, 'Jäähdytys testattu'),
    checkRow(field(data, 'mittausLammitysTestattu') as boolean | undefined, 'Lämmitys testattu'),
    row('Testauslämpötila (°C)', strField(data, 'mittausTestausLampotila'), '#00838F'),
    row('Ulkolämpötila (°C)', strField(data, 'mittausUlkoLampotila'), '#00838F'),
    row('Ulkoyksikkö L1 (A)', strField(data, 'mittausAmpeeriL1'), '#00838F'),
    row('Ulkoyksikkö L2 (A)', strField(data, 'mittausAmpeeriL2'), '#00838F'),
    row('Ulkoyksikkö L3 (A)', strField(data, 'mittausAmpeeriL3'), '#00838F'),
  ]
    .filter(Boolean)
    .join('');

  const mittausYksikot = field(data, 'mittausSisayksikot');
  let mittausYksHtml = '';
  if (Array.isArray(mittausYksikot) && mittausYksikot.length > 0) {
    mittausYksHtml = mittausYksikot
      .map((m: Record<string, unknown>, i: number) => {
        const inner = [
          row('Imupaine jäähdytys (bar)', m.imupaineJaahdytys, '#00838F'),
          row('Korkeapaine jäähdytys (bar)', m.korkeapaineJaahdytys, '#00838F'),
          row('Sisälämpötila jäähdytys (°C)', m.sisalampotilaJaahdytys ?? m.sisalampotila, '#00838F'),
          row('Paluu jäähdytys (°C)', m.paluuLampotilaJaahdytys ?? m.paluuLampotila, '#00838F'),
          row('Puhallus jäähdytys (°C)', m.puhallusLampotilaJaahdytys ?? m.puhallusLampotila, '#00838F'),
          row('Ilmanmäärä jäähdytys (m³/h)', m.ilmanmaaraM3hJaahdytys ?? m.ilmanmaaraM3h, '#00838F'),
          row('Imupaine lämmitys (bar)', m.imupaineLammitys, '#00838F'),
          row('Korkeapaine lämmitys (bar)', m.korkeapaineLammitys, '#00838F'),
          row('Sisälämpötila lämmitys (°C)', m.sisalampotilaLammitys ?? m.sisalampotila, '#00838F'),
          row('Paluu lämmitys (°C)', m.paluuLampotilaLammitys ?? m.paluuLampotila, '#00838F'),
          row('Puhallus lämmitys (°C)', m.puhallusLampotilaLammitys ?? m.puhallusLampotila, '#00838F'),
          row('Ilmanmäärä lämmitys (m³/h)', m.ilmanmaaraM3hLammitys ?? m.ilmanmaaraM3h, '#00838F'),
        ]
          .filter(Boolean)
          .join('');
        if (!inner) return '';
        return `<div style="margin-top:6px;padding:6px;background:#e0f7fa;border-radius:4px;"><strong>Mittaus ${i + 1}</strong>${inner}</div>`;
      })
      .filter(Boolean)
      .join('');
  }

  return [box('ULKOYKSIKKÖ', '#E64A19', ulko), box('SISÄYKSIKÖT', '#00838F', sisaHtml), box('MITTAUKSET', '#00838F', `${mittaus}${mittausYksHtml}`)]
    .filter(Boolean)
    .join('');
}

function renderRefrigerantCharge(data: HuoltoReportData): string {
  const gwp = data.kylmaaineTyyppi ? getRefrigerantGWP(data.kylmaaineTyyppi) : 0;
  const rows: string[] = [];
  if (hasPrintableValue(data.kylmaaineTyyppi)) {
    rows.push(row('Tyyppi', data.kylmaaineTyyppi, '#FF6D00'));
    if (gwp > 0) rows.push(row('GWP', gwp, '#FF6D00'));
  }

  const piireja = String(data.kylmaainePiireja ?? '').trim();
  const single = piireja === '1' || piireja === '';
  if (single) {
    const valm = parseFloat(strField(data, 'kylmaaineValmistajaMaara')) || 0;
    const lis = parseFloat(strField(data, 'kylmaaineLisattyMaara')) || 0;
    if (valm > 0) rows.push(row('Valmistajan määrä', `${valm} kg`, '#FF6D00'));
    if (lis > 0) rows.push(row('Lisätty määrä', `${lis} kg`, '#FF6D00'));
    if (valm + lis > 0) rows.push(row('Yhteensä', `${(valm + lis).toFixed(2)} kg`, '#FF6D00'));
    const putki = strField(data, 'kylmaainePutkimatka');
    if (putki) rows.push(row('Putkimatka', `${putki} m`, '#FF6D00'));
  } else {
    for (const [label, key] of [
      ['Piiri 1', 'kylmaaineMaaraPiiri1'],
      ['Piiri 2', 'kylmaaineMaaraPiiri2'],
      ['Piiri 3', 'kylmaaineMaaraPiiri3'],
      ['Piiri 4', 'kylmaaineMaaraPiiri4'],
    ] as const) {
      const v = strField(data, key);
      if (hasPrintableValue(v)) rows.push(row(label, `${v} kg`, '#FF6D00'));
    }
    const total = strField(data, 'kylmaaineMaaraYhteensa');
    if (hasPrintableValue(total)) rows.push(row('Yhteensä', `${total} kg`, '#FF6D00'));
  }

  const co2 = strField(data, 'kylmaaineCO2Ekv');
  if (hasPrintableValue(co2)) rows.push(row('CO₂-ekvivalentti', `${co2} t`, '#FF6D00'));

  if (!rows.length) return '';
  return box('KYLMÄAINE', '#FF6D00', rows.join(''));
}

function renderTiiveyskoe(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  if (!data.selectedModules.tiiveyskoe) return '';
  const tv = data.tiiveyskoeData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(tv.koeAlkaaPvm, tv.koeAlkaaKlo, huoltoPvm);
  const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, tv.kestoMin) : '';
  const tulos =
    tv.tulos === 'hyvaksytty' ? 'Hyväksytty' : tv.tulos === 'hylatty' ? 'Hylätty' : '';

  const inner = [
    row('Koepaine (bar)', tv.testipaineBar, '#00695C'),
    alku ? row('Koe alkoi', alku, '#00695C') : '',
    row('Kesto (min)', tv.kestoMin, '#00695C'),
    loppu ? row('Koe päättyi', loppu, '#00695C') : '',
    row('Testauslämpötila (°C)', tv.testauslampotila, '#00695C'),
    tulos ? row('Tulos', tulos, '#00695C') : '',
    row('Menetelmä', tv.menetelma, '#00695C'),
    hasPrintableValue(tv.huom) ? `<div style="white-space:pre-wrap;padding:2px 0;">Huom: ${esc(tv.huom)}</div>` : '',
    renderPhotoCommentList(tv.todisteKuvat, '#00695C', imageUrls),
  ]
    .filter(Boolean)
    .join('');

  return inner ? box('TIIVEYSKOE', '#00695C', inner) : '';
}

function renderTyhjiointi(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  if (!data.selectedModules.tyhjiointi) return '';
  const ty = data.tyhjiointiData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(ty.koeAlkaaPvm, ty.koeAlkaaKlo, huoltoPvm);
  const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, ty.kestoMin) : '';
  const loppupaine = formatTyhjiointiLoppupaine(ty.loppupaineArvo, ty.loppupaineYksikko);
  const tulos =
    ty.tulos === 'hyvaksytty' ? 'Hyväksytty' : ty.tulos === 'hylatty' ? 'Hylätty' : '';

  const inner = [
    hasPrintableValue(loppupaine) ? row('Loppupaine', loppupaine, '#0277BD') : '',
    alku ? row('Koe alkoi', alku, '#0277BD') : '',
    row('Kesto (min)', ty.kestoMin, '#0277BD'),
    loppu ? row('Koe päättyi', loppu, '#0277BD') : '',
    tulos ? row('Tulos', tulos, '#0277BD') : '',
    row('Painemittari', ty.kaytettyPainemittari, '#0277BD'),
    hasPrintableValue(ty.huom) ? `<div style="white-space:pre-wrap;padding:2px 0;">Huom: ${esc(ty.huom)}</div>` : '',
    renderPhotoCommentList(ty.todisteKuvat, '#0277BD', imageUrls),
  ]
    .filter(Boolean)
    .join('');

  return inner ? box('TYHJIÖINTI', '#0277BD', inner) : '';
}

function resolvePhotoHref(
  item: MaintenanceReportPhotoItem | string | HuomiotImageAttachment,
  imageUrls?: Record<string, string>,
): string {
  return resolveMaintenancePrintPhotoHref(item, imageUrls);
}

function renderEvidencePhotos(
  items: unknown,
  title: string,
  borderColor: string,
  imageUrls?: Record<string, string>,
): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const figs = items
    .map((item, i) => {
      const href = resolvePhotoHref(item as MaintenanceReportPhotoItem, imageUrls);
      if (!href) return '';
      const comment =
        item && typeof item === 'object'
          ? String((item as { comment?: string }).comment ?? '').trim()
          : '';
      return `<figure><img src="${escAttr(href)}" alt="" style="border:.5px solid ${borderColor};" /><figcaption>${esc(title)} ${i + 1}${comment ? ` — ${esc(comment)}` : ''}</figcaption></figure>`;
    })
    .filter(Boolean)
    .join('');
  return figs ? `<div class="photos">${figs}</div>` : '';
}

function renderPhotoCommentList(
  items: MaintenanceReportPhotoItem[] | undefined,
  color: string,
  imageUrls?: Record<string, string>,
): string {
  const photos = renderEvidencePhotos(items, 'Kuvatodiste', color, imageUrls);
  const commentOnly = (items ?? [])
    .filter((item) => {
      const comment = String(item.comment ?? '').trim();
      return comment && !resolvePhotoHref(item, imageUrls);
    })
    .map((item) => `<li style="margin:2px 0;">${esc(item.comment)}</li>`)
    .join('');
  const list = commentOnly
    ? `<div style="margin-top:6px;"><strong style="color:${color};">Kuvakommentit:</strong><ul style="margin:4px 0 0 18px;padding:0;">${commentOnly}</ul></div>`
    : '';
  return `${photos}${list}`;
}

function renderHuomiot(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  const huom = String(data.huomiot || '').trim();
  const luonne = field(data, 'huomiotLuonne');
  const kuvat = renderEvidencePhotos(data.huomiotLiitteet, 'Liite', '#7B1FA2', imageUrls);
  if (!huom && !kuvat) return '';

  const style =
    luonne === 'vika'
      ? 'white-space:pre-wrap;font-size:11pt;margin:0;color:#b91c1c;font-weight:700;'
      : 'white-space:pre-wrap;font-size:11pt;margin:0;';

  const body = [
    huom ? `<div style="${style}">${formatHuomioPrintHtml(huom, esc)}</div>` : '',
    kuvat,
  ]
    .filter(Boolean)
    .join('');

  return box('HUOMIOT JA LISÄTIEDOT', '#7B1FA2', body);
}


function renderCircuitWarningsBanner(data: HuoltoReportData): string {
  if (isKonvektoritDevice(data.laiteTyyppi) || hideMaintenancePrintWarnings(data)) return '';
  const warnings = buildRefrigerantCircuitWarnings(data);
  if (!warnings.length) return '';
  const list = warnings.map((w) => `<li style="margin-bottom:4px;">${esc(w)}</li>`).join('');
  return `<div class="box-content" style="border-color:#d32f2f;margin-top:10px;page-break-inside:avoid;">
    <div style="border-bottom:2px solid #d32f2f;padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:14px;color:#d32f2f;">HUOMIOITAVAA — KYLMÄAINEPIIRI</strong>
    </div>
    <ul style="margin:0;padding-left:16px;font-size:11px;color:#c62828;">${list}</ul>
  </div>`;
}


/** Generate printable HTML fragment for a maintenance report. */
export function generateMaintenanceReportHtml(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const imageUrls = meta.imageUrls;
  const docKind = data.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto';
  const docTitle = docKind === 'kayttoonotto' ? 'Käyttöönottopöytäkirja' : 'Huoltopöytäkirja';
  const printDate = data.huoltoPaivamaara || new Date().toLocaleDateString('fi-FI');
  const kohteenTunniste = isKonvektoritDevice(data.laiteTyyppi)
    ? konvektoriPrintSubtitle(data)
    : data.laiteTunnus;


  if (data.laiteTyyppi === 'lämpöpumppu') {
    const c = data.legacyCompanyInfo as Record<string, unknown> | undefined;
    return generateIlpPrintHtml(data, {
      companyName: String(c?.name ?? meta.companyName ?? '').trim(),
      companyLines: [c?.businessId ? `Y-tunnus ${String(c.businessId)}` : '', String(c?.phone ?? ''), String(c?.email ?? '')]
        .map((v) => v.trim())
        .filter(Boolean),
      logoUrl: meta.logoUrl,
      imageUrls,
      docTitle,
      fault: Boolean(data.huoltoLaiteessaVika) || lampopumppuHasDeviceFault(data),
    });
  }

  const legacyCompany = data.legacyCompanyInfo as Record<string, unknown> | undefined;
  const companyLine = [
    String(legacyCompany?.name ?? meta.companyName ?? '').trim(),
    legacyCompany?.businessId ? `Y-tunnus ${String(legacyCompany.businessId)}` : '',
    String(legacyCompany?.phone ?? '').trim(),
    String(legacyCompany?.email ?? '').trim(),
  ].filter(Boolean).join(' · ');

  const customerBox = box(
    'ASIAKASTIEDOT',
    '#1976D2',
    [
      row('', data.asiakas, '#1976D2'),
      row('', data.osoite, '#1976D2'),
      row('Y-tunnus', data.asiakasYtunnus, '#1976D2'),
      row('Yhteyshenkilö', data.asiakasYhteyshenkilo, '#1976D2'),
      row('Puhelin', data.asiakasPuhelin, '#1976D2'),
      row('Sähköposti', data.asiakasEmail, '#1976D2'),
    ]
      .filter(Boolean)
      .join(''),
  );

  const deviceBox = isKonvektoritDevice(data.laiteTyyppi)
    ? ''
    : box(
      'LAITETIEDOT',
      '#388E3C',
      [
        row('Tyyppi', data.laiteTyyppi, '#388E3C'),
        row('Valmistaja', data.laiteValmistaja, '#388E3C'),
        row('Malli', data.laiteMalli, '#388E3C'),
        row('Tunnus', data.laiteTunnus, '#388E3C'),
        row('Sijainti', data.laiteSijainti, '#388E3C'),
        row('Sarjanumero', data.laiteSarjanumero, '#388E3C'),
        row('Käyttötarkoitus', data.laiteKayttotarkoitus, '#388E3C'),
      ]
        .filter(Boolean)
        .join(''),
    );

  const refrigerantBox =
    !isKonvektoritDevice(data.laiteTyyppi) &&
    (data.selectedModules.kylmaainePiiri || data.kylmaaineTyyppi)
      ? renderRefrigerantCharge(data)
      : '';

  let circuitsHtml = renderCircuitsHtml(data);

  const vuotoStatus = usesRefrigerantServiceExtras(data.laiteTyyppi)
    ? renderVuototarkastusStatus(data.huoltoKylmaaineVuotoTarkastus)
    : '';

  const fault = Boolean(data.huoltoLaiteessaVika) || lampopumppuHasDeviceFault(data);
  const band = renderVerdictBand([
    verdictHtml(fault, data.huoltoLaiteessaVika === false || Boolean(data.huoltoSuoritettu)),
    data.huoltoSuoritettu ? '<span>Huolto suoritettu</span>' : '',
    vuotoStatus ? '<span class="st st-ok">✓ Vuototarkastus, ei vuotoja</span>' : '',
    `<span class="muted">${esc(printDate)}</span>`,
    hasPrintableValue(data.huoltoSuorittajaNimi) ? `<span class="muted">${esc(data.huoltoSuorittajaNimi)}</span>` : '',
  ]);
  const unwrap = (html: string) => html.replace(/^\s*<section class="sec"><div class="sec-body"><div class="keep"><h2>[^<]*<\/h2>/, '<div>').replace(/<\/div><\/section>\s*$/, '');
  const info = renderInfoColumns([
    { title: 'Asiakas', html: unwrap(customerBox) },
    { title: isKonvektoritDevice(data.laiteTyyppi) ? 'Kohde' : 'Laite', html: isKonvektoritDevice(data.laiteTyyppi)
      ? [row('Verkosto', data.laiteKayttotarkoitus), row('Alue', data.laiteSijainti), row('Tunnus', data.laiteTunnus)].join('')
      : unwrap(deviceBox) },
    { title: 'Kylmäaine', html: refrigerantBox ? unwrap(refrigerantBox) : '' },
  ]);

  return `<style>${PRINT_SHELL_CSS}</style>
<div class="rp">
  ${renderPrintHeader({ logoUrl: meta.logoUrl, companyLine, title: docTitle, subtitle: [deviceTypeLabel(data.laiteTyyppi), kohteenTunniste].filter(Boolean).join(' · ') })}
  ${band}
  ${info}
  <div class="legacy">
  ${renderLampopumppuSections(data)}
  ${circuitsHtml}
  ${renderCircuitWarningsBanner(data)}
  ${renderEvaporators(data)}
  ${renderCondensers(data)}
  ${renderLauhdutuspiiri(data)}
  ${renderNestelauhduttimet(data)}
  ${renderJaahdytysvesi(data)}
  ${renderVapaajahdytys(data)}
  ${renderChillerEnergy(data)}
  ${generateMlpFullPrintHtml(data)}
  ${renderKonvektoritTable(data)}
  ${usesRefrigerantServiceExtras(data.laiteTyyppi) ? renderTiiveyskoe(data, imageUrls) : ''}
  ${usesRefrigerantServiceExtras(data.laiteTyyppi) ? renderTyhjiointi(data, imageUrls) : ''}
  ${renderCustomModulesPrintHtml(data.customModules)}
  ${renderHuomiot(data, imageUrls)}
  </div>
  ${renderSignatureRow({ name: String(data.huoltoSuorittajaNimi || ''), tukes: String(data.huoltoSuorittajaTUKES || ''), date: printDate })}
</div>`;
}
