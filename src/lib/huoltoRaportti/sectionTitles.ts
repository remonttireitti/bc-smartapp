import {
  isAirSourceHeatPump,
  isChillerLikeDevice,
  isGroundSourceHeatPump,
  isWaterAirHeatPump,
  keruupiiriSectionTitle,
  usesLegacySectionNumbers,
} from './deviceModuleLogic';

export function huomiotSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Huomiot';
  if (deviceType === 'konvektorit') return 'Huomiot';
  if (isGroundSourceHeatPump(deviceType)) return 'Huomiot';
  return 'Huomiot';
}

export function huoltoTiedotSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Huoltotiedot';
  if (deviceType === 'konvektorit') return 'Huoltotiedot';
  if (isGroundSourceHeatPump(deviceType)) return 'Huoltotiedot';
  return 'Huoltotiedot';
}

export function kylmaaineChargeTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Kylmäaine';
  return 'Kylmäaine';
}

export function kylmaainePiiriSectionTitle(deviceType: string): string {
  if (isGroundSourceHeatPump(deviceType) || isWaterAirHeatPump(deviceType)) {
    return 'Kylmäainepiiri';
  }
  if (isChillerLikeDevice(deviceType)) return 'Kylmäainepiirin rakenne ja mittaukset';
  if (usesLegacySectionNumbers(deviceType)) return 'Kylmäainepiiri';
  return 'Kylmäainepiiri';
}

export function kylmaainePiiriCircuitLabel(deviceType: string, circuitNumber: number): string {
  if (isGroundSourceHeatPump(deviceType) || isWaterAirHeatPump(deviceType)) {
    return `Kylmäainepiiri ${circuitNumber} mittaukset`;
  }
  if (usesLegacySectionNumbers(deviceType) && !isChillerLikeDevice(deviceType)) {
    return `Kylmäpiiri ${circuitNumber} mittaukset`;
  }
  return `Kylmäainepiiri ${circuitNumber}`;
}

export function mlpKeruupiiriSectionTitle(deviceType: string): string {
  if (isGroundSourceHeatPump(deviceType)) {
    return `5.1 ${keruupiiriSectionTitle(deviceType)}`;
  }
  if (isWaterAirHeatPump(deviceType)) {
    return `${keruupiiriSectionTitle(deviceType)}`;
  }
  if (isChillerLikeDevice(deviceType)) {
    return 'Jäähdytyspiiri';
  }
  return keruupiiriSectionTitle(deviceType);
}

export function mlpJaahdytyspiiriSectionTitle(deviceType: string): string {
  return isGroundSourceHeatPump(deviceType)
    ? 'Erillinen keruu- / jäähdytyspiiri'
    : 'Erillinen keruu- / jäähdytyspiiri';
}

export function hoyrystinSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Höyrystin';
  return 'Höyrystin';
}

export function hoyrystinUnitTitle(deviceType: string, index: number): string {
  if (deviceType === 'kylmäkoneikko') return `Höyrystin ${index + 1}`;
  if (isChillerLikeDevice(deviceType)) {
    return index === 0 ? 'Höyrystin (yhteinen)' : `Höyrystin ${index + 1}`;
  }
  if (deviceType === 'pakastin') return `Piiri ${index + 1}`;
  return `Höyrystin ${index + 1}`;
}

export function lauhdutinSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Lauhdutin';
  return 'Lauhdutin';
}

export function lauhdutinUnitTitle(deviceType: string, index: number): string {
  if (deviceType === 'pakastin' || deviceType === 'kylmäkoneikko') {
    return `3.${index + 1} Lauhdutimen tiedot — Piiri ${index + 1}`;
  }
  return `Lauhdutin — piiri ${index + 1}`;
}

export function jaahdytysvesiSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return 'Jäähdytyspiiri';
  return 'Jäähdytysveden piiri';
}

export function lauhdutuspiiriSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return 'Lauhdutuspiiri';
  return 'Lauhdutuspiiri';
}

export function nestelauhduttimetSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return 'Nestelauhduttimet';
  return 'Nestelauhdutin';
}

export function lampopumppuUlkoyksikkoTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return 'Ulkoyksikkö';
  if (isWaterAirHeatPump(deviceType)) return `${keruupiiriSectionTitle(deviceType)}`;
  return 'Ulkoyksikkö';
}

export function lampopumppuSisayksikkoTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return 'Sisäyksiköt';
  return 'Sisäyksiköt';
}

export function lampopumppuMittauksetTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return 'Mittaukset';
  return 'Mittaukset';
}

export function kiinteistoPiiriSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return 'Kiinteistön jäähdytyspiiri';
  if (isGroundSourceHeatPump(deviceType)) return 'Kiinteistö lämmityspiiri';
  return 'Kiinteistön lämmitys-/jäähdytyspiiri';
}

export function energiatehokkuusSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType) || isGroundSourceHeatPump(deviceType)) {
    return 'Lämpöpumpun energiatehokkuus';
  }
  return 'Energiatehokkuus';
}

export function konvektoritSectionTitle(deviceType: string): string {
  if (deviceType === 'konvektorit') return 'Konvektorit';
  return 'Konvektorit';
}

export function raportointiLaitetiedotTabTitle(deviceType: string, showKylmaaineCharge: boolean): string {
  let devicePart: string;
  if (deviceType === 'konvektorit') {
    devicePart = 'asiakas';
  } else if (showKylmaaineCharge) {
    devicePart = 'laitetiedot ja kylmäaine';
  } else {
    devicePart = 'laitetiedot';
  }
  const base = deviceType === 'konvektorit'
    ? 'Raportointi ja asiakas'
    : `Raportointi, asiakas ja ${devicePart}`;
  if (usesLegacySectionNumbers(deviceType) && deviceType !== 'konvektorit') {
    return base;
  }
  return base;
}

/** @deprecated Prefer raportointiLaitetiedotTabTitle */
export function laitetiedotTabTitle(deviceType: string, showKylmaaineCharge: boolean): string {
  return raportointiLaitetiedotTabTitle(deviceType, showKylmaaineCharge);
}
