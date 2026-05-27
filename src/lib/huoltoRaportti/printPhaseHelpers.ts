import type { CompressorData, CondenserFanData, PumpunSyottoValinta } from './types';
import { getCompressorVaiheValinta, getCondenserFanVaiheValinta, getMlpPumpSyottoValinta } from './sahkoVaiheUtils';
import { calculatePhaseImbalance } from './utils';

export function normalizePrintText(val: unknown): string {
  if (val == null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

export function hasPrintableValue(val: unknown): boolean {
  const s = normalizePrintText(val);
  if (!s || s === '-' || s === '—' || s === '–') return false;
  return !/^[-–—]\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\/h)?$/i.test(s);
}

export function getPhaseWarning(
  virtaL1: number,
  virtaL2: number,
  virtaL3: number,
  phase: number,
): { bgColor: string; borderColor: string; warningText: string; maxDev: number } {
  let bgColor = '#e0f7fa';
  let borderColor = '#00838F';
  let warningText = '';
  let maxDev = 0;

  if (phase === 3) {
    maxDev = calculatePhaseImbalance(virtaL1, virtaL2, virtaL3);
    if (maxDev > 10) {
      bgColor = '#ffebee';
      borderColor = '#d32f2f';
      warningText = `<div style="margin-top:4px;padding:4px;background:#ffebee;border-radius:4px;font-size:10px;color:#c62828;font-weight:bold;">VAARA: Vaihe-epätasapaino ${maxDev.toFixed(1)}%</div>`;
    } else if (maxDev > 5) {
      bgColor = '#fffde7';
      borderColor = '#ffa000';
      warningText = `<div style="margin-top:4px;padding:4px;background:#fffde7;border-radius:4px;font-size:10px;color:#e65100;">Huom: Vaihe-epätasapaino ${maxDev.toFixed(1)}%</div>`;
    }
  }

  return { bgColor, borderColor, warningText, maxDev };
}

/** Pumpun syöttö: vain jos 230_1/400_3 valittu; virrat vain täytetyt kentät */
export function pumpSupplyHtmlBlock(
  syottoValinta: PumpunSyottoValinta | undefined,
  legacyKolme: boolean | undefined,
  virta1vaihe: string,
  virtaL1: string,
  virtaL2: string,
  virtaL3: string,
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
        const imb = calculatePhaseImbalance(parseFloat(virtaL1) || 0, parseFloat(virtaL2) || 0, parseFloat(virtaL3) || 0);
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
    <div style="margin-bottom:8px;padding:8px;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;font-size:11px;">
      <div style="font-weight:bold;margin-bottom:4px;color:#333;">Pumpun syöttö</div>
      <div style="margin-bottom:6px;"><span style="color:#666;">Syöttö:</span> <strong>${syottoLabel}</strong></div>
      ${virtaRivi}
      ${imbWarn}
    </div>`;
}

export type FanPhaseCardTheme = 'condenser' | 'evaporator';

export function renderFanPhaseCardHtml(
  fan: Partial<CondenserFanData>,
  index: number,
  theme: FanPhaseCardTheme,
  syotto?: '230' | '400',
): string {
  const vv = getCondenserFanVaiheValinta(fan, syotto);
  if (vv !== '1' && vv !== '3') return '';

  const l1p = hasPrintableValue(fan.virtaL1);
  const l2p = hasPrintableValue(fan.virtaL2);
  const l3p = hasPrintableValue(fan.virtaL3);
  const n1 = parseFloat(String(fan.virtaL1 ?? '')) || 0;
  const n2 = parseFloat(String(fan.virtaL2 ?? '')) || 0;
  const n3 = parseFloat(String(fan.virtaL3 ?? '')) || 0;
  const imbOk = vv === '3' && l1p && l2p && l3p;
  const defaults =
    theme === 'condenser'
      ? { bgColor: '#fff3e0', borderColor: '#ff9800', titleColor: '#e65100' }
      : { bgColor: '#e0f7fa', borderColor: '#00838F', titleColor: '#006064' };
  const { bgColor, borderColor, warningText } = imbOk
    ? getPhaseWarning(n1, n2, n3, 3)
    : { ...defaults, warningText: '' };

  let virtaText = '';
  if (vv === '1' && l1p) virtaText = `${normalizePrintText(fan.virtaL1)} A`;
  else if (vv === '3') {
    const parts: string[] = [];
    if (l1p) parts.push(`L1: ${normalizePrintText(fan.virtaL1)} A`);
    if (l2p) parts.push(`L2: ${normalizePrintText(fan.virtaL2)} A`);
    if (l3p) parts.push(`L3: ${normalizePrintText(fan.virtaL3)} A`);
    if (parts.length) virtaText = parts.join(', ');
  }

  const janniteNaytto = fan.jannite === '400' ? '400' : '230';
  const phaseLabel = vv === '3' ? '3-vaihe' : '1-vaihe';
  if (!virtaText && !warningText) return '';

  return `
    <div style="padding:8px;background:${bgColor};border-radius:4px;border-left:3px solid ${borderColor};">
      <div style="font-size:11px;font-weight:bold;color:${defaults.titleColor};margin-bottom:4px;">Puhallin ${index}</div>
      <div style="font-size:10px;color:#666;">${janniteNaytto} V • ${phaseLabel}</div>
      ${virtaText ? `<div style="font-size:10px;color:#333;margin-top:4px;">${virtaText}</div>` : ''}
      ${warningText}
    </div>`;
}

export function renderCompressorCurrentHtml(comp: Partial<CompressorData>): string {
  const vv = getCompressorVaiheValinta(comp);
  const syotto =
    vv === '1' || vv === '3'
      ? `<div style="margin:4px 0;font-size:11px;">Syöttö: <strong>${vv === '3' ? '3-vaiheinen' : '1-vaiheinen'}</strong></div>`
      : '';

  if (vv === '1' && hasPrintableValue(comp.virta1vaihe)) {
    return `${syotto}<div style="display:grid;grid-template-columns:1fr;gap:8px;font-size:11px;">
      <div><div style="color:#666;margin-bottom:2px;">Ampeeri (A)</div>
      <div style="padding:6px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:4px;text-align:center;font-weight:bold;">${normalizePrintText(comp.virta1vaihe)}</div></div></div>`;
  }

  if (vv !== '3') return syotto;

  const l1p = hasPrintableValue(comp.virtaL1);
  const l2p = hasPrintableValue(comp.virtaL2);
  const l3p = hasPrintableValue(comp.virtaL3);
  const n1 = parseFloat(String(comp.virtaL1 ?? '')) || 0;
  const n2 = parseFloat(String(comp.virtaL2 ?? '')) || 0;
  const n3 = parseFloat(String(comp.virtaL3 ?? '')) || 0;
  const { bgColor, borderColor, warningText, maxDev } =
    l1p && l2p && l3p ? getPhaseWarning(n1, n2, n3, 3) : { bgColor: '#e8f5e9', borderColor: '#66bb6a', warningText: '', maxDev: 0 };

  const cell = (label: string, val: string | undefined, show: boolean) =>
    show
      ? `<div><div style="color:#666;margin-bottom:2px;">${label}</div>
      <div style="padding:6px;background:${bgColor};border:1px solid ${borderColor};border-radius:4px;text-align:center;font-weight:bold;">${normalizePrintText(val)}</div></div>`
      : '';

  const virtaRivi = [cell('L1 (A)', comp.virtaL1, l1p), cell('L2 (A)', comp.virtaL2, l2p), cell('L3 (A)', comp.virtaL3, l3p)]
    .filter(Boolean)
    .join('');
  if (!virtaRivi && !syotto) return '';

  let warningHtml = warningText;
  if (!warningHtml && maxDev > 5 && l1p && l2p && l3p) {
    const warningBgColor = maxDev > 10 ? '#ffebee' : '#fffde7';
    const warningTextColor = maxDev > 10 ? '#c62828' : '#e65100';
    const warningMessage =
      maxDev > 10
        ? `VAARA: Vaihe-epätasapaino ${maxDev.toFixed(1)}%`
        : `Huom: Vaihe-epätasapaino ${maxDev.toFixed(1)}%`;
    warningHtml = `<div style="margin-top:6px;padding:4px;background:${warningBgColor};border-radius:4px;font-size:10px;color:${warningTextColor};text-align:center;">${warningMessage}</div>`;
  }

  return `${syotto}${virtaRivi ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;">${virtaRivi}</div>` : ''}${warningHtml}`;
}
