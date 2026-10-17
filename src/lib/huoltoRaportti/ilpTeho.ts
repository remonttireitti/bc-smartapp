/**
 * Ilmalämpöpumpun sisäyksikön teho mittauksista.
 * Ilman lämpötilat: paluu (imu sisäyksikköön, puuttuessa huonelämpötila) ja puhallus, ilmanmäärä m³/h.
 * - Kosteus (RH) molemmista → kokonaisteho entalpiaerosta: P = ρ · qv · Δh (latentti mukana).
 * - Muuten näyttöhyöty: P = ρ · cp · qv · ΔT, ρ = 1,2 kg/m³, cp = 1,005 kJ/(kg·K).
 */
import type { MittausSisayksikkoData } from './types';
import { coolingPowerFromEnthalpyKw, moistAirEnthalpyDeltaKjPerKg } from './psychrometrics';

export const ILP_AIR_DENSITY = 1.2;
export const ILP_AIR_CP = 1.005;

export type IlpTehoMode = 'jaahdytys' | 'lammitys';

export type IlpSisayksikkoTeho = {
  /** Kokonaisteho kW (entalpia) tai näyttöhyöty (ΔT). */
  kw: number;
  method: 'entalpia' | 'naytto';
  sensibleKw: number;
  /** Ilman kuivaus (vain jäähdytys, entalpialla). */
  latentKw: number;
  deltaT: number;
  /** Ilma jäähtyi (true) vai lämpeni (false) sisäyksikön läpi. */
  cooling: boolean;
};

function num(v: unknown): number | null {
  const raw = String(v ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

type Rec = Record<string, unknown>;

function pick(m: Rec, modeKey: string, legacyKey?: string): number | null {
  const v = num(m[modeKey]);
  if (v != null) return v;
  return legacyKey ? num(m[legacyKey]) : null;
}

const SUFFIX: Record<IlpTehoMode, string> = { jaahdytys: 'Jaahdytys', lammitys: 'Lammitys' };

export function ilpSisayksikkoInputs(m: Partial<MittausSisayksikkoData> | undefined, mode: IlpTehoMode) {
  const r = (m ?? {}) as Rec;
  const s = SUFFIX[mode];
  const sisaan = pick(r, `paluuLampotila${s}`, 'paluuLampotila') ?? pick(r, `sisalampotila${s}`, 'sisalampotila');
  return {
    sisaan,
    ulos: pick(r, `puhallusLampotila${s}`, 'puhallusLampotila'),
    qv: pick(r, `ilmanmaaraM3h${s}`, 'ilmanmaaraM3h'),
    rhSisaan: num(r[`paluuKosteusRh${s}`]),
    rhUlos: num(r[`puhallusKosteusRh${s}`]),
  };
}

export function sensibleAirPowerKw(qvM3h: number, deltaT: number): number {
  return ILP_AIR_DENSITY * ILP_AIR_CP * (qvM3h / 3600) * Math.abs(deltaT);
}

export function calculateIlpSisayksikkoTeho(
  m: Partial<MittausSisayksikkoData> | undefined,
  mode: IlpTehoMode,
): IlpSisayksikkoTeho | null {
  const { sisaan, ulos, qv, rhSisaan, rhUlos } = ilpSisayksikkoInputs(m, mode);
  if (sisaan == null || ulos == null || qv == null || qv <= 0) return null;
  const deltaT = sisaan - ulos;
  if (Math.abs(deltaT) < 0.05) return null;
  const sensibleKw = sensibleAirPowerKw(qv, deltaT);
  const cooling = deltaT > 0;
  const rhOk = (v: number | null) => v != null && v > 0 && v <= 100;
  if (rhOk(rhSisaan) && rhOk(rhUlos)) {
    const dh = moistAirEnthalpyDeltaKjPerKg(sisaan, rhSisaan!, ulos, rhUlos!);
    const total = dh != null ? coolingPowerFromEnthalpyKw(qv, dh) : null;
    if (total != null) {
      const latentKw = cooling && total > sensibleKw ? total - sensibleKw : 0;
      return { kw: total, method: 'entalpia', sensibleKw, latentKw, deltaT, cooling };
    }
  }
  return { kw: sensibleKw, method: 'naytto', sensibleKw, latentKw: 0, deltaT, cooling };
}

export function formatIlpKw(kw: number): string {
  return `${(Math.round(kw * 100) / 100).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW`;
}

/** Lyhyt teksti: "4,02 kW" tai "5,10 kW (kuivaus 1,08 kW)". */
export function formatIlpSisayksikkoTeho(t: IlpSisayksikkoTeho | null, mode?: IlpTehoMode): string {
  if (!t) return '';
  const base = formatIlpKw(t.kw);
  const extra = [
    t.latentKw >= 0.05 ? `kuivaus ${formatIlpKw(t.latentKw)}` : '',
    mode === 'jaahdytys' && !t.cooling ? 'ilma lämpeni' : '',
    mode === 'lammitys' && t.cooling ? 'ilma jäähtyi' : '',
  ].filter(Boolean);
  return extra.length ? `${base} (${extra.join(', ')})` : base;
}
