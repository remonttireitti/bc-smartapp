import { isChillerLikeDevice, isKonvektoritDevice } from './deviceModuleLogic';

export type ReportOwnerTarget = {
  companyId: string;
  label: string;
};

export type CustomerBasicsInput = {
  profileCompanyId: string | null | undefined;
  reportOwnerCompanyId: string | null;
  reportOwnerTargets: ReportOwnerTarget[];
  customerId: string;
  asiakas: string;
  osoite: string;
  canEditCustomerEquipment: boolean;
};

export type DeviceBasicsInput = {
  laiteTyyppi: string;
  laiteValmistaja: string;
  laiteMalli: string;
  laiteTunnus: string;
  laiteSarjanumero: string;
  laiteSijainti: string;
  laiteKayttotarkoitus: string;
  kylmaaineTyyppi: string;
  kylmaainePiireja: string;
  selectedModules: Record<string, boolean>;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
};

function result(errors: Record<string, string>): ValidationResult {
  const messages = Object.values(errors);
  return { ok: messages.length === 0, errors: messages, fieldErrors: errors };
}

export function validateMaintenanceCustomerBasics(input: CustomerBasicsInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.profileCompanyId) {
    errors.profile = 'Profiilista puuttuu yritys.';
    return result(errors);
  }

  if (!input.canEditCustomerEquipment) {
    return result(errors);
  }

  const needsExplicitOwner = !input.customerId && input.reportOwnerTargets.length > 1;
  if (needsExplicitOwner) {
    const ownerValid =
      Boolean(input.reportOwnerCompanyId)
      && input.reportOwnerTargets.some((target) => target.companyId === input.reportOwnerCompanyId);
    if (!ownerValid) {
      errors.reportOwnerCompanyId = 'Valitse yritys, jonka nimissä raportti laaditaan.';
    }
  }

  if (!input.customerId && !input.asiakas.trim()) {
    errors.customer = 'Valitse asiakas tai täytä asiakkaan nimi.';
  }

  if (!input.osoite.trim()) {
    errors.osoite = 'Asiakkaan kohteen osoite on pakollinen.';
  }

  return result(errors);
}

export function showRefrigerantBasics(input: DeviceBasicsInput): boolean {
  return Boolean(input.laiteTyyppi)
    && (input.selectedModules.kylmaainePiiri || input.laiteTyyppi === 'lämpöpumppu');
}

export function validateMaintenanceDeviceBasics(input: DeviceBasicsInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.laiteTyyppi.trim()) {
    errors.laiteTyyppi = 'Valitse laitetyyppi.';
    return result(errors);
  }

  if (isKonvektoritDevice(input.laiteTyyppi)) {
    if (!input.laiteKayttotarkoitus.trim()) {
      errors.laiteKayttotarkoitus = 'Verkoston kuvaus on pakollinen.';
    }
    if (!input.laiteSijainti.trim()) {
      errors.laiteSijainti = 'Alue / rakennus / kerros on pakollinen.';
    }
    return result(errors);
  }

  if (!input.laiteValmistaja.trim()) {
    errors.laiteValmistaja = 'Valmistaja on pakollinen.';
  }
  if (!input.laiteMalli.trim()) {
    errors.laiteMalli = 'Malli on pakollinen.';
  }
  if (!input.laiteTunnus.trim()) {
    errors.laiteTunnus = 'Laitetunnus on pakollinen.';
  }
  if (!input.laiteSarjanumero.trim()) {
    errors.laiteSarjanumero = 'Sarjanumero on pakollinen (esim. ei luettavissa / tiedossa).';
  }
  if (!input.laiteSijainti.trim()) {
    errors.laiteSijainti = 'Sijainti on pakollinen.';
  }

  return result(errors);
}

export function validateMaintenanceRefrigerantBasics(input: DeviceBasicsInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!showRefrigerantBasics(input)) {
    return result(errors);
  }

  if (!input.kylmaaineTyyppi.trim()) {
    errors.kylmaaineTyyppi = 'Valitse kylmäaine.';
  }
  if (input.laiteTyyppi !== 'lämpöpumppu' && !input.kylmaainePiireja.trim()) {
    errors.kylmaainePiireja = 'Valitse kylmäainepiirejä.';
  }

  return result(errors);
}

export function isRaportointiBasicsComplete(
  customerInput: CustomerBasicsInput,
  deviceInput: DeviceBasicsInput,
): boolean {
  return validateMaintenanceCustomerBasics(customerInput).ok
    && validateMaintenanceDeviceBasics(deviceInput).ok;
}

export function isMaintenanceBasicsComplete(
  customerInput: CustomerBasicsInput,
  deviceInput: DeviceBasicsInput,
): boolean {
  if (!isRaportointiBasicsComplete(customerInput, deviceInput)) return false;
  return validateMaintenanceRefrigerantBasics(deviceInput).ok;
}

export { isChillerLikeDevice, isKonvektoritDevice };
