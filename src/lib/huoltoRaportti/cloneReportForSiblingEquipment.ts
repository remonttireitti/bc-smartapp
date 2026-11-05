import { createEmptyHuoltoReportData, normalizeHuoltoReportData } from './defaults';
import { buildHuoltoEquipmentTechnicalSnapshot, mergeFormWithEquipmentSnapshot } from './equipmentSnapshot';
import { realIdentityValue } from './ilpIdentity';
import type { HuoltoReportData } from './types';

/** Asiakas- ja rakennetiedot, jotka kopio perii sellaisenaan (ei käyntikohtaisia tuloksia). */
const CARRY_KEYS = [
  'asiakas', 'customerId', 'asiakasYtunnus', 'asiakasYhteyshenkilo', 'asiakasPuhelin', 'asiakasEmail', 'osoite',
  'laiteTyyppi', 'selectedModules', 'hiddenTabIds', 'moduleTabOrder', 'huoltoReportDocumentKind',
  'laiteValmistaja', 'laiteMalli', 'laiteSijainti', 'laiteKayttotarkoitus',
] as const;

/**
 * Kopio toiselle laitteelle: rakennetaan TYHJÄSTÄ pöytäkirjasta. Mukaan tulevat vain asiakas, laitetyyppi,
 * valmistaja/malli/sijainti/käyttötarkoitus sekä laitekortin kiinteät tiedot (kokoonpano, asetusarvot,
 * komponenttien tyypit) samalla suodatuksella kuin laiterekisteriin tallennettaessa.
 * Ei mukaan: tunnus, sarjanumerot, mittaukset, tarkastustulokset, viat, huomiot, kuvat, kuittaus.
 */
export function cloneHuoltoReportForSiblingEquipment(
  source: HuoltoReportData,
  options?: { keepModel?: boolean },
): HuoltoReportData {
  const src = normalizeHuoltoReportData(structuredClone(source) as HuoltoReportData);
  const base = createEmptyHuoltoReportData();
  for (const key of CARRY_KEYS) {
    if (src[key] !== undefined) (base as Record<string, unknown>)[key] = structuredClone(src[key]);
  }
  base.customModules = (src.customModules ?? []).map((m) => ({ ...structuredClone(m), values: {} }));

  const snapshot = buildHuoltoEquipmentTechnicalSnapshot(src);
  const next = normalizeHuoltoReportData(mergeFormWithEquipmentSnapshot(base, snapshot));

  next.laiteTunnus = '';
  next.laiteSarjanumero = '';
  next.laiteSijainti = realIdentityValue(src.laiteSijainti);
  next.laiteKayttotarkoitus = realIdentityValue(src.laiteKayttotarkoitus);
  next.laiteMalli = options?.keepModel ? realIdentityValue(src.laiteMalli) : '';
  next.laiteValmistaja = options?.keepModel ? realIdentityValue(src.laiteValmistaja) : '';
  next.equipmentSnapshot = undefined;
  next.huoltoWorkReportId = undefined;

  if (next.ulkoyksikkoSarjanumero != null) next.ulkoyksikkoSarjanumero = '';
  next.evaporatorData = (next.evaporatorData ?? []).map((row) => ({ ...row, sarjanumero: '' }));
  next.konvektoriRows = (next.konvektoriRows ?? []).map((row) => ({ ...row, sarjanumero: '' }));
  next.nestelauhduttimetVj = (next.nestelauhduttimetVj ?? []).map((u) => ({ ...u, sarjanumero: '' }));
  next.sisayksikkoData = (next.sisayksikkoData ?? []).map((u) => ({ ...u, sarjanumero: '' }));

  if (next.laiteTyyppi === 'lämpöpumppu') resetIlpInspectionResults(next);

  // Uusi laite, uusi käynti: ei vikoja, huomioita, kuvia eikä tehtyjä tarkastuksia.
  next.huomiot = '';
  next.huomiotLiitteet = [];
  next.huoltoLaiteessaVika = false;
  next.huoltoSuoritettu = false;
  next.huoltoKylmaaineVuotoTarkastus = false;
  next.visitedModuleIds = [];

  return next;
}

/** ILP-kopio toiselle laitteelle: tarkastustulokset eivät kopioidu (ei oletusvalintaa). */
function resetIlpInspectionResults(next: HuoltoReportData): void {
  next.ulkoyksikkoTarkastusTila = null;
  next.ulkoyksikkoTarkastusHuomio = '';
  next.ulkoyksikkoKennosPuhdas = false;
  next.ulkoyksikkoKennoPuhdistustapa = '';
  next.ulkoyksikkoSulatausVedenTarkistettu = false;
  next.sisaSamaKuinEnsimmainen = (next.sisaSamaKuinEnsimmainen ?? []).map(() => false);
  next.sisayksikkoData = (next.sisayksikkoData ?? []).map((unit) => ({
    ...unit,
    asennettu: null,
    kennoPuhdas: null,
    eiAania: null,
    kondenssiTestattu: null,
    kondenssiEiTarkastettu: false,
    huomio: '',
    huomioTyyppi: 'kommentti',
  }));
}
