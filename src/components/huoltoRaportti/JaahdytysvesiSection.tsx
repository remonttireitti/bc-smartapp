import { createEmptyJaahdytysvesiData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function JaahdytysvesiSection({ form, onChange }: Props) {
  const data = form.jaahdytysvesiData ?? createEmptyJaahdytysvesiData();

  const patch = (next: Partial<typeof data>) =>
    onChange({ jaahdytysvesiData: { ...data, ...next } });

  return (
    <HuoltoModuleSection
      moduleKey="vedenjajahdytyskone"
      title={
        form.laiteTyyppi === 'vedenjäähdytyskone' || form.laiteTyyppi === 'vakioilmastointtikone'
          ? 'Jäähdytyskone — jäähdytysveden piiri'
          : 'Jäähdytysveden piiri'
      }
    >
      <p className="muted huolto-help">
        Nestekiertoinen jäähdytysveden piiri kuuluu aina vedenjäähdytyskoneeseen ja vakioilmastointikoneeseen.
      </p>
      <NestepiiriFields data={data} onChange={patch} showPiiriTarkistukset />
    </HuoltoModuleSection>
  );
}
