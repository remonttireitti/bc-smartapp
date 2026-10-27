/** Kylmiö/pakastin: koneikon komponentit (nestelasi, kuivain, imusuodatin, tärinänvaimennus) — 1 kpl / koneikko. */
import { isKylmioDevice } from './deviceKokoonpano';
import type { HuoltoInspectionStatus } from './huoltoInspectionStatus';
import { ensureRefrigerantCircuitComponents, refrigerantCircuitComponentStatus } from './refrigerantCircuitComponents';
import type { RefrigerantCircuitComponent, RefrigerantCircuitData } from './types';

export function usesKoneikkoComponents(laiteTyyppi: string | undefined): boolean {
  return isKylmioDevice(laiteTyyppi ?? '');
}

function legacyHasData(c: RefrigerantCircuitComponent): boolean {
  return refrigerantCircuitComponentStatus(c) !== 'na';
}

function legacyOf(data: RefrigerantCircuitData, type: string): RefrigerantCircuitComponent | undefined {
  return ensureRefrigerantCircuitComponents(data).find((c) => c.type === type && legacyHasData(c));
}

export type KoneikkoView = {
  nestelasiOn: boolean;
  nestelasiKuplat: '' | 'kupliton' | 'kuplii';
  nestelasiKosteus: '' | 'kuiva' | 'kostea';
  kuivainOn: boolean;
  kuivainVaihdettu: boolean;
  kuivainMalli: string;
  imusuodatinOn: boolean;
  imusuodatinVaihdettu: boolean;
  tarinaOn: boolean;
};

/** Tallennetut kentät + vanhojen piirikomponenttien arvot (vanha data luettavissa). */
export function koneikkoView(data: RefrigerantCircuitData): KoneikkoView {
  const oldKuivain = legacyOf(data, 'kuivain');
  const oldNestelasi = legacyOf(data, 'nestelasi');
  return {
    nestelasiOn: data.nestelasiKaytossa !== false,
    nestelasiKuplat: data.nestelasiKuplat ?? '',
    nestelasiKosteus: data.nestelasiKosteus ?? (data.nestelasiKuiva || oldNestelasi?.nestelasiKuiva ? 'kuiva' : ''),
    kuivainOn: data.kuivainKaytossa !== false,
    kuivainVaihdettu: !!data.kuivainVaihdettu,
    kuivainMalli: data.koneikkoKuivainMalli ?? ([oldKuivain?.valmistaja ?? data.kuivainValmistaja, oldKuivain?.malli ?? data.kuivainMalli].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ')),
    imusuodatinOn: data.imusuodatinKaytossa ?? !!legacyOf(data, 'imusuodatin'),
    imusuodatinVaihdettu: !!data.imusuodatinVaihdettu,
    tarinaOn: data.tarinanvaimennusKaytossa ?? !!legacyOf(data, 'tarinavaimennin'),
  };
}

const LEGACY_ELSEWHERE = ['paisuntaventtiili', 'magneettiventtiili', 'lauhdutimenTalvivarustus'];

/** Vanhat piirikomponentit, joilla on tietoa → näytetään vain luku -riveinä (venttiilit kuuluvat höyrystimelle). */
export function koneikkoLegacyReadOnly(data: RefrigerantCircuitData): RefrigerantCircuitComponent[] {
  return ensureRefrigerantCircuitComponents(data).filter((c) => LEGACY_ELSEWHERE.includes(c.type) && legacyHasData(c));
}

export function koneikkoCustomComponents(data: RefrigerantCircuitData): RefrigerantCircuitComponent[] {
  return ensureRefrigerantCircuitComponents(data).filter((c) => c.type === 'custom');
}

export function koneikkoStatuses(data: RefrigerantCircuitData): HuoltoInspectionStatus[] {
  const v = koneikkoView(data);
  const out: HuoltoInspectionStatus[] = [];
  if (v.nestelasiOn) {
    if (!v.nestelasiKuplat || !v.nestelasiKosteus) out.push(null);
    else out.push(v.nestelasiKuplat === 'kuplii' || v.nestelasiKosteus === 'kostea' ? 'faulty' : 'ok');
  }
  for (const c of koneikkoCustomComponents(data)) {
    const s = refrigerantCircuitComponentStatus(c);
    if (s !== 'na') out.push(s);
  }
  return out;
}
