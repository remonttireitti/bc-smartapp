import { isChillerLikeDevice, isHeatPumpCircuitsDevice } from './deviceModuleLogic';
import { inferLegacyMlpFlags } from './mlpLegacyFlags';
import type { HuoltoReportData, LauhdutuspiiriData, MlpData, NestepiiriData } from './types';

/** Kasvatetaan kun tuonti-normalisointilogiikka muuttuu — fix-skripti päivittää vanhat rivit. */
export const HUOLTO_IMPORT_NORMALIZE_VERSION = 3;

function hasText(...values: unknown[]): boolean {
  return values.some((v) => String(v ?? '').trim().length > 0);
}

function inferLegacyNestepiiriFlags(p: Partial<NestepiiriData>): Partial<NestepiiriData> {
  const patch: Partial<NestepiiriData> = {};

  if (!p.paineTarkastettu && hasText(p.paineBar)) {
    patch.paineTarkastettu = true;
  }
  if (!p.pumppuTarkastettu && hasText(p.pumppuValmistaja, p.pumppuMalli)) {
    patch.pumppuTarkastettu = true;
  }
  if (!p.paisuntaAstiaTarkistettu && hasText(p.paisuntaAstiaKoko, p.paisuntaAstiaEsipaine)) {
    patch.paisuntaAstiaTarkistettu = true;
  }

  return patch;
}

function inferLegacyLauhdutuspiiriFlags(p: Partial<LauhdutuspiiriData>): Partial<LauhdutuspiiriData> {
  const patch: Partial<LauhdutuspiiriData> = {
    ...inferLegacyNestepiiriFlags(p),
  };
  if (!p.painesäätimenTarkistettu && hasText(p.painesäätimenMalli)) {
    patch.painesäätimenTarkistettu = true;
  }
  return patch;
}

function inferLegacyMlpExtras(m: Partial<MlpData>): Partial<MlpData> {
  const patch: Partial<MlpData> = { ...inferLegacyMlpFlags(m) };

  if (!m.latausTulistuspiiri && hasText(m.latausTulistusVirtaus, m.latausTulistusMeno, m.latausTulistusTulo)) {
    patch.latausTulistuspiiri = true;
  }
  if (!m.latausTulistuspiiriPumppu && hasText(m.latausTulistusPumpunValmistaja, m.latausTulistusPumpunMalli)) {
    patch.latausTulistuspiiriPumppu = true;
  }
  if (
    !m.keruuJaahdytysPiiri &&
    hasText(m.keruuJaahdytysVirtaus, m.keruuJaahdytysMenoLampotila, m.keruuJaahdytysPaluuLampotila)
  ) {
    patch.keruuJaahdytysPiiri = true;
  }
  if (!m.keruuJaahdytysPiiriPumppu && hasText(m.keruuJaahdytysPumpunValmistaja, m.keruuJaahdytysPumpunMalli)) {
    patch.keruuJaahdytysPiiriPumppu = true;
  }

  return patch;
}

/** Täydentää legacy-tallennetusta datasta puuttuvat “näytä kentät” -valinnat. */
export function applyLegacyImportInference(data: HuoltoReportData): HuoltoReportData {
  const out: HuoltoReportData = { ...data };

  if (out.mlpData) {
    out.mlpData = { ...out.mlpData, ...inferLegacyMlpExtras(out.mlpData) };
  }

  if (out.jaahdytysvesiData) {
    out.jaahdytysvesiData = { ...out.jaahdytysvesiData, ...inferLegacyNestepiiriFlags(out.jaahdytysvesiData) };
  }

  if (out.lauhdutuspiiriData) {
    out.lauhdutuspiiriData = { ...out.lauhdutuspiiriData, ...inferLegacyLauhdutuspiiriFlags(out.lauhdutuspiiriData) };
  }

  if (out.hoyrystinPiiriData && !isChillerLikeDevice(out.laiteTyyppi)) {
    out.hoyrystinPiiriData = { ...out.hoyrystinPiiriData, ...inferLegacyNestepiiriFlags(out.hoyrystinPiiriData) };
  }

  out.legacyImportNormalizedVersion = HUOLTO_IMPORT_NORMALIZE_VERSION;
  return out;
}

/** Onko raportissa jo tallennettua sisältöä (tuotu / aiemmin täytetty). */
export function huoltoReportHasSubstantiveData(data: HuoltoReportData): boolean {
  if (data.legacyCompanyInfo && typeof data.legacyCompanyInfo === 'object') return true;
  if (data.legacyImportNormalizedVersion != null && data.legacyImportNormalizedVersion > 0) return true;

  const kp = data.kylmaainePiiri1;
  if (hasText(kp?.imupaine, kp?.korkeapaine, kp?.imuLampotila)) return true;

  if (isHeatPumpCircuitsDevice(data.laiteTyyppi) && data.mlpData) {
    const m = data.mlpData;
    if (
      hasText(
        m.keruupiiriVirtaus,
        m.latausVirtaus,
        m.kayttovesiTilavuus,
        m.kokoLaiteVirtaL1,
        m.kylmaainePaineLauhdutinBar,
      )
    ) {
      return true;
    }
  }

  if (isChillerLikeDevice(data.laiteTyyppi)) {
    const j = data.jaahdytysvesiData;
    if (hasText(j?.virtaus, j?.meno, j?.tulo)) return true;
  }

  if ((data.konvektoriRows?.length ?? 0) > 0) return true;
  if (hasText(data.huomiot)) return true;

  return false;
}
