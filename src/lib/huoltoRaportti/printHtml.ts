import { evaporatorWithLegacyOhjaus, fieldModuleDisplayValue, fieldModuleFieldVisible } from './fieldModules';
import { koneikkoCustomComponents, koneikkoLegacyReadOnly, koneikkoView, usesKoneikkoComponents } from './koneikkoComponents';
import { refrigerantCircuitComponentLabel } from './refrigerantCircuitComponents';
import { airCapacity, evaporatorRoomTemp, formatKw, staticEvaporatorEstimate, staticInput } from './airCapacity';
import { kokoonpanoLauhdutinLabel, kokoonpanoSummary, vjHeatingTitle } from './deviceKokoonpano';
import { fieldModuleValues, visibleFieldModules } from './fieldModules';
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
  printBrandStyle,
  renderInfoColumns,
  renderPrintFooter,
  renderPrintHeader,
  renderSignatureRow,
  renderVerdictBand,
  verdictHtml,
} from './printShell';
import { blk, chk, cmp, kvr, pair, warn } from './printKit';
import { fiDate, fiNumber, normalizePrintHtml } from './printFormat';

function deviceTypeLabel(t: string): string {
  return (deviceTypes as ReadonlyArray<{ value: string; label: string }>).find((d) => d.value === t)?.label ?? t;
}
import { generateMlpFullPrintHtml } from './printMlpFull';
import { renderCompressorCurrentHtml, renderFanPhaseCardHtml } from './printPhaseHelpers';
import {
  calculateSubcoolingFromMeasurements,
  calculateSuperheatFromMeasurements,
  getRefrigerantGWP,
  renderVuototarkastusStatus,
} from './utils';
import { inspectionChipHtml, renderInspectionHuomioRow } from './inspectionPrint';
import {
  compressorInspectionStatus,
  condenserInspectionStatus,
  entityInspectionStatus,
  lauhdutuspiiriInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  ulkoyksikkoInspectionStatus,
  vapaajahdytysInspectionStatus,
} from './huoltoInspectionStatus';
import { hasPrintableValue, normalizePrintText } from './printFieldVisibility';
import { sisayksikkoTarkastusSummary } from './sisayksikkoTarkastus';

export interface MaintenancePrintMeta {
  companyName: string;
  logoUrl?: string;
  /** Yrityksen väri (hex) otsikkokaistalle; oletus tummansininen. */
  brandColor?: string;
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

/** Pääosio: yhtenäinen otsikko, sisältö lohkoina. */
function box(title: string, inner: string, statusHtml = ''): string {
  if (!inner.trim()) return '';
  const head = statusHtml ? `<h2 class="h2-st"><span>${esc(title)}</span>${statusHtml}</h2>` : `<h2>${esc(title)}</h2>`;
  if (/^\s*<div class="cmp"/.test(inner)) {
    return `<section class="sec"><div class="sec-body">${head}${inner}</div></section>`;
  }
  return `<section class="sec"><div class="sec-body">${keepHeadingWithFirst(head, inner)}</div></section>`;
}

/** Rivit kaksisarakkeiseen avain–arvo-ruudukkoon. */
function kvGrid(inner: string): string {
  return inner.trim() ? `<div class="kv2">${inner}</div>` : '';
}

const row = kvr;

function renderFieldModules(data: HuoltoReportData): string {
  return visibleFieldModules(data)
    .map((def) => {
      const values = fieldModuleValues(data, def.id);
      const groups = new Map<string, string[]>();
      for (const f of def.fields.filter((x) => fieldModuleFieldVisible(x, values, data))) {
        const v = fieldModuleDisplayValue(f, values);
        if (!v) continue;
        const key = String((f as { section?: string }).section ?? '');
        const list = groups.get(key) ?? [];
        list.push(f.type === 'textarea' ? `<div class="note">${esc(f.label)}: ${esc(v)}</div>` : row(f.label, v));
        groups.set(key, list);
      }
      const inner = [...groups.entries()]
        .map(([title, items]) => (title ? blk(title, items) : kvGrid(items.join(''))))
        .join('');
      return box(def.title, inner);
    })
    .join('');
}

const OHJAUS_TYYPPI_LABEL: Record<string, string> = {
  saadin: 'Elektroninen säädin',
  termostaatti: 'Termostaatti',
  kiinteisto: 'Kiinteistöautomaatio',
};

function getSulatusText(sulatus: string): string {
  if (sulatus === 'ilma') return 'Ilmasulatus';
  if (sulatus === 'sahko') return 'Sähkösulatus';
  return 'Kuumakaasusulatus';
}

function getLauhdutinTypeText(tyyppi: string): string {
  return lauhdutinTypeLabel(tyyppi);
}

function getOhjausText(ohjaus: string, muu?: string): string {
  const map: Record<string, string> = {
    nopeussäädin: 'Nopeussäädin',
    taajusmuuntaja: 'Taajuusmuuntaja',
    kp_pressostaatti: 'KP-pressostaatti',
    kompressorin_yhtaaikaa: 'Kompressorin kanssa yhtä aikaa',
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

function inspectionHeader(status: unknown): string {
  return inspectionChipHtml(status, esc);
}

function renderChillerEnergy(data: HuoltoReportData): string {
  if (!isChillerLikeDevice(data.laiteTyyppi)) return '';
  const m = data.mlpData;
  if (!m) return '';

  const { qCoolKw, pInKw, qCondKw, cop } = computeChillerEnergyFromMlp(m, data.kylmaainePiiri1);
  if (qCoolKw == null && pInKw == null && !hasPrintableValue(m.keruupiiriVirtaus)) return '';
  const kw = (v: number | null | undefined) => (v != null ? `${fiNumber(v.toFixed(2))}\u00a0kW` : '');

  return box(
    'Energiatehokkuus',
    cmp(
      'Jäähdytyksen COP',
      '',
      blk('Mittaukset', [
        row('COP (jäähdytysteho / sähköteho)', cop != null && cop > 0 ? fiNumber(cop.toFixed(2)) : '', undefined, 'wide'),
        pair(['Jäähdytysteho Q_cool', kw(qCoolKw)], ['Sähköteho P_in', kw(pInKw)]),
        row('Lauhdutusteho Q_cond', kw(qCondKw)),
      ]),
    ),
  );
}

function renderCompressorBlock(comp: Partial<CompressorData>, index: number): string {
  const info = blk('Tiedot', [
    row('Valmistaja', comp.valmistaja),
    row('Malli', comp.malli),
    row('Ohjaustapa', comp.ohjaustapa),
    row('Kontaktori', comp.kontaktoriTyyppi),
    row('Pehmokäynnistin', comp.pehmokaynnistinTyyppi),
    row('Taajuusmuuttaja', comp.taajuusmuuttajaTyyppi),
  ]);
  const checks = blk('Tarkastukset', [chk('Öljymäärä oikea', comp.oljyMaaraOikea), chk('Öljy kirkas', comp.oljyKirkas)]);
  const meas = blk('Mittaukset', [renderCompressorCurrentHtml(comp)]);
  const status = comp.tarkastusTila ?? compressorInspectionStatus(comp);
  const huomio = renderInspectionHuomioRow(comp.tarkastusHuomio, esc);
  return cmp(`Kompressori ${index}`, inspectionHeader(status), `${info}${meas}${checks}${huomio}`);
}

function renderCircuitHtml(
  circuitNum: number,
  kp: RefrigerantCircuitData | null | undefined,
  refrigerant: string,
  laiteTyyppi: string,
  extraHtml = '',
): string {
  if (!kp || !kp.onKaytossa) return '';
  const printSuperheat = circuitSuperheatPrintEnabled(kp);
  const printSubcooling = circuitSubcoolingPrintEnabled(kp);
  const sh = printSuperheat
    ? calculateSuperheatFromMeasurements(parseFloat(kp.imupaine) || 0, parseFloat(kp.imuLampotila) || 0, refrigerant)?.toFixed(1) ?? ''
    : '';
  const sc = printSubcooling
    ? calculateSubcoolingFromMeasurements(parseFloat(kp.korkeapaine) || 0, parseFloat(kp.nestePutkiLampotila) || 0, refrigerant)?.toFixed(1) ?? ''
    : '';

  const mittaukset = blk('Mittaukset', [
    pair(['Imupaine', kp.imupaine, 'bar'], ['Imulämpötila', kp.imuLampotila, '°C']),
    pair(['Korkeapaine', kp.korkeapaine, 'bar'], ['Nesteputken lämpötila', kp.nestePutkiLampotila, '°C']),
    pair(['Kuumakaasun lämpötila', kp.kuumakaasuLampotila, '°C'], ['', '']),
    printSuperheat || printSubcooling
      ? pair(printSuperheat ? ['Tulistus', sh || '–', 'K'] : ['', ''], printSubcooling ? ['Alijäähdytys', sc || '–', 'K'] : ['', ''])
      : '',
  ]);

  const compCount = parseInt(kp.kompressorienMaara || '1', 10) || 1;
  let compressors = '';
  for (let i = 1; i <= compCount; i++) {
    const comp = kp[`kompressori${i}` as keyof RefrigerantCircuitData] as CompressorData | undefined;
    if (comp) compressors += renderCompressorBlock(comp, i);
  }

  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, kp.paisuntaventtiiliTyyppi);
  const pvLabel =
    expansionValveTypes.find((t) => t.value === kp.paisuntaventtiiliTyyppi)?.label ?? kp.paisuntaventtiiliTyyppi;
  const kv = usesKoneikkoComponents(laiteTyyppi) ? koneikkoView(kp) : null;
  const tiedot = kv
    ? blk('Tiedot', [
        row('Ohjaustapa', kp.ohjaustapa),
        kv.nestelasiOn
          ? row('Nestelasi', [kv.nestelasiKuplat === 'kupliton' ? 'Kupliton' : kv.nestelasiKuplat === 'kuplii' ? 'Kuplii' : '', kv.nestelasiKosteus ? `kosteus ${kv.nestelasiKosteus}` : ''].filter(Boolean).join(', ') || 'Asennettu')
          : '',
        kv.kuivainOn ? row('Kuivain', [kv.kuivainMalli, kv.kuivainVaihdettu ? 'vaihdettu' : ''].filter(Boolean).join(', ') || 'Asennettu') : '',
        kv.imusuodatinOn ? row('Imusuodatin', kv.imusuodatinVaihdettu ? 'Vaihdettu' : 'Asennettu') : '',
        kv.tarinaOn ? row('Tärinänvaimennus', 'Asennettu') : '',
        ...koneikkoCustomComponents(kp).map((c) => row('Muu komponentti', c.customName)),
        ...koneikkoLegacyReadOnly(kp).map((c) =>
          row(refrigerantCircuitComponentLabel(c), [c.valmistaja, c.malli, c.kommentti].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ') || 'Kirjattu'),
        ),
      ])
    : blk('Tiedot', [
        row('Ohjaustapa', kp.ohjaustapa),
        row('Paisuntaventtiili', pvLabel),
        row('Paisuntaventtiilin valmistaja', kp.paisuntaventtiiliValmistaja),
        row('Paisuntaventtiilin malli', kp.paisuntaventtiiliMalli),
        row('Kuivaimen valmistaja', kp.kuivainValmistaja),
        row('Kuivaimen malli', kp.kuivainMalli),
      ]);
  const tarkastukset = kv
    ? ''
    : blk('Tarkastukset', [
        ...(showMagnetValve ? [chk('Magneettiventtiili testattu', kp.magneettiventtiiliTestattu)] : []),
        chk('Nestelasi kuiva', kp.nestelasiKuiva),
        chk('Kuivain OK', kp.kuivainOK),
      ]);

  return box(`Kylmäainepiiri ${circuitNum}`, `${tiedot}${mittaukset}${tarkastukset}${compressors}${extraHtml}`);
}

function evapCapacityRow(ev: EvaporatorData): string {
  if (ev.tyyppi === 'staatinen') {
    const r = staticEvaporatorEstimate(staticInput(ev));
    return r
      ? row(
          'Teho (arvio)',
          `${formatKw(r.kw)} (${!String(ev.kennoLampotila ?? '').trim() ? 'kenno = höyrystyminen, ' : ''}A ${fiNumber(r.areaM2.toFixed(1))} m², U ${r.uWm2K} W/m²K, ΔT ${fiNumber(r.dtK.toFixed(1))} K)`,
        )
      : '';
  }
  const r = airCapacity({ tIn: ev.ilmaTuloLampotila || ev.lampotilaMitattu, rhIn: ev.ilmaTuloRh, tOut: ev.ilmaPoistoLampotila, rhOut: ev.ilmaPoistoRh, airflowM3h: ev.ilmavirtaM3h, direction: 'cooling' });
  return r ? row('Teho', `${formatKw(r.totalKw)} (tuntuva ${formatKw(r.sensibleKw)}, latentti ${formatKw(r.latentKw)})`) : '';
}

function renderSingleEvaporatorHtml(
  ev: EvaporatorData,
  index: number,
  deviceType: string,
  sharedAcrossCircuits?: boolean,
  nested = false,
): string {
  const title =
    deviceType === 'kylmäkoneikko'
      ? `Höyrystin ${index + 1}`
      : sharedAcrossCircuits
        ? 'Höyrystin (yhteinen)'
        : `Höyrystin, piiri ${index + 1}`;
  const chillerHx = isChillerLikeDevice(deviceType) && isHeatExchangerEvaporatorType(ev.tyyppi);
  const showDefrost = evaporatorShowsFansAndDefrost(ev.tyyppi);
  const staattinen = ev.tyyppi === 'staatinen';
  const kenno = ev.kennoPituusMm && ev.kennoKorkeusMm && ev.kennoSyvyysMm ? `${ev.kennoPituusMm} × ${ev.kennoKorkeusMm} × ${ev.kennoSyvyysMm} mm` : '';

  const tiedot = blk('Tiedot', [
    row(chillerHx ? 'Lämmönvaihdin' : 'Tyyppi', evapTyyppiLabel(ev.tyyppi)),
    !chillerHx ? row('Huoneen tunnus', ev.huoneenTunnus) : '',
    showDefrost ? row('Sulatus', getSulatusText(ev.sulatus)) : '',
    row('Valmistaja', ev.valmistaja),
    row('Malli', ev.malli),
    row('Sarjanumero', ev.sarjanumero),
    row('Kennon koko (P × K × S)', kenno),
    row('Ripaväli', ev.ripavaliMm, 'mm'),
    row('Putkirivit', ev.putkirivit, 'kpl'),
    ev.magneettiventtiiliKaytossa !== false ? row('Magneettiventtiili', ev.magneettiventtiiliMalli) : '',
    ev.paisuntaventtiiliKaytossa !== false ? row('Paisuntaventtiili', [ev.paisuntaventtiiliTyyppi, ev.paisuntaventtiiliMalli].filter(Boolean).join(' ')) : '',
  ]);

  const mittaukset = blk('Mittaukset', [
    pair(['Ilma ennen', staattinen ? '' : ev.ilmaTuloLampotila || ev.lampotilaMitattu, '°C'], ['Ilma jälkeen', ev.ilmaPoistoLampotila, '°C']),
    pair(['Kosteus ennen', ev.ilmaTuloRh, '%'], ['Kosteus jälkeen', ev.ilmaPoistoRh, '%']),
    pair(['Ilmavirta', ev.ilmavirtaM3h, 'm³/h'], ['Huoneen lämpötila', staattinen ? evaporatorRoomTemp(ev) : ev.kylmioLampotila, '°C']),
    pair(['Kennon lämpötila', ev.kennoLampotila, '°C'], ['Höyrystyminen', ev.hoyrystymisLampotila, '°C']),
    ev.paisuntaventtiiliKaytossa !== false ? pair(['Tulistus', ev.tulistus, 'K'], ['', '']) : '',
    evapCapacityRow(ev),
  ]);

  const sulatus = showDefrost
    ? ev.sulatus === 'sahko'
      ? blk('Sulatus', [
          pair(['Sulatuskertoja', ev.sulatusKertojaPäivässä, '/ vrk'], ['Sulatusaika', ev.sulatusAika, 'min']),
          pair(['Sulatusohjaus', ev.sulatusOhjaus], ['Sähköjännite', ev.sahkoJannite, 'V']),
          ev.sahkoVirtaMitattu
            ? pair(['Sulatusvirta L1', ev.sahkoVirtaL1, 'A'], ['Sulatusvirta L2', ev.sahkoVirtaL2, 'A']) +
              pair(['Sulatusvirta L3', ev.sahkoVirtaL3, 'A'], ['', ''])
            : '',
        ])
      : blk('Sulatus', [
          pair(['Sulatusohjaus', ev.sulatusOhjaus], ['Sulatuskello', ev.sulatusKelloMalli]),
          pair(['Sulatusaika', ev.sulatusAika, 'min'], ['', '']),
        ])
    : '';

  const ohjaus =
    ev.ohjausKaytossa !== false
      ? blk('Ohjaus', [
          row('Ohjain', [OHJAUS_TYYPPI_LABEL[String(ev.ohjausTyyppi ?? '')] ?? ev.ohjausTyyppi, ev.ohjausMalli || ev.sulatusSäädinMalli].filter(Boolean).join(', ')),
          pair(['Lämpötila-asetus', ev.lampotilaAsetus, '°C'], ['Ovikytkin / munakello', ev.ovikytkin]),
          pair(['Ylähälytysraja', ev.halytysYla, '°C'], ['Alahälytysraja', ev.halytysAla, '°C']),
          pair(['Sulatusväli', ev.sulatusVali, 'h'], ['', '']),
        ])
      : '';

  const tarkastukset = blk('Tarkastukset', [
    chk('Lamellit puhtaat', ev.lamellitPuhtaat),
    chk('Sulatusvesi poistuu', ev.sulatusvesiPoistuu),
    chk('Ei jäätymistä', ev.jaatyminenOk),
    ev.magneettiventtiiliKaytossa !== false ? chk('Magneettiventtiili testattu', ev.magneettiventtiiliTestattu) : '',
  ]);

  const fans =
    showDefrost && Array.isArray(ev.puhaltimet)
      ? blk('Puhaltimet', ev.puhaltimet.map((fan, fi) => renderEvaporatorFanBlock(fan, fi + 1)))
      : '';

  const huomio = renderInspectionHuomioRow(ev.tarkastusHuomio, esc);
  const body = `${tiedot}${mittaukset}${sulatus}${ohjaus}${fans}${tarkastukset}${huomio}`;
  const st = inspectionHeader(ev.tarkastusTila ?? entityInspectionStatus(ev));
  return nested ? cmp(title, st, body) : box(title, body, st);
}

function renderEvaporators(data: HuoltoReportData): string {
  if (!data.selectedModules.hoyrystin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  if (isChillerLikeDevice(data.laiteTyyppi)) return '';
  return data.evaporatorData
    .map((ev, i) => renderSingleEvaporatorHtml(evaporatorWithLegacyOhjaus(ev, data, i), i, data.laiteTyyppi))
    .join('');
}

function renderCircuitsHtml(data: HuoltoReportData): string {
  if (isKonvektoritDevice(data.laiteTyyppi)) return '';
  if (!data.selectedModules.kylmaainePiiri || data.kylmaainePiireja === '0') return '';

  const inlineEvaporators =
    isChillerLikeDevice(data.laiteTyyppi) &&
    !isWaterCooledChiller(data.laiteTyyppi) &&
    (data.selectedModules.hoyrystin || data.laiteTyyppi === 'pakastin' || data.laiteTyyppi === 'kylmäkoneikko');
  const sharedEvaporator = isSharedEvaporatorAcrossCircuits(data.laiteTyyppi, data.hoyrystinYhteinenPiireissa);

  let html = '';
  const circuit = (n: number, kp: RefrigerantCircuitData | null | undefined, ev: EvaporatorData | undefined, shared: boolean, withLegacy: boolean) => {
    const evHtml =
      inlineEvaporators && ev
        ? renderSingleEvaporatorHtml(withLegacy ? evaporatorWithLegacyOhjaus(ev, data, n - 1) : ev, n - 1, data.laiteTyyppi, shared, true)
        : '';
    html += renderCircuitHtml(n, kp, data.kylmaaineTyyppi, data.laiteTyyppi, evHtml);
  };
  circuit(1, data.kylmaainePiiri1, data.evaporatorData[0], sharedEvaporator, true);
  if (data.kylmaainePiireja !== '1' && data.kylmaainePiiri2) {
    circuit(2, data.kylmaainePiiri2, !sharedEvaporator ? data.evaporatorData[1] : undefined, false, false);
  }
  if ((data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4') && data.kylmaainePiiri3) {
    circuit(3, data.kylmaainePiiri3, !sharedEvaporator ? data.evaporatorData[2] : undefined, false, false);
  }
  return html;
}

function renderCondensers(data: HuoltoReportData): string {
  if (!data.selectedModules.lauhdutin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  return data.condenserData
    .map((co, i) => {
      const tiedot = blk('Tiedot', [
        row('Tyyppi', co.tyyppi ? getLauhdutinTypeText(co.tyyppi) : ''),
        row('Valmistaja', co.valmistaja),
        row('Malli', co.malli),
        row('Sarjanumero', co.sarjanumero),
        row('Puhaltimien määrä', co.puhaltimienMaara, 'kpl'),
        row('Puhaltimen ohjaus', co.puhallinOhjaus ? getOhjausText(co.puhallinOhjaus, co.puhallinOhjausMuu) : ''),
        row('Nopeussäädin', co.nopeussäädinMalli),
        row('Taajuusmuuntaja', co.taajusmuuntajaMalli),
        co.talvivarustus ? row('Talvivarustus', String(co.talvivarustusTapa ?? '').trim() || 'Kyllä') : '',
        row('Lauhdutuksen asetus', co.lauhdutusAsetus),
        row('Puhallin käynnistyy', co.puhallinKaynnistysAsetus),
        row('Puhallin pysähtyy', co.puhallinPysaytysAsetus),
      ]);
      const cap = airCapacity({ tIn: co.ilmaTuloLampotila, rhIn: co.ilmaTuloRh, tOut: co.ilmaPoistoLampotila, rhOut: co.ilmaPoistoRh, airflowM3h: co.ilmavirtaM3h, direction: 'heating', allowSensibleOnly: true });
      const mittaukset = blk('Mittaukset', [
        pair(['Ilma ennen', co.ilmaTuloLampotila, '°C'], ['Ilma jälkeen', co.ilmaPoistoLampotila, '°C']),
        pair(['Kosteus ennen', co.ilmaTuloRh, '%'], ['Kosteus jälkeen', co.ilmaPoistoRh, '%']),
        pair(['Lauhtumislämpötila', co.lauhtumisLampotila, '°C'], ['Alijäähtyminen', co.alijaahtyminen, 'K']),
        pair(['Ilmavirta', co.ilmavirtaM3h, 'm³/h'], ['Teho', cap ? `${formatKw(cap.totalKw)}${cap.sensibleOnly ? ' (vain tuntuva)' : ''}` : '']),
      ]);
      const fans = (co.puhaltimet ?? []).length
        ? blk('Puhaltimet', (co.puhaltimet ?? []).map((fan, fi) => renderCondenserFanBlock(fan, fi + 1, fan.jannite === '400' ? '400' : undefined)))
        : '';
      const tarkastukset = blk('Tarkastukset', [
        chk('Kenno puhdistettu', co.lauhdutinPuhdistettu),
        chk(LAUHDUTIN_PAINEVENTTIILI_LABEL, co.painesäätimenTarkistettu),
        chk('Virtaus riittävä', co.virtausRiittävä),
      ]);
      const huomio = renderInspectionHuomioRow(co.tarkastusHuomio, esc);
      return box(`Lauhdutin ${i + 1}`, `${tiedot}${mittaukset}${fans}${tarkastukset}${huomio}`, inspectionHeader(co.tarkastusTila ?? condenserInspectionStatus(co)));
    })
    .join('');
}

function renderNestepiiriFields(piiri: NestepiiriData | LauhdutuspiiriData | undefined): string {
  if (!piiri) return '';
  const isLauhdutus = 'painesäätimenTarkistettu' in piiri;
  const status = isLauhdutus ? lauhdutuspiiriInspectionStatus(piiri as LauhdutuspiiriData) : nestepiiriInspectionStatus(piiri);
  const lp = piiri as LauhdutuspiiriData;
  const body = [
    blk('Tiedot', [
      row('Neste', piiri.neste),
      piiri.pumppuTarkastettu ? row('Pumpun valmistaja', piiri.pumppuValmistaja) : '',
      piiri.pumppuTarkastettu ? row('Pumpun malli', piiri.pumppuMalli) : '',
      piiri.paisuntaAstiaTarkistettu ? row('Paisunta-astian koko', piiri.paisuntaAstiaKoko, 'l') : '',
      'painesäätimenTarkistettu' in lp && lp.painesäätimenTarkistettu ? row(LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL, lp.painesäätimenMalli) : '',
      'painesäätimenTarkistettu' in lp && lp.virtausRiittävä === false && lp.virtausOngelma ? row('Virtausongelma', lp.virtausOngelma) : '',
    ]),
    blk('Mittaukset', [
      pair(['Virtaus', piiri.virtaus, 'm³/h'], ['', '']),
      pair(['Menolämpötila', piiri.meno, '°C'], ['Paluulämpötila', piiri.tulo, '°C']),
      piiri.paisuntaAstiaTarkistettu ? pair(['Esipaine', piiri.paisuntaAstiaEsipaine, 'bar'], ['', '']) : '',
      piiri.paineTarkastettu ? pair(['Mitattu paine', piiri.paineBar, 'bar'], ['', '']) : '',
    ]),
    blk('Tarkastukset', [
      chk('Pumppu tarkastettu', piiri.pumppuTarkastettu),
      chk('Paisunta-astia tarkistettu', piiri.paisuntaAstiaTarkistettu),
      chk('Paine tarkastettu', piiri.paineTarkastettu),
      chk('Automaattinen ilmaus tarkistettu', piiri.automaattinenIlmausTarkistettu),
      chk('Mutapussi puhdistettu', piiri.mutapussiPuhdistettu),
      chk('Toimilaitteet OK', piiri.toimilaitteetOK),
      'painesäätimenTarkistettu' in lp ? chk(LAUHDUTIN_PAINEVENTTIILI_LABEL, lp.painesäätimenTarkistettu) : '',
      'painesäätimenTarkistettu' in lp ? chk('Virtaus riittävä', lp.virtausRiittävä !== false) : '',
    ]),
    renderInspectionHuomioRow(piiri.tarkastusHuomio, esc),
  ].join('');
  return body.trim() ? `${inspectionStatusLine(piiri.tarkastusTila ?? status)}${body}` : '';
}

/** Osion tarkastustila oikealle ylös osion sisällä (osion otsikko on box()). */
function inspectionStatusLine(status: unknown): string {
  const chip = inspectionHeader(status);
  return chip ? `<div class="kv2"><div class="kvr"><span>Tarkastus</span><span>${chip}</span></div></div>` : '';
}

function renderLiquidCircuitFields(piiri: VapaajahdytysData | undefined): string {
  if (!piiri) return '';
  const status = vapaajahdytysInspectionStatus(piiri);
  const body = [
    blk('Tiedot', [
      row('Neste', piiri.neste),
      piiri.pumppuTarkastettu ? row('Pumpun valmistaja', piiri.pumppuValmistaja) : '',
      piiri.pumppuTarkastettu ? row('Pumpun malli', piiri.pumppuMalli) : '',
      piiri.ohjaus === 'kone' ? row('Ohjaus', 'Kone') : piiri.ohjaus === 'taloautomaatio' ? row('Ohjaus', 'Taloautomaatio') : '',
    ]),
    blk('Mittaukset', [
      pair(['Virtaus', piiri.virtaus, 'm³/h'], ['', '']),
      pair(['Menolämpötila', piiri.meno, '°C'], ['Paluulämpötila', piiri.tulo, '°C']),
    ]),
    blk('Tarkastukset', [chk('Pumppu tarkastettu', piiri.pumppuTarkastettu)]),
    renderInspectionHuomioRow(piiri.tarkastusHuomio, esc),
  ].join('');
  return body.trim() ? `${inspectionStatusLine(piiri.tarkastusTila ?? status)}${body}` : '';
}

function renderVapaajahdytys(data: HuoltoReportData): string {
  if (!data.selectedModules.vapaajahdytys) return '';
  const inner = renderLiquidCircuitFields(data.vapaajahdytysData);
  return inner ? box('Vapaajäähdytys', inner) : '';
}

function renderJaahdytysvesi(data: HuoltoReportData): string {
  if (!data.selectedModules.vedenjajahdytyskone) return '';
  const inner = renderNestepiiriFields(data.jaahdytysvesiData);
  if (!inner) return '';
  const title =
    data.laiteTyyppi === 'vedenjäähdytyskone' || data.laiteTyyppi === 'vakioilmastointtikone'
      ? 'Jäähdytyspiiri'
      : 'Jäähdytysveden piiri';
  return box(vjHeatingTitle(title, data), inner);
}

function renderLauhdutuspiiri(data: HuoltoReportData): string {
  if (!data.selectedModules.lauhdutin || !hasExternalNestelauhdutin(data.lauhdutinTyyppiLaite)) return '';
  const inner = renderNestepiiriFields(data.lauhdutuspiiriData);
  if (!inner) return '';
  return box(vjHeatingTitle('Lauhdutuspiiri', data), inner);
}

function renderNestelauhduttimet(data: HuoltoReportData): string {
  const units = field(data, 'nestelauhduttimetVj');
  if (!data.selectedModules.nestelauhduttimet || !Array.isArray(units) || units.length === 0) return '';
  const cards = units
    .map((u: Record<string, unknown>, i: number) =>
      cmp(
        `Nestelauhdutin ${i + 1}`,
        '',
        blk('Tiedot', [
          row('Valmistaja', u.valmistaja),
          row('Malli', u.malli),
          row('Sarjanumero', u.sarjanumero),
          row('Puhaltimien määrä', u.puhaltimienMaara, 'kpl'),
        ]) + blk('Tarkastukset', [chk('Puhdistettu', u.lauhdutinPuhdistettu as boolean | undefined)]),
      ),
    )
    .join('');
  return box('Nestelauhduttimet', cards);
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

function renderRefrigerantCharge(data: HuoltoReportData): string {
  const gwp = data.kylmaaineTyyppi ? getRefrigerantGWP(data.kylmaaineTyyppi) : 0;
  const rows: string[] = [];
  const kg = (n: number | string) => `${fiNumber(typeof n === 'number' ? n.toFixed(2) : n)}\u00a0kg`;
  if (hasPrintableValue(data.kylmaaineTyyppi)) {
    rows.push(row('Kylmäaine', data.kylmaaineTyyppi));
    if (gwp > 0) rows.push(row('GWP', gwp));
  }

  const piireja = String(data.kylmaainePiireja ?? '').trim();
  const single = piireja === '1' || piireja === '';
  if (single) {
    const valm = parseFloat(strField(data, 'kylmaaineValmistajaMaara')) || 0;
    const lis = parseFloat(strField(data, 'kylmaaineLisattyMaara')) || 0;
    if (valm > 0) rows.push(row('Täyttömäärä (tehdas)', kg(valm)));
    if (lis > 0) rows.push(row('Lisätty huollossa', kg(lis)));
    if (valm + lis > 0) rows.push(row('Yhteensä', kg(valm + lis)));
    const putki = strField(data, 'kylmaainePutkimatka');
    if (putki) rows.push(row('Putkimatka', putki, 'm'));
  } else {
    for (const [label, key] of [
      ['Piiri 1', 'kylmaaineMaaraPiiri1'],
      ['Piiri 2', 'kylmaaineMaaraPiiri2'],
      ['Piiri 3', 'kylmaaineMaaraPiiri3'],
      ['Piiri 4', 'kylmaaineMaaraPiiri4'],
    ] as const) {
      const v = strField(data, key);
      if (hasPrintableValue(v)) rows.push(row(label, kg(v)));
    }
    const total = strField(data, 'kylmaaineMaaraYhteensa');
    if (hasPrintableValue(total)) rows.push(row('Yhteensä', kg(total)));
  }

  const co2 = strField(data, 'kylmaaineCO2Ekv');
  if (hasPrintableValue(co2)) rows.push(row('CO₂-ekvivalentti', co2, 't'));

  if (!rows.length) return '';
  return box('Kylmäaine', kvGrid(rows.join('')));
}

function koeAika(pvmIso: string, klo: string): string {
  return pvmIso && klo ? `${fiDate(pvmIso)} klo ${klo}` : '';
}

function renderTiiveyskoe(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  if (!data.selectedModules.tiiveyskoe) return '';
  const tv = data.tiiveyskoeData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(tv.koeAlkaaPvm, tv.koeAlkaaKlo, huoltoPvm);
  const alku = koeAika(res.pvmIso, res.klo);
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, tv.kestoMin) : '';
  const tulos = tv.tulos === 'hyvaksytty' ? 'Hyväksytty' : tv.tulos === 'hylatty' ? 'Hylätty' : '';

  const inner = [
    blk('Tiedot', [
      row('Menetelmä', tv.menetelma),
      pair(['Koe alkoi', alku], ['Koe päättyi', loppu]),
    ]),
    blk('Mittaukset', [
      pair(['Koepaine', tv.testipaineBar, 'bar'], ['Kesto', tv.kestoMin, 'min']),
      pair(['Testauslämpötila', tv.testauslampotila, '°C'], ['Tulos', tulos]),
    ]),
    hasPrintableValue(tv.huom) ? `<div class="note">Huom: ${esc(tv.huom)}</div>` : '',
    renderPhotoCommentList(tv.todisteKuvat, imageUrls),
  ].join('');
  return inner.replace(/<[^>]+>/g, '').trim() ? box('Tiiveyskoe', inner) : '';
}

function renderTyhjiointi(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  if (!data.selectedModules.tyhjiointi) return '';
  const ty = data.tyhjiointiData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(ty.koeAlkaaPvm, ty.koeAlkaaKlo, huoltoPvm);
  const alku = koeAika(res.pvmIso, res.klo);
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, ty.kestoMin) : '';
  const loppupaine = formatTyhjiointiLoppupaine(ty.loppupaineArvo, ty.loppupaineYksikko);
  const tulos = ty.tulos === 'hyvaksytty' ? 'Hyväksytty' : ty.tulos === 'hylatty' ? 'Hylätty' : '';

  const inner = [
    blk('Tiedot', [
      row('Painemittari', ty.kaytettyPainemittari),
      pair(['Koe alkoi', alku], ['Koe päättyi', loppu]),
    ]),
    blk('Mittaukset', [
      pair(['Loppupaine', hasPrintableValue(loppupaine) ? loppupaine : ''], ['Kesto', ty.kestoMin, 'min']),
      pair(['Tulos', tulos], ['', '']),
    ]),
    hasPrintableValue(ty.huom) ? `<div class="note">Huom: ${esc(ty.huom)}</div>` : '',
    renderPhotoCommentList(ty.todisteKuvat, imageUrls),
  ].join('');
  return inner.replace(/<[^>]+>/g, '').trim() ? box('Tyhjiöinti', inner) : '';
}

function resolvePhotoHref(
  item: MaintenanceReportPhotoItem | string | HuomiotImageAttachment,
  imageUrls?: Record<string, string>,
): string {
  return resolveMaintenancePrintPhotoHref(item, imageUrls);
}

function renderEvidencePhotos(items: unknown, title: string, imageUrls?: Record<string, string>): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const figs = items
    .map((item, i) => {
      const href = resolvePhotoHref(item as MaintenanceReportPhotoItem, imageUrls);
      if (!href) return '';
      const comment =
        item && typeof item === 'object' ? String((item as { comment?: string }).comment ?? '').trim() : '';
      return `<figure><img src="${escAttr(href)}" alt="" /><figcaption>${esc(title)} ${i + 1}${comment ? ` — ${esc(comment)}` : ''}</figcaption></figure>`;
    })
    .filter(Boolean)
    .join('');
  return figs ? `<div class="photos">${figs}</div>` : '';
}

function renderPhotoCommentList(items: MaintenanceReportPhotoItem[] | undefined, imageUrls?: Record<string, string>): string {
  const photos = renderEvidencePhotos(items, 'Kuvatodiste', imageUrls);
  const commentOnly = (items ?? [])
    .filter((item) => {
      const comment = String(item.comment ?? '').trim();
      return comment && !resolvePhotoHref(item, imageUrls);
    })
    .map((item) => `<div class="kvr full"><span>${esc(item.comment)}</span></div>`)
    .join('');
  const list = commentOnly ? `<div class="blk"><div class="sh">Kuvakommentit</div>${commentOnly}</div>` : '';
  return `${photos}${list}`;
}

function renderHuomiot(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  const huom = String(data.huomiot || '').trim();
  const luonne = field(data, 'huomiotLuonne');
  const kuvat = renderEvidencePhotos(data.huomiotLiitteet, 'Liite', imageUrls);
  if (!huom && !kuvat) return '';

  const body = [
    huom ? `<div class="note${luonne === 'vika' ? ' fault-text' : ''}">${formatHuomioPrintHtml(huom, esc)}</div>` : '',
    kuvat,
  ]
    .filter(Boolean)
    .join('');

  return box('Huomiot ja lisätiedot', body);
}

function renderCircuitWarningsBanner(data: HuoltoReportData): string {
  if (isKonvektoritDevice(data.laiteTyyppi) || hideMaintenancePrintWarnings(data)) return '';
  const warnings = buildRefrigerantCircuitWarnings(data, true);
  if (!warnings.length) return '';
  return box('Huomioitavaa, kylmäainepiiri', warnings.map((w) => warn(w, true)).join(''));
}

/** Generate printable HTML fragment for a maintenance report. */
export function generateMaintenanceReportHtml(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const imageUrls = meta.imageUrls;
  const docKind = data.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto';
  const docTitle = docKind === 'kayttoonotto' ? 'Käyttöönottopöytäkirja' : 'Huoltopöytäkirja';
  const printDate = fiDate(data.huoltoPaivamaara || '') || new Date().toLocaleDateString('fi-FI');
  const kohteenTunniste = isKonvektoritDevice(data.laiteTyyppi)
    ? konvektoriPrintSubtitle(data)
    : data.laiteTunnus;
  const legacyCompany = data.legacyCompanyInfo as Record<string, unknown> | undefined;
  const companyName = String(legacyCompany?.name ?? meta.companyName ?? '').trim();
  const footer = renderPrintFooter({
    name: String(data.huoltoSuorittajaNimi || '').trim(),
    tukes: String(data.huoltoSuorittajaTUKES || '').trim(),
    company: companyName,
    date: printDate,
  });
  const wrap = (html: string) => normalizePrintHtml(html);

  if (data.laiteTyyppi === 'lämpöpumppu') {
    return wrap(
      generateIlpPrintHtml(data, {
        companyName,
        companyLines: [legacyCompany?.businessId ? `Y-tunnus ${String(legacyCompany.businessId)}` : '', String(legacyCompany?.phone ?? ''), String(legacyCompany?.email ?? '')]
          .map((v) => v.trim())
          .filter(Boolean),
        logoUrl: meta.logoUrl,
        brandColor: meta.brandColor,
        imageUrls,
        docTitle,
        fault: Boolean(data.huoltoLaiteessaVika) || lampopumppuHasDeviceFault(data),
      }),
    );
  }

  const companyLine = [
    companyName,
    legacyCompany?.businessId ? `Y-tunnus ${String(legacyCompany.businessId)}` : '',
    String(legacyCompany?.phone ?? '').trim(),
    String(legacyCompany?.email ?? '').trim(),
  ].filter(Boolean).join(' · ');

  const konv = isKonvektoritDevice(data.laiteTyyppi);
  const customerHtml = [
    row('', data.asiakas),
    row('', data.osoite),
    row('Y-tunnus', data.asiakasYtunnus),
    row('Yhteyshenkilö', data.asiakasYhteyshenkilo),
    row('Puhelin', data.asiakasPuhelin),
    row('Sähköposti', data.asiakasEmail),
  ].join('');

  const deviceHtml = konv
    ? [row('Verkosto', data.laiteKayttotarkoitus), row('Alue', data.laiteSijainti), row('Tunnus', data.laiteTunnus)].join('')
    : [
        row('Tyyppi', deviceTypeLabel(data.laiteTyyppi)),
        row('Valmistaja', data.laiteValmistaja),
        row('Malli', data.laiteMalli),
        row('Tunnus', data.laiteTunnus),
        row('Sijainti', data.laiteSijainti),
        row('Sarjanumero', data.laiteSarjanumero),
        row('Käyttötarkoitus', data.laiteKayttotarkoitus),
        row('Kokoonpano', kokoonpanoSummary(data, kokoonpanoLauhdutinLabel(data))),
      ].join('');

  const refrigerantBox =
    !konv && (data.selectedModules.kylmaainePiiri || data.kylmaaineTyyppi) ? renderRefrigerantCharge(data) : '';

  const vuotoStatus = usesRefrigerantServiceExtras(data.laiteTyyppi)
    ? renderVuototarkastusStatus(data.huoltoKylmaaineVuotoTarkastus)
    : '';

  const fault = Boolean(data.huoltoLaiteessaVika) || lampopumppuHasDeviceFault(data);
  const band = renderVerdictBand([
    verdictHtml(fault, data.huoltoLaiteessaVika === false || Boolean(data.huoltoSuoritettu)),
    data.huoltoSuoritettu ? '<span class="pill">Huolto suoritettu</span>' : '',
    vuotoStatus ? '<span class="pill st-ok">✓ Vuototarkastus, ei vuotoja</span>' : '',
    `<span class="muted">${esc(printDate)}</span>`,
    hasPrintableValue(data.huoltoSuorittajaNimi) ? `<span class="muted">${esc(data.huoltoSuorittajaNimi)}</span>` : '',
  ]);
  const unwrap = (html: string) =>
    html
      .replace(/^\s*<section class="sec"><div class="sec-body"><div class="keep"><h2>[^<]*<\/h2>/, '<div>')
      .replace(/<\/div><\/section>\s*$/, '')
      .replace(/<div class="kv2">/, '<div>');
  const info = renderInfoColumns([
    { title: 'Asiakas', html: customerHtml },
    { title: konv ? 'Kohde' : 'Laite', html: deviceHtml },
    { title: 'Kylmäaine', html: refrigerantBox ? unwrap(refrigerantBox) : '' },
  ]);

  const body = `
  ${renderCircuitsHtml(data)}
  ${renderCircuitWarningsBanner(data)}
  ${renderEvaporators(data)}
  ${renderCondensers(data)}
  ${renderLauhdutuspiiri(data)}
  ${renderNestelauhduttimet(data)}
  ${renderJaahdytysvesi(data)}
  ${renderVapaajahdytys(data)}
  ${renderChillerEnergy(data)}
  <div class="legacy">${generateMlpFullPrintHtml(data)}</div>
  ${renderKonvektoritTable(data)}
  ${usesRefrigerantServiceExtras(data.laiteTyyppi) ? renderTiiveyskoe(data, imageUrls) : ''}
  ${usesRefrigerantServiceExtras(data.laiteTyyppi) ? renderTyhjiointi(data, imageUrls) : ''}
  ${renderFieldModules(data)}
  <div class="legacy">${renderCustomModulesPrintHtml(data.customModules)}</div>
  ${renderHuomiot(data, imageUrls)}`;

  return wrap(`<style>${PRINT_SHELL_CSS}</style>${printBrandStyle(meta.brandColor)}
<div class="rp">
  ${renderPrintHeader({ logoUrl: meta.logoUrl, companyLine, title: docTitle, subtitle: [deviceTypeLabel(data.laiteTyyppi), kohteenTunniste].filter(Boolean).join(' · ') })}
  ${band}
  ${info}
  ${body}
  ${renderSignatureRow({ name: String(data.huoltoSuorittajaNimi || ''), tukes: String(data.huoltoSuorittajaTUKES || ''), company: companyName, date: printDate })}
  ${footer}
</div>`);
}
