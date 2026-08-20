import { applyDeviceTypeDefaults, mergeHuoltoReportData } from './defaults';
import { validateMaintenanceDeviceBasics } from './maintenanceReportBasicsValidation';
import type { HuoltoReportData } from './types';

export type DeviceDialogApplyResult =
  | { ok: true; next: HuoltoReportData }
  | { ok: false; fieldErrors: Record<string, string> };

export function buildDeviceDialogApplyResult(
  base: HuoltoReportData,
  deviceDraft: HuoltoReportData,
): DeviceDialogApplyResult {
  const validation = validateMaintenanceDeviceBasics({
    laiteTyyppi: deviceDraft.laiteTyyppi,
    laiteValmistaja: deviceDraft.laiteValmistaja,
    laiteMalli: deviceDraft.laiteMalli,
    laiteTunnus: deviceDraft.laiteTunnus,
    laiteSarjanumero: deviceDraft.laiteSarjanumero,
    laiteSijainti: deviceDraft.laiteSijainti,
    laiteKayttotarkoitus: deviceDraft.laiteKayttotarkoitus,
    kylmaaineTyyppi: deviceDraft.kylmaaineTyyppi,
    kylmaainePiireja: deviceDraft.kylmaainePiireja,
    selectedModules: deviceDraft.selectedModules,
  });
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.fieldErrors };
  }

  const withDefaults: HuoltoReportData =
    deviceDraft.laiteTyyppi !== base.laiteTyyppi
      ? {
          ...applyDeviceTypeDefaults(base, deviceDraft.laiteTyyppi),
          hiddenTabIds: [],
          moduleTabOrder: [],
        }
      : base;

  return {
    ok: true,
    next: mergeHuoltoReportData(withDefaults, {
      laiteTyyppi: deviceDraft.laiteTyyppi,
      laiteValmistaja: deviceDraft.laiteValmistaja,
      laiteMalli: deviceDraft.laiteMalli,
      laiteTunnus: deviceDraft.laiteTunnus,
      laiteSarjanumero: deviceDraft.laiteSarjanumero,
      laiteSijainti: deviceDraft.laiteSijainti,
      laiteKayttotarkoitus: deviceDraft.laiteKayttotarkoitus,
      vjOhjausData: deviceDraft.vjOhjausData,
    }),
  };
}

/** Päivitä laitetyyppi heti valinnassa — ei odota dialogin sulkemista. */
export function applyDeviceTypeSelection(
  base: HuoltoReportData,
  deviceType: string,
): HuoltoReportData {
  if (!deviceType.trim() || deviceType === base.laiteTyyppi) return base;
  return {
    ...applyDeviceTypeDefaults(base, deviceType),
    hiddenTabIds: [],
    moduleTabOrder: [],
  };
}

/** Raportointi-popup: asiakastiedot luonnoksesta, laitetiedot aina live-formista. */
export function mergeRaportointiDialogClose(
  live: HuoltoReportData,
  draft: HuoltoReportData,
): HuoltoReportData {
  return mergeHuoltoReportData(live, {
    asiakas: draft.asiakas,
    osoite: draft.osoite,
    asiakasYtunnus: draft.asiakasYtunnus,
    asiakasYhteyshenkilo: draft.asiakasYhteyshenkilo,
    asiakasPuhelin: draft.asiakasPuhelin,
    asiakasEmail: draft.asiakasEmail,
    customerId: draft.customerId,
  });
}
