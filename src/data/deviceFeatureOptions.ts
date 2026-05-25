/**
 * Valittavat tuloste-/myyntiominaisuudet laiterekisterissä (checkbox-listat).
 */
export const IILP_FEATURE_OPTIONS = [
  { id: 'wifi', label: 'WiFi / etähallinta (vakio tai valinnainen)' },
  { id: 'hepa', label: 'HEPA / tehokas ilmansuodatin' },
  { id: 'flash_streamer', label: 'Flash streamer / ionisaatio (mallista riippuen)' },
  { id: 'silent', label: 'Hiljainen käynti / yötila' },
  { id: 'r32', label: 'R32-kylmäaine' },
  { id: 'inverter', label: 'Invertteriohjaus' },
  { id: 'presence', label: 'Läsnäolo / älykäs ohjaus' },
  { id: 'draft_shield', label: 'Luonnonsuoja / vedonesto (mallista riippuen)' },
] as const;

export const VILP_FEATURE_OPTIONS = [
  { id: 'wifi', label: 'WiFi / etähallinta' },
  { id: 'hydrobox', label: 'Hydrobox / jaotuskeskus' },
  { id: 'integrated_tank', label: 'Integroitu varaaja' },
  { id: 'cooling', label: 'Jäähdytys' },
  { id: 'r290', label: 'R290 / matala GWP' },
  { id: 'low_temp', label: 'Matalalämpö käyttö' },
] as const;

export type IilpFeatureId = (typeof IILP_FEATURE_OPTIONS)[number]['id'];
export type VilpFeatureId = (typeof VILP_FEATURE_OPTIONS)[number]['id'];
