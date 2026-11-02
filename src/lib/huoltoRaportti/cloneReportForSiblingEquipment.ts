import { normalizeHuoltoReportData } from './defaults';
import { realIdentityValue } from './ilpIdentity';
import type { HuoltoReportData } from './types';

/** Tyhjennetään laitteen yksilöivät kentät kopioitaessa pöytäkirja toiselle laitteelle samalla kohteella. */
export function cloneHuoltoReportForSiblingEquipment(
  source: HuoltoReportData,
  options?: { keepModel?: boolean },
): HuoltoReportData {
  const next = normalizeHuoltoReportData(
    structuredClone(source) as HuoltoReportData,
  );

  // Vain tunnus ja sarjanumero ovat laitekohtaisia; sijainti, käyttötarkoitus, malli ja valmistaja kopioidaan.
  next.laiteTunnus = '';
  next.laiteSarjanumero = '';
  next.laiteSijainti = realIdentityValue(next.laiteSijainti);
  next.laiteKayttotarkoitus = realIdentityValue(next.laiteKayttotarkoitus);
  next.laiteMalli = realIdentityValue(next.laiteMalli);
  next.laiteValmistaja = realIdentityValue(next.laiteValmistaja);
  next.equipmentSnapshot = undefined;

  if (!options?.keepModel) {
    next.laiteMalli = '';
    next.laiteValmistaja = '';
  }

  if (next.ulkoyksikkoSarjanumero != null) next.ulkoyksikkoSarjanumero = '';

  if (next.evaporatorData?.length) {
    next.evaporatorData = next.evaporatorData.map((row) => ({
      ...row,
      sarjanumero: '',
    }));
  }

  if (next.konvektoriRows) {
    next.konvektoriRows = next.konvektoriRows.map((row) => ({
      ...row,
      sarjanumero: '',
    }));
  }

  if (next.nestelauhduttimetVj) {
    next.nestelauhduttimetVj = next.nestelauhduttimetVj.map((unit) => ({
      ...unit,
      sarjanumero: '',
    }));
  }

  if (next.sisayksikkoData) {
    next.sisayksikkoData = next.sisayksikkoData.map((unit) => ({
      ...unit,
      sarjanumero: '',
    }));
  }

  if (next.laiteTyyppi === 'lämpöpumppu') resetIlpInspectionResults(next);

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
