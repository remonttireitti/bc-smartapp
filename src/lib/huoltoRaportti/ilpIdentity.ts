import type { HuoltoReportData } from './types';

/** Täyttöarvot, joita ei pidetä oikeana mallina / sarjanumerona. */
const PLACEHOLDER_VALUES = new Set(['', '-', '—', 'ei tiedossa', 'ei luettavissa']);

export function realIdentityValue(value: unknown): string {
  const text = String(value ?? '').trim();
  return PLACEHOLDER_VALUES.has(text.toLowerCase()) ? '' : text;
}

export function isIlpDevice(laiteTyyppi: unknown): boolean {
  return laiteTyyppi === 'lämpöpumppu';
}

type IdentityFields = Pick<
  HuoltoReportData,
  'laiteTyyppi' | 'laiteMalli' | 'laiteSarjanumero' | 'ulkoyksikkoMalli' | 'ulkoyksikkoSarjanumero'
>;

/** ILP: laitteen sarjanumero = ulkoyksikön sarjanumero (yksi kenttä). */
export function ilpDeviceSerial(form: Partial<IdentityFields>): string {
  return realIdentityValue(form.ulkoyksikkoSarjanumero) || realIdentityValue(form.laiteSarjanumero);
}

/** ILP: laitteen malli = ulkoyksikön malli. */
export function ilpDeviceModel(form: Partial<IdentityFields>): string {
  return realIdentityValue(form.ulkoyksikkoMalli) || realIdentityValue(form.laiteMalli);
}

/**
 * ILP: pidä laitetietojen malli/sarjanumero ja ulkoyksikön malli/sarjanumero samoina.
 * Ulkoyksikön arvo voittaa; täyttöarvot ("—", "ei tiedossa") eivät kopioidu ulkoyksikölle.
 */
export function syncIlpOutdoorIdentity(form: Partial<IdentityFields>): Partial<IdentityFields> {
  if (!isIlpDevice(form.laiteTyyppi)) return {};
  const patch: Partial<IdentityFields> = {};
  const serial = ilpDeviceSerial(form);
  const model = ilpDeviceModel(form);
  if (serial) {
    if ((form.ulkoyksikkoSarjanumero ?? '').trim() !== serial) patch.ulkoyksikkoSarjanumero = serial;
    if ((form.laiteSarjanumero ?? '').trim() !== serial) patch.laiteSarjanumero = serial;
  }
  if (model) {
    if ((form.ulkoyksikkoMalli ?? '').trim() !== model) patch.ulkoyksikkoMalli = model;
    if ((form.laiteMalli ?? '').trim() !== model) patch.laiteMalli = model;
  }
  return patch;
}
