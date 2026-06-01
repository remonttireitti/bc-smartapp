import { normalizeHuoltoReportData } from './defaults';
import type { HuoltoReportData } from './types';

/** Tyhjennetään laitteen yksilöivät kentät kopioitaessa pöytäkirja toiselle laitteelle samalla kohteella. */
export function cloneHuoltoReportForSiblingEquipment(source: HuoltoReportData): HuoltoReportData {
  const next = normalizeHuoltoReportData(
    structuredClone(source) as HuoltoReportData,
  );

  next.laiteTunnus = '';
  next.laiteMalli = '';
  next.laiteSarjanumero = '';
  next.laiteSijainti = '';
  next.laiteValmistaja = '';
  next.equipmentSnapshot = undefined;

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

  return next;
}
