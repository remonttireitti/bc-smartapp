import { parseChargeKg, type EquipmentDeviceFields } from './equipmentDeviceFields';

/**
 * Laitteen kylmäaine (tyyppi + kokonaismäärä) on yksi tieto: laitekortin arvo
 * (equipment-sarakkeet, varalla tilannekuva). Tilannekuvan kylmäaineavaimet ovat sen peilikopio,
 * josta uusi huoltopöytäkirja esitäytetään.
 */
type Fields = Pick<EquipmentDeviceFields, 'refrigerant' | 'refrigerant_charge_kg'>;

/** Pöytäkirjan kentät, joiden muokkaus tarkoittaa kylmäaineen muutosta. */
export const REFRIGERANT_FORM_KEYS = [
  'kylmaaineTyyppi',
  'kylmaaineLaatu',
  'kylmaaineValmistajaMaara',
  'kylmaaineLisattyMaara',
  'kylmaaineMaaraPiiri1',
  'kylmaaineMaaraPiiri2',
  'kylmaaineMaaraPiiri3',
  'kylmaaineMaaraPiiri4',
] as const;

export function patchTouchesRefrigerant(patch: Record<string, unknown>): boolean {
  return REFRIGERANT_FORM_KEYS.some((k) => k in patch);
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function formatKg(kg: number): string {
  return String(Number(kg.toFixed(3)));
}

/** Kylmäaineen kokonaismäärä (kg) pöytäkirjan tai tilannekuvan kentistä; sama laskenta kuin kylmäaineikkunassa. */
export function totalChargeKg(src: Record<string, unknown>): number {
  const piireja = String(src.kylmaainePiireja ?? '');
  if (piireja === '1' || !piireja) return num(src.kylmaaineValmistajaMaara) + num(src.kylmaaineLisattyMaara);
  return num(src.kylmaaineMaaraPiiri1) + num(src.kylmaaineMaaraPiiri2) + num(src.kylmaaineMaaraPiiri3) + num(src.kylmaaineMaaraPiiri4);
}

/** Pöytäkirjan kylmäaine laitekortin muodossa. */
export function refrigerantFieldsFromReport(src: Record<string, unknown>): Fields {
  const type = String(src.kylmaaineTyyppi ?? '').trim() || String(src.kylmaaineLaatu ?? '').trim();
  const kg = totalChargeKg(src);
  return { refrigerant: type || null, refrigerant_charge_kg: kg > 0 ? kg : null };
}

/**
 * Kirjoittaa laitekortin kylmäaineen tilannekuvaan. Yhden piirin laitteella määrä jaetaan
 * valmistajan ja lisätyn määrän kesken niin, että pöytäkirjan summa on laitekortin määrä.
 * clear: tyhjä arvo poistaa avaimen (laitekortin tyhjennys).
 */
export function snapshotWithRefrigerant(
  snapshot: Record<string, unknown> | null | undefined,
  fields: Partial<Fields>,
  opts: { clear?: boolean } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(snapshot ?? {}) };
  const type = (fields.refrigerant ?? '').toString().trim();
  const kg = parseChargeKg(fields.refrigerant_charge_kg);
  if (type) {
    out.kylmaaineTyyppi = type;
    out.kylmaaineLaatu = '';
  } else if (opts.clear) {
    delete out.kylmaaineTyyppi;
    out.kylmaaineLaatu = '';
  }
  if (kg != null) {
    out.kylmaaineMaaraYhteensa = formatKg(kg);
    const piireja = String(out.kylmaainePiireja ?? '');
    if (piireja === '1' || !piireja) {
      const added = num(out.kylmaaineLisattyMaara);
      if (added > 0 && added < kg) {
        out.kylmaaineValmistajaMaara = formatKg(kg - added);
      } else {
        out.kylmaaineValmistajaMaara = formatKg(kg);
        delete out.kylmaaineLisattyMaara;
      }
    }
  } else if (opts.clear) {
    delete out.kylmaaineMaaraYhteensa;
    delete out.kylmaaineValmistajaMaara;
    delete out.kylmaaineLisattyMaara;
  }
  return out;
}
