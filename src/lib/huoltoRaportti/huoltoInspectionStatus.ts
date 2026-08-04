/** Tarkastuksen tila: kunnossa / vika / ei kuulu tarkastukseen / vastaamatta. */
export type HuoltoInspectionStatus = 'ok' | 'faulty' | 'na' | null;

export const HUOLTO_INSPECTION_STATUS_LABELS: Record<Exclude<HuoltoInspectionStatus, null>, string> = {
  ok: 'Kunnossa',
  faulty: 'Vika',
  na: 'Ei kuulu',
};

export function huoltoInspectionStatusLabel(status: HuoltoInspectionStatus): string {
  if (status === null) return 'Tarkastus kesken';
  return HUOLTO_INSPECTION_STATUS_LABELS[status];
}

export function huoltoInspectionStatusClassName(status: HuoltoInspectionStatus): string {
  if (status === 'ok') return 'konvektori-status konvektori-status--ok';
  if (status === 'faulty') return 'konvektori-status konvektori-status--vika';
  if (status === 'na') return 'konvektori-status konvektori-status--note';
  return 'konvektori-status konvektori-status--pending';
}

export function normalizeHuoltoInspectionStatus(value: unknown): HuoltoInspectionStatus {
  if (value === 'ok' || value === 'faulty' || value === 'na') return value;
  return null;
}

/** Vanha boolean tai uusi merkkijono → tarkastustila. */
export function normalizeLegacyInspectionStatus(value: unknown): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(value);
  if (explicit !== null) return explicit;
  if (value === true) return 'ok';
  if (value === false) return 'faulty';
  return null;
}

/** Vanha magneettiventtiiliTestattu → uusi tila. */
export function magnetValveInspectionStatus(data: {
  magneettiventtiiliTila?: HuoltoInspectionStatus;
  magneettiventtiiliTestattu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.magneettiventtiiliTila);
  if (explicit !== null) return explicit;
  if (data.magneettiventtiiliTestattu === true) return 'ok';
  return null;
}

/** Vanha kuivainOK → uusi tila. */
export function dryerInspectionStatus(data: {
  kuivainTila?: HuoltoInspectionStatus;
  kuivainOK?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.kuivainTila);
  if (explicit !== null) return explicit;
  if (data.kuivainOK === true) return 'ok';
  if (data.kuivainOK === false) return 'faulty';
  return null;
}

export function expansionValveInspectionStatus(data: {
  paisuntaventtiiliTila?: HuoltoInspectionStatus;
  paisuntaventtiiliTyyppi?: string;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.paisuntaventtiiliTila);
  if (explicit !== null) return explicit;
  if (String(data.paisuntaventtiiliTyyppi ?? '').trim()) return null;
  return null;
}

export function applyMagnetValveInspectionPatch(
  tila: HuoltoInspectionStatus,
): { magneettiventtiiliTila: HuoltoInspectionStatus; magneettiventtiiliTestattu: boolean } {
  return {
    magneettiventtiiliTila: tila,
    magneettiventtiiliTestattu: tila === 'ok',
  };
}

export function applyDryerInspectionPatch(
  tila: HuoltoInspectionStatus,
): { kuivainTila: HuoltoInspectionStatus; kuivainOK: boolean } {
  return {
    kuivainTila: tila,
    kuivainOK: tila === 'ok',
  };
}

export function applyExpansionValveInspectionPatch(
  tila: HuoltoInspectionStatus,
): { paisuntaventtiiliTila: HuoltoInspectionStatus } {
  return { paisuntaventtiiliTila: tila };
}

export function compressorInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  oljyMaaraOikea?: boolean;
  oljyKirkas?: boolean;
  kontaktoritTarkastettu?: boolean;
  pehmokaynnistinTarkastettu?: boolean;
  taajuusmuuttajaTarkastettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  const checks = [
    data.oljyMaaraOikea,
    data.oljyKirkas,
    data.kontaktoritTarkastettu,
    data.pehmokaynnistinTarkastettu,
    data.taajuusmuuttajaTarkastettu,
  ].filter((v) => v !== undefined);
  if (checks.some((v) => v === false)) return 'faulty';
  if (checks.length > 0 && checks.every((v) => v === true)) return 'ok';
  return null;
}

export function entityInspectionStatus(data: { tarkastusTila?: HuoltoInspectionStatus }): HuoltoInspectionStatus {
  return normalizeHuoltoInspectionStatus(data.tarkastusTila);
}

export function condenserInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  lauhdutinPuhdistettu?: boolean;
  virtausRiittävä?: boolean;
  painesäätimenTarkistettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  if (data.virtausRiittävä === false) return 'faulty';
  if (data.lauhdutinPuhdistettu === true || data.painesäätimenTarkistettu === true) return 'ok';
  return null;
}

export function nestelauhdutinInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  lauhdutinPuhdistettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  if (data.lauhdutinPuhdistettu === true) return 'ok';
  return null;
}

export function mlpKeruupiiriInspectionStatus(data: {
  keruupiiriTarkastusTila?: HuoltoInspectionStatus;
  keruupiirinPaineTarkastettu?: boolean;
  keruupiirissaMutapussiPuhdistettu?: boolean;
  keruupiirinPumppuTarkastettu?: boolean;
  keruupiirinEristeetKunnossa?: boolean;
  keruupiirissaAutomaattinenIlmausTarkistettu?: boolean;
  keruuPaisuntaAstiaTarkistettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.keruupiiriTarkastusTila);
  if (explicit !== null) return explicit;
  const checks = [
    data.keruupiirinPaineTarkastettu,
    data.keruupiirissaMutapussiPuhdistettu,
    data.keruupiirinPumppuTarkastettu,
    data.keruupiirinEristeetKunnossa,
    data.keruupiirissaAutomaattinenIlmausTarkistettu,
    data.keruuPaisuntaAstiaTarkistettu,
  ].filter((v) => v !== undefined);
  if (checks.some((v) => v === false)) return 'faulty';
  if (checks.length > 0 && checks.every((v) => v === true)) return 'ok';
  return null;
}

function legacyBooleanChecksStatus(checks: Array<boolean | undefined>): HuoltoInspectionStatus {
  const defined = checks.filter((v) => v !== undefined);
  if (defined.some((v) => v === false)) return 'faulty';
  if (defined.length > 0 && defined.every((v) => v === true)) return 'ok';
  return null;
}

export function nestepiiriInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  pumppuTarkastettu?: boolean;
  paisuntaAstiaTarkistettu?: boolean;
  paineTarkastettu?: boolean;
  automaattinenIlmausTarkistettu?: boolean;
  mutapussiPuhdistettu?: boolean;
  toimilaitteetOK?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  return legacyBooleanChecksStatus([
    data.pumppuTarkastettu,
    data.paisuntaAstiaTarkistettu,
    data.paineTarkastettu,
    data.automaattinenIlmausTarkistettu,
    data.mutapussiPuhdistettu,
    data.toimilaitteetOK,
  ]);
}

export function lauhdutuspiiriInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  pumppuTarkastettu?: boolean;
  paisuntaAstiaTarkistettu?: boolean;
  paineTarkastettu?: boolean;
  automaattinenIlmausTarkistettu?: boolean;
  mutapussiPuhdistettu?: boolean;
  toimilaitteetOK?: boolean;
  painesäätimenTarkistettu?: boolean;
  virtausRiittävä?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  const base = nestepiiriInspectionStatus(data);
  if (base === 'faulty') return 'faulty';
  if (data.virtausRiittävä === false) return 'faulty';
  if (data.painesäätimenTarkistettu === false) return 'faulty';
  if (base === 'ok') return 'ok';
  if (data.painesäätimenTarkistettu === true || data.virtausRiittävä === true) return 'ok';
  return null;
}

export function vapaajahdytysInspectionStatus(data: {
  tarkastusTila?: HuoltoInspectionStatus;
  pumppuTarkastettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.tarkastusTila);
  if (explicit !== null) return explicit;
  if (data.pumppuTarkastettu === true) return 'ok';
  if (data.pumppuTarkastettu === false) return 'faulty';
  return null;
}

export function mlpLatauspiiriInspectionStatus(data: {
  latausTarkastusTila?: HuoltoInspectionStatus;
  latausPaineTarkastettu?: boolean;
  latausMutapussiPuhdistettu?: boolean;
  latausPumppuTarkastettu?: boolean;
  latausEristeetKunnossa?: boolean;
  latausAutomaattinenIlmausTarkistettu?: boolean;
  latausPaisuntaAstiaTarkistettu?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.latausTarkastusTila);
  if (explicit !== null) return explicit;
  return legacyBooleanChecksStatus([
    data.latausPaineTarkastettu,
    data.latausMutapussiPuhdistettu,
    data.latausPumppuTarkastettu,
    data.latausEristeetKunnossa,
    data.latausAutomaattinenIlmausTarkistettu,
    data.latausPaisuntaAstiaTarkistettu,
  ]);
}

export function mlpLampoInspectionStatus(data: {
  lampoTarkastusTila?: HuoltoInspectionStatus;
  lampoToimilaitteetOK?: boolean;
  lampoAutomaattinenIlmausTarkistettu?: boolean;
  lampoMutapussiPuhdistettu?: boolean;
  lampoPaisuntaAstiaTarkistettu?: boolean;
  lampoPiirit?: Array<{ pumppuTarkastettu?: boolean }>;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.lampoTarkastusTila);
  if (explicit !== null) return explicit;
  const circuitChecks = (data.lampoPiirit ?? []).map((p) => p.pumppuTarkastettu);
  return legacyBooleanChecksStatus([
    data.lampoToimilaitteetOK,
    data.lampoAutomaattinenIlmausTarkistettu,
    data.lampoMutapussiPuhdistettu,
    data.lampoPaisuntaAstiaTarkistettu,
    ...circuitChecks,
  ]);
}

export function ulkoyksikkoInspectionStatus(data: {
  ulkoyksikkoTarkastusTila?: HuoltoInspectionStatus;
  ulkoyksikkoKennosPuhdas?: boolean;
  ulkoyksikkoSulatausVedenKeraily?: boolean;
  ulkoyksikkoSulatausVedenTarkistettu?: boolean;
  ulkoyksikkoTurvakytkin?: boolean;
  ulkoyksikkoSuojakotelo?: boolean;
}): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(data.ulkoyksikkoTarkastusTila);
  if (explicit !== null) return explicit;
  const checks: Array<boolean | undefined> = [
    data.ulkoyksikkoKennosPuhdas,
    data.ulkoyksikkoTurvakytkin,
    data.ulkoyksikkoSuojakotelo,
  ];
  if (data.ulkoyksikkoSulatausVedenKeraily) {
    checks.push(data.ulkoyksikkoSulatausVedenTarkistettu);
  }
  return legacyBooleanChecksStatus(checks);
}
