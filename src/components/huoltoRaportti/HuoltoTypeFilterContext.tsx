import { createContext, useContext } from 'react';
import { deviceTypes } from '../../lib/huoltoRaportti/constants';

/** Yrityksen käytössä olevat kylmälaitetyypit; null = ei rajausta. */
export const HuoltoTypeFilterContext = createContext<string[] | null>(null);

/** Laitetyyppivalinnat: vain käytössä olevat + raportin nykyinen tyyppi (vanhat raportit). */
export function useEnabledDeviceTypes(current?: string) {
  const enabled = useContext(HuoltoTypeFilterContext);
  if (!enabled) return deviceTypes;
  return deviceTypes.filter((dt) => enabled.includes(dt.value) || dt.value === current);
}
