import { useHuoltoModulePresentation } from '../components/huoltoRaportti/HuoltoModulePresentationContext';

/** Lomake näytetään tulosteen rivi/grid-asettelulla (dokumenttinäkymä). */
export function useHuoltoPrintFormLayout(): boolean {
  return useHuoltoModulePresentation() === 'flat';
}
