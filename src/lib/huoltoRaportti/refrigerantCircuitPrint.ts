import type { RefrigerantCircuitData } from './types';

/** Tulistuslaskelma ja -varoitukset näytetään vain kun käyttäjä on kytkenyt tulosteen päälle. */
export function circuitSuperheatPrintEnabled(
  kp: Pick<RefrigerantCircuitData, 'tulistusTulosteeseen'> | null | undefined,
): boolean {
  return kp?.tulistusTulosteeseen === true;
}

/** Alijäähdytyslaskelma ja -varoitukset näytetään vain kun käyttäjä on kytkenyt tulosteen päälle. */
export function circuitSubcoolingPrintEnabled(
  kp: Pick<RefrigerantCircuitData, 'alijahdytysTulosteeseen'> | null | undefined,
): boolean {
  return kp?.alijahdytysTulosteeseen === true;
}
