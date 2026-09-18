import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { buildLampopumppuDocumentUnits } from '../../lib/huoltoRaportti/lampopumppuDocumentHelpers';
import { LampopumppuDocumentUnit } from './LampopumppuDocumentUnit';

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  showUlkoyksikko?: boolean;
  showSisayksikko?: boolean;
  showMittaukset?: boolean;
};

/** Fallback when lampopumppu is rendered as a single tab (document view prefers three unit tiles). */
export function LampopumppuDocumentSection({
  form,
  onChange,
  showUlkoyksikko = true,
  showSisayksikko = true,
  showMittaukset = true,
}: Props) {
  const units = buildLampopumppuDocumentUnits(form).filter((unit) => {
    if (unit.id === 'ulkoyksikko') return showUlkoyksikko;
    if (unit.id === 'sisayksikko') return showSisayksikko;
    return showMittaukset;
  });

  return (
    <>
      {units.map((unit) => (
        <LampopumppuDocumentUnit
          key={unit.tabId}
          form={form}
          unitId={unit.id}
          onChange={onChange}
          documentUnitKey={unit.tabId}
        />
      ))}
    </>
  );
}
