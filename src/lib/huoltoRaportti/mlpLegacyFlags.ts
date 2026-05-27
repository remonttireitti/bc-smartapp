import type { MlpData } from './types';

function hasText(...values: unknown[]): boolean {
  return values.some((v) => String(v ?? '').trim().length > 0);
}

/** Päättelee legacy-tallennetuista arvoista puuttuvat checkboxit (tulostus näyttää datan ilman niitä). */
export function inferLegacyMlpFlags(m: Partial<MlpData>): Partial<MlpData> {
  const patch: Partial<MlpData> = {};

  if (!m.keruupiirinPaineTarkastettu && hasText(m.keruupiiriPaineBar)) {
    patch.keruupiirinPaineTarkastettu = true;
  }
  if (
    !m.keruupiirinPumppuTarkastettu &&
    hasText(
      m.keruupiiriPumpunValmistaja,
      m.keruupiiriPumpunMalli,
      m.keruupiirinPumpunTyyppi,
      m.keruupiiriPumppuVirta1vaihe,
      m.keruupiiriPumppuVirtaL1,
    )
  ) {
    patch.keruupiirinPumppuTarkastettu = true;
  }
  if (!m.keruuPaisuntaAstiaTarkistettu && hasText(m.keruuPaisuntaAstiaKoko, m.keruuPaisuntaAstiaEsipaine)) {
    patch.keruuPaisuntaAstiaTarkistettu = true;
  }
  if (!m.latausPaineTarkastettu && hasText(m.latausPaineBar)) {
    patch.latausPaineTarkastettu = true;
  }
  if (
    !m.latausPumppuTarkastettu &&
    hasText(
      m.latausPumpunValmistaja,
      m.latausPumpunMalli,
      m.latausPumppuVirta1vaihe,
      m.latausPumppuVirtaL1,
    )
  ) {
    patch.latausPumppuTarkastettu = true;
  }
  if (!m.latausPaisuntaAstiaTarkistettu && hasText(m.latausPaisuntaAstiaKoko, m.latausPaisuntaAstiaEsipaine)) {
    patch.latausPaisuntaAstiaTarkistettu = true;
  }
  if (
    !m.kayttovesiEnabled &&
    hasText(m.kayttovesiTilavuus, m.kayttovesiLampotilaAsetus, m.kayttovesiLampotilaNykyinen)
  ) {
    patch.kayttovesiEnabled = true;
  }
  if (!m.kayttovesiSahkoVastuksetEnabled && (m.kayttovesiSahkoVastukset?.length ?? 0) > 0) {
    patch.kayttovesiSahkoVastuksetEnabled = true;
  }
  if (
    !m.kayttovesiKiertoEnabled &&
    hasText(m.kayttovesiKiertoPumpunValmistaja, m.kayttovesiKiertoPumpunMalli, m.kayttovesiKiertoVirtaus)
  ) {
    patch.kayttovesiKiertoEnabled = true;
  }
  if (
    !m.mittaaKokoLaiteSahko &&
    hasText(m.kokoLaiteVirta1vaihe, m.kokoLaiteVirtaL1, m.kokoLaiteVirtaL2, m.kokoLaiteVirtaL3)
  ) {
    patch.mittaaKokoLaiteSahko = true;
  }
  if (!m.lampoPaisuntaAstiaTarkistettu && hasText(m.lampoPaisuntaAstiaKoko, m.lampoPaisuntaAstiaEsipaine)) {
    patch.lampoPaisuntaAstiaTarkistettu = true;
  }

  return patch;
}
