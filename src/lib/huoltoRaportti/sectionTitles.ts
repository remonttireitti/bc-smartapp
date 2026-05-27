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
  if (deviceType === 'konvektorit') return '3. Huomiot';
  if (isGroundSourceHeatPump(deviceType)) return '6. Huomiot';
  return '6. Huomiot';
}

export function huoltoTiedotSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Huoltotiedot';
  if (deviceType === 'konvektorit') return '4. Huolto tiedot';
  if (isGroundSourceHeatPump(deviceType)) return '7. Huolto tiedot';
  return '7. Huolto tiedot';
}

export function kylmaaineChargeTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Kylmäaine';
  return '3. Kylmäaine';
}

export function kylmaainePiiriSectionTitle(deviceType: string): string {
  if (isGroundSourceHeatPump(deviceType)) return '4. Kylmäpiiri 1 mittaukset';
  if (isChillerLikeDevice(deviceType)) return 'Kylmäainepiirin rakenne ja mittaukset';
  if (usesLegacySectionNumbers(deviceType)) return 'Kylmäainepiiri';
  return 'Kylmäainepiiri';
}

export function kylmaainePiiriCircuitLabel(deviceType: string, circuitNumber: number): string {
  if (usesLegacySectionNumbers(deviceType) && !isChillerLikeDevice(deviceType)) {
    return `4. Kylmäpiiri ${circuitNumber} mittaukset`;
  }
  return `Kylmäainepiiri ${circuitNumber}`;
}

export function hoyrystinSectionTitle(deviceType: string): string {
  if (!usesLegacySectionNumbers(deviceType)) return 'Höyrystin';
  return 'Höyrystin';
}

export function hoyrystinUnitTitle(deviceType: string, index: number): string {
  if (deviceType === 'kylmäkoneikko') return `4.${index + 1} Höyrystimen tiedot — Höyrystin ${index + 1}`;
  if (isChillerLikeDevice(deviceType)) {
    return index === 0 ? '4.1 Höyrystin (yhteinen)' : `4.${index + 1} Höyrystin ${index + 1}`;
  }
  if (deviceType === 'pakastin') return `4.${index + 1} Höyrystimen tiedot — Piiri ${index + 1}`;
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
  if (isChillerLikeDevice(deviceType)) return '4.1 Jäähdytyspiiri';
  return 'Jäähdytysveden piiri';
}

export function lauhdutuspiiriSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return '5.2 Lauhdutuspiiri';
  return 'Lauhdutuspiiri';
}

export function nestelauhduttimetSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return 'Nestelauhduttimet (vedenjäähdytyskone)';
  return 'Nestelauhdutin';
}

export function lampopumppuUlkoyksikkoTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return '4. Ulkoyksikkö';
  if (isWaterAirHeatPump(deviceType)) return `4.1 ${keruupiiriSectionTitle(deviceType)}`;
  return 'Ulkoyksikkö';
}

export function lampopumppuSisayksikkoTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return '5. Sisäyksiköt';
  return 'Sisäyksiköt';
}

export function lampopumppuMittauksetTitle(deviceType: string): string {
  if (isAirSourceHeatPump(deviceType)) return '6. Mittaukset';
  return 'Mittaukset';
}

export function kiinteistoPiiriSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType)) return '5.4 Kiinteistön jäähdytyspiiri';
  if (isGroundSourceHeatPump(deviceType)) return '5.4 Kiinteistö lämmityspiiri';
  return 'Kiinteistön lämmitys-/jäähdytyspiiri';
}

export function energiatehokkuusSectionTitle(deviceType: string): string {
  if (isChillerLikeDevice(deviceType) || isGroundSourceHeatPump(deviceType)) {
    return '5.5 Lämpöpumpun energiatehokkuus';
  }
  return 'Energiatehokkuus';
}

export function konvektoritSectionTitle(deviceType: string): string {
  if (deviceType === 'konvektorit') return '2. Konvektorit';
  return 'Konvektorit';
}
