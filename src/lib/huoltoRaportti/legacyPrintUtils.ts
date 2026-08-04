// @ts-nocheck
// Print utility functions — ported from legacy huoltoraportti app for 1:1 print parity
import { withDemoPrintBootstrap } from './printBootstrap';
import type {
  CompressorData,
  EvaporatorData,
  CondenserData,
  HeatingCircuitData,
  HeatingElementData,
  MlpData,
  RefrigerantCircuitData,
  HuomiotImageAttachment,
  NestelauhdutinUnitData,
  PumpunSyottoValinta,
} from './types';
import type { MaintenancePrintPhoto } from '../maintenanceReportPrintImages';
import {
  getCompressorVaiheValinta,
  getCondenserFanVaiheValinta,
  getKokoLaiteSahkoVaiheValinta,
  getMlpPumpSyottoValinta,
} from './sahkoVaiheUtils';
import {
  circuitSubcoolingPrintEnabled,
  circuitSuperheatPrintEnabled,
} from './refrigerantCircuitPrint';
import {
  getSpecificHeatCapacity,
  renderCheckbox,
  calculateSuperheatFromMeasurements,
  calculateSubcoolingFromMeasurements,
  calculatePhaseImbalance,
  getRefrigerantGWP,
} from './utils';
import {
  laskeKokeLoppuaikaFi,
  formatTyhjiointiLoppupaine,
  resolveKoePaivamaaraJaKello,
} from './kokeAikaUtils';
import { buildMaintenanceReportPrintTitle, hideMaintenancePrintWarnings } from './defaults';
import { LAUHDUTIN_PAINEVENTTIILI_LABEL, LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL } from './constants';
import { generateKonvektoritGridPrintHtml, konvektoriVerkostoKoideFromReport } from './konvektoriPrint';
import { isKonvektoritDevice, usesRefrigerantServiceExtras } from './deviceModuleLogic';
import { generateSisayksikotGridPrintHtml } from './sisayksikkoPrint';
import { formatHuomioPrintHtml, RICH_COMMENT_PRINT_CSS } from './formatHuomioPrintHtml';
import { isMaintenancePrintPhotoImage } from '../maintenanceReportPrintImages';
import type { HuoltoReportData } from './types';

type LegacyCompanyInfo = {
  name?: string;
  businessId?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoBase64?: string;
};

/** Pumpun syöttö: vain jos 230_1/400_3 valittu; virrat vain täytetyt kentät */
function pumpSupplyHtmlBlock(
  syottoValinta: PumpunSyottoValinta | undefined,
  legacyKolme: boolean | undefined,
  virta1vaihe: string,
  virtaL1: string,
  virtaL2: string,
  virtaL3: string
): string {
  const sel = getMlpPumpSyottoValinta(syottoValinta, legacyKolme);
  if (sel !== '230_1' && sel !== '400_3') return '';
  const kolme = sel === '400_3';
  const syottoLabel = kolme ? '400 V (3-vaihe)' : '230 V (1-vaihe)';
  let virtaRivi = '';
  let imbWarn = '';
  if (!kolme) {
    if (hasPrintableValue(virta1vaihe)) {
      virtaRivi = `<div style="color:#666;">Ampeeri (A)</div><div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(virta1vaihe)}</div>`;
    }
  } else {
    const c1 = hasPrintableValue(virtaL1);
    const c2 = hasPrintableValue(virtaL2);
    const c3 = hasPrintableValue(virtaL3);
    if (c1 || c2 || c3) {
      const cells = [
        c1
          ? `<div><div style="color:#666;">L1 (A)</div><div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(virtaL1)}</div></div>`
          : '',
        c2
          ? `<div><div style="color:#666;">L2 (A)</div><div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(virtaL2)}</div></div>`
          : '',
        c3
          ? `<div><div style="color:#666;">L3 (A)</div><div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(virtaL3)}</div></div>`
          : '',
      ].filter(Boolean);
      virtaRivi = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;">${cells.join('')}</div>`;
      if (c1 && c2 && c3) {
        const l1 = parseFloat(virtaL1) || 0;
        const l2 = parseFloat(virtaL2) || 0;
        const l3 = parseFloat(virtaL3) || 0;
        const imb = calculatePhaseImbalance(l1, l2, l3);
        imbWarn =
          imb > 10
            ? `<div style="color:#c62828;font-weight:bold;font-size:10px;margin-top:4px;">VAARA: Vaihe-epätasapaino ${imb.toFixed(1)}%</div>`
            : imb > 5
              ? `<div style="color:#e65100;font-size:10px;margin-top:4px;">Huom: Vaihe-epätasapaino ${imb.toFixed(1)}%</div>`
              : '';
      }
    }
  }
  return `
    <div style="margin-bottom: 8px; padding: 8px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 11px;">
      <div style="font-weight: bold; margin-bottom: 4px; color: #333;">Pumpun syöttö</div>
      <div style="margin-bottom: 6px;"><span style="color:#666;">Syöttö:</span> <strong>${syottoLabel}</strong></div>
      ${virtaRivi}
      ${imbWarn}
    </div>`;
}

// Helper function to get sulatustapa text
function getSulatusText(sulatus: string): string {
  if (sulatus === 'ilma') return 'Ilmasulatus';
  if (sulatus === 'sahko') return 'Sähkösulatus';
  return 'Kuumakaasu sulatus';
}

// Helper function to get lauhdutin type text
function getLauhdutinTypeText(tyyppi: string): string {
  if (tyyppi === 'koneseen_integroitu') return 'Koneseen integroitu ilmalauhdutin';
  if (tyyppi === 'erillinen_ilma') return 'Erillinen ilmalauhdutin';
  return 'Levy- tai putkilämmönvaihdin + nestekiertoinen ilmalauhdutin';
}

// Helper function to get puhallin ohjaus text
function getOhjausText(ohjaus: string, puhallinOhjausMuu?: string): string {
  if (ohjaus === 'nopeussäädin') return 'Nopeussäädin';
  if (ohjaus === 'taajusmuuntaja') return 'Taajusmuuntaja';
  if (ohjaus === 'kp_pressostaatti') return 'KP-pressostaatti';
  if (ohjaus === 'kompressorin_yhtaaikaa') return 'Puhallin toimii kompressorin kanssa yhtä aikaa';
  if (ohjaus === 'muu') return puhallinOhjausMuu ? `Muu: ${puhallinOhjausMuu}` : '';
  return '';
}

function normalizePrintText(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function hasPrintableValue(val: unknown): boolean {
  const s = normalizePrintText(val);
  if (!s) return false;
  if (s === '-' || s === '—' || s === '–') return false;
  if (/^[-–—]\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\/h)?$/i.test(s)) return false;
  return true;
}

// Helper function to calculate phase imbalance
function getPhaseWarning(virtaL1: number, virtaL2: number, virtaL3: number, phase: number): { bgColor: string; borderColor: string; warningText: string; maxDev: number } {
  let bgColor = '#e0f7fa';
  let borderColor = '#00838F';
  let warningText = '';
  let maxDev = 0;

  if (phase === 3) {
    const avgVirta = (virtaL1 + virtaL2 + virtaL3) / 3;
    const deviations = [Math.abs(virtaL1 - avgVirta), Math.abs(virtaL2 - avgVirta), Math.abs(virtaL3 - avgVirta)];
    maxDev = avgVirta > 0 ? (Math.max(...deviations) / avgVirta) * 100 : 0;

    if (maxDev > 10) {
      bgColor = '#ffebee';
      borderColor = '#d32f2f';
      warningText = `<div style="margin-top: 4px; padding: 4px; background: #ffebee; border-radius: 4px; font-size: 10px; color: #c62828; font-weight: bold;">VAARA: Vaihe-epätasapaino ${maxDev.toFixed(1)}%</div>`;
    } else if (maxDev > 5) {
      bgColor = '#fffde7';
      borderColor = '#ffa000';
      warningText = `<div style="margin-top: 4px; padding: 4px; background: #fffde7; border-radius: 4px; font-size: 10px; color: #e65100;">Huom: Vaihe-epätasapaino ${maxDev.toFixed(1)}%</div>`;
    }
  }

  return { bgColor, borderColor, warningText, maxDev };
}

// Generate evaporator print HTML
export function generateEvaporatorPrintHtml(
  evaporatorDataArray: EvaporatorData[],
  otsikkoTyyppi: 'piiri' | 'hoyrystin' = 'piiri'
): string {
  if (!evaporatorDataArray || evaporatorDataArray.length === 0) return '';

  let html = '';

  evaporatorDataArray.forEach((evaporatorData, circuitIndex) => {
    const otsikkoRivi =
      otsikkoTyyppi === 'hoyrystin'
        ? `4.${circuitIndex + 1} HÖYRYSTIMEN TIEDOT — HÖYRYSTIN ${circuitIndex + 1}`
        : `4.${circuitIndex + 1} HÖYRYSTIMEN TIEDOT — PIIRI ${circuitIndex + 1}`;
    html += `
    <div class="box-content" style="border-color: #00838F; margin-top: 12px; page-break-inside: avoid;">
      <div style="border-bottom: 2px solid #00838F; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 14px; color: #00838F; text-decoration: underline;">${otsikkoRivi}</strong>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
        <div>
          <div style="color: #666; margin-bottom: 2px;">Tyyppi</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">
            ${evaporatorData.tyyppi === 'puhallin' ? 'Puhallinhöyrystin' : 'Staattinen höyrystin'}
          </div>
        </div>
        <div style="grid-column: 1 / -1;">
          <div style="color: #666; margin-bottom: 2px;">Huoneen tunnus</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(evaporatorData.huoneenTunnus) || '-'}</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Sulatustapa</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">
            ${getSulatusText(evaporatorData.sulatus)}
          </div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Valmistaja</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.valmistaja || '-'}</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Malli</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.malli || '-'}</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Sarjanumero</div>
          <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sarjanumero || '-'}</div>
        </div>
      </div>`;

    // Sähkösulatuksen tiedot
    if (evaporatorData.sulatus === 'sahko') {
      const jannite = evaporatorData.sahkoJannite || '230';
      const virtaText = jannite === '400'
        ? `L1: ${evaporatorData.sahkoVirtaL1 || '-'}A, L2: ${evaporatorData.sahkoVirtaL2 || '-'}A, L3: ${evaporatorData.sahkoVirtaL3 || '-'}A`
        : `${evaporatorData.sahkoVirtaL1 || '-'}A`;

      // Sulatuksen ohjaustiedot
      const ohjausLabel = evaporatorData.sulatusOhjaus === 'huonesäädin' ? 'Huonesäädin ohjaa'
        : evaporatorData.sulatusOhjaus === 'kello' ? 'Sulatuskello ohjaa'
        : evaporatorData.sulatusOhjaus === 'muu' ? `Muu: ${evaporatorData.sulatusOhjausMuu || '-'}`
        : '-';

      html += `
      <div style="margin-top: 8px; padding: 8px; background: #fff8e1; border-radius: 4px; border-left: 3px solid #ffa000;">
        <div style="font-size: 12px; font-weight: bold; color: #f57f17; margin-bottom: 6px;">SÄHKÖSULATUS</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px;">
          <div>
            <div style="color: #666; margin-bottom: 2px;">Jännite</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${jannite} V</div>
          </div>
          <div>
            <div style="color: #666; margin-bottom: 2px;">Virrat mitattu</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sahkoVirtaMitattu ? 'Kyllä' : 'Ei'}</div>
          </div>
          <div>
            <div style="color: #666; margin-bottom: 2px;">Sulatuksen ohjaus</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${ohjausLabel}</div>
          </div>
          ${evaporatorData.sulatusOhjaus === 'kello' ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Sulatuskellon malli</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sulatusKelloMalli || '-'}</div>
          </div>` : ''}
          ${evaporatorData.sulatusOhjaus === 'huonesäädin' ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Säätimen malli</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sulatusSäädinMalli || '-'}</div>
          </div>` : ''}
          <div>
            <div style="color: #666; margin-bottom: 2px;">Sulatuskertaa/päivä</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sulatusKertojaPäivässä || '-'}</div>
          </div>
          <div>
            <div style="color: #666; margin-bottom: 2px;">Sulatusaika</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sulatusAika || '-'}</div>
          </div>
          <div>
            <div style="color: #666; margin-bottom: 2px;">Lopetuslämpötila</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${evaporatorData.sulatusLopetusLämpötila || '-'}</div>
          </div>
        </div>
        ${evaporatorData.sahkoVirtaMitattu ? `
        <div style="margin-top: 8px;">
          <div style="color: #666; margin-bottom: 2px;">Mitattu virta</div>
          <div style="padding: 6px; background: #fff; border: 1px solid #ddd; border-radius: 4px; font-weight: bold;">${virtaText}</div>
        </div>` : ''}
      </div>`;
    }

    // Puhaltimien tiedot (sama logiikka kuin ilmalauhduttimen puhaltimilla)
    if (evaporatorData.tyyppi === 'puhallin' && evaporatorData.puhaltimet) {
      html += `
      <div style="margin-top: 12px;">
        <div style="font-size: 12px; font-weight: bold; color: #00838F; margin-bottom: 8px;">Puhaltimet (${evaporatorData.puhaltimienMaara || evaporatorData.puhaltimet.length} kpl)</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">`;

      evaporatorData.puhaltimet.forEach((p, idx) => {
        const vv = getCondenserFanVaiheValinta(p, p.jannite === '400' ? '400' : undefined);
        if (vv !== '1' && vv !== '3') return;

        const l1p = hasPrintableValue(p.virtaL1);
        const l2p = hasPrintableValue(p.virtaL2);
        const l3p = hasPrintableValue(p.virtaL3);
        const n1 = parseFloat(p.virtaL1) || 0;
        const n2 = parseFloat(p.virtaL2) || 0;
        const n3 = parseFloat(p.virtaL3) || 0;
        const imbOk = vv === '3' && l1p && l2p && l3p;
        const { bgColor, borderColor, warningText } = imbOk
          ? getPhaseWarning(n1, n2, n3, 3)
          : { bgColor: '#e0f7fa', borderColor: '#00838F', warningText: '' };

        let virtaText = '';
        if (vv === '1' && l1p) virtaText = `${normalizePrintText(p.virtaL1)} A`;
        else if (vv === '3') {
          const parts: string[] = [];
          if (l1p) parts.push(`L1: ${normalizePrintText(p.virtaL1)} A`);
          if (l2p) parts.push(`L2: ${normalizePrintText(p.virtaL2)} A`);
          if (l3p) parts.push(`L3: ${normalizePrintText(p.virtaL3)} A`);
          if (parts.length) virtaText = parts.join(', ');
        }

        const janniteNaytto = p.jannite === '400' ? '400' : '230';
        const phaseLabel = vv === '3' ? '3-vaihe' : '1-vaihe';
        html += `
          <div style="padding: 8px; background: ${bgColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
            <div style="font-size: 11px; font-weight: bold; color: #006064; margin-bottom: 4px;">Puhallin ${idx + 1}</div>
            <div style="font-size: 10px; color: #666;">${janniteNaytto} V • ${phaseLabel}</div>
            ${virtaText ? `<div style="font-size: 10px; color: #333; margin-top: 4px;">${virtaText}</div>` : ''}
            ${warningText}
          </div>`;
      });

      html += `
        </div>
      </div>`;
    }

    html += `
    </div>`;
  });

  return html;
}

// Generate condenser print HTML
export function generateCondenserPrintHtml(
  condenserDataArray: CondenserData[],
  laiteTyyppi?: string
): string {
  if (!condenserDataArray || condenserDataArray.length === 0) return '';

  let html = '';

  condenserDataArray.forEach((condenserData, circuitIndex) => {
    if (!condenserData?.tyyppi) return;

    const isVjkNeste =
      laiteTyyppi === 'Vedenjäähdytyskone' && condenserData.tyyppi === 'nestekiertoinen';
    /** Vedenjäähdytyskone + nestekiertoinen: lomakkeella vain tyyppi (puhdistus/paine/virtaus muualla). */
    const showLauhdutinPuhdistusFields = !isVjkNeste;

    html += `
    <div style="margin-top: 16px; padding: 12px; background: #fff3e0; border-radius: 6px; border-left: 4px solid #ff9800;">
      <div style="font-size: 14px; font-weight: bold; color: #e65100; margin-bottom: 10px;">LAUHDUTIN - PIIRI ${circuitIndex + 1}</div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11px;">
        <div${isVjkNeste ? ' style="grid-column: 1 / -1;"' : ''}>
          <div style="color: #666; margin-bottom: 2px;">Tyyppi</div>
          <div style="padding: 6px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${getLauhdutinTypeText(condenserData.tyyppi)}</div>
        </div>`;

    if (showLauhdutinPuhdistusFields) {
      html += `
        <div>
          <div style="color: #666; margin-bottom: 2px;">Puhdistettu</div>
          <div style="padding: 6px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${condenserData.lauhdutinPuhdistettu ? 'Kyllä' : 'Ei'}</div>
        </div>`;
    }

    html += `
      </div>`;

    if (
      showLauhdutinPuhdistusFields &&
      condenserData.lauhdutinPuhdistettu &&
      hasPrintableValue(condenserData.lauhdutinPuhdistusTapa)
    ) {
      html += `
      <div style="margin-top: 8px;">
        <div style="color: #666; margin-bottom: 2px;">Puhdistustapa</div>
        <div style="padding: 6px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.lauhdutinPuhdistusTapa)}</div>
      </div>`;
    }

    // Ilmalauhduttimen tiedot
    if (condenserData.tyyppi === 'koneseen_integroitu' || condenserData.tyyppi === 'erillinen_ilma') {
      html += `
      <div style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 4px; border: 1px solid #ffcc80;">
        <div style="font-size: 12px; font-weight: bold; color: #f57c00; margin-bottom: 8px;">Puhaltimet</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11px;">
          ${condenserData.puhallinOhjaus ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Ohjaustapa</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${getOhjausText(condenserData.puhallinOhjaus, condenserData.puhallinOhjausMuu)}</div>
          </div>` : ''}
          ${(condenserData.tyyppi === 'koneseen_integroitu' || condenserData.tyyppi === 'erillinen_ilma') &&
          (condenserData.puhaltimienMaara ?? 0) > 0
            ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Puhaltimien määrä</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${condenserData.puhaltimienMaara} kpl</div>
          </div>`
            : ''}
          ${condenserData.puhallinOhjaus === 'nopeussäädin' && hasPrintableValue(condenserData.nopeussäädinMalli) ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Nopeussäätimen malli</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.nopeussäädinMalli)}</div>
          </div>` : ''}
          ${condenserData.puhallinOhjaus === 'taajusmuuntaja' && hasPrintableValue(condenserData.taajusmuuntajaMalli) ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Taajusmuuntajan malli</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.taajusmuuntajaMalli)}</div>
          </div>` : ''}
          ${condenserData.puhallinOhjaus === 'kp_pressostaatti' && hasPrintableValue(condenserData.kpPressostaattiMalli) ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">KP-pressostaatin malli</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.kpPressostaattiMalli)}</div>
          </div>` : ''}
          ${condenserData.talvivarustus === true ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Talvivarustus</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">Kyllä</div>
          </div>` : ''}
          ${condenserData.talvivarustus === true && hasPrintableValue(condenserData.talvivarustusTapa) ? `
          <div>
            <div style="color: #666; margin-bottom: 2px;">Talvivarustuksen toteutustapa</div>
            <div style="padding: 4px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.talvivarustusTapa)}</div>
          </div>` : ''}
        </div>`;

      // Puhaltimien tiedot
      if (condenserData.puhaltimet && condenserData.puhaltimet.length > 0) {
        html += `
        <div style="margin-top: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">`;

        condenserData.puhaltimet.forEach((p, idx) => {
          const vv = getCondenserFanVaiheValinta(p, p.jannite === '400' ? '400' : undefined);
          if (vv !== '1' && vv !== '3') return;

          const l1p = hasPrintableValue(p.virtaL1);
          const l2p = hasPrintableValue(p.virtaL2);
          const l3p = hasPrintableValue(p.virtaL3);
          const n1 = parseFloat(p.virtaL1) || 0;
          const n2 = parseFloat(p.virtaL2) || 0;
          const n3 = parseFloat(p.virtaL3) || 0;
          const imbOk = vv === '3' && l1p && l2p && l3p;
          const { bgColor, borderColor, warningText } = imbOk
            ? getPhaseWarning(n1, n2, n3, 3)
            : { bgColor: '#fff3e0', borderColor: '#ff9800', warningText: '' };

          let virtaText = '';
          if (vv === '1' && l1p) virtaText = `${normalizePrintText(p.virtaL1)} A`;
          else if (vv === '3') {
            const parts: string[] = [];
            if (l1p) parts.push(`L1: ${normalizePrintText(p.virtaL1)} A`);
            if (l2p) parts.push(`L2: ${normalizePrintText(p.virtaL2)} A`);
            if (l3p) parts.push(`L3: ${normalizePrintText(p.virtaL3)} A`);
            if (parts.length) virtaText = parts.join(', ');
          }

          const janniteNaytto = p.jannite === '400' ? '400' : '230';
          const phaseLabel = vv === '3' ? '3-vaihe' : '1-vaihe';
          html += `
          <div style="padding: 8px; background: ${bgColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
            <div style="font-size: 11px; font-weight: bold; color: #e65100; margin-bottom: 4px;">Puhallin ${idx + 1}</div>
            <div style="font-size: 10px; color: #666;">${janniteNaytto} V • ${phaseLabel}</div>
            ${virtaText ? `<div style="font-size: 10px; color: #333; margin-top: 4px;">${virtaText}</div>` : ''}
            ${warningText}
          </div>`;
        });

        html += `
        </div>`;
      }

      html += `
      </div>`;
    }

    // Nestekiertoisen lauhduttimen nestepuoli — vain kylmäkoneikko/pakastin (VJK: ei lomakkeella tässä osassa)
    if (condenserData.tyyppi === 'nestekiertoinen' && !isVjkNeste) {
      const nesteCells: string[] = [];
      if (condenserData.painesäätimenTarkistettu === true) {
        nesteCells.push(`<div>
            <div style="color: #666; margin-bottom: 2px;">${LAUHDUTIN_PAINEVENTTIILI_LABEL}</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">Kyllä</div>
          </div>`);
        if (hasPrintableValue(condenserData.painesäätimenMalli)) {
          nesteCells.push(`<div>
            <div style="color: #666; margin-bottom: 2px;">${LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.painesäätimenMalli)}</div>
          </div>`);
        }
      }
      if (condenserData.virtausRiittävä === false) {
        nesteCells.push(`<div>
            <div style="color: #666; margin-bottom: 2px;">Virtaus riittävä</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">Ei</div>
          </div>`);
      }
      if (hasPrintableValue(condenserData.virtausOngelma)) {
        nesteCells.push(`<div style="grid-column: 1 / -1;">
            <div style="color: #666; margin-bottom: 2px;">Virtausongelma</div>
            <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(condenserData.virtausOngelma)}</div>
          </div>`);
      }
      if (nesteCells.length > 0) {
        html += `
      <div style="margin-top: 10px; padding: 10px; background: #e3f2fd; border-radius: 4px; border: 1px solid #90caf9;">
        <div style="font-size: 12px; font-weight: bold; color: #1565c0; margin-bottom: 8px;">NESTEKIERTOINEN LAUHDUTIN</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11px;">
          ${nesteCells.join('')}
        </div>
      </div>`;
      }
    }

    html += `
    </div>`;
  });

  return html;
}

const NESTE_OHJAUS_TAPA: Record<string, string> = {
  on_off: 'ON/OFF',
  erillinen_taajuus: 'Erillinen taajuusmuuntaja',
  sisainen_nopeussaato: 'Puhaltimen sisään rakennettu nopeussäätö',
};

const NESTE_OHJAUS_LAHDE: Record<string, string> = {
  talo_automaatio: 'Taloautomaatiosta',
  vedenjaahdytyskone: 'Vedenjäähdytyskoneesta',
  lampotila: 'Suora lämpötilan mukainen ohjaus',
  korkeapaine: 'Suora korkeapaineen mukainen ohjaus',
};

export function generateNestelauhduttimetVjPrintHtml(units: NestelauhdutinUnitData[]): string {
  if (!units?.length) return '';
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let html = `
  <div class="box-content" style="border-color: #0277BD; page-break-inside: avoid; margin-top: 12px;">
    <div style="border-bottom: 2px solid #0277BD; padding-bottom: 2px; margin-bottom: 8px;">
      <strong style="font-size: 14px; color: #0277BD;">NESTELAUHDUTTIMET (VEDENJÄÄHDYTYSKONE)</strong>
    </div>`;

  units.forEach((unit, uidx) => {
    const idCells: string[] = [];
    if (hasPrintableValue(unit.valmistaja)) {
      idCells.push(
        `<div><div style="color:#555">Valmistaja</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.valmistaja)}</div></div>`
      );
    }
    if (hasPrintableValue(unit.malli)) {
      idCells.push(
        `<div><div style="color:#555">Malli</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.malli)}</div></div>`
      );
    }
    if (hasPrintableValue(unit.sarjanumero)) {
      idCells.push(
        `<div><div style="color:#555">Sarjanumero</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.sarjanumero)}</div></div>`
      );
    }

    const puhdistusRow: string[] = [];
    if (unit.lauhdutinPuhdistettu === true || unit.lauhdutinPuhdistettu === false) {
      puhdistusRow.push(
        `<div><div style="color:#555">Lauhdutin (kenno) puhdistettu tai ei tarvitse puhdistusta</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${unit.lauhdutinPuhdistettu === true ? 'Kyllä' : 'Ei'}</div></div>`
      );
    }
    if (hasPrintableValue(unit.lauhdutinPuhdistusTapa)) {
      puhdistusRow.push(
        `<div><div style="color:#555">Puhdistustapa</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.lauhdutinPuhdistusTapa)}</div></div>`
      );
    }

    const ohjausCells: string[] = [];
    const pm = unit.puhaltimienMaara != null ? Number(unit.puhaltimienMaara) : 0;
    if (pm > 0) {
      ohjausCells.push(
        `<div><div style="color:#555">Puhaltimien määrä</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${pm}</div></div>`
      );
    }
    if (unit.puhallinSyotto === '230' || unit.puhallinSyotto === '400') {
      ohjausCells.push(
        `<div><div style="color:#555">Puhaltimien syöttö</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${unit.puhallinSyotto === '230' ? '230 V' : '400 V'}</div></div>`
      );
    }
    if (hasPrintableValue(unit.puhaltimienValmistaja)) {
      ohjausCells.push(
        `<div><div style="color:#555">Puhaltimien valmistaja</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.puhaltimienValmistaja)}</div></div>`
      );
    }
    if (hasPrintableValue(unit.puhaltimienMalli)) {
      ohjausCells.push(
        `<div><div style="color:#555">Puhaltimien malli</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(unit.puhaltimienMalli)}</div></div>`
      );
    }
    if (unit.puhallinOhjausTapa) {
      const ohjausTapaNaytto = NESTE_OHJAUS_TAPA[unit.puhallinOhjausTapa] || String(unit.puhallinOhjausTapa);
      if (hasPrintableValue(ohjausTapaNaytto)) {
        ohjausCells.push(
          `<div><div style="color:#555">Puhaltimen ohjaustapa</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(ohjausTapaNaytto)}</div></div>`
        );
      }
    }
    if (unit.ohjausLahde) {
      const ohjausLahdeNaytto = NESTE_OHJAUS_LAHDE[unit.ohjausLahde] || String(unit.ohjausLahde);
      if (hasPrintableValue(ohjausLahdeNaytto)) {
        ohjausCells.push(
          `<div><div style="color:#555">Ohjaus tulee</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${esc(ohjausLahdeNaytto)}</div></div>`
        );
      }
    }

    html += `
    <div style="margin-top: 10px; padding: 10px; background: #e1f5fe; border: 1px solid #4fc3f7; border-radius: 6px;">
      <div style="font-size: 12px; font-weight: bold; color: #01579b; margin-bottom: 8px;">Nestelauhdutin ${uidx + 1}</div>
      ${
        idCells.length
          ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10px;">${idCells.join('')}</div>`
          : ''
      }
      ${
        puhdistusRow.length
          ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 10px; margin-top: 8px;">${puhdistusRow.join('')}</div>`
          : ''
      }
      ${
        ohjausCells.length
          ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 10px; margin-top: 8px;">${ohjausCells.join('')}</div>`
          : ''
      }
      ${
        unit.puhallinMoottoriVirratMitattu
          ? `<div style="margin-top:8px;font-size:10px;"><strong>Puhaltimoottorien virrat mitattu:</strong> Kyllä</div>`
          : ''
      }`;

    if (unit.puhallinMoottoriVirratMitattu && unit.puhaltimet?.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px;">`;
      unit.puhaltimet.forEach((p, pidx) => {
        const syotto400 = unit.puhallinSyotto === '400';
        const effV = getCondenserFanVaiheValinta(p, syotto400 ? '400' : undefined);
        if (effV !== '1' && effV !== '3') return;

        const l1p = hasPrintableValue(p.virtaL1);
        const l2p = hasPrintableValue(p.virtaL2);
        const l3p = hasPrintableValue(p.virtaL3);
        const v1 = parseFloat(p.virtaL1) || 0;
        const v2 = parseFloat(p.virtaL2 || '') || 0;
        const v3 = parseFloat(p.virtaL3 || '') || 0;
        let imbTxt = '';
        if (effV === '3' && l1p && l2p && l3p) {
          const avg = (v1 + v2 + v3) / 3;
          const devs = [Math.abs(v1 - avg), Math.abs(v2 - avg), Math.abs(v3 - avg)];
          const maxDev = avg > 0 ? (Math.max(...devs) / avg) * 100 : 0;
          if (maxDev > 10) imbTxt = `<div style="color:#c62828;font-weight:bold;margin-top:4px;">VAARA: Vaihe-epätasapaino ${maxDev.toFixed(1)} %</div>`;
          else if (maxDev > 5) imbTxt = `<div style="color:#ef6c00;margin-top:4px;">Huom: Vaihe-epätasapaino ${maxDev.toFixed(1)} %</div>`;
        }
        let vtxt = '';
        if (effV === '1' && l1p) vtxt = `${esc(p.virtaL1)} A`;
        else if (effV === '3') {
          const segs: string[] = [];
          if (l1p) segs.push(`L1 ${esc(p.virtaL1)} A`);
          if (l2p) segs.push(`L2 ${esc(p.virtaL2)} A`);
          if (l3p) segs.push(`L3 ${esc(p.virtaL3)} A`);
          if (segs.length) vtxt = segs.join(' / ');
        }
        const phaseLabel = syotto400 ? '3-vaihe (400 V)' : effV === '3' ? '3-vaihe' : '1-vaihe';
        html += `
          <div style="padding:6px;background:#fff;border:1px solid #b3e5fc;border-radius:4px;font-size:10px;">
            <div style="font-weight:bold;margin-bottom:4px;">Puhallin ${pidx + 1} (${phaseLabel})</div>
            ${vtxt ? `<div>Virta: ${vtxt}</div>` : ''}
            ${imbTxt}
          </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

/** 5.4 Kiinteistön lämmitys- / jäähdytyspiiri (tuloste) */
function kiinteistoPiiritPrintSectionHtml(m: MlpData, laiteTyyppi: string): string {
  if (!m.lampoPiirit?.length) return '';

  let section = `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.4 KIINTEISTÖN JÄÄHDYTYSPIIRI' : '5.4 LÄMMITYSPIIRIT'}</strong>
    </div>`;

  m.lampoPiirit.forEach((piiri: HeatingCircuitData & { nimi?: string }, index: number) => {
    const virtausLS = parseFloat(piiri.virtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(piiri.meno) || 0;
    const tulo = parseFloat(piiri.tulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(piiri.neste);
    const power = virtausLS > 0 && deltaT > 0 && c > 0 ? c * virtausLS * deltaT : 0;
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    const missingFields: string[] = [];
    if (!hasPrintableValue(piiri.virtaus)) missingFields.push('virtaus');
    if (!hasPrintableValue(piiri.meno)) missingFields.push('menolämpötila');
    if (!hasPrintableValue(piiri.tulo)) missingFields.push('paluu-/tulolämpötila');
    if (!hasPrintableValue(piiri.neste)) missingFields.push('neste');

    section += `
    <div style="padding: 10px; background: #fafafa; border-radius: 4px; border: 1px solid #e0e0e0; margin-bottom: 8px;">
      <div style="font-size: 12px; font-weight: bold; color: #7B1FA2; margin-bottom: 6px;">Piiri ${index + 1}: ${piiri.nimi || '-'}</div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; font-size: 11px; margin-bottom: 6px;">
        <div>
          <div style="color: #666; margin-bottom: 2px;">Virtaus</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)} m³/h</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Meno</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.meno || '-'} °C</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Paluu</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.tulo || '-'} °C</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Neste</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.neste || '-'} kW/(l/s·K)</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Teho</div>
          <div style="padding: 4px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${power.toFixed(2)} kW</div>
        </div>
      </div>
      <div style="font-size: 10px; color: #666;">Kaava: ${formula}</div>
      ${
        power === 0
          ? `<div style="margin-top: 6px; font-size: 10px; color: #666; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; padding: 6px;">
        <strong>Ei tarpeeksi dataa laskentaan.</strong>
        ${
          missingFields.length > 0
            ? `Puuttuu: ${missingFields.join(', ')}.`
            : 'Tarkista, että virtaus ja lämpötilaero (delta-T) ovat > 0.'
        }
      </div>`
          : ''
      }
      ${
        piiri.pumppuTarkastettu &&
        (hasPrintableValue(piiri.pumppuValmistaja) ||
          hasPrintableValue(piiri.pumppuMalli) ||
          hasPrintableValue(piiri.pumppuTyyppi))
          ? `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; margin-bottom: 8px;">
        ${
          hasPrintableValue(piiri.pumppuValmistaja)
            ? `<div><div style="color:#666;">Pumpun valmistaja</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuValmistaja)}</div></div>`
            : ''
        }
        ${
          hasPrintableValue(piiri.pumppuMalli)
            ? `<div><div style="color:#666;">Pumpun malli</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuMalli)}</div></div>`
            : ''
        }
        ${
          !hasPrintableValue(piiri.pumppuValmistaja) &&
          !hasPrintableValue(piiri.pumppuMalli) &&
          hasPrintableValue(piiri.pumppuTyyppi)
            ? `<div style="grid-column:1/-1;"><div style="color:#666;">Pumpun tyyppi (vanha)</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuTyyppi)}</div></div>`
            : ''
        }
      </div>`
          : ''
      }
      ${piiri.pumppuTarkastettu ? pumpSupplyHtmlBlock(
        piiri.pumppuSyottoValinta,
        piiri.pumppuKolmeVaihetta,
        piiri.pumppuVirta1vaihe || '',
        piiri.pumppuVirtaL1 || '',
        piiri.pumppuVirtaL2 || '',
        piiri.pumppuVirtaL3 || ''
      ) : ''}
    </div>`;
  });

  section += `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.lampoToimilaitteetOK, 'Toimilaitteet kunnossa')}</div>
    <div>${renderCheckbox(m.lampoAutomaattinenIlmausTarkistettu, 'Automaattinen ilmaus tarkistettu')}</div>
    <div>${renderCheckbox(m.lampoMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
    </div>
  </div>`;
  return section;
}

// Generate MLP/Vedenjäähdytyskone print HTML
export function generateMLPPrintHtml(
  m: MlpData,
  kp1Data: RefrigerantCircuitData,
  laiteTyyppi: string,
  hasAirCondenserSelected: boolean = false,
  piilotaVaroitukset: boolean = false,
): string {
  const includeKiinteistoPiirit = m.kiinteistoPiiritSisallytetaan !== false;
  // Check if this is a vedenjäähdytyskone (chiller)
  const isChiller = laiteTyyppi === 'Vedenjäähdytyskone';
  const showLauhdutuspiiri = !(isChiller && hasAirCondenserSelected);
  const getNestekiertoMissingLine = (
    label: string,
    virtaus: unknown,
    meno: unknown,
    tulo: unknown,
    neste: unknown
  ): string | null => {
    const missing: string[] = [];
    if (!hasPrintableValue(virtaus)) missing.push('virtaus');
    if (!hasPrintableValue(meno)) missing.push('menolämpötila');
    if (!hasPrintableValue(tulo)) missing.push('paluu-/tulolämpötila');
    if (!hasPrintableValue(neste)) missing.push('neste');
    if (missing.length > 0) return `${label}: puuttuu ${missing.join(', ')}.`;
    const virtausNum = parseFloat(String(virtaus ?? '')) || 0;
    const menoNum = parseFloat(String(meno ?? '')) || 0;
    const tuloNum = parseFloat(String(tulo ?? '')) || 0;
    const deltaT = Math.abs(menoNum - tuloNum);
    if (virtausNum <= 0 || deltaT <= 0) return `${label}: tarkista että virtaus ja delta-T ovat > 0.`;
    return null;
  };
  
  if (isChiller) {
    // === CHILLER CALCULATIONS ===
    // Q_cool (jäähdytysteho) = 1.163 × V̇ (m³/h) × ΔT (°C)
    const chillerVirtausLS = parseFloat(m.keruupiiriVirtaus) || 0;
    const chillerVirtausM3h = chillerVirtausLS * 3.6;
    const chillerMeno = parseFloat(m.keruupiiriMeno) || 0;
    const chillerTulo = parseFloat(m.keruupiiriTulo) || 0;
    const chillerDeltaT = Math.abs(chillerMeno - chillerTulo);
    const hasCoolingFlow = hasPrintableValue(m.keruupiiriVirtaus) && chillerVirtausM3h > 0;
    const hasCoolingTemps = hasPrintableValue(m.keruupiiriMeno) && hasPrintableValue(m.keruupiiriTulo);
    const hasCoolingInputForCalc = hasCoolingFlow && hasCoolingTemps && chillerDeltaT > 0;
    const chillerQcool = hasCoolingInputForCalc ? 1.163 * chillerVirtausM3h * chillerDeltaT : 0;
    
    // P_in (sähköteho): joko koko laitteisto TAI kaikkien kompressorien virrat
    const chillerElectricResult = (() => {
      if (m.mittaaKokoLaiteSahko) {
        const kv = getKokoLaiteSahkoVaiheValinta(m);
        if (kv === '3' && m.kokoLaiteVirtaL1 && m.kokoLaiteVirtaL2 && m.kokoLaiteVirtaL3) {
          const l1 = parseFloat(m.kokoLaiteVirtaL1) || 0;
          const l2 = parseFloat(m.kokoLaiteVirtaL2) || 0;
          const l3 = parseFloat(m.kokoLaiteVirtaL3) || 0;
          return { value: 0.591 * ((l1 + l2 + l3) / 3), hasEnoughData: true };
        }
        if (kv === '1' && m.kokoLaiteVirta1vaihe) {
          const virta = parseFloat(m.kokoLaiteVirta1vaihe) || 0;
          return { value: 0.23 * virta, hasEnoughData: true };
        }
        return { value: 0, hasEnoughData: false };
      }
      const compCount = parseInt(String(kp1Data.kompressorienMaara ?? '')) || 1;
      let totalPower = 0;
      for (let i = 1; i <= compCount; i++) {
        const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
        const compRaw = kp1Data[compKey];
        if (!compRaw || typeof compRaw !== 'object') {
          return { value: 0, hasEnoughData: false };
        }
        const comp = compRaw as Partial<CompressorData>;
        const cv = getCompressorVaiheValinta(comp);
        if (cv === '1') {
          if (!hasPrintableValue(comp.virta1vaihe)) return { value: 0, hasEnoughData: false };
          const virta = parseFloat(String(comp.virta1vaihe ?? '')) || 0;
          totalPower += 0.23 * virta;
          continue;
        }
        if (cv === '3') {
          if (!hasPrintableValue(comp.virtaL1) || !hasPrintableValue(comp.virtaL2) || !hasPrintableValue(comp.virtaL3)) {
            return { value: 0, hasEnoughData: false };
          }
          const l1 = parseFloat(String(comp.virtaL1 ?? '')) || 0;
          const l2 = parseFloat(String(comp.virtaL2 ?? '')) || 0;
          const l3 = parseFloat(String(comp.virtaL3 ?? '')) || 0;
          totalPower += 0.591 * ((l1 + l2 + l3) / 3);
          continue;
        }
        return { value: 0, hasEnoughData: false };
      }
      return { value: totalPower, hasEnoughData: totalPower > 0 };
    })();
    const chillerElectricInput = chillerElectricResult.value;
    
    const canCalculateCondensingPower = hasCoolingInputForCalc && chillerElectricResult.hasEnoughData;
    const chillerQcond = canCalculateCondensingPower ? chillerQcool + chillerElectricInput : 0;
    const chillerCOP = canCalculateCondensingPower ? chillerQcool / chillerElectricInput : 0;
    const chillerMissingDataReasons: string[] = [];
    if (!hasCoolingInputForCalc) {
      const coolingMissing = getNestekiertoMissingLine('Jäähdytyspiiri (Q_cool)', m.keruupiiriVirtaus, m.keruupiiriMeno, m.keruupiiriTulo, m.keruupiiriNeste);
      if (coolingMissing) chillerMissingDataReasons.push(coolingMissing);
    }
    if (!chillerElectricResult.hasEnoughData) {
      if (m.mittaaKokoLaiteSahko) {
        const kv = getKokoLaiteSahkoVaiheValinta(m);
        if (kv === '3') {
          const missingPhases: string[] = [];
          if (!hasPrintableValue(m.kokoLaiteVirtaL1)) missingPhases.push('L1');
          if (!hasPrintableValue(m.kokoLaiteVirtaL2)) missingPhases.push('L2');
          if (!hasPrintableValue(m.kokoLaiteVirtaL3)) missingPhases.push('L3');
          chillerMissingDataReasons.push(
            missingPhases.length > 0
              ? `Sähköteho (P_in): puuttuvat koko laitteiston 3-vaihevirrat (${missingPhases.join(', ')}).`
              : 'Sähköteho (P_in): tarvitaan koko laitteiston 3-vaihevirrat (L1, L2, L3).'
          );
        } else if (kv === '1') {
          chillerMissingDataReasons.push('Sähköteho (P_in): puuttuu koko laitteiston 1-vaihevirta (A).');
        } else {
          chillerMissingDataReasons.push('Sähköteho (P_in): valitse sähkömittaus (1-vaihe tai 3-vaihe) ja syötä virrat.');
        }
      } else {
        chillerMissingDataReasons.push('Sähköteho (P_in): syötä kaikkien kompressorien virrat tai käytä koko laitteiston virranmittausta.');
      }
    }
    
    // COP colors for chiller
    const copBgColor = chillerCOP >= 5 ? '#e8f5e9' : chillerCOP >= 3.5 ? '#fffde7' : chillerCOP >= 2.5 ? '#fff3e0' : '#ffebee';
    const copBorderColor = chillerCOP >= 5 ? '#4caf50' : chillerCOP >= 3.5 ? '#ffc107' : chillerCOP >= 2.5 ? '#ff9800' : '#f44336';
    const copTextColor = chillerCOP >= 5 ? '#2e7d32' : chillerCOP >= 3.5 ? '#f9a825' : chillerCOP >= 2.5 ? '#e65100' : '#c62828';
    
    // Generate chiller HTML
    let chillerHtml = '';
    
    // Cooling circuit data
    if (chillerQcool > 0 || chillerElectricInput > 0 || m.keruupiiriVirtaus) {
      chillerHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">ENERGIATEHOKKUUS</strong>
    </div>
    
    <!-- Main efficiency display -->
    <div style="background: ${copBgColor}; border: 2px solid ${copBorderColor}; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 14px; color: #333; margin-bottom: 4px;">Jäähdytyksen COP</div>
          <div style="font-size: 11px; color: #666;">jäähdytysteho / sähköteho</div>
        </div>
        <div style="font-size: 36px; font-weight: bold; color: ${copTextColor};">
          ${chillerCOP > 0 ? chillerCOP.toFixed(2) : '-'}
        </div>
      </div>
      <div style="margin-top: 8px; font-size: 12px;">
        ${chillerCOP >= 5 ? '<span style="background: #4caf50; color: white; padding: 4px 8px; border-radius: 12px;">Erinomainen</span>' : 
          chillerCOP >= 3.5 ? '<span style="background: #ffc107; color: #333; padding: 4px 8px; border-radius: 12px;">Hyvä</span>' : 
          chillerCOP >= 2.5 ? '<span style="background: #ff9800; color: white; padding: 4px 8px; border-radius: 12px;">Tyydyttävä</span>' : 
          chillerCOP > 0 ? '<span style="background: #f44336; color: white; padding: 4px 8px; border-radius: 12px;">Heikko</span>' : 
          '<span style="background: #9e9e9e; color: white; padding: 4px 8px; border-radius: 12px;">Puuttuvia mittauksia</span>'}
      </div>
    </div>
    
    <!-- Power values -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; font-size: 11px;">
      <div style="padding: 10px; background: #e0f7fa; border-radius: 6px; text-align: center;">
        <div style="color: #00838f; margin-bottom: 4px;">Jäähdytysteho (Q_cool)</div>
        <div style="font-size: 16px; font-weight: bold; color: #006064;">${hasCoolingInputForCalc ? `${chillerQcool.toFixed(2)} kW` : 'Ei tarpeeksi dataa laskentaan'}</div>
        <div style="color: #666; font-size: 10px;">${hasCoolingInputForCalc ? `${chillerVirtausM3h.toFixed(1)} m³/h × ${chillerDeltaT.toFixed(1)}°C` : 'Tarvitaan virtaus + meno/tulo-lämpötilat'}</div>
      </div>
      <div style="padding: 10px; background: #fff8e1; border-radius: 6px; text-align: center;">
        <div style="color: #ff8f00; margin-bottom: 4px;">Sähköteho (P_in)</div>
        <div style="font-size: 16px; font-weight: bold; color: #ff6f00;">${chillerElectricResult.hasEnoughData ? `${chillerElectricInput.toFixed(2)} kW` : 'Ei tarpeeksi dataa laskentaan'}</div>
        <div style="color: #666; font-size: 10px;">${m.mittaaKokoLaiteSahko ? 'Koko laite' : 'Kaikki kompressorit'}</div>
      </div>
      <div style="padding: 10px; background: #fff3e0; border-radius: 6px; text-align: center;">
        <div style="color: #e65100; margin-bottom: 4px;">Lauhdutusteho (Q_cond)</div>
        <div style="font-size: 16px; font-weight: bold; color: #bf360c;">${canCalculateCondensingPower ? `${chillerQcond.toFixed(2)} kW` : 'Ei tarpeeksi dataa laskentaan'}</div>
        <div style="color: #666; font-size: 10px;">${canCalculateCondensingPower ? '≈ Q_cool + P_in' : 'Laskenta vaatii Q_cool + P_in'}</div>
      </div>
      <div style="padding: 10px; background: #e8eaf6; border-radius: 6px; text-align: center;">
        <div style="color: #3f51b5; margin-bottom: 4px;">COP</div>
        <div style="font-size: 16px; font-weight: bold; color: ${copTextColor};">${chillerCOP > 0 ? chillerCOP.toFixed(2) : '-'}</div>
        <div style="color: #666; font-size: 10px;">${chillerCOP >= 4 ? 'Erinomainen' : chillerCOP >= 3 ? 'Hyvä' : chillerCOP >= 2 ? 'Normaali' : 'Matala'}</div>
      </div>
    </div>
    ${chillerMissingDataReasons.length > 0 ? `
    <div style="padding: 10px; background: #fafafa; border-radius: 6px; border-left: 4px solid #9e9e9e; font-size: 11px; color: #666;">
      <div style="font-weight: bold; margin-bottom: 4px;">Ei ole tarpeeksi dataa laskentaan</div>
      <ul style="margin: 0; padding-left: 16px;">
        ${chillerMissingDataReasons.map((item) => `<li style="margin-bottom: 2px;">${item}</li>`).join('')}
      </ul>
    </div>` : ''}
  </div>`;
    }
    
    if (includeKiinteistoPiirit) {
      chillerHtml += kiinteistoPiiritPrintSectionHtml(m, laiteTyyppi);
    }
    return chillerHtml;
  }
  
  // === MLP (MAALÄMPÖPUMPPU) CALCULATIONS ===
  // Lasketaan energiatehokkuus
  const keruupiiriPower = (() => {
    const virtaus = parseFloat(m.keruupiiriVirtaus) || 0;
    const meno = parseFloat(m.keruupiiriMeno) || 0;
    const tulo = parseFloat(m.keruupiiriTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.keruupiiriNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const kompressoriPowerResult = (() => {
    if (m.mittaaKokoLaiteSahko) {
      const kv = getKokoLaiteSahkoVaiheValinta(m);
      if (kv === '3' && m.kokoLaiteVirtaL1 && m.kokoLaiteVirtaL2 && m.kokoLaiteVirtaL3) {
        const l1 = parseFloat(m.kokoLaiteVirtaL1) || 0;
        const l2 = parseFloat(m.kokoLaiteVirtaL2) || 0;
        const l3 = parseFloat(m.kokoLaiteVirtaL3) || 0;
        const avgVirta = (l1 + l2 + l3) / 3;
        return { value: 0.591 * avgVirta, hasEnoughData: true };
      }
      if (kv === '1' && m.kokoLaiteVirta1vaihe) {
        const virta = parseFloat(m.kokoLaiteVirta1vaihe) || 0;
        return { value: 0.23 * virta, hasEnoughData: true };
      }
      return { value: 0, hasEnoughData: false };
    }
    const compCount = parseInt(String(kp1Data.kompressorienMaara ?? '')) || 1;
    let totalPower = 0;
    for (let i = 1; i <= compCount; i++) {
      const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
      const compRaw = kp1Data[compKey];
      if (!compRaw || typeof compRaw !== 'object') return { value: 0, hasEnoughData: false };
      const comp = compRaw as Partial<CompressorData>;
      const cv = getCompressorVaiheValinta(comp);
      if (cv === '1') {
        if (!hasPrintableValue(comp.virta1vaihe)) return { value: 0, hasEnoughData: false };
        const virta = parseFloat(String(comp.virta1vaihe ?? '')) || 0;
        totalPower += 0.23 * virta;
        continue;
      }
      if (cv === '3') {
        if (!hasPrintableValue(comp.virtaL1) || !hasPrintableValue(comp.virtaL2) || !hasPrintableValue(comp.virtaL3)) {
          return { value: 0, hasEnoughData: false };
        }
        const l1 = parseFloat(String(comp.virtaL1 ?? '')) || 0;
        const l2 = parseFloat(String(comp.virtaL2 ?? '')) || 0;
        const l3 = parseFloat(String(comp.virtaL3 ?? '')) || 0;
        totalPower += 0.591 * ((l1 + l2 + l3) / 3);
        continue;
      }
      return { value: 0, hasEnoughData: false };
    }
    return { value: totalPower, hasEnoughData: totalPower > 0 };
  })();
  const kompressoriPower = kompressoriPowerResult.value;
  
  const tulistuspiiriPower = (() => {
    const virtaus = parseFloat(m.latausTulistusVirtaus) || 0;
    const meno = parseFloat(m.latausTulistusMeno) || 0;
    const tulo = parseFloat(m.latausTulistusTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausTulistusNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const latauspiiriPower = (() => {
    const virtaus = parseFloat(m.latausVirtaus) || 0;
    const meno = parseFloat(m.latausMeno) || 0;
    const tulo = parseFloat(m.latausTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const hasLatausForCop = getNestekiertoMissingLine('Latauspiiri', m.latausVirtaus, m.latausMeno, m.latausTulo, m.latausNeste) === null;
  const hasTulistusForCop = !m.latausTulistuspiiri
    || getNestekiertoMissingLine('Lauhdutus-/tulistuspiiri', m.latausTulistusVirtaus, m.latausTulistusMeno, m.latausTulistusTulo, m.latausTulistusNeste) === null;
  const hasEnoughOutputForCop = hasLatausForCop && hasTulistusForCop;
  const deviceOutputPower = tulistuspiiriPower + latauspiiriPower;
  const lampoPiiritPower = includeKiinteistoPiirit
    ? m.lampoPiirit.reduce((sum: number, piiri: HeatingCircuitData) => {
        const virtaus = parseFloat(piiri.virtaus) || 0;
        const meno = parseFloat(piiri.meno) || 0;
        const tulo = parseFloat(piiri.tulo) || 0;
        const deltaT = Math.abs(meno - tulo);
        const c = getSpecificHeatCapacity(piiri.neste);
        // Virtaus on l/s, ei jaeta 60:llä
        return sum + (virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0);
      }, 0)
    : 0;
  
  const canCalculateCop = kompressoriPowerResult.hasEnoughData && hasEnoughOutputForCop && kompressoriPower > 0 && deviceOutputPower > 0;
  const cop = canCalculateCop ? deviceOutputPower / kompressoriPower : 0;

  // Pre-compute COP-based colors to avoid nested ternaries in template literals
  const copBgColor = cop >= 4 ? '#e8f5e9' : cop >= 3 ? '#fffde7' : cop >= 2 ? '#fff3e0' : '#ffebee';
  const copBorderColor = cop >= 4 ? '#4caf50' : cop >= 3 ? '#ffc107' : cop >= 2 ? '#ff9800' : '#f44336';
  const copTextColor = cop >= 4 ? '#2e7d32' : cop >= 3 ? '#f9a825' : cop >= 2 ? '#e65100' : '#c62828';
  const copEfficiencyLabel = cop >= 4 ? 'Erinomainen' : cop >= 3 ? 'Hyvä' : cop >= 2 ? 'Tyydyttävä' : cop > 0 ? 'Heikko' : 'Ei voida laskea';

  // Maaperästä saatava energia = TUOTANTO - Sähkösyöte
  // Tämä on energiatasapainon mukainen laskenta: Q_maaperä = Q_tuotanto - Q_sähkö
  const maaperastaEnergy = deviceOutputPower > 0 && kompressoriPower > 0 ? deviceOutputPower - kompressoriPower : keruupiiriPower;
  const totalEnergyInput = maaperastaEnergy + kompressoriPower;
  void totalEnergyInput;
  
  // Varoitukset ja parannusehdotukset
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Tarkista onko tulistuspiirin mittaukset syötetty
  const tulistuspiiriPuuttuu = m.latausTulistuspiiri && tulistuspiiriPower === 0;
  if (tulistuspiiriPuuttuu) {
    warnings.push('Tulistuspiirin mittauksia ei ole syötetty - energiatase ei ole täydellinen');
    suggestions.push('Syötä tulistuspiirin virtaus ja lämpötilat täydellisen energiataseen saavuttamiseksi');
    suggestions.push('Tulistuspiiri edustaa tyypillisesti 5-15% kokonaislämmitystehosta');
  }
  
  // Tarkista energiataseen johdonmukaisuus
  if (deviceOutputPower > 0 && maaperastaEnergy < 0) {
    warnings.push('Energiatase negatiivinen - sähkönkulutus ylittää tuotannon, tarkista mittaukset');
  }
  
  // Tarkista onko keruupiirin teho realistinen suhteessa tuotantoon
  if (deviceOutputPower > 0 && maaperastaEnergy > 0) {
    const maaperanOsuus = (maaperastaEnergy / deviceOutputPower) * 100;
    if (maaperanOsuus > 90) {
      warnings.push(`Maaperän osuus energiatuotannosta erittäin korkea (${maaperanOsuus.toFixed(0)}%) - tarkista mittaukset`);
    } else if (maaperanOsuus < 50 && deviceOutputPower > 10) {
      warnings.push(`Maaperän osuus energiatuotannosta matala (${maaperanOsuus.toFixed(0)}%), voi olla normaalia matalilla lämpötiloilla`);
    }
  }
  
  // Tarkista onko laskennallinen maaperäenergia merkittävästi eri kuin mitattu keruupiirin teho
  // Tämä voi indikoida tulistuspiirin puuttumista tai mittausvirheitä
  if (keruupiiriPower > 0 && deviceOutputPower > kompressoriPower) {
    const erotus = Math.abs(keruupiiriPower - maaperastaEnergy);
    const suhteellinenErotus = erotus / keruupiiriPower;
    if (suhteellinenErotus > 0.3 && tulistuspiiriPower === 0) {
      const tulistuksenOsus = (deviceOutputPower > 0) ? ((tulistuspiiriPower / deviceOutputPower) * 100) : 0;
      if (tulistuksenOsus === 0 && m.latausTulistuspiiri) {
        suggestions.push(`Laskennallinen ja mitattu keruupiirin teho eroavat merkittävästi (${(suhteellinenErotus * 100).toFixed(0)}%)`);
        suggestions.push(`Ero voi johtua puuttuvasta tulistuspiirin mittauksesta (tyypillisesti 5-15% tuotannosta)`);
      }
    }
  }
  
  // Tarkista onko COP fysikaalisesti realistinen maalämpöpumpulle
  if (cop > 0) {
    // Maalämpöpumpun tyypillinen COP on 3-5, poikkeuksellisesti 2-6
    if (cop > 6) {
      warnings.push(`COP erittäin korkea (${cop.toFixed(2)}) - varmista mittausten oikeellisuus`);
    }
    // Erittäin matala COP voi indikoida vikaa tai epänormaaleja olosuhteita
    if (cop < 2 && deviceOutputPower > 5) {
      warnings.push(`COP matala (${cop.toFixed(2)}) - tarkista kylmäaineen määrä ja lauhduttimen toiminta`);
    }
  }
  
  // Tarkista onko sähköteho syötetty mutta ei mittauksia tuotannosta
  if (kompressoriPower > 0 && deviceOutputPower === 0) {
    warnings.push('Sähkönkulutus syötetty mutta ei tuotantotehoa - tarkista lämpötila- ja virtausmittaukset');
  }
  
  // Tarkista onko virtausmittaus syötetty mutta teho ei laskeudu
  const virtausMuttaEiTehoa = (parseFloat(m.keruupiiriVirtaus) || 0) > 0 && keruupiiriPower === 0;
  if (virtausMuttaEiTehoa) {
    warnings.push('Keruupiirin virtaus syötetty mutta tehoa ei voida laskea - tarkista lämpötilat ja nesteen valinta');
  }
  
  if (keruupiiriPower > 0) {
    const keruuDeltaT = Math.abs(parseFloat(m.keruupiiriMeno) - parseFloat(m.keruupiiriTulo)) || 0;
    if (keruuDeltaT > 5) {
      warnings.push('Keruupiirin lämpötilaero on suuri (>5°C), voi indikoida riittämätöntä virtausta');
      suggestions.push('Tarkista keruupiirin pumpun toiminta ja virtaus');
    }
    if (keruuDeltaT < 2 && keruupiiriPower > 5) {
      warnings.push('Keruupiirin lämpötilaero on pieni (<2°C) suurella teholla');
    }
  }
  
  if (latauspiiriPower > 0) {
    const latausDeltaT = Math.abs(parseFloat(m.latausMeno) - parseFloat(m.latausTulo)) || 0;
    if (latausDeltaT > 10) {
      warnings.push('Latauspiirin lämpötilaero on suuri (>10°C)');
      suggestions.push('Voit optimoida virtausta parantamaan lämmönsiirtoa');
    }
  }
  
  if (cop > 0 && cop < 2.5) {
    warnings.push(`COP on alhainen (${cop.toFixed(2)}), normaali maalämpöpumppu tulisi olla > 3`);
    suggestions.push('Tarkista kylmäaineen määrä ja paineet');
    suggestions.push('Tarkista lauhduttimen ja höyrystimen toiminta');
  } else if (cop > 5) {
    warnings.push(`COP on erittäin korkea (${cop.toFixed(2)}), varmista mittauksien oikeellisuus`);
  }
  
  if (kp1Data.kompressori1.virtaL1 && kp1Data.kompressori1.virtaL2 && kp1Data.kompressori1.virtaL3) {
    const l1 = parseFloat(kp1Data.kompressori1.virtaL1) || 0;
    const l2 = parseFloat(kp1Data.kompressori1.virtaL2) || 0;
    const l3 = parseFloat(kp1Data.kompressori1.virtaL3) || 0;
    const avg = (l1 + l2 + l3) / 3;
    const deviations = [Math.abs(l1 - avg), Math.abs(l2 - avg), Math.abs(l3 - avg)];
    const maxDev = Math.max(...deviations);
    const imbalance = avg > 0 ? (maxDev / avg) * 100 : 0;
    if (imbalance > 10) {
      warnings.push(`Vaihe-epätasapaino ${imbalance.toFixed(1)}% - vaarallinen moottorille!`);
      suggestions.push('Tarkista jännitteet ja liitokset');
    } else if (imbalance > 5) {
      warnings.push(`Vaihe-epätasapaino ${imbalance.toFixed(1)}%`);
    }
  }
  
  if (deviceOutputPower > 20 && kompressoriPower < 3) {
    warnings.push('Tehokkuus vaikuttaa epärealistisen hyvältä, tarkista mittaukset');
  }
  
  if (keruupiiriPower > 5 && parseFloat(m.keruupiiriVirtaus) < 0.5) {
    suggestions.push('Keruupiirin virtaus voi olla riittämätön, tarkista pumpun säätö');
  }
  
  let mlpHtml = '';
  
  // Keruupiiri - form style
  if (m.keruupiirinPaineTarkastettu || m.keruupiiriPaineBar || m.keruupiirissaMutapussiPuhdistettu || 
      m.keruupiirinPumppuTarkastettu || m.keruupiirinEristeetKunnossa || m.keruupiirissaAutomaattinenIlmausTarkistettu ||
      m.keruupiiriVirtaus || m.keruupiiriMeno || m.keruupiiriTulo || m.keruupiiriNeste || m.keruupiirinPumpunTyyppi ||
      m.keruupiiriPumpunValmistaja || m.keruupiiriPumpunMalli || 
      getMlpPumpSyottoValinta(m.keruupiiriPumpunSyottoValinta, m.keruupiiriPumppuKolmeVaihetta) ||
      m.keruuPaisuntaAstiaTarkistettu === true) {
    const virtausLS = parseFloat(m.keruupiiriVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.keruupiiriMeno) || 0;
    const tulo = parseFloat(m.keruupiiriTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.keruupiiriNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.1 JÄÄHDYTYSPIRII' : '5.1 KERUUPIRII (MAA/VESI)'}</strong>
    </div>
    
    <!-- Tarkastukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.keruupiirinPaineTarkastettu, 'Paine tarkastettu')}${m.keruupiiriPaineBar ? ' (' + m.keruupiiriPaineBar + ' bar)' : ''}</div>
      <div>${renderCheckbox(m.keruupiirissaMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
      <div>${renderCheckbox(m.keruupiirinPumppuTarkastettu, 'Pumppu tarkastettu')}</div>
      <div>${renderCheckbox(m.keruupiirinEristeetKunnossa, 'Eristeet kunnossa')}</div>
      <div>${renderCheckbox(m.keruupiirissaAutomaattinenIlmausTarkistettu, 'Automaattinen ilmaus tarkistettu')}</div>
      <div>${renderCheckbox(m.keruuPaisuntaAstiaTarkistettu, 'Paisunta-astia tarkistettu')}</div>
    </div>
    
    <!-- Paine mittaus -->
    ${m.keruupiiriPaineBar ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriPaineBar || '-'}</div>
      </div>
    </div>` : ''}
    
    <!-- Paisunta-astia tiedot -->
    ${m.keruuPaisuntaAstiaTarkistettu ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paisunta-astia koko (l)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuPaisuntaAstiaKoko || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Esipaine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuPaisuntaAstiaEsipaine || '-'}</div>
      </div>
    </div>` : ''}
    
    ${
      m.keruupiirinPumppuTarkastettu &&
      (hasPrintableValue(m.keruupiiriPumpunValmistaja) ||
        hasPrintableValue(m.keruupiiriPumpunMalli) ||
        hasPrintableValue(m.keruupiirinPumpunTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.keruupiiriPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiiriPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.keruupiiriPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiiriPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.keruupiiriPumpunValmistaja) &&
        !hasPrintableValue(m.keruupiiriPumpunMalli) &&
        hasPrintableValue(m.keruupiirinPumpunTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiirinPumpunTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.keruupiirinPumppuTarkastettu ? pumpSupplyHtmlBlock(
      m.keruupiiriPumpunSyottoValinta,
      m.keruupiiriPumppuKolmeVaihetta,
      m.keruupiiriPumppuVirta1vaihe || '',
      m.keruupiiriPumppuVirtaL1 || '',
      m.keruupiiriPumppuVirtaL2 || '',
      m.keruupiiriPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${keruupiiriPower.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }

  // Erillinen keruu- / jäähdytyspiiri (MLP)
  const keruuJaahdytysNayta =
    m.keruuJaahdytysPiiri ||
    m.keruuJaahdytysPiiriPumppu ||
    hasPrintableValue(m.keruuJaahdytysPumppuTyyppi) ||
    hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) ||
    hasPrintableValue(m.keruuJaahdytysPumpunMalli) ||
    getMlpPumpSyottoValinta(m.keruuJaahdytysPumpunSyottoValinta, m.keruuJaahdytysPumppuKolmeVaihetta) ||
    hasPrintableValue(m.keruuJaahdytysVirtaus) ||
    hasPrintableValue(m.keruuJaahdytysKayntivirta) ||
    hasPrintableValue(m.keruuJaahdytysMenoLampotila) ||
    hasPrintableValue(m.keruuJaahdytysPaluuLampotila);
  if (keruuJaahdytysNayta) {
    const vls = parseFloat(m.keruuJaahdytysVirtaus) || 0;
    const vM3h = vls * 3.6;
    const jMeno = parseFloat(m.keruuJaahdytysMenoLampotila) || 0;
    const jPaluu = parseFloat(m.keruuJaahdytysPaluuLampotila) || 0;
    const jDt = Math.abs(jMeno - jPaluu);
    const cVesi = 4.18;
    const keruuJaaTeho = vls > 0 && jDt > 0 ? cVesi * vls * jDt : 0;
    mlpHtml += `
  <div class="box-content" style="border-color: #5E35B1; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #5E35B1; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #5E35B1; text-decoration: underline;">5.1b KERUU- / JÄÄHDYTYSPIIRI (ERILLINEN)</strong>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.keruuJaahdytysPiiri, 'Erillinen keruu- / jäähdytyspiiri')}</div>
      <div>${renderCheckbox(m.keruuJaahdytysPiiriPumppu, 'Piirissä pumppu')}</div>
    </div>
    ${
      m.keruuJaahdytysPiiriPumppu &&
      (hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) ||
        hasPrintableValue(m.keruuJaahdytysPumpunMalli) ||
        hasPrintableValue(m.keruuJaahdytysPumppuTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.keruuJaahdytysPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.keruuJaahdytysPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) &&
        !hasPrintableValue(m.keruuJaahdytysPumpunMalli) &&
        hasPrintableValue(m.keruuJaahdytysPumppuTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumppuTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.keruuJaahdytysPiiriPumppu ? pumpSupplyHtmlBlock(
      m.keruuJaahdytysPumpunSyottoValinta,
      m.keruuJaahdytysPumppuKolmeVaihetta,
      m.keruuJaahdytysPumppuVirta1vaihe || '',
      m.keruuJaahdytysPumppuVirtaL1 || '',
      m.keruuJaahdytysPumppuVirtaL2 || '',
      m.keruuJaahdytysPumppuVirtaL3 || ''
    ) : ''}
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${vM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysMenoLampotila || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysPaluuLampotila || '-'}</div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Käyntivirta</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysKayntivirta || '-'}</div>
      </div>
    </div>
    ${
      keruuJaaTeho > 0
        ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Laskennallinen teho (kW, vesi c=4,18)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${keruuJaaTeho.toFixed(2)} kW</div>
      </div>
    </div>`
        : ''
    }
  </div>`;
  }

  // Latauspiiri - form style
  if (showLauhdutuspiiri && (m.latausPaineTarkastettu || m.latausPaineBar || m.latausMutapussiPuhdistettu || m.latausPumppuTarkastettu || 
      m.latausEristeetKunnossa || m.latausAutomaattinenIlmausTarkistettu ||
      m.latausVirtaus || m.latausMeno || m.latausTulo || m.latausNeste || m.latausPumpunTyyppi ||
      m.latausPumpunValmistaja || m.latausPumpunMalli ||
      m.latausPaisuntaAstiaTarkistettu)) {
    const virtausLS = parseFloat(m.latausVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.latausMeno) || 0;
    const tulo = parseFloat(m.latausTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.2 LAUHDUTUSPIRII' : '5.2 LATAUSPIRII'}</strong>
    </div>
    
    <!-- Tarkastukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.latausPaineTarkastettu, 'Paine tarkastettu')}${m.latausPaineBar ? ' (' + m.latausPaineBar + ' bar)' : ''}</div>
      <div>${renderCheckbox(m.latausMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
      <div>${renderCheckbox(m.latausPumppuTarkastettu, 'Pumppu tarkastettu')}</div>
      <div>${renderCheckbox(m.latausEristeetKunnossa, 'Eristeet kunnossa')}</div>
    </div>
    
    ${m.latausPaineBar ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Mitattu paine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausPaineBar || '-'}</div>
      </div>
    </div>` : ''}
    
    ${
      m.latausPumppuTarkastettu &&
      (hasPrintableValue(m.latausPumpunValmistaja) ||
        hasPrintableValue(m.latausPumpunMalli) ||
        hasPrintableValue(m.latausPumpunTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.latausPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.latausPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.latausPumpunValmistaja) &&
        !hasPrintableValue(m.latausPumpunMalli) &&
        hasPrintableValue(m.latausPumpunTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.latausPumppuTarkastettu ? pumpSupplyHtmlBlock(
      m.latausPumpunSyottoValinta,
      m.latausPumppuKolmeVaihetta,
      m.latausPumppuVirta1vaihe || '',
      m.latausPumppuVirtaL1 || '',
      m.latausPumppuVirtaL2 || '',
      m.latausPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${latauspiiriPower.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }
  
  // Latauspiirin tulistuspiiri - form style
  if (showLauhdutuspiiri && (m.latausTulistuspiiri || m.latausTulistuspiiriPumppu) && (m.latausTulistusVirtaus || m.latausTulistusMeno || m.latausTulistusTulo || m.latausTulistusPumppuTyyppi || m.latausTulistusPumpunValmistaja || m.latausTulistusPumpunMalli || m.latausTulistusNeste)) {
    const virtausLS = parseFloat(m.latausTulistusVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.latausTulistusMeno) || 0;
    const tulo = parseFloat(m.latausTulistusTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausTulistusNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    const power = virtausLS > 0 && deltaT > 0 && c > 0 ? c * virtausLS * deltaT : 0;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">5.2b TULISTUSPIRII</strong>
    </div>
    
    <!-- Pumppu tiedot -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Tulistuspiiri</div>
        <div>${renderCheckbox(m.latausTulistuspiiriPumppu, 'Pumppu käytössä')}</div>
      </div>
    </div>
    
    ${
      m.latausTulistuspiiriPumppu &&
      (hasPrintableValue(m.latausTulistusPumpunValmistaja) ||
        hasPrintableValue(m.latausTulistusPumpunMalli) ||
        hasPrintableValue(m.latausTulistusPumppuTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.latausTulistusPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.latausTulistusPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.latausTulistusPumpunValmistaja) &&
        !hasPrintableValue(m.latausTulistusPumpunMalli) &&
        hasPrintableValue(m.latausTulistusPumppuTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumppuTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    
    ${m.latausTulistuspiiriPumppu ? pumpSupplyHtmlBlock(
      m.latausTulistusPumpunSyottoValinta,
      m.latausTulistusPumppuKolmeVaihetta,
      m.latausTulistusPumppuVirta1vaihe || '',
      m.latausTulistusPumppuVirtaL1 || '',
      m.latausTulistusPumppuVirtaL2 || '',
      m.latausTulistusPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${power.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }
  
  // Käyttövesi - form style - only for MLP, not for Vedenjäähdytyskone
  if (laiteTyyppi !== 'Vedenjäähdytyskone' && m.kayttovesiEnabled && (m.kayttovesiTilavuus || m.kayttovesiLampotilaAsetus || m.kayttovesiLampotilaNykyinen || m.kayttovesiSahkoVastuksetEnabled)) {
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">5.3 KÄYTTÖVESI</strong>
    </div>
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Tilavuus (l)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiTilavuus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Lämpötila asetus (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiLampotilaAsetus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Nykyinen lämpötila (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiLampotilaNykyinen || '-'}</div>
      </div>
    </div>
    
    <!-- Sähkövastukset -->
    ${m.kayttovesiSahkoVastuksetEnabled && m.kayttovesiSahkoVastukset && m.kayttovesiSahkoVastukset.length > 0 ? `
    <div style="margin-bottom: 8px;">
      <div style="font-size: 12px; font-weight: bold; color: #7B1FA2; margin-bottom: 6px;">Sähkövastukset</div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 11px;">
        ${m.kayttovesiSahkoVastukset.map((v: HeatingElementData, idx: number) => `
          <div style="padding: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">
            <div style="font-weight: bold; margin-bottom: 4px;">Vastus ${idx + 1}: ${v.tunnus || '-'}</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
              <div>Teho: <strong>${v.teho || '-'} kW</strong></div>
              <div>Jännite: <strong>${v.jannite || '-'} V</strong></div>
              <div>Asetus: <strong>${v.asetusarvo || '-'} °C</strong></div>
              <div>${renderCheckbox(v.toimintaTestattu, 'Toiminta testattu')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- Laitteet -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.kayttovesiSahkoVastuksetEnabled, 'Sähkövastukset käytössä')}${m.kayttovesiSahkoVastuksetMaara ? ' (' + m.kayttovesiSahkoVastuksetMaara + ' kpl)' : ''}</div>
    <div>${renderCheckbox(m.kayttovesiToimilaitteetOK, 'Toimilaitteet kunnossa')}</div>
    <div>${renderCheckbox(m.kayttovesiKiertoEnabled, 'Kiertopumppu käytössä')}</div>
    </div>
  </div>`;
  }
  
  // Lämpöpiirit / Kiinteistön jäähdytyspiiri - form style
  if (includeKiinteistoPiirit) {
    mlpHtml += kiinteistoPiiritPrintSectionHtml(m, laiteTyyppi);
  }
  
  // Energia tehokkuus - form style
  mlpHtml += `
  <div class="box-content" style="border-color: #FF6D00; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #FF6D00; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #FF6D00; text-decoration: underline;">5.5 ENERGIATEHOKKUUS</strong>
    </div>
    
    <!-- Energian SYÖTE -->
    <div style="padding: 10px; background: #e3f2fd; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #1976D2;">
      <div style="font-size: 11px; font-weight: bold; color: #1976D2; margin-bottom: 4px;">ENERGIATASE</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 11px;">
        <div>
          <div style="color: #666;">Maaperästä/kaivosta</div>
          <div style="font-size: 14px; font-weight: bold; color: #1976D2;">${maaperastaEnergy.toFixed(2)} kW</div>
          <div style="font-size: 9px; color: #666;">${deviceOutputPower > 0 ? ((maaperastaEnergy / deviceOutputPower) * 100).toFixed(0) + '%' : '-'}</div>
        </div>
        <div>
          <div style="color: #666;">Sähköverkosta</div>
          <div style="font-size: 14px; font-weight: bold; color: #f9a825;">${kompressoriPower.toFixed(2)} kW</div>
          <div style="font-size: 9px; color: #666;">${m.mittaaKokoLaiteSahko ? '(koko laite)' : '(kompressorin 1)'}</div>
        </div>
        <div>
          <div style="color: #666;">Tuotanto yhteensä</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${deviceOutputPower.toFixed(2)} kW</div>
          ${tulistuspiiriPower > 0 ? `<div style="font-size: 9px; color: #666;">Lataus: ${latauspiiriPower.toFixed(1)} kW + Tulistus: ${tulistuspiiriPower.toFixed(1)} kW</div>` : `<div style="font-size: 9px; color: #666;">Latauspiiri: ${latauspiiriPower.toFixed(1)} kW</div>`}
        </div>
      </div>
    </div>
    
    <!-- Energian TUOTANTO -->
    <div style="padding: 10px; background: #e8f5e9; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #388E3C;">
      <div style="font-size: 11px; font-weight: bold; color: #388E3C; margin-bottom: 4px;">TUOTANTO (mitä laite työntää järjestelmään)</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 11px;">
        ${tulistuspiiriPower > 0 ? `
        <div>
          <div style="color: #666;">Tulistuspiiri (varastoon)</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${tulistuspiiriPower.toFixed(2)} kW</div>
        </div>` : ''}
        <div>
          <div style="color: #666;">Latauspiiri (varastoon/jakeluun)</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${latauspiiriPower.toFixed(2)} kW</div>
        </div>
        <div>
          <div style="color: #666;">Yhteensä tuotanto</div>
          <div style="font-size: 14px; font-weight: bold; color: #333;">${deviceOutputPower.toFixed(2)} kW</div>
        </div>
      </div>
    </div>
    
    <!-- Energian KULUTUS -->
    ${includeKiinteistoPiirit ? `
    <div style="padding: 10px; background: #f3e5f5; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #7B1FA2;">
      <div style="font-size: 11px; font-weight: bold; color: #7B1FA2; margin-bottom: 4px;">KULUTUS (mitä kiinteistö kuluttaa varaajasta - poistaa sen varaajasta)</div>
      <div style="font-size: 14px; font-weight: bold; color: #7B1FA2;">${lampoPiiritPower.toFixed(2)} kW</div>
      <div style="font-size: 10px; color: #666;">Lämmitys (varaajasta)</div>
    </div>` : ''}
    
    <!-- COP -->
    <div style="padding: 12px; background: ${copBgColor}; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid ${copBorderColor};">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11px; color: #666;">Laskennallinen COP</div>
          <div style="font-size: 24px; font-weight: bold; color: ${copTextColor};">${canCalculateCop ? cop.toFixed(2) : '-'}</div>
          <div style="font-size: 10px; color: #666;">tuotanto / sähkönkulutus</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: bold; color: ${copTextColor};">
            ${piilotaVaroitukset && !canCalculateCop ? '—' : copEfficiencyLabel}
          </div>
          <div style="font-size: 10px; color: #666;">${piilotaVaroitukset && !canCalculateCop ? '' : 'energiatehokkuus'}</div>
        </div>
      </div>
    </div>`;
  
  if (!piilotaVaroitukset && warnings.length > 0) {
    mlpHtml += `
    <div style="padding: 10px; background: #ffebee; border-radius: 4px; border-left: 4px solid #d32f2f; margin-bottom: 8px;">
      <div style="font-size: 11px; font-weight: bold; color: #d32f2f; margin-bottom: 4px;">HUOMIOITAVAA</div>
      <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #c62828;">
        ${warnings.map((w: string) => `<li style="margin-bottom: 2px;">${w}</li>`).join('')}
      </ul>
    </div>`;
  }
  
  if (suggestions.length > 0) {
    // PARANNUSEHDOTUKSIA - Removed as requested
  }
  
  if (!piilotaVaroitukset && warnings.length === 0 && cop > 0) {
    mlpHtml += `
    <div style="padding: 10px; background: #e8f5e9; border-radius: 4px; border-left: 4px solid #388E3C;">
      <div style="font-size: 11px; color: #2e7d32;">✓ Mittaukset vaikuttavat normaaleilta, ei havaittu poikkeamia</div>
    </div>`;
  }
  
  if (!piilotaVaroitukset && !canCalculateCop) {
    const missingCopMeasurements: string[] = [];
    if (m.mittaaKokoLaiteSahko) {
      const kv = getKokoLaiteSahkoVaiheValinta(m);
      if (kv === '3') {
        const missingPhases: string[] = [];
        if (!hasPrintableValue(m.kokoLaiteVirtaL1)) missingPhases.push('L1');
        if (!hasPrintableValue(m.kokoLaiteVirtaL2)) missingPhases.push('L2');
        if (!hasPrintableValue(m.kokoLaiteVirtaL3)) missingPhases.push('L3');
        if (missingPhases.length > 0) {
          missingCopMeasurements.push(`Koko laitteiston 3-vaihevirrat puuttuvat (${missingPhases.join(', ')}).`);
        }
      } else if (kv === '1') {
        if (!hasPrintableValue(m.kokoLaiteVirta1vaihe)) {
          missingCopMeasurements.push('Koko laitteiston 1-vaihevirta (A) puuttuu.');
        }
      } else {
        missingCopMeasurements.push('Sähköteholle pitää valita 1-vaihe/3-vaihe ja syöttää virrat.');
      }
    } else {
      const compCount = parseInt(String(kp1Data.kompressorienMaara ?? '')) || 1;
      for (let i = 1; i <= compCount; i++) {
        const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
        const compRaw = kp1Data[compKey];
        if (!compRaw || typeof compRaw !== 'object') {
          missingCopMeasurements.push(`Kompressori ${i}: virranmittaus puuttuu.`);
          continue;
        }
        const comp = compRaw as Partial<CompressorData>;
        const cv = getCompressorVaiheValinta(comp);
        if (cv === '1' && !hasPrintableValue(comp.virta1vaihe)) {
          missingCopMeasurements.push(`Kompressori ${i}: 1-vaihevirta (A) puuttuu.`);
        } else if (cv === '3') {
          const missingPhases: string[] = [];
          if (!hasPrintableValue(comp.virtaL1)) missingPhases.push('L1');
          if (!hasPrintableValue(comp.virtaL2)) missingPhases.push('L2');
          if (!hasPrintableValue(comp.virtaL3)) missingPhases.push('L3');
          if (missingPhases.length > 0) {
            missingCopMeasurements.push(`Kompressori ${i}: 3-vaihevirroista puuttuu ${missingPhases.join(', ')}.`);
          }
        } else {
          missingCopMeasurements.push(`Kompressori ${i}: vaihetieto tai virranmittaus puuttuu.`);
        }
      }
    }
    if (keruupiiriPower === 0) {
      const keruuMissing = getNestekiertoMissingLine('Keruupiiri', m.keruupiiriVirtaus, m.keruupiiriMeno, m.keruupiiriTulo, m.keruupiiriNeste);
      if (keruuMissing) missingCopMeasurements.push(keruuMissing);
    }
    if (latauspiiriPower === 0) {
      const latausMissing = getNestekiertoMissingLine('Jäähdytys-/latauspiiri', m.latausVirtaus, m.latausMeno, m.latausTulo, m.latausNeste);
      if (latausMissing) missingCopMeasurements.push(latausMissing);
    }
    if (showLauhdutuspiiri && m.latausTulistuspiiri && tulistuspiiriPower === 0) {
      const tulistusMissing = getNestekiertoMissingLine(
        'Lauhdutus-/tulistuspiiri',
        m.latausTulistusVirtaus,
        m.latausTulistusMeno,
        m.latausTulistusTulo,
        m.latausTulistusNeste
      );
      if (tulistusMissing) missingCopMeasurements.push(tulistusMissing);
    }
    const tulistusPiiriPuuttuuHtml = m.latausTulistuspiiri && tulistuspiiriPower === 0 ? `
      <div style="margin-top: 8px; padding: 8px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px;">
        <div style="font-size: 11px; font-weight: bold; color: #f57c00; margin-bottom: 2px;">Tulistuspiiri käytössä mutta mittaukset puuttuvat</div>
        <div style="font-size: 10px; color: #f57c00;">Tulistuspiiri edustaa tyypillisesti 5-15% kokonaislämmitystehosta. Ilman mittauksia energiatase jää vajaaksi.</div>
      </div>
    ` : '';
    
    mlpHtml += `
    <div style="padding: 10px; background: #fafafa; border-radius: 4px; border-left: 4px solid #9e9e9e;">
      <div style="font-size: 11px; font-weight: bold; color: #666; margin-bottom: 4px;">COP:N LASKEMISEKSI TARVITAAN:</div>
      <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #666;">
        ${missingCopMeasurements.length > 0 ? missingCopMeasurements.map((item) => `<li>${item}</li>`).join('') : '<li>Ei yksilöityä puutetta: tarkista mittausarvojen yksiköt ja että arvot ovat > 0.</li>'}
      </ul>
      <div style="margin-top: 6px; font-size: 10px; color: #666;">Oikea COP-laskenta vaatii sähkötehon + tuotantopiirin mittaukset. Energiataseen tarkennukseen suositellaan lisäksi keruupiirin mittaukset (virtaus, meno, paluu, neste).</div>
      ${tulistusPiiriPuuttuuHtml}
    </div>`;
  }
  
  // Subcooling (Alijäähdytys)
  if (m.kylmaaineKyllaestymisLampotila && m.kylmaaineNestePutkiLampotila) {
    const kyllaestymis = parseFloat(m.kylmaaineKyllaestymisLampotila) || 0;
    const neste = parseFloat(m.kylmaaineNestePutkiLampotila) || 0;
    const alijaahdytys = (kyllaestymis - neste).toFixed(1);
    const alijaahdytysNum = parseFloat(alijaahdytys);
    const onkoNormaali = alijaahdytysNum >= 4 && alijaahdytysNum <= 6;
    
    // Add warnings for abnormal subcooling
    if (alijaahdytysNum > 0) {
      if (alijaahdytysNum < 4) {
        warnings.push(`Alijäähdytys matala (${alijaahdytysNum} K < 4 K) - lauhdutus voi olla tehoton`);
      } else if (alijaahdytysNum > 6) {
        warnings.push(`Alijäähdytys korkea (${alijaahdytysNum} K > 6 K) - nesteen alijohtumisriski kompressoriin`);
      }
    }
    
    mlpHtml += `
  <div class="box-content" style="border-color: #0288D1; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #0288D1; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #0288D1; text-decoration: underline;">5.6 ALIJÄÄHDYTYS (SUBCOOLING)</strong>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 11px; margin-bottom: 8px;">
      <div style="padding: 8px; background: #e1f5fe; border-radius: 4px; text-align: center;">
        <div style="color: #0277BD; margin-bottom: 4px;">Kyllästymislämpötila</div>
        <div style="font-size: 16px; font-weight: bold; color: #01579B;">${m.kylmaaineKyllaestymisLampotila} °C</div>
      </div>
      <div style="padding: 8px; background: #e1f5fe; border-radius: 4px; text-align: center;">
        <div style="color: #0277BD; margin-bottom: 4px;">Nesteputken lämpötila</div>
        <div style="font-size: 16px; font-weight: bold; color: #01579B;">${m.kylmaaineNestePutkiLampotila} °C</div>
      </div>
      <div style="padding: 8px; background: ${onkoNormaali ? '#e8f5e9' : '#fffde7'}; border-radius: 4px; text-align: center;">
        <div style="color: ${onkoNormaali ? '#2E7D32' : '#F57F17'}; margin-bottom: 4px;">Alijäähdytys</div>
        <div style="font-size: 16px; font-weight: bold; color: ${onkoNormaali ? '#1B5E20' : '#E65100'};">${alijaahdytys} K</div>
      </div>
    </div>
    
    <div style="font-size: 10px; color: #666; padding: 6px; background: #f5f5f5; border-radius: 4px;">
      <strong>Kaava:</strong> Alijäähdytys = Kyllästymislämpötila − Nesteputken lämpötila<br/>
      <strong>Normaali (R-410A):</strong> +4…6 K
    </div>
  </div>`;
  }
  
  mlpHtml += `
  </div>`;
  
  return mlpHtml;
}


// Generate pure HTML for printing - NO React, NO modals, just clean HTML
export function generatePrintHTML(data: {
  isMLP: boolean;
  mlpData?: Partial<MlpData> | null;
  asiakas: string;
  asiakasYtunnus?: string;
  asiakasYhteyshenkilo?: string;
  asiakasPuhelin?: string;
  asiakasEmail?: string;
  osoite: string;
  laiteTyyppi: string;
  selectedModules?: Record<string, boolean>;
  laiteValmistaja: string;
  laiteMalli?: string;
  laiteTunnus: string;
  laiteSarjanumero: string;
  laiteSijainti: string;
  laiteKayttotarkoitus: string;
  kylmaaineTyyppi: string;
  kylmaainePiireja: string;
  kylmaaineMaaraPiiri1: string;
  kylmaaineMaaraPiiri2: string;
  kylmaaineMaaraPiiri3: string;
  kylmaaineMaaraPiiri4: string;
  kylmaaineMaaraYhteensa: string;
  kylmaaineCO2Ekv: string;
  kp1Data: Partial<RefrigerantCircuitData>;
  kp2Data: Partial<RefrigerantCircuitData>;
  kp3Data: Partial<RefrigerantCircuitData>;
  evaporatorData: EvaporatorData[];
  condenserData: CondenserData[];
  // Ulkoyksikkö tiedot
  ulkoyksikkoMalli?: string;
  ulkoyksikkoSarjanumero?: string;
  ulkoyksikkoJaahdytysTeho?: string;
  ulkoyksikkoLammitysTeho?: string;
  ulkoyksikkoAsennustapa?: string;
  ulkoyksikkoAsennustapaMuu?: string;
  ulkoyksikkoKennosPuhdas?: boolean;
  ulkoyksikkoKennoPuhdistustapa?: string;
  ulkoyksikkoSulatausVedenKeraily?: boolean;
  ulkoyksikkoSulatausVedenTarkistettu?: boolean;
  ulkoyksikkoTurvakytkin?: boolean;
  ulkoyksikkoSuojakotelo?: boolean;
  kylmaaineValmistajaMaara?: string;
  kylmaaineLisattyMaara?: string;
  kylmaainePutkimatka?: string;
  sisayksikkoMaara?: number;
  sisayksikkoData?: Array<{
    tyyppi: string;
    malli: string;
    sarjanumero: string;
    kondenssivesi: string;
    pumppuMalli: string;
    asennettu?: boolean;
    kennoPuhdas?: boolean;
    eiAania?: boolean;
    kondenssiTestattu?: boolean;
  }>;
  // Mittaukset
  mittausJaahdytysTestattu?: boolean;
  mittausLammitysTestattu?: boolean;
  mittausTestausLampotila?: string;
  mittausUlkoLampotila?: string;
  mittausSisayksikot?: Array<{
    imupaineJaahdytys: string;
    korkeapaineJaahdytys: string;
    imupaineLammitys: string;
    korkeapaineLammitys: string;
    sisalampotila: string;
    paluuLampotila: string;
    puhallusLampotila: string;
  }>;
  mittausVaiheMaara?: string;
  mittausAmpeeriL1?: string;
  mittausAmpeeriL2?: string;
  mittausAmpeeriL3?: string;
  konvektoriRows?: Array<{
    id?: string;
    tyyppi?: string;
    tunnus?: string;
    huone?: string;
    valmistaja?: string;
    malli?: string;
    sarjanumero?: string;
    tuloLampotila?: string;
    menoLampotila?: string;
    puhallusLampotila?: string;
    mitattuTeho?: string;
    suodatinPuhdistettu?: boolean | null;
    kennoPuhdistettu?: boolean | null;
    kondenssiTarkastettu?: boolean | null;
    puhallinTarkastettu?: boolean | null;
    venttiiliTarkastettu?: boolean | null;
    ohjausToimii?: boolean | null;
    huomio?: string;
    huomioTyyppi?: 'kommentti' | 'vika';
  }>;
  huomiot: string;
  /** Yleinen huomio: vika = punainen tulosteessa */
  huomiotLuonne?: 'kommentti' | 'vika';
  huomiotLiitteet?: HuomiotImageAttachment[];
  nestelauhduttimetVj?: NestelauhdutinUnitData[];
  huoltoSuorittajaNimi: string;
  huoltoSuorittajaTUKES: string;
  huoltoPaivamaara: string;
  huoltoSuoritettu: boolean;
  huoltoKylmaaineVuotoTarkastus: boolean;
  huoltoLaiteessaVika: boolean;
  piilotaVaroitukset?: boolean;
  hasAirCondenserSelected?: boolean;
  /** Ilma-/vesi-ilmalämpöpumppu: huolto vs käyttöönottopöytäkirja (otsikko ja selaimen title). */
  huoltoReportDocumentKind?: 'huolto' | 'kayttoonotto';
  companyInfo: LegacyCompanyInfo | Record<string, unknown> | null;
  tiiveyskoeData?: {
    testipaineBar?: string;
    kestoMin?: string;
    koeAlkaaPvm?: string;
    koeAlkaaKlo?: string;
    testauslampotila?: string;
    tulos?: string;
    menetelma?: string;
    huom?: string;
    todisteKuvat?: Array<string | MaintenancePrintPhoto>;
  };
  tyhjiointiData?: {
    loppupaineArvo?: string;
    loppupaineYksikko?: string;
    loppupaineMikronia?: string;
    kestoMin?: string;
    koeAlkaaPvm?: string;
    koeAlkaaKlo?: string;
    kaytettyPainemittari?: string;
    pumpunTyyppi?: string;
    huom?: string;
    todisteKuvat?: Array<string | MaintenancePrintPhoto>;
  };
}) {
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const escAttr = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');

  const huomiotLiitteetArr = data.huomiotLiitteet || [];
  const huomiotLiitteetHtml =
    huomiotLiitteetArr.length > 0
      ? `<div style="margin-top:12px;"><strong style="font-size:12px;">Liitteet</strong>${huomiotLiitteetArr
          .map((a) => {
            const displayRaw =
              (a.comment && String(a.comment).trim()) ||
              (a.fileName && String(a.fileName).trim()) ||
              'Liite';
            const display = esc(displayRaw);
            const url = String(a.url || '').trim();
            const isImg = Boolean(url) && isMaintenancePrintPhotoImage(a);
            if (isImg && url) {
              return `<div style="margin:10px 0;page-break-inside:avoid;"><div style="font-size:10pt;margin-bottom:4px;">${display}</div><img src="${escAttr(url)}" alt="" style="max-width:100%;max-height:420px;border:1px solid #ddd;border-radius:4px;display:block;" /></div>`;
            }
            if (url) {
              return `<div style="margin:10px 0;page-break-inside:avoid;"><div style="font-size:10pt;margin-bottom:4px;">${display}</div><img src="${escAttr(url)}" alt="" style="max-width:100%;max-height:420px;border:1px solid #ddd;border-radius:4px;display:block;" /></div>`;
            }
            if (displayRaw && displayRaw !== 'Liite') {
              return `<div style="margin:6px 0;font-size:10pt;color:#92400e;">${display} (kuvaa ei voitu ladata tulosteeseen)</div>`;
            }
            return '';
          })
          .join('')}</div>`
      : '';

  const sm = data.selectedModules || {};
  const docKind = data.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto';
  const docTitleFi = docKind === 'kayttoonotto' ? 'Käyttöönottopöytäkirja' : 'Huoltopöytäkirja';
  const printFileTitle = buildMaintenanceReportPrintTitle(data as HuoltoReportData);
  /** Muu + vedenjäähdytysmoduuli: sama tulostelogiikka kuin lomakkeella (showChillerCondenserInCircuit). */
  const laiteTyyppiEff =
    data.laiteTyyppi === 'Vedenjäähdytyskone' ||
    (data.laiteTyyppi === 'muu' && Boolean(sm.vedenjajahdytyskone))
      ? 'Vedenjäähdytyskone'
      : data.laiteTyyppi;
  const tv = data.tiiveyskoeData || {};
  const ty = data.tyhjiointiData || {};
  const tiiveyskoeTulosLabel =
    tv.tulos === 'hyvaksytty' ? 'Hyväksytty' : tv.tulos === 'hylatty' ? 'Hylätty' : '—';
  /** Huoltopäivä + oletuskello (resolveKoePaivamaaraJaKello) jos kellonaikaa ei ole merkitty. */
  const huoltoPvmFallback = String(data.huoltoPaivamaara || '').trim();
  const tiivRes = resolveKoePaivamaaraJaKello(
    String(tv.koeAlkaaPvm || ''),
    String(tv.koeAlkaaKlo || ''),
    huoltoPvmFallback
  );
  const tiivPvm = tiivRes.pvmIso;
  const tiivKloEff = tiivRes.klo;
  const tiiveyskoeAlku =
    tiivPvm && tiivKloEff ? `${esc(tiivPvm)} klo ${esc(tiivKloEff)}` : '';
  const tiiveyskoeLoppu =
    tiivPvm && tiivKloEff
      ? laskeKokeLoppuaikaFi(tiivPvm, tiivKloEff, tv.kestoMin || '')
      : '';
  const tyhjRes = resolveKoePaivamaaraJaKello(
    String(ty.koeAlkaaPvm || ''),
    String(ty.koeAlkaaKlo || ''),
    huoltoPvmFallback
  );
  const tyhjPvm = tyhjRes.pvmIso;
  const tyhjKloEff = tyhjRes.klo;
  const tyhjiointiAlku =
    tyhjPvm && tyhjKloEff ? `${esc(tyhjPvm)} klo ${esc(tyhjKloEff)}` : '';
  const tyhjiointiLoppu =
    tyhjPvm && tyhjKloEff
      ? laskeKokeLoppuaikaFi(tyhjPvm, tyhjKloEff, ty.kestoMin || '')
      : '';
  const tyhjiointiLoppupaineTxt = formatTyhjiointiLoppupaine(
    ty.loppupaineArvo,
    ty.loppupaineYksikko,
    ty.loppupaineMikronia
  );
  const tyhjiointiPainemittari = ty.kaytettyPainemittari || ty.pumpunTyyppi || '';

  const todisteKuvatHtml = (kuvat: unknown, kuvaOtsikko: string, reunavari: string): string => {
    if (!Array.isArray(kuvat) || kuvat.length === 0) return '';
    return kuvat
      .map((entry, i) => {
        let href = '';
        let comment = '';
        if (typeof entry === 'string') {
          href = entry.trim();
        } else if (entry && typeof entry === 'object') {
          href = String((entry as { href?: string; url?: string }).href ?? (entry as { url?: string }).url ?? '').trim();
          comment = String((entry as { comment?: string }).comment ?? '').trim();
        }
        if (!href.startsWith('data:image/') && !href.startsWith('http://') && !href.startsWith('https://')) {
          href = '';
        }
        const caption = comment || `${kuvaOtsikko} ${i + 1}`;
        if (href) {
          return `<div style="margin-top:10px;page-break-inside:avoid;"><div style="font-size:10px;color:#555;margin-bottom:4px;">${esc(
            caption,
          )}</div><img src="${escAttr(href)}" alt="" style="max-width:100%;max-height:380px;border:1px solid ${reunavari};border-radius:4px;display:block;" /></div>`;
        }
        if (comment) {
          return `<div style="margin-top:6px;font-size:10px;color:#92400e;">${esc(comment)} (kuvaa ei voitu ladata tulosteeseen)</div>`;
        }
        return '';
      })
      .join('');
  };

  const koeTekstiRivi = (label: string, val: unknown): string => {
    if (!hasPrintableValue(val)) return '';
    return `<div style="border-bottom: 1px solid #b2dfdb; padding: 2px 0;">${label}: ${esc(val)}</div>`;
  };
  const tyhjioTekstiRivi = (label: string, val: unknown): string => {
    if (!hasPrintableValue(val)) return '';
    return `<div style="border-bottom: 1px solid #81d4fa; padding: 2px 0;">${label}: ${esc(val)}</div>`;
  };

  const tiiveyskoeTulosRivi =
    tv.tulos === 'hyvaksytty' || tv.tulos === 'hylatty'
      ? `<div style="border-bottom: 1px solid #b2dfdb; padding: 2px 0;">Tulos: ${tiiveyskoeTulosLabel}</div>`
      : '';
  const tiiveyskoeAlkuRivi = tiiveyskoeAlku
    ? `<div style="border-bottom: 1px solid #b2dfdb; padding: 2px 0;">Koe alkoi (pvm + klo): ${tiiveyskoeAlku}</div>`
    : '';
  const tiiveyskoeLoppuRivi = tiiveyskoeLoppu
    ? `<div style="border-bottom: 1px solid #b2dfdb; padding: 2px 0;">Koe päättyi (laskettu): ${esc(tiiveyskoeLoppu)}</div>`
    : '';
  const tiiveyskoeHuomRivi = hasPrintableValue(tv.huom)
    ? `<div style="padding: 2px 0; white-space: pre-wrap;">Huomiot: ${formatHuomioPrintHtml(tv.huom, esc)}</div>`
    : '';

  const tiiveyskoeSisalto = [
    koeTekstiRivi('Koepaine (bar)', tv.testipaineBar),
    tiiveyskoeAlkuRivi,
    koeTekstiRivi('Kesto (min)', tv.kestoMin),
    tiiveyskoeLoppuRivi,
    koeTekstiRivi('Testauslämpötila (°C)', tv.testauslampotila),
    tiiveyskoeTulosRivi,
    koeTekstiRivi('Menetelmä / väline', tv.menetelma),
    tiiveyskoeHuomRivi,
  ]
    .filter(Boolean)
    .join('');
  const tiiveyskoeKuvatHtmlOsio = todisteKuvatHtml(
    tv.todisteKuvat,
    'Tiiveyskoe — kuvatodiste',
    '#b2dfdb'
  );
  const tiiveyskoeOsioHtml =
    usesRefrigerantServiceExtras(data.laiteTyyppi) &&
    sm.tiiveyskoe &&
    (tiiveyskoeSisalto.trim() || tiiveyskoeKuvatHtmlOsio)
      ? `
  <div class="box-content" style="border-color: #00695C; page-break-inside: avoid; margin-top: 10px;">
    <div style="border-bottom: 2px solid #00695C; padding-bottom: 2px; margin-bottom: 4px;">
      <strong style="font-size: 14px; color: #00695C;">TIIVEYSKOE</strong>
    </div>
    <div style="font-size: 11px; line-height: 1.45;">
      ${tiiveyskoeSisalto}
      ${tiiveyskoeKuvatHtmlOsio}
    </div>
  </div>
  `
      : '';

  const tyhjiointiAlkuRivi = tyhjiointiAlku
    ? `<div style="border-bottom: 1px solid #81d4fa; padding: 2px 0;">Koe alkoi (pvm + klo): ${tyhjiointiAlku}</div>`
    : '';
  const tyhjiointiLoppuRivi = tyhjiointiLoppu
    ? `<div style="border-bottom: 1px solid #81d4fa; padding: 2px 0;">Koe päättyi (laskettu): ${esc(tyhjiointiLoppu)}</div>`
    : '';
  const tyhjiointiLoppupaineRivi = hasPrintableValue(tyhjiointiLoppupaineTxt)
    ? `<div style="border-bottom: 1px solid #81d4fa; padding: 2px 0;">Loppupaine: ${esc(tyhjiointiLoppupaineTxt)}</div>`
    : '';
  const tyhjiointiMittariRivi = hasPrintableValue(tyhjiointiPainemittari)
    ? `<div style="border-bottom: 1px solid #81d4fa; padding: 2px 0;">Käytetty painemittari: ${esc(tyhjiointiPainemittari)}</div>`
    : '';
  const tyhjiointiHuomRivi = hasPrintableValue(ty.huom)
    ? `<div style="padding: 2px 0; white-space: pre-wrap;">Huomiot: ${formatHuomioPrintHtml(ty.huom, esc)}</div>`
    : '';

  const tyhjiointiSisalto = [
    tyhjiointiLoppupaineRivi,
    tyhjiointiAlkuRivi,
    tyhjioTekstiRivi('Kesto (min)', ty.kestoMin),
    tyhjiointiLoppuRivi,
    tyhjiointiMittariRivi,
    tyhjiointiHuomRivi,
  ]
    .filter(Boolean)
    .join('');
  const tyhjiointiKuvatHtmlOsio = todisteKuvatHtml(
    ty.todisteKuvat,
    'Tyhjiöinti — kuvatodiste',
    '#81d4fa'
  );
  const tyhjiointiOsioHtml =
    usesRefrigerantServiceExtras(data.laiteTyyppi) &&
    sm.tyhjiointi &&
    (tyhjiointiSisalto.trim() || tyhjiointiKuvatHtmlOsio)
      ? `
  <div class="box-content" style="border-color: #0277BD; page-break-inside: avoid; margin-top: 10px;">
    <div style="border-bottom: 2px solid #0277BD; padding-bottom: 2px; margin-bottom: 4px;">
      <strong style="font-size: 14px; color: #0277BD;">TYHJIÖINTI</strong>
    </div>
    <div style="font-size: 11px; line-height: 1.45;">
      ${tyhjiointiSisalto}
      ${tyhjiointiKuvatHtmlOsio}
    </div>
  </div>
  `
      : '';

  /** Vain eksplisiittinen kyllä/ei; täyttämätön (undefined) = ei merkkiä (ei "tyhjää ruksia") */
  const renderCheck = (checked: boolean | undefined) => {
    if (checked === true) {
      return `<span style="color: #16a34a; font-weight: bold;">✓</span>`;
    }
    if (checked === false) {
      return `<span style="color: #dc2626; font-weight: bold;">✗</span>`;
    }
    return '';
  };

  /** Konvektoritaulukko: pienet merkit; sarakkeet 4–5 px leveät */
  const renderCheckKonv = (checked: boolean | null | undefined) => {
    if (checked === true) {
      return `<span style="color:#16a34a;font-weight:700;font-size:7px;line-height:1;">✓</span>`;
    }
    if (checked === false) {
      return `<span style="color:#dc2626;font-weight:700;font-size:7px;line-height:1;">✗</span>`;
    }
    return `<span style="color:#9ca3af;font-size:7px;">–</span>`;
  };

  /**
   * Pystyotsikko: kirjain riviä kohden (toimii kaikissa PDF/print-moottoreissa toisin kuin writing-mode).
   * Sarake pysyy kapeana (~4–5px + reunus).
   */
  const konvThVertical = (stack: string, fullTitle: string) => {
    const br = stack
      .split('')
      .map((ch) => esc(ch))
      .join('<br/>');
    return `<th title="${escAttr(fullTitle)}" style="border:1px solid #ccc;padding:1px 0;width:4px;min-width:4px;max-width:5px;vertical-align:middle;text-align:center;font-size:4.5px;line-height:0.95;font-weight:700;color:#222;">${br}</th>`;
  };
  
  const buildLegacyCircuitWarnings = (
    kpData: Partial<RefrigerantCircuitData> | null | undefined,
  ): string[] => {
    if (!kpData || data.laiteTyyppi === 'lämpöpumppu') return [];
    const warnings: string[] = [];
    const ref = data.kylmaaineTyyppi || '';

    if (circuitSuperheatPrintEnabled(kpData as RefrigerantCircuitData)) {
      const imp = parseFloat(kpData.imupaine || '') || 0;
      const tmp = parseFloat(kpData.imuLampotila || '') || 0;
      if (imp > 0 && ref) {
        const sh = calculateSuperheatFromMeasurements(imp, tmp, ref);
        if (sh != null) {
          if (sh < 3) {
            warnings.push(
              `Tulistus matala (${sh.toFixed(1)} K < 3 K) - nestepisarat voivat päätyä kompressoriin`,
            );
          } else if (sh > 15) {
            warnings.push(`Tulistus korkea (${sh.toFixed(1)} K > 15 K) - tehokkuuden lasku`);
          }
        }
      }
    }

    if (circuitSubcoolingPrintEnabled(kpData as RefrigerantCircuitData)) {
      const hp = parseFloat(kpData.korkeapaine || '') || 0;
      const lp = parseFloat(kpData.nestePutkiLampotila || '') || 0;
      if (hp > 0 && ref) {
        const sc = calculateSubcoolingFromMeasurements(hp, lp, ref);
        if (sc != null) {
          if (sc < 3) {
            warnings.push(
              `Alijäähdytys matala (${sc.toFixed(1)} K < 3 K) - lauhdutus voi olla tehoton`,
            );
          } else if (sc > 10) {
            warnings.push(
              `Alijäähdytys korkea (${sc.toFixed(1)} K > 10 K) - nesteen alijohtumisriski`,
            );
          }
        }
      }
    }

    return warnings;
  };

  const kylmaainepiiriWarnings: string[] = isKonvektoritDevice(data.laiteTyyppi)
    ? []
    : [
        ...buildLegacyCircuitWarnings(data.kp1Data),
        ...(data.kylmaainePiireja !== '1' ? buildLegacyCircuitWarnings(data.kp2Data) : []),
        ...(data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4'
          ? buildLegacyCircuitWarnings(data.kp3Data)
          : []),
      ];

  const logoSrc = String(
    (data.companyInfo as LegacyCompanyInfo | null)?.logoBase64 ?? '',
  ).trim();
  const logoOnlyHtml = logoSrc ? `
    <img src="${escAttr(logoSrc)}" alt="Logo" style="max-height: 52px; max-width: 170px; width: auto; display: inline-block; vertical-align: middle;" />
  ` : '';
  const printSubtitle = [data.companyInfo?.name || '', data.asiakas || '', (() => {
    if (data.laiteTyyppi === 'konvektorit') {
      const koide = konvektoriVerkostoKoideFromReport(data);
      return koide.kuvaus || koide.alue || koide.tunnus || '';
    }
    return data.laiteTunnus || '';
  })()]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' – ');
  const printDate =
    String((data as { paiva?: unknown }).paiva || data.huoltoPaivamaara || '').trim() ||
    new Date().toLocaleDateString('fi-FI');
  
  const companyInfoBoxHtml = data.companyInfo?.name ? `
    <div class="box-content" style="border-color: #9E9E9E; page-break-inside: avoid; break-inside: avoid;">
      <div style="border-bottom: 2px solid #9E9E9E; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 18px; color: #616161; text-decoration: underline;">YRITYSTIEDOT</strong>
      </div>
      <div style="border-bottom: 1px solid #9E9E9E; padding: 2px 0; font-size: 11px;">${data.companyInfo.name}</div>
      <div style="border-bottom: 1px solid #9E9E9E; padding: 2px 0; font-size: 11px;">Y-tunnus: ${data.companyInfo.businessId || '-'}</div>
      <div style="border-bottom: 1px solid #9E9E9E; padding: 2px 0; font-size: 11px;">${data.companyInfo.address || '-'}</div>
      <div style="border-bottom: 1px solid #9E9E9E; padding: 2px 0; font-size: 11px;">Puh: ${data.companyInfo.phone || '-'}</div>
      <div style="padding: 2px 0; font-size: 11px;">${data.companyInfo.email || '-'}</div>
    </div>
  ` : '';

  const customerInfoBoxHtml = (() => {
    // Kerää asiakastiedot
    const customerRows: string[] = [];
    
    if (data.asiakas) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;"><strong>${data.asiakas}</strong></div>`);
    }
    if (data.asiakasYtunnus) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;">${data.asiakasYtunnus}</div>`);
    }
    if (data.asiakasYhteyshenkilo) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;">${data.asiakasYhteyshenkilo}</div>`);
    }
    if (data.asiakasPuhelin) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;">${data.asiakasPuhelin}</div>`);
    }
    if (data.asiakasEmail) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;">${data.asiakasEmail}</div>`);
    }
    if (data.osoite) {
      customerRows.push(`<div style="border-bottom: 1px solid #1976D2; padding: 2px 0; font-size: 11px;">${data.osoite}</div>`);
    }
    
    // Jos ei ole yhtään tietoa, älä näytä boxia
    if (customerRows.length === 0) {
      return '';
    }
    
    return `
    <div class="box-content" style="border-color: #1976D2; page-break-inside: avoid; break-inside: avoid;">
      <div style="border-bottom: 2px solid #1976D2; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 18px; color: #1976D2; text-decoration: underline;">ASIAKASTIEDOT</strong>
      </div>
      ${customerRows.join('\n')}
    </div>
  `;
  })();

  const deviceInfoBoxHtml = data.laiteTyyppi === 'konvektorit' ? '' : `
    <div class="box-content" style="border-color: #388E3C; page-break-inside: avoid; break-inside: avoid;">
      <div style="border-bottom: 2px solid #388E3C; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 18px; color: #388E3C; text-decoration: underline;">LAITETIEDOT</strong>
      </div>
      <div style="border-bottom: 1px solid #388E3C; padding: 2px 0; font-size: 11px;">${data.laiteTyyppi || '-'} ${data.laiteValmistaja || ''}</div>
      <div style="border-bottom: 1px solid #388E3C; padding: 2px 0; font-size: 11px;">${data.laiteMalli || '-'}</div>
      <div style="border-bottom: 1px solid #388E3C; padding: 2px 0; font-size: 11px;">${data.laiteTunnus || '-'}</div>
      <div style="border-bottom: 1px solid #388E3C; padding: 2px 0; font-size: 11px;">${data.laiteSijainti || '-'}</div>
      <div style="border-bottom: 1px solid #388E3C; padding: 2px 0; font-size: 11px;">${data.laiteSarjanumero || '-'}</div>
      <div style="padding: 2px 0; font-size: 11px;">${data.laiteKayttotarkoitus || '-'}</div>
    </div>
  `;

  // Build refrigerant circuit rows based on number of circuits
  /** Sama logiikka kuin buildPrintDocument (HuoltoRaporttiPage): vain yksi piiri → grammat; useampi → kg / piiri. */
  const circuitRows: string[] = [];
  const gwp = getRefrigerantGWP(data.kylmaaineTyyppi);
  const piirejaStr = String(data.kylmaainePiireja ?? '').trim();
  const useSingleCircuitGrams = piirejaStr === '1' || piirejaStr === '';
  const hasRefrigerantKind = data.laiteTyyppi === 'lämpöpumppu' || Boolean(data.kylmaaineTyyppi);

  const pushCo2Line = (tonnes: number) => {
    if (tonnes > 0) {
      circuitRows.push(`<div style="padding: 2px 0; font-size: 11px;">CO₂-ekvivalentti: ${tonnes.toFixed(3)} t</div>`);
    }
  };

  if (hasRefrigerantKind && useSingleCircuitGrams) {
    // Yhden piirin kentät syötetään UI:ssa grammoina (lämpöpumppu, VJK 1 piiri, …)
    const valmistajaG = parseFloat(data.kylmaaineValmistajaMaara) || 0;
    const lisattyG = parseFloat(data.kylmaaineLisattyMaara) || 0;
    const totalG = valmistajaG + lisattyG;
    const totalKg = totalG / 1000;
    const co2Tonnes = gwp > 0 && totalKg > 0 ? (totalKg * gwp) / 1000 : 0;

    if (valmistajaG > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Valmistajan kylmäaine määrä: ${valmistajaG.toFixed(0)} g</div>`);
    }
    if (lisattyG > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Lisätty kylmäaine määrä: ${lisattyG.toFixed(0)} g</div>`);
    }
    if (data.kylmaainePutkimatka) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Putkimatka: ${data.kylmaainePutkimatka} m</div>`);
    }
    if (hasPrintableValue(data.kylmaainePiireja) && String(data.kylmaainePiireja) !== '0') {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Piirejä: ${esc(data.kylmaainePiireja)}</div>`);
    }
    if (totalG > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px; font-weight: bold;">Kylmäaineen määrä yhteensä: ${totalG.toFixed(0)} g</div>`);
    }
    pushCo2Line(co2Tonnes);
  } else if (piirejaStr !== '0' && piirejaStr !== '') {
    // Useampi piiri (esim. vedenjäähdytyskone): määrät kg / piiri — ei voi jättää ensimmäiseen haaraan (grammat 0 → CO₂ puuttui)
    const totalKg = parseFloat(String(data.kylmaaineMaaraYhteensa).replace(',', '.')) || 0;
    const co2Tonnes = gwp > 0 && totalKg > 0 ? (totalKg * gwp) / 1000 : 0;

    if (data.kylmaaineMaaraPiiri1 && parseFloat(String(data.kylmaaineMaaraPiiri1).replace(',', '.')) > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Piiri 1: ${data.kylmaaineMaaraPiiri1} kg</div>`);
    }
    if (data.kylmaainePiireja !== '1' && data.kylmaaineMaaraPiiri2 && parseFloat(String(data.kylmaaineMaaraPiiri2).replace(',', '.')) > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Piiri 2: ${data.kylmaaineMaaraPiiri2} kg</div>`);
    }
    if ((data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4') && data.kylmaaineMaaraPiiri3 && parseFloat(String(data.kylmaaineMaaraPiiri3).replace(',', '.')) > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Piiri 3: ${data.kylmaaineMaaraPiiri3} kg</div>`);
    }
    if (data.kylmaainePiireja === '4' && data.kylmaaineMaaraPiiri4 && parseFloat(String(data.kylmaaineMaaraPiiri4).replace(',', '.')) > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Piiri 4: ${data.kylmaaineMaaraPiiri4} kg</div>`);
    }
    if (data.kylmaaineMaaraYhteensa && parseFloat(String(data.kylmaaineMaaraYhteensa).replace(',', '.')) > 0) {
      circuitRows.push(`<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px; font-weight: bold;">Yhteensä: ${data.kylmaaineMaaraYhteensa} kg</div>`);
    }
    pushCo2Line(co2Tonnes);
  }

  const co2SavedT = parseFloat(String(data.kylmaaineCO2Ekv ?? '').replace(',', '.')) || 0;
  const alreadyHasCo2 = circuitRows.some((row) => row.includes('CO₂-ekvivalentti'));
  if (!alreadyHasCo2 && co2SavedT > 0) {
    pushCo2Line(co2SavedT);
  }

  const hasRefrigerantData =
    !isKonvektoritDevice(data.laiteTyyppi) &&
    (hasPrintableValue(data.kylmaaineTyyppi) ||
      circuitRows.length > 0 ||
      (hasPrintableValue(data.kylmaaineMaaraYhteensa) &&
        Number(String(data.kylmaaineMaaraYhteensa).replace(',', '.')) > 0) ||
      (hasPrintableValue(data.kylmaaineCO2Ekv) && co2SavedT > 0));
  const refrigerantInfoBoxHtml = hasRefrigerantData
    ? `
    <div class="box-content" style="border-color: #FF6D00; page-break-inside: avoid; break-inside: avoid;">
      <div style="border-bottom: 2px solid #FF6D00; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 18px; color: #FF6D00; text-decoration: underline;">KYLMÄAINE</strong>
      </div>
      ${hasPrintableValue(data.kylmaaineTyyppi) ? `<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">Tyyppi: ${data.kylmaaineTyyppi}</div>` : ''}
      ${gwp > 0 ? `<div style="border-bottom: 1px solid #FF6D00; padding: 2px 0; font-size: 11px;">GWP: ${gwp}</div>` : ''}
      ${circuitRows.join('\n')}
    </div>
  `
    : '';

  // Generate ulkoyksikkö HTML (lämpöpumppu / ilmalämpöpumppu tai Muu + ulkoyksikkö-moduuli)
  const ulkoyksikkoHtml =
    data.laiteTyyppi === 'lämpöpumppu' || (data.laiteTyyppi === 'muu' && Boolean(sm.ulkoyksikko))
      ? (() => {
    const asennustapaLabel = data.ulkoyksikkoAsennustapa === 'maateline' ? 'Maateline' :
      data.ulkoyksikkoAsennustapa === 'seinateline' ? 'Seinäteline' :
      data.ulkoyksikkoAsennustapa === 'sokkeliteline' ? 'Sokkeliteline' :
      data.ulkoyksikkoAsennustapa === 'parveketeline' ? 'Parveketeline' :
      data.ulkoyksikkoAsennustapa === 'muu' ? (data.ulkoyksikkoAsennustapaMuu || 'Muu') : '';

    const ulkoRivi = (label: string, val: unknown, bottomBorder = true): string => {
      if (!hasPrintableValue(val)) return '';
      const bb = bottomBorder ? 'border-bottom: 1px solid #E64A19; ' : '';
      return `<div style="${bb}padding: 2px 0; font-size: 11px;">${label}: ${esc(val)}</div>`;
    };
    const ulkoRuksi = (checked: boolean | undefined, label: string, bottomBorder = true): string => {
      if (checked !== true && checked !== false) return '';
      const mark =
        checked === true
          ? '<span style="color: #16a34a; font-weight: bold;">✓</span>'
          : '<span style="color: #dc2626; font-weight: bold;">✗</span>';
      const bb = bottomBorder ? 'border-bottom: 1px solid #E64A19; ' : '';
      return `<div style="${bb}padding: 2px 0; font-size: 11px;">${mark} ${esc(label)}</div>`;
    };

    const tehoJ = hasPrintableValue(data.ulkoyksikkoJaahdytysTeho)
      ? `<div style="border-bottom: 1px solid #E64A19; padding: 2px 0; font-size: 11px;">Nimellis jäähdytys teho: ${esc(data.ulkoyksikkoJaahdytysTeho)} kW</div>`
      : '';
    const tehoL = hasPrintableValue(data.ulkoyksikkoLammitysTeho)
      ? `<div style="border-bottom: 1px solid #E64A19; padding: 2px 0; font-size: 11px;">Nimellis lämmitys teho: ${esc(data.ulkoyksikkoLammitysTeho)} kW</div>`
      : '';
    const asennus = hasPrintableValue(asennustapaLabel)
      ? `<div style="border-bottom: 1px solid #E64A19; padding: 2px 0; font-size: 11px;">Asennustapa: ${esc(asennustapaLabel)}</div>`
      : '';

    const ulkoMittSolu = (label: string, val: unknown, yks: string) =>
      hasPrintableValue(val)
        ? `<div style="border-bottom: 1px solid #E64A19; padding: 2px 0; font-size: 11px;">${label}: ${esc(String(val).trim())} ${yks}</div>`
        : '';
    const ulkoSyotto = hasPrintableValue(data.mittausVaiheMaara)
      ? `<div style="border-bottom: 1px solid #E64A19; padding: 2px 0; font-size: 11px;">Syötön tyyppi: ${data.mittausVaiheMaara === '3' ? '3-vaiheinen' : '1-vaiheinen'}</div>`
      : '';
    let ulkoVirta = '';
    if (data.mittausVaiheMaara === '3') {
      const l1 = ulkoMittSolu('L1', data.mittausAmpeeriL1, 'A');
      const l2 = ulkoMittSolu('L2', data.mittausAmpeeriL2, 'A');
      const l3 = ulkoMittSolu('L3', data.mittausAmpeeriL3, 'A');
      ulkoVirta = [l1, l2, l3].filter(Boolean).join('');
    } else {
      ulkoVirta = ulkoMittSolu('Virta', data.mittausAmpeeriL1, 'A');
    }

    return `
    <div class="box-content" style="border-color: #E64A19; page-break-inside: avoid; break-inside: avoid;">
      <div style="border-bottom: 2px solid #E64A19; padding-bottom: 2px; margin-bottom: 4px;">
        <strong style="font-size: 18px; color: #E64A19; text-decoration: underline;">ULKOYKSIKKÖ</strong>
      </div>
      ${ulkoRivi('Malli', data.ulkoyksikkoMalli)}
      ${ulkoRivi('Sarjanumero', data.ulkoyksikkoSarjanumero)}
      ${tehoJ}
      ${tehoL}
      ${asennus}
      ${ulkoRuksi(data.ulkoyksikkoKennosPuhdas, 'Kenno puhdistettu tai puhdas')}
      ${data.ulkoyksikkoKennosPuhdas === true && hasPrintableValue(data.ulkoyksikkoKennoPuhdistustapa) ? ulkoRivi('Kennon puhdistustapa', data.ulkoyksikkoKennoPuhdistustapa) : ''}
      ${ulkoRuksi(data.ulkoyksikkoSulatausVedenKeraily, 'Ulkoyksiköllä sulatusveden keräily/ohjaus')}
      ${data.ulkoyksikkoSulatausVedenKeraily === true ? ulkoRuksi(data.ulkoyksikkoSulatausVedenTarkistettu, 'Sulatusveden keräily tarkistettu/kunnossa') : ''}
      ${ulkoRuksi(data.ulkoyksikkoTurvakytkin, 'Ulkoyksikön vieressä turvakytkin')}
      ${ulkoRuksi(data.ulkoyksikkoSuojakotelo, 'Ulkoyksiköllä suojakotelo')}
      ${ulkoSyotto}
      ${ulkoVirta}
    </div>
  `;
      })()
      : '';

  // Generate measurements HTML for refrigerant circuits
  const measurementsHtml = (() => {
    if (isKonvektoritDevice(data.laiteTyyppi)) return '';
    // Helper function to calculate superheat for a circuit
    const calcSuperheat = (kpData: Partial<RefrigerantCircuitData> | null | undefined) => {
      if (!kpData) return '-';
      const imp = parseFloat(kpData.imupaine) || 0;
      const tmp = parseFloat(kpData.imuLampotila) || 0;
      if (imp > 0 && data.kylmaaineTyyppi) {
        const sh = calculateSuperheatFromMeasurements(imp, tmp, data.kylmaaineTyyppi);
        if (sh != null) return sh.toFixed(1);
      }
      return '-';
    };

    // Helper function to calculate subcooling for a circuit
    const calcSubcooling = (kpData: Partial<RefrigerantCircuitData> | null | undefined) => {
      if (!kpData) return '-';
      const hp = parseFloat(kpData.korkeapaine) || 0;
      const lp = parseFloat(kpData.nestePutkiLampotila) || 0;
      if (hp > 0 && data.kylmaaineTyyppi) {
        const sc = calculateSubcoolingFromMeasurements(hp, lp, data.kylmaaineTyyppi);
        if (sc != null) return sc.toFixed(1);
      }
      return '-';
    };

    const renderCheck = (val: boolean | undefined, label: string) => {
      if (val !== true && val !== false) return '';
      const mark =
        val === true
          ? '<span style="color: #16a34a; font-weight: bold;">✓</span>'
          : '<span style="color: #dc2626; font-weight: bold;">✗</span>';
      return `${mark} ${label}`;
    };

    // Helper function to render field value
    const renderVal = (val: unknown) => {
      if (!hasPrintableValue(val)) return '';
      return normalizePrintText(val);
    };

    // Generate circuit measurements box - form style layout
    const generateCircuitBox = (circuitNum: number, kpData: Partial<RefrigerantCircuitData> | null | undefined) => {
      if (!kpData) return '';

      const printSuperheat = circuitSuperheatPrintEnabled(kpData as RefrigerantCircuitData);
      const printSubcooling = circuitSubcoolingPrintEnabled(kpData as RefrigerantCircuitData);
      const superheat = printSuperheat ? calcSuperheat(kpData) : '';
      const subcooling = printSubcooling ? calcSubcooling(kpData) : '';
      const circuitLabel = circuitNum === 1 ? 'Kylmäainepiiri 1' : circuitNum === 2 ? 'Kylmäainepiiri 2' : 'Kylmäainepiiri 3';

      const paineSolu = (title: string, val: unknown) =>
        hasPrintableValue(val)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">${title}</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${renderVal(val)}</div>
      </div>`
          : '';

      const lampoSolu = (title: string, val: unknown) =>
        hasPrintableValue(val)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">${title}</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${renderVal(val)}</div>
      </div>`
          : '';

      // Get compressors for this circuit
      let compressorsHtml = '';
      const compCount = parseInt(kpData.kompressorienMaara || '') || 1;
      for (let i = 1; i <= compCount; i++) {
        const compKey = 'kompressori' + i;
        const compRaw = kpData[compKey as keyof RefrigerantCircuitData];
        if (!compRaw || typeof compRaw !== 'object') continue;
        const comp = compRaw as Partial<CompressorData>;

        const valmSolu = hasPrintableValue(comp.valmistaja)
          ? `<div>
                <div style="color: #666; margin-bottom: 2px;">Valmistaja</div>
                <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${renderVal(comp.valmistaja)}</div>
              </div>`
          : '';
        const malliSolu = hasPrintableValue(comp.malli)
          ? `<div>
                <div style="color: #666; margin-bottom: 2px;">Malli</div>
                <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${renderVal(comp.malli)}</div>
              </div>`
          : '';
        const tyyppiVanha =
          !valmSolu && !malliSolu && hasPrintableValue(comp.tyyppi)
            ? `<div>
                <div style="color: #666; margin-bottom: 2px;">Tyyppi (vanha)</div>
                <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${renderVal(comp.tyyppi)}</div>
              </div>`
            : '';
        const ohjaSolu = hasPrintableValue(comp.ohjaustapa)
          ? `<div>
                <div style="color: #666; margin-bottom: 2px;">Ohjaustapa</div>
                <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${renderVal(comp.ohjaustapa)}</div>
              </div>`
          : '';
        const tyypitRow =
          valmSolu || malliSolu || tyyppiVanha || ohjaSolu
            ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 6px; font-size: 11px;">${valmSolu}${malliSolu}${tyyppiVanha}${ohjaSolu}</div>`
            : '';

        const o1 = renderCheck(comp.oljyMaaraOikea, 'Öljy määrä oikea');
        const o2 = renderCheck(comp.oljyKirkas, 'Öljy kirkas');
        const oilRow =
          o1 || o2
            ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 6px; font-size: 11px;">${o1 ? `<div>${o1}</div>` : ''}${
                o2 ? `<div>${o2}</div>` : ''
              }</div>`
            : '';

        const compVaihe = getCompressorVaiheValinta(comp);
        const vaiheRivi =
          compVaihe === '1' || compVaihe === '3'
            ? `<div style="margin-bottom: 6px; font-size: 11px;"><span style="color:#666;">Kompressorin syöttö:</span> <strong>${
                compVaihe === '3' ? '3-vaiheinen' : '1-vaiheinen'
              }</strong></div>`
            : '';

        let virtaRivi = '';
        let warningHtml = '';
        if (compVaihe === '1' && hasPrintableValue(comp.virta1vaihe)) {
          virtaRivi = `<div style="display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 11px;">
            <div>
              <div style="color: #666; margin-bottom: 2px;">Ampeeri kulutus (A)</div>
              <div style="padding: 6px; background: #e8f5e9; border: 1px solid #66bb6a; border-radius: 4px; text-align: center; font-weight: bold;">${renderVal(comp.virta1vaihe)}</div>
            </div></div>`;
        } else if (compVaihe === '3') {
          const virtaL1n = hasPrintableValue(comp.virtaL1);
          const virtaL2n = hasPrintableValue(comp.virtaL2);
          const virtaL3n = hasPrintableValue(comp.virtaL3);
          const num1 = parseFloat(String(comp.virtaL1 ?? '')) || 0;
          const num2 = parseFloat(String(comp.virtaL2 ?? '')) || 0;
          const num3 = parseFloat(String(comp.virtaL3 ?? '')) || 0;
          const avgVirta = (num1 + num2 + num3) / 3;
          const deviations = [Math.abs(num1 - avgVirta), Math.abs(num2 - avgVirta), Math.abs(num3 - avgVirta)];
          const maxDev = avgVirta > 0 ? (Math.max(...deviations) / avgVirta) * 100 : 0;
          const compressorBgColor = maxDev > 10 ? '#ffebee' : maxDev > 5 ? '#fffde7' : '#e8f5e9';
          const compressorBorderColor = maxDev > 10 ? '#ef5350' : maxDev > 5 ? '#ffa726' : '#66bb6a';
          const v1 = virtaL1n
            ? `<div>
                <div style="color: #666; margin-bottom: 2px;">L1 (A)</div>
                <div style="padding: 6px; background: ${compressorBgColor}; border: 1px solid ${compressorBorderColor}; border-radius: 4px; text-align: center; font-weight: bold;">${renderVal(comp.virtaL1)}</div>
              </div>`
            : '';
          const v2 = virtaL2n
            ? `<div>
                <div style="color: #666; margin-bottom: 2px;">L2 (A)</div>
                <div style="padding: 6px; background: ${compressorBgColor}; border: 1px solid ${compressorBorderColor}; border-radius: 4px; text-align: center; font-weight: bold;">${renderVal(comp.virtaL2)}</div>
              </div>`
            : '';
          const v3 = virtaL3n
            ? `<div>
                <div style="color: #666; margin-bottom: 2px;">L3 (A)</div>
                <div style="padding: 6px; background: ${compressorBgColor}; border: 1px solid ${compressorBorderColor}; border-radius: 4px; text-align: center; font-weight: bold;">${renderVal(comp.virtaL3)}</div>
              </div>`
            : '';
          virtaRivi =
            v1 || v2 || v3
              ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">${v1}${v2}${v3}</div>`
              : '';
          if (maxDev > 5 && virtaL1n && virtaL2n && virtaL3n) {
            const warningBgColor = maxDev > 10 ? '#ffebee' : '#fffde7';
            const warningTextColor = maxDev > 10 ? '#c62828' : '#e65100';
            const warningMessage =
              maxDev > 10 ? 'VAARA: Vaihe-epätasapaino ' + maxDev.toFixed(1) + '%' : 'Huom: Vaihe-epätasapaino ' + maxDev.toFixed(1) + '%';
            warningHtml = `
            <div style="margin-top: 6px; padding: 4px; background: ${warningBgColor}; border-radius: 4px; font-size: 10px; color: ${warningTextColor}; text-align: center;">
              ${warningMessage}
            </div>`;
          }
        }

        const compInner = `${tyypitRow}${oilRow}${vaiheRivi}${virtaRivi}${warningHtml}`;
        if (!compInner.trim()) continue;

        compressorsHtml += `
          <div style="margin-top: 6px; padding: 8px; background: #fafafa; border-radius: 4px; border: 1px solid #e0e0e0;">
            <div style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 6px;">Kompressori ${i}</div>
            ${compInner}
          </div>`;
      }

      const mag1 = renderCheck(kpData.magneettiventtiiliTestattu, 'Magneettiventtiili testattu');
      const mag2 = renderCheck(kpData.nestelasiKuiva, 'Nestelasi kuiva');
      const magCol =
        mag1 || mag2
          ? `<div>${mag1 ? `<div>${mag1}</div>` : ''}${mag2 ? `<div>${mag2}</div>` : ''}</div>`
          : '';

      const ohjaHtml = hasPrintableValue(kpData.ohjaustapa)
        ? `<div><div style="color: #666;">Ohjaustapa: ${renderVal(kpData.ohjaustapa)}</div></div>`
        : '';
      const paisuntaHtml = hasPrintableValue(kpData.paisuntaventtiiliTyyppi)
        ? `<div><div style="color: #666;">Paisuntaventtiili</div><div>${renderVal(kpData.paisuntaventtiiliTyyppi)}</div></div>`
        : '';
      const paisuntaValHtml = paineSolu('Paisuntaventtiilin valmistaja', kpData.paisuntaventtiiliValmistaja);
      const paisuntaMalliHtml = paineSolu('Paisuntaventtiilin malli', kpData.paisuntaventtiiliMalli);
      const magValHtml = paineSolu('Magneettiventtiilin valmistaja', kpData.magneettiventtiiliValmistaja);
      const magMalliHtml = paineSolu('Magneettiventtiilin malli', kpData.magneettiventtiiliMalli);
      const kompMaaraHtml = hasPrintableValue(kpData.kompressorienMaara)
        ? `<div><div style="color: #666;">Kompressoreita</div><div>${kpData.kompressorienMaara}</div></div>`
        : '';

      const paineRivit = [paineSolu('Imupaine (bar)', kpData.imupaine), paineSolu('Korkeapaine (bar)', kpData.korkeapaine)]
        .filter(Boolean)
        .join('');
      const lampoRivit = [
        lampoSolu('Imu lämpötila (°C)', kpData.imuLampotila),
        lampoSolu('Nesteputki (°C)', kpData.nestePutkiLampotila),
        lampoSolu('Kuumakaasu (°C)', kpData.kuumakaasuLampotila),
      ]
        .filter(Boolean)
        .join('');

      const tulistusLaatikko =
        printSuperheat && hasPrintableValue(superheat)
          ? `<div style="padding: 8px; background: #e8f5e9; border-radius: 4px; border-left: 4px solid #4caf50;">
        <div style="color: #388E3C; margin-bottom: 4px;">Tulistus (K)</div>
        <div style="font-size: 18px; font-weight: bold; color: #1B5E20;">${superheat}</div>
      </div>`
          : '';
      const alijaahtLaatikko =
        printSubcooling && hasPrintableValue(subcooling)
          ? `<div style="padding: 8px; background: #e8f5e9; border-radius: 4px; border-left: 4px solid #4caf50;">
        <div style="color: #388E3C; margin-bottom: 4px;">Alijäähdytys (K)</div>
        <div style="font-size: 18px; font-weight: bold; color: #1B5E20;">${subcooling}</div>
      </div>`
          : '';
      const lasketutRivi =
        tulistusLaatikko || alijaahtLaatikko
          ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">${tulistusLaatikko}${alijaahtLaatikko}</div>`
          : '';

      const superheatNum = parseFloat(String(superheat));
      const subcoolingNum = parseFloat(String(subcooling));
      const superheatOk =
        printSuperheat &&
        hasPrintableValue(superheat) &&
        !Number.isNaN(superheatNum) &&
        superheatNum >= 3 &&
        superheatNum <= 15;
      const subcoolingOk =
        printSubcooling &&
        hasPrintableValue(subcooling) &&
        !Number.isNaN(subcoolingNum) &&
        subcoolingNum >= 3 &&
        subcoolingNum <= 10;
      const showCircuitNormalMessage =
        (printSuperheat || printSubcooling) &&
        (!printSuperheat || superheatOk) &&
        (!printSubcooling || subcoolingOk) &&
        (superheatOk || subcoolingOk);

      const perustiedotInner = [
        ohjaHtml,
        paisuntaHtml,
        paisuntaValHtml,
        paisuntaMalliHtml,
        kompMaaraHtml,
        magCol,
        magValHtml,
        magMalliHtml,
      ]
        .filter(Boolean)
        .join('');
      const perustiedotBlokki = perustiedotInner
        ? `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 6px; font-size: 11px;">${perustiedotInner}</div>`
        : '';

      const kuivR = renderCheck(kpData.kuivainOK, 'Kuivain kunnossa');
      const kuivTxt = hasPrintableValue(kpData.kuivainLisatieto)
        ? `<span style="margin-left: 12px;">${renderVal(kpData.kuivainLisatieto)}</span>`
        : '';
      const kuivKiintoHtml = [
        paineSolu('Kuivaimen valmistaja', kpData.kuivainValmistaja),
        paineSolu('Kuivaimen malli', kpData.kuivainMalli),
        paineSolu('Kuivaimen kivien määrä', kpData.kuivainKivienMaara),
      ]
        .filter(Boolean)
        .join('');
      const kuivainBlokki =
        kuivR || kuivTxt || kuivKiintoHtml
          ? `<div style="padding: 4px; background: #fff3e0; border-radius: 4px; font-size: 11px;">
        ${kuivR}${kuivTxt}
        ${kuivKiintoHtml ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; font-size: 11px;">${kuivKiintoHtml}</div>` : ''}
      </div>`
          : '';

      return `
  <div class="box-content" style="border-color: #E64A19; margin-top: 8px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #E64A19; padding-bottom: 2px; margin-bottom: 4px;">
      <strong style="font-size: 18px; color: #E64A19; text-decoration: underline;">${circuitLabel} MITTAUKSET</strong>
    </div>

    <!-- Perustiedot -->
    ${perustiedotBlokki}

    <!-- Paine mittaukset -->
    ${paineRivit ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">${paineRivit}</div>` : ''}

    <!-- Lämpötila mittaukset -->
    ${lampoRivit ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">${lampoRivit}</div>` : ''}

    <!-- Lasketut -->
    ${lasketutRivi}
    ${showCircuitNormalMessage ? `
    <div style="margin-bottom: 8px; padding: 8px; background: #c8e6c9; border-radius: 4px; font-size: 12px; font-weight: bold; color: #2e7d32; text-align: center;">
      Kylmäainepiiri toimii oikein.${superheatOk ? ` Tulistus ${superheat} K.` : ''}${subcoolingOk ? ` Alijäähdytys ${subcooling} K.` : ''}
    </div>` : ''}

    <!-- Kompressorit -->
    ${
      compressorsHtml.trim()
        ? `<div style="margin-bottom: 8px;">
      <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #E64A19;">KOMPRESSORIT</div>
      ${compressorsHtml}
    </div>`
        : ''
    }

    <!-- Kuivain -->
    ${kuivainBlokki}
  </div>`;
    };

    let resultHtml = '';
    resultHtml += generateCircuitBox(1, data.kp1Data);
    if (data.kylmaainePiireja !== '1') {
      resultHtml += generateCircuitBox(2, data.kp2Data);
    }
    if (data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4') {
      resultHtml += generateCircuitBox(3, data.kp3Data);
    }
    return resultHtml;
  })();

  return withDemoPrintBootstrap(`<!DOCTYPE html>
<html>
<head>
  <title>${esc(printFileTitle)}</title>
  <style>
    :root { --text:#111827; --muted:#6b7280; --border:#e5e7eb; --soft:#f9fafb; --accent:#F0810F; --accent-strong:#D97706; }
    body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: var(--text); margin: 0; padding: 0 2mm; background: linear-gradient(180deg, #f3f4f6 0%, #eceef1 100%); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { margin: 0; font-size: 18pt; }
    h2 { font-size: 13pt; margin: 12px 0 6px 0; border-bottom: 1px solid #999; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    th, td { padding: 3px 4px; border: 1px solid #999; text-align: left; background: #fff; }
    th { background: #f0f0f0; font-size: 9pt; }
    .header-row { display:grid; grid-template-columns: 55mm 1fr 55mm; align-items: start; border-bottom: 4px dashed var(--accent-strong); padding-bottom: 4mm; margin-bottom: 8px; }
    .h-left { display:flex; align-items:center; justify-content:flex-start; min-height: 20mm; }
    .h-center { text-align:center; }
    .h-right { text-align:right; color: var(--muted); font-size: 10pt; }
    .subtitle { margin-top: 1mm; color: var(--muted); font-size: 10.5pt; }
    .badge { display:inline-block; margin-top: 2mm; padding: 1.5mm 3mm; border-radius: 999px; border:1px solid var(--border); background: var(--soft); font-size: 9.5pt; }
    .date-row { margin-bottom: 8px; }
    .divider { display:none; }
    .content-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: stretch; justify-content: space-between; }
    .content-row-full { display: flex; gap: 10px; align-items: stretch; justify-content: space-between; }
    .column-box { width: calc(50% - 5px); display: flex; flex-direction: column; }
    .box-content { border: 0 !important; padding: 0; border-radius: 0; text-align: left; width: 100%; height: 100%; box-sizing: border-box; box-shadow: none; background: transparent; page-break-inside: auto !important; break-inside: auto !important; }
    /* Piilota borders tyhjistä sisällöstä - ylikirjoita inline-tyylit */
    .box-content[style*="border-color"] { border-color: #ccc !important; }
    .box-content:has(div:empty), .box-content:has(div div:empty) { border: none !important; padding: 0 !important; }
    .footer { border-top: 1px solid #ccc; padding-top: 8px; margin-top: 15px; font-size: 9pt; color: #666; page-break-inside: auto; }
    .info-section { page-break-inside: auto; break-inside: auto; }
    .page-break-after { page-break-after: auto; break-after: auto; }
    @page { margin: 14mm; size: A4 portrait; }
    @media print { body { padding: 0; } button { display: none; } }
    /* Piilota tyhjät boxit */
    .box-content:empty { display: none !important; }
    ${RICH_COMMENT_PRINT_CSS}
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      function normalizeText(text) {
        return (text || '').replace(/\\s+/g, ' ').trim();
      }
      function isPlaceholderText(text) {
        var s = normalizeText(text);
        if (!s) return true;
        if (/[✓✗]/.test(s)) return false;
        if (s === '-' || s === '—' || s === '–') return true;
        if (/^[-–—]\\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\\/h)?$/i.test(s)) return true;
        if (/:\\s*[-–—](\\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\\/h))?$/i.test(s)) return true;
        if (/[-–—](\\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\\/h))?$/i.test(s) && !/[0-9a-zäöå]/i.test(s.replace(/[-–—]/g, ''))) return true;
        if (/^(Tyyppi|Valmistaja|Malli|Sarjanumero|Ohjaustapa|Imupaine \\(bar\\)|Korkeapaine \\(bar\\)|Imu lämpötila \\(°C\\)|Nesteputki \\(°C\\)|Kuumakaasu \\(°C\\)|Tulistus \\(K\\)|Alijäähdytys \\(K\\)|L1 \\(A\\)|L2 \\(A\\)|L3 \\(A\\)|Mitattu virta|Virta|Puhdistustapa|Talvivarustuksen toteutustapa|Painesäätimen malli/koko|Virtausongelma|Lämpötila testauksen aikana|Ulkolämpötila|Sisä|Paluu|Puhallus|Imu \\(J\\)|KP \\(J\\)|Imu \\(L\\)|KP \\(L\\))\\s*:?$/i.test(s)) return true;
        return false;
      }
      function prune(node) {
        Array.from(node.children || []).forEach(function(child) { prune(child); });
        if (!node.children.length) {
          if (isPlaceholderText(node.textContent)) node.remove();
          return;
        }
        var text = normalizeText(node.textContent);
        var hasMeaningfulChild = Array.from(node.children).some(function(child) {
          return normalizeText(child.textContent) !== '';
        });
        if (!hasMeaningfulChild && isPlaceholderText(text)) node.remove();
      }
      document.querySelectorAll('.box-content, table, .content-row, .content-row-full, .column-box').forEach(function(node) { prune(node); });
      document.querySelectorAll('.box-content').forEach(function(box) {
        var text = normalizeText(box.textContent);
        if (!text || isPlaceholderText(text)) box.style.display = 'none';
      });
    });
  </script>
</head>
<body>
  <div class="header-row">
    <div class="h-left">${logoOnlyHtml || ''}</div>
    <div class="h-center">
      <h1>${docTitleFi}</h1>
      ${printSubtitle ? `<div class="subtitle">${esc(printSubtitle)}</div>` : ''}
    </div>
    <div class="h-right">
      <div>Päiväys: <strong>${esc(printDate)}</strong></div>
    </div>
  </div>
  
  <div class="divider"></div>
  
  <div class="content-row">
    <div class="column-box">
      ${companyInfoBoxHtml}
    </div>
    <div class="column-box">
      ${customerInfoBoxHtml}
    </div>
  </div>

  ${deviceInfoBoxHtml || refrigerantInfoBoxHtml ? `
  <div class="content-row-full">
    ${deviceInfoBoxHtml ? `<div class="column-box" style="${refrigerantInfoBoxHtml ? 'width: calc(50% - 5px);' : 'width: 100%;'}">
      ${deviceInfoBoxHtml}
    </div>` : ''}
    ${refrigerantInfoBoxHtml ? `<div class="column-box" style="width: calc(50% - 5px);">${refrigerantInfoBoxHtml}</div>` : ''}
  </div>
  ` : ''}

  ${ulkoyksikkoHtml}

  ${data.laiteTyyppi === 'lämpöpumppu' && data.sisayksikkoData && data.sisayksikkoData.length > 0
    ? generateSisayksikotGridPrintHtml(data.sisayksikkoData, data.mittausSisayksikot, esc, {
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        unitCount: data.sisayksikkoMaara ?? data.sisayksikkoData.length,
        testInfo: {
          jaahdytysTestattu: data.mittausJaahdytysTestattu,
          lammitysTestattu: data.mittausLammitysTestattu,
          testausLampotila: data.mittausTestausLampotila,
          ulkoLampotila: data.mittausUlkoLampotila,
        },
      })
    : ''}

  ${data.laiteTyyppi !== 'lämpöpumppu' && !isKonvektoritDevice(data.laiteTyyppi) && data.kylmaainePiireja !== '0' ? measurementsHtml : ''}

  ${(data.laiteTyyppi === 'kylmäkoneikko' || data.laiteTyyppi === 'pakastin') && data.evaporatorData && data.evaporatorData.length > 0 ? generateEvaporatorPrintHtml(data.evaporatorData, data.laiteTyyppi === 'kylmäkoneikko' ? 'hoyrystin' : 'piiri') : ''}

  ${(data.laiteTyyppi === 'kylmäkoneikko' || data.laiteTyyppi === 'pakastin' || laiteTyyppiEff === 'Vedenjäähdytyskone') && data.condenserData && data.condenserData.length > 0 ? generateCondenserPrintHtml(data.condenserData, laiteTyyppiEff) : ''}

  ${data.laiteTyyppi !== 'konvektorit' && data.laiteTyyppi !== 'lämpöpumppu' && Array.isArray(data.nestelauhduttimetVj) && data.nestelauhduttimetVj.length > 0 ? generateNestelauhduttimetVjPrintHtml(data.nestelauhduttimetVj) : ''}

  ${(data.isMLP || laiteTyyppiEff === 'Vedenjäähdytyskone') && data.mlpData
    ? generateMLPPrintHtml(
        data.mlpData as MlpData,
        data.kp1Data as RefrigerantCircuitData,
        laiteTyyppiEff,
        Array.isArray(data.condenserData)
          && data.condenserData.some((c: CondenserData) => c?.tyyppi === 'koneseen_integroitu' || c?.tyyppi === 'erillinen_ilma'),
        hideMaintenancePrintWarnings(data),
      )
    : ''}

  ${!hideMaintenancePrintWarnings(data) && kylmaainepiiriWarnings.length > 0 ? `
  <div class="box-content" style="border-color: #d32f2f; margin-top: 12px; page-break-inside: avoid;">
    <div style="border-bottom: 2px solid #d32f2f; padding-bottom: 2px; margin-bottom: 4px;">
      <strong style="font-size: 14px; color: #d32f2f;">HUOMIOITAVAA - KYLMÄAINEPIRII</strong>
    </div>
    <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #c62828;">
      ${kylmaainepiiriWarnings.map((w: string) => `<li style="margin-bottom: 4px;">${w}</li>`).join('')}
    </ul>
  </div>
  ` : ''}


  ${(data.laiteTyyppi === 'konvektorit' && data.konvektoriRows && data.konvektoriRows.length > 0)
    ? generateKonvektoritGridPrintHtml(data.konvektoriRows, esc, {
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        escAttr,
        verkosto: konvektoriVerkostoKoideFromReport(data),
      })
    : ''}

  ${tiiveyskoeOsioHtml}

  ${tyhjiointiOsioHtml}

  ${data.huomiot || huomiotLiitteetArr.length ? `
  <div class="box-content" style="border-color: #7B1FA2; page-break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 2px; margin-bottom: 4px;">
      <strong style="font-size: 14px; color: #7B1FA2;">HUOMIOT JA LISÄTIEDOT</strong>
    </div>
    ${data.huomiot ? (data.huomiotLuonne === 'vika' ? `<div style="white-space: pre-wrap; font-size: 11pt; margin: 0; color: #b91c1c;">${formatHuomioPrintHtml(data.huomiot, esc)}</div>` : `<div style="white-space: pre-wrap; font-size: 11pt; margin: 0;">${formatHuomioPrintHtml(data.huomiot, esc)}</div>`) : ''}
    ${huomiotLiitteetHtml}
  </div>
  ` : ''}
  
  <div class="footer">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <p style="margin: 0;"><strong>Suorittaja:</strong> ${data.huoltoSuorittajaNimi || '-'}
         ${data.huoltoSuorittajaTUKES ? `| TUKES: ${data.huoltoSuorittajaTUKES}` : ''}</p>
      <p style="margin: 0;"><strong>Päivämäärä:</strong> ${data.huoltoPaivamaara || '-'}</p>
    </div>
  </div>
  
  <button onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; font-size: 14px; cursor: pointer;">
    Tulosta / Tallenna PDF
  </button>
</body>
</html>`);
}
