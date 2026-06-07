import type { KonvektoriRowData } from './types';
import {
  coolingPowerFromEnthalpyKw,
  moistAirEnthalpyDeltaKjPerKg,
  volumeFlowFromEnthalpyM3h,
} from './psychrometrics';

/** c_p kJ/(kg·K); vesipiirillä P(kW) ≈ c_p × V(l/s) × ΔT (°C) */
const JAAHDYTYSNESTE_CP: Record<string, number> = {
  vesi: 4.18,
  etyleeniglykoli_20: 3.65,
  etyleeniglykoli_30: 3.45,
  etyleeniglykoli_40: 3.25,
  propyleeniglykoli_20: 3.55,
  propyleeniglykoli_30: 3.35,
  propyleeniglykoli_40: 3.15,
};

/** Ilman näyttöhyöty: P ≈ 1,206 × V(m³/h) / 3600 × |ΔT| */
const AIR_SENSIBLE_FACTOR = 1.206;

const LATENT_MIN_KW = 0.05;
const SENSIBLE_AGREE_PCT = 15;

export function parseKonvektoriNumeric(value: unknown): number | null {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatKw(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} kW`;
}

function formatM3h(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString('fi-FI', { maximumFractionDigits: 0 });
}

function formatLs(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('fi-FI', { maximumFractionDigits: 3 });
}

function formatPct(value: number): string {
  return `${Math.round(value)} %`;
}

export type KonvektoriLaskettuTeho = {
  tehoKw: number;
  mode: 'jaahdytys' | 'lammitys';
  method?: 'vesi' | 'ilma' | 'ilma_enthalpy' | 'mitattu';
};

export type KonvektoriIlmaEntalpiaEro = {
  totalKw: number;
  sensibleKw: number;
  latentKw: number;
  mode: 'jaahdytys' | 'lammitys';
};

function tehoModeFromDelta(delta: number): KonvektoriLaskettuTeho['mode'] {
  return delta > 0 ? 'jaahdytys' : 'lammitys';
}

export function isKonvektoriIlmaLaskentaMode(row: KonvektoriRowData): boolean {
  return row.ilmaTehoMittaus === 'laskenta';
}

function airRhOk(temp: number | null, rh: number | null): boolean {
  return temp != null && rh != null && rh >= 0 && rh <= 100;
}

/** Paluu- ja menoveden lämpötilat vaaditaan laskentariveihin */
export function konvektoriVesiLampotilatOk(row: KonvektoriRowData): boolean {
  const tulo = parseKonvektoriNumeric(row.tuloLampotila);
  const meno = parseKonvektoriNumeric(row.menoLampotila);
  return tulo != null && meno != null && Math.abs(meno - tulo) >= 0.01;
}

function waterDeltaT(row: KonvektoriRowData): number | null {
  if (!konvektoriVesiLampotilatOk(row)) return null;
  const tulo = parseKonvektoriNumeric(row.tuloLampotila)!;
  const meno = parseKonvektoriNumeric(row.menoLampotila)!;
  return Math.abs(meno - tulo);
}

function nesteCp(row: KonvektoriRowData): number | null {
  const neste = String(row.jaahdytysNeste ?? '').trim();
  if (!neste || neste === 'muu') return null;
  return JAAHDYTYSNESTE_CP[neste] ?? null;
}

/** Laskee vesipiirin teho kW kun virtaus ja lämpötilat tiedossa */
export function calculateKonvektoriVesipiirinTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const cp = nesteCp(row);
  if (cp == null) return null;

  const virtaus = parseKonvektoriNumeric(row.virtausLs);
  const deltaT = waterDeltaT(row);
  if (virtaus == null || virtaus <= 0 || deltaT == null) return null;

  const tehoKw = cp * virtaus * deltaT;
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  const tulo = parseKonvektoriNumeric(row.tuloLampotila)!;
  const meno = parseKonvektoriNumeric(row.menoLampotila)!;
  return {
    tehoKw,
    mode: tehoModeFromDelta(meno - tulo),
    method: 'vesi',
  };
}

/** Ilmapuolen näyttöhyöty kun virtaus ja lämpötilat tiedossa */
export function calculateKonvektoriIlmapuolenTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const virtausM3h = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  if (huone == null || puhallus == null || virtausM3h == null || virtausM3h <= 0) return null;

  const deltaT = Math.abs(huone - puhallus);
  if (deltaT < 0.01) return null;

  const tehoKw = AIR_SENSIBLE_FACTOR * (virtausM3h / 3600) * deltaT;
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  return {
    tehoKw,
    mode: tehoModeFromDelta(huone - puhallus),
    method: 'ilma',
  };
}

/** Kokonais-, näyttöhyöty- ja latenttiteho T+RH-laskennalla */
export function calculateKonvektoriIlmaEntalpiaEro(row: KonvektoriRowData): KonvektoriIlmaEntalpiaEro | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const huoneRh = parseKonvektoriNumeric(row.huoneKosteusRh);
  const puhRh = parseKonvektoriNumeric(row.puhallusKosteusRh);
  const virtausM3h = parseKonvektoriNumeric(row.ilmanVirtausM3h);

  if (!airRhOk(huone, huoneRh) || !airRhOk(puhallus, puhRh) || virtausM3h == null || virtausM3h <= 0) {
    return null;
  }

  const enthalpyDelta = moistAirEnthalpyDeltaKjPerKg(huone!, huoneRh!, puhallus!, puhRh!);
  if (enthalpyDelta == null || Math.abs(enthalpyDelta) < 0.01) return null;

  const totalKw = coolingPowerFromEnthalpyKw(virtausM3h, enthalpyDelta);
  if (totalKw == null) return null;

  const deltaT = Math.abs(huone! - puhallus!);
  const sensibleKw = deltaT >= 0.01
    ? AIR_SENSIBLE_FACTOR * (virtausM3h / 3600) * deltaT
    : 0;

  const latentKw = totalKw > sensibleKw + LATENT_MIN_KW ? totalKw - sensibleKw : 0;

  return {
    totalKw,
    sensibleKw,
    latentKw,
    mode: tehoModeFromDelta(enthalpyDelta),
  };
}

/** Arvioi ilmavirtaus m³/h näyttöhyödystä ja ilman lämpötiloista */
export function estimateKonvektoriIlmanVirtausM3h(
  row: KonvektoriRowData,
  tehoKw: number,
): number | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  if (huone == null || puhallus == null || tehoKw <= 0) return null;

  const deltaT = Math.abs(huone - puhallus);
  if (deltaT < 0.01) return null;

  const virtausM3h = (tehoKw * 3600) / (AIR_SENSIBLE_FACTOR * deltaT);
  if (!Number.isFinite(virtausM3h) || virtausM3h <= 0) return null;
  return virtausM3h;
}

/** Arvioi ilmavirtaus m³/h entalpiasta (T+RH) */
export function estimateKonvektoriIlmanVirtausFromEnthalpy(row: KonvektoriRowData, tehoKw: number): number | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const huoneRh = parseKonvektoriNumeric(row.huoneKosteusRh);
  const puhRh = parseKonvektoriNumeric(row.puhallusKosteusRh);
  if (!airRhOk(huone, huoneRh) || !airRhOk(puhallus, puhRh) || tehoKw <= 0) return null;

  const enthalpyDelta = moistAirEnthalpyDeltaKjPerKg(huone!, huoneRh!, puhallus!, puhRh!);
  if (enthalpyDelta == null || Math.abs(enthalpyDelta) < 0.01) return null;
  return volumeFlowFromEnthalpyM3h(tehoKw, enthalpyDelta);
}

/** Arvioi vesivirtaus l/s tehosta ja veden lämpötilaerosta */
export function estimateKonvektoriVesivirtausLs(
  row: KonvektoriRowData,
  tehoKw: number,
): number | null {
  const cp = nesteCp(row);
  const deltaT = waterDeltaT(row);
  if (cp == null || deltaT == null || tehoKw <= 0) return null;

  const virtausLs = tehoKw / (cp * deltaT);
  if (!Number.isFinite(virtausLs) || virtausLs <= 0) return null;
  return virtausLs;
}

function sensibleReferenceKw(
  ves: KonvektoriLaskettuTeho | null,
  ilm: KonvektoriLaskettuTeho | null,
  entalpia: KonvektoriIlmaEntalpiaEro | null,
): number | null {
  if (entalpia) return entalpia.sensibleKw;
  if (ves && ilm) return (ves.tehoKw + ilm.tehoKw) / 2;
  if (ves) return ves.tehoKw;
  if (ilm) return ilm.tehoKw;
  return null;
}

function latentFromMitattu(mitattu: number, sensibleKw: number | null): number | null {
  if (sensibleKw == null || mitattu <= sensibleKw + LATENT_MIN_KW) return null;
  return mitattu - sensibleKw;
}

function sensibleMethodsAgree(ves: KonvektoriLaskettuTeho | null, ilm: KonvektoriLaskettuTeho | null): boolean {
  if (!ves || !ilm) return false;
  const ero = Math.abs(ves.tehoKw - ilm.tehoKw);
  const ref = Math.max(ves.tehoKw, ilm.tehoKw);
  return ref > 0 && (ero / ref) * 100 <= SENSIBLE_AGREE_PCT;
}

function primaryAirTotalKw(
  row: KonvektoriRowData,
  entalpia: KonvektoriIlmaEntalpiaEro | null,
  mitattu: number | null,
): number | null {
  if (isKonvektoriIlmaLaskentaMode(row) && entalpia) return entalpia.totalKw;
  if (mitattu != null && mitattu > 0) return mitattu;
  return entalpia?.totalKw ?? null;
}

export function resolveKonvektoriTehoKw(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const entalpia = isKonvektoriIlmaLaskentaMode(row) ? calculateKonvektoriIlmaEntalpiaEro(row) : null;
  if (entalpia) {
    return { tehoKw: entalpia.totalKw, mode: entalpia.mode, method: 'ilma_enthalpy' };
  }

  const manual = parseKonvektoriNumeric(row.mitattuTeho);
  if (manual != null && manual > 0) {
    const huone = parseKonvektoriNumeric(row.huoneLampotila);
    const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
    if (huone != null && puhallus != null && Math.abs(huone - puhallus) >= 0.01) {
      return { tehoKw: manual, mode: tehoModeFromDelta(huone - puhallus), method: 'mitattu' };
    }
    return { tehoKw: manual, mode: 'jaahdytys', method: 'mitattu' };
  }

  const ves = calculateKonvektoriVesipiirinTeho(row);
  if (ves) return ves;

  return calculateKonvektoriIlmapuolenTeho(row);
}

function tehoLine(result: KonvektoriLaskettuTeho, prefix: string): string {
  if (result.method === 'mitattu') {
    return `${prefix}Mittari: kokonaisteho (entalpia, kosteus mukana) ${formatKw(result.tehoKw)}`.trim();
  }
  if (result.method === 'ilma_enthalpy') {
    return `${prefix}Ilma: kokonaisteho (laskettu T+RH) ${formatKw(result.tehoKw)}`.trim();
  }
  if (result.method === 'vesi') {
    return `${prefix}Vesi: näyttöhyöty (ΔT × virtaus) ${formatKw(result.tehoKw)}`.trim();
  }
  return `${prefix}Ilma: näyttöhyöty (ΔT × virtaus) ${formatKw(result.tehoKw)}`.trim();
}

export function formatKonvektoriLaskettuTeho(result: KonvektoriLaskettuTeho | null, prefix = ''): string {
  if (!result) return '';
  return tehoLine(result, prefix);
}

function appendLatentLine(lines: string[], latentKw: number, totalKw: number): void {
  if (latentKw <= LATENT_MIN_KW || totalKw <= 0) return;
  lines.push(`Ilman kuivaus (latentti): ${formatKw(latentKw)} (${formatPct((latentKw / totalKw) * 100)} kokonaistehosta)`);
}

/** Laskennalliset rivit — vaatii paluu- ja menoveden lämpötilat */
export function getKonvektoriCalculationLines(row: KonvektoriRowData): string[] {
  if (!konvektoriVesiLampotilatOk(row)) return [];

  const lines: string[] = [];
  const laskentaMode = isKonvektoriIlmaLaskentaMode(row);
  const entalpia = laskentaMode ? calculateKonvektoriIlmaEntalpiaEro(row) : null;
  const mitattu = parseKonvektoriNumeric(row.mitattuTeho);
  const ves = calculateKonvektoriVesipiirinTeho(row);
  const ilm = calculateKonvektoriIlmapuolenTeho(row);
  const sensibleRef = sensibleReferenceKw(ves, ilm, entalpia);

  if (laskentaMode) {
    if (entalpia) {
      lines.push(tehoLine({ tehoKw: entalpia.totalKw, mode: entalpia.mode, method: 'ilma_enthalpy' }, ''));
      if (entalpia.sensibleKw > LATENT_MIN_KW) {
        lines.push(`Ilma: näyttöhyöty (ΔT × virtaus) ${formatKw(entalpia.sensibleKw)}`);
      }
      appendLatentLine(lines, entalpia.latentKw, entalpia.totalKw);

      if (mitattu != null && mitattu > 0) {
        const ero = Math.abs(mitattu - entalpia.totalKw);
        const pct = Math.round((ero / Math.max(mitattu, entalpia.totalKw)) * 100);
        if (pct > 5) {
          lines.push(`Laskenta vs. mittari − ero ${formatKw(ero)} (${pct} %) — vertailu`);
        } else if (pct > 0) {
          lines.push(`Laskenta vs. mittari − ero ${formatKw(ero)} (${pct} %) — hyväksyttävä`);
        }
      }
    } else {
      lines.push('T+RH-laskenta: syötä imu- ja puhalluslämpötila, RH % ja ilmavirtaus');
    }
  } else if (mitattu != null && mitattu > 0) {
    const resolved = resolveKonvektoriTehoKw(row);
    if (resolved?.method === 'mitattu') lines.push(tehoLine(resolved, ''));
    const latent = latentFromMitattu(mitattu, sensibleRef);
    if (latent != null) appendLatentLine(lines, latent, mitattu);
    if (latent != null && sensibleRef != null) {
      lines.push(
        `Entalpia vs. näyttöhyöty − ero ${formatKw(latent)}: odotettavissa kun ilmaa kuivataan`,
      );
    } else if (mitattu > 0 && ves && !latent) {
      const ero = Math.abs(mitattu - ves.tehoKw);
      const pct = Math.round((ero / Math.max(mitattu, ves.tehoKw)) * 100);
      if (pct > SENSIBLE_AGREE_PCT) {
        lines.push(`Mittari vs. vesi − ero ${formatKw(ero)} (${pct} %) — tarkista mittaukset`);
      }
    }
  }

  if (ves) lines.push(tehoLine(ves, ''));
  if (ilm && !laskentaMode) lines.push(tehoLine(ilm, ''));

  if (sensibleMethodsAgree(ves, ilm)) {
    lines.push('Vesi- ja ilmanäyttöhyöty täsmäävät → virtaus- ja lämpötilamittaukset linjassa');
  } else if (ves && ilm && !laskentaMode) {
    const ero = Math.abs(ves.tehoKw - ilm.tehoKw);
    const pct = Math.round((ero / Math.max(ves.tehoKw, ilm.tehoKw)) * 100);
    if (pct > 0) {
      lines.push(`Vesi vs. ilma (näyttöhyöty) − ero ${formatKw(ero)} (${pct} %) — tarkista virtaus/T`);
    }
  }

  if (laskentaMode && entalpia && ves) {
    const ero = Math.abs(entalpia.totalKw - ves.tehoKw);
    const pct = Math.round((ero / Math.max(entalpia.totalKw, ves.tehoKw)) * 100);
    if (pct > SENSIBLE_AGREE_PCT) {
      lines.push(`Ilma (T+RH) vs. vesi − ero ${formatKw(ero)} (${pct} %) — tarkista vesimittaukset`);
    } else if (pct > 0) {
      lines.push(`Ilma (T+RH) vs. vesi − ero ${formatKw(ero)} (${pct} %) — vesipiirin näyttöhyöty odotettu pienempi`);
    }
  }

  const airTotal = primaryAirTotalKw(row, entalpia, mitattu);
  const tehoVirtausArvioon = laskentaMode && entalpia
    ? entalpia.totalKw
    : (sensibleRef ?? (mitattu != null && mitattu > 0 ? mitattu : null));
  const karkeaVirtausArvio = !laskentaMode && tehoVirtausArvioon != null && sensibleRef == null && mitattu != null;

  const ilmanVirtaus = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  if (
    tehoVirtausArvioon != null
    && tehoVirtausArvioon > 0
    && parseKonvektoriNumeric(row.huoneLampotila) != null
    && parseKonvektoriNumeric(row.puhallusLampotila) != null
    && (ilmanVirtaus == null || ilmanVirtaus <= 0)
  ) {
    const arvio = laskentaMode && entalpia
      ? estimateKonvektoriIlmanVirtausFromEnthalpy(row, tehoVirtausArvioon)
      : estimateKonvektoriIlmanVirtausM3h(row, tehoVirtausArvioon);
    if (arvio != null) {
      const suffix = laskentaMode && entalpia
        ? ' (T+RH)'
        : karkeaVirtausArvio
          ? ' (karkea — perustuu entalpiaan, ei RH:tä)'
          : ' (näyttöhyöty)';
      lines.push(`Arvioitu ilmavirtaus ${formatM3h(arvio)} m³/h${suffix}`);
    }
  }

  const vesivirtaus = parseKonvektoriNumeric(row.virtausLs);
  const tehoVesiArvioon = laskentaMode && entalpia
    ? entalpia.totalKw
    : tehoVirtausArvioon;
  if (
    tehoVesiArvioon != null
    && tehoVesiArvioon > 0
    && nesteCp(row) != null
    && (vesivirtaus == null || vesivirtaus <= 0)
  ) {
    const arvioLs = estimateKonvektoriVesivirtausLs(row, tehoVesiArvioon);
    if (arvioLs != null) {
      const suffix = laskentaMode && entalpia
        ? ' (T+RH-kokonaisteho)'
        : karkeaVirtausArvio
          ? ' (karkea — käytä mitattua virtausta jos mahdollista)'
          : sensibleMethodsAgree(ves, ilm)
            ? ' (luotettava — vesi/ilma näyttöhyöty täsmää)'
            : ' (näyttöhyöty)';
      lines.push(`Arvioitu vesivirtaus ${formatLs(arvioLs)} l/s${suffix}`);
    }
  }

  if (laskentaMode && entalpia && airTotal && !vesivirtaus) {
    lines.push('Vesivirtauksen arvio perustuu ilman T+RH-kokonaistehoihin (latentti mukana)');
  }

  return lines;
}
