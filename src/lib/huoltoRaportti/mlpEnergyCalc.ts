import type { HuoltoReportData, MlpData, RefrigerantCircuitData } from './types';
import { getCompressorVaiheValinta, getKokoLaiteSahkoVaiheValinta } from './sahkoVaiheUtils';
import {
  circuitSubcoolingPrintEnabled,
  circuitSuperheatPrintEnabled,
} from './refrigerantCircuitPrint';
import { calculateSubcoolingFromMeasurements, calculateSuperheatFromMeasurements } from './utils';

function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '')) || 0;
}

/** Teho kW: virtaus l/s, c = nesteen ominaislämpö (kW/(l/s·K)). */
export function calcLiquidPowerKw(virtausLs: string, meno: string, tulo: string, c: number): number | null {
  const v = parseNum(virtausLs);
  const m = parseNum(meno);
  const t = parseNum(tulo);
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return c * v * deltaT;
  return null;
}

function compressorElectricKw(kp: RefrigerantCircuitData): number | null {
  const compCount = parseInt(String(kp.kompressorienMaara ?? ''), 10) || 1;
  let total = 0;
  for (let i = 1; i <= compCount; i++) {
    const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
    const comp = kp[compKey];
    if (!comp || typeof comp !== 'object') return null;
    const cv = getCompressorVaiheValinta(comp);
    if (cv === '1') {
      if (!String(comp.virta1vaihe ?? '').trim()) return null;
      total += 0.23 * parseNum(comp.virta1vaihe);
    } else if (cv === '3') {
      if (!comp.virtaL1?.trim() || !comp.virtaL2?.trim() || !comp.virtaL3?.trim()) return null;
      total += 0.591 * ((parseNum(comp.virtaL1) + parseNum(comp.virtaL2) + parseNum(comp.virtaL3)) / 3);
    } else return null;
  }
  return total > 0 ? total : null;
}

function wholeDeviceElectricKw(m: MlpData): number | null {
  const kv = getKokoLaiteSahkoVaiheValinta(m);
  if (kv === '3' && m.kokoLaiteVirtaL1 && m.kokoLaiteVirtaL2 && m.kokoLaiteVirtaL3) {
    return 0.591 * ((parseNum(m.kokoLaiteVirtaL1) + parseNum(m.kokoLaiteVirtaL2) + parseNum(m.kokoLaiteVirtaL3)) / 3);
  }
  if (kv === '1' && m.kokoLaiteVirta1vaihe) {
    return 0.23 * parseNum(m.kokoLaiteVirta1vaihe);
  }
  return null;
}

export type MlpEnergySummary = {
  qKeruuKw: number | null;
  qLatausKw: number | null;
  qTulistusKw: number | null;
  pInKw: number | null;
  cop: number | null;
  warnings: string[];
};

export type MlpHeatPumpEnergyBalance = MlpEnergySummary & {
  deviceOutputKw: number;
  maaperastaKw: number;
  copEfficiencyLabel: string;
  canCalculateCop: boolean;
};

export function computeMlpHeatPumpEnergyBalance(
  mlp: MlpData,
  kp1: RefrigerantCircuitData,
): MlpHeatPumpEnergyBalance {
  const cKeruu = parseNum(mlp.keruupiiriNeste) || 4.18;
  const cLataus = parseNum(mlp.latausNeste) || parseNum(mlp.latausJarjestelmanNeste) || 4.18;
  const cTulistus = parseNum(mlp.latausTulistusNeste) || cLataus;

  const qKeruuKw = calcLiquidPowerKw(mlp.keruupiiriVirtaus, mlp.keruupiiriMeno, mlp.keruupiiriTulo, cKeruu);
  const qLatausKw = calcLiquidPowerKw(mlp.latausVirtaus, mlp.latausMeno, mlp.latausTulo, cLataus);
  const qTulistusKw = mlp.latausTulistuspiiri
    ? calcLiquidPowerKw(mlp.latausTulistusVirtaus, mlp.latausTulistusMeno, mlp.latausTulistusTulo, cTulistus)
    : null;

  const pInKw = mlp.mittaaKokoLaiteSahko ? wholeDeviceElectricKw(mlp) : compressorElectricKw(kp1);
  const deviceOutputKw = (qLatausKw ?? 0) + (qTulistusKw ?? 0);
  const maaperastaKw =
    deviceOutputKw > 0 && pInKw != null && pInKw > 0
      ? deviceOutputKw - pInKw
      : qKeruuKw ?? 0;
  const canCalculateCop = pInKw != null && pInKw > 0 && deviceOutputKw > 0;
  const cop = canCalculateCop ? deviceOutputKw / pInKw : null;

  const warnings: string[] = [];
  if (cop != null) {
    if (cop < 2.5) warnings.push(`COP matala (${cop.toFixed(2)}) — tarkista mittaukset.`);
    else if (cop > 6) warnings.push(`COP poikkeuksellisen korkea (${cop.toFixed(2)}) — varmista virrat ja lämpötilat.`);
  }
  if (qKeruuKw == null && (mlp.keruupiiriVirtaus || mlp.keruupiiriMeno)) {
    warnings.push('Keruupiiri: tarvitaan virtaus ja meno/paluu-lämpötilat teholaskentaan.');
  }
  if (pInKw == null) {
    warnings.push('Sähköteho: syötä kompressorien virrat tai koko laitteen virranmittaus.');
  }

  const copEfficiencyLabel =
    cop == null || cop <= 0
      ? 'Ei voida laskea'
      : cop >= 4
        ? 'Erinomainen'
        : cop >= 3
          ? 'Hyvä energiatehokkuus'
          : cop >= 2
            ? 'Tyydyttävä energiatehokkuus'
            : 'Heikko';

  return {
    qKeruuKw,
    qLatausKw,
    qTulistusKw,
    pInKw,
    cop,
    warnings,
    deviceOutputKw,
    maaperastaKw,
    copEfficiencyLabel,
    canCalculateCop,
  };
}

export function computeMlpEnergySummary(
  mlp: MlpData,
  kp1: RefrigerantCircuitData,
): MlpEnergySummary {
  const balance = computeMlpHeatPumpEnergyBalance(mlp, kp1);
  return {
    qKeruuKw: balance.qKeruuKw,
    qLatausKw: balance.qLatausKw,
    qTulistusKw: balance.qTulistusKw,
    pInKw: balance.pInKw,
    cop: balance.cop,
    warnings: balance.warnings,
  };
}

export function computeChillerEnergyFromMlp(
  mlp: MlpData,
  kp1: RefrigerantCircuitData,
): { qCoolKw: number | null; pInKw: number | null; qCondKw: number | null; cop: number | null } {
  const virtausLs = parseNum(mlp.keruupiiriVirtaus);
  const virtausM3h = virtausLs * 3.6;
  const meno = parseNum(mlp.keruupiiriMeno);
  const tulo = parseNum(mlp.keruupiiriTulo);
  const deltaT = Math.abs(meno - tulo);
  const qCoolKw =
    virtausM3h > 0 && deltaT > 0 ? 1.163 * virtausM3h * deltaT : null;
  const pInKw = mlp.mittaaKokoLaiteSahko ? wholeDeviceElectricKw(mlp) : compressorElectricKw(kp1);
  const qCondKw = qCoolKw != null && pInKw != null ? qCoolKw + pInKw : null;
  const cop = qCoolKw != null && pInKw != null && pInKw > 0 ? qCoolKw / pInKw : null;
  return { qCoolKw, pInKw, qCondKw, cop };
}

function warningsForRefrigerantCircuit(
  kp: HuoltoReportData['kylmaainePiiri1'] | null | undefined,
  ref: string,
  circuitLabel: string,
): string[] {
  if (!kp?.onKaytossa) return [];
  const prefix = circuitLabel ? `${circuitLabel}: ` : '';
  const warnings: string[] = [];
  const sh = circuitSuperheatPrintEnabled(kp)
    ? calculateSuperheatFromMeasurements(parseNum(kp.imupaine), parseNum(kp.imuLampotila), ref)
    : null;
  const sc = circuitSubcoolingPrintEnabled(kp)
    ? calculateSubcoolingFromMeasurements(
        parseNum(kp.korkeapaine),
        parseNum(kp.nestePutkiLampotila),
        ref,
      )
    : null;
  if (sh != null) {
    if (sh < 3) {
      warnings.push(
        `${prefix}Tulistus matala (${sh.toFixed(1)} K < 3 K) — nestepisarat voivat päätyä kompressoriin`,
      );
    } else if (sh > 15) {
      warnings.push(`${prefix}Tulistus korkea (${sh.toFixed(1)} K > 15 K) — tehokkuuden lasku`);
    }
  }
  if (sc != null) {
    if (sc < 3) {
      warnings.push(
        `${prefix}Alijäähdytys matala (${sc.toFixed(1)} K < 3 K) — lauhdutus voi olla tehoton`,
      );
    } else if (sc > 10) {
      warnings.push(
        `${prefix}Alijäähdytys korkea (${sc.toFixed(1)} K > 10 K) — nesteen alijohtumisriski`,
      );
    }
  }
  return warnings;
}

export function buildRefrigerantCircuitWarnings(data: HuoltoReportData): string[] {
  if (data.piilotaVaroitukset || data.laiteTyyppi === 'lämpöpumppu') return [];
  const ref = data.kylmaaineTyyppi || '';
  const circuits = data.kylmaainePiireja ?? '1';
  const out = [...warningsForRefrigerantCircuit(data.kylmaainePiiri1, ref, '')];
  if (circuits !== '1') {
    out.push(...warningsForRefrigerantCircuit(data.kylmaainePiiri2, ref, 'Piiri 2'));
  }
  if (circuits === '3' || circuits === '4') {
    out.push(...warningsForRefrigerantCircuit(data.kylmaainePiiri3, ref, 'Piiri 3'));
  }
  return out;
}
