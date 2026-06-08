import { koeTulosOptions } from '../../lib/huoltoRaportti/constants';
import {
  KLO_PUOLI_TUNNIN_VAIHTOEHDOT,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from '../../lib/huoltoRaportti/kokeAikaUtils';
import type { HuoltoReportData, TiiveyskoeData, TiiveyskoeTulos } from '../../lib/huoltoRaportti/types';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { RichCommentEditor } from './RichCommentEditor';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string | null;
  userId?: string;
}

export function TiiveyskoeSection({ form, onChange, reportId, userId }: Props) {
  const data = form.tiiveyskoeData;

  function patchTiiveyskoe(patch: Partial<TiiveyskoeData>) {
    onChange({ tiiveyskoeData: { ...data, ...patch } });
  }

  const resolved = resolveKoePaivamaaraJaKello(
    data.koeAlkaaPvm,
    data.koeAlkaaKlo,
    form.huoltoPaivamaara,
  );
  const loppuaika = laskeKokeLoppuaikaFi(resolved.pvmIso, resolved.klo, data.kestoMin);

  return (
    <HuoltoModuleSection moduleKey="tiiveyskoe" title="Tiiveyskoe">
      <div className="line-form-grid huolto-measurement-grid">
        <FormInput
          label="Koepaine (bar)"
          value={data.testipaineBar}
          onChange={(v) => patchTiiveyskoe({ testipaineBar: v })}
          placeholder="Esim. 42"
        />
        <label>
          Koe alkoi — päivämäärä
          <input
            type="date"
            value={data.koeAlkaaPvm}
            onChange={(e) => patchTiiveyskoe({ koeAlkaaPvm: e.target.value })}
          />
        </label>
        <label>
          Koe alkoi — kellonaika (puolen tunnin tarkkuus)
          <select
            value={data.koeAlkaaKlo}
            onChange={(e) => patchTiiveyskoe({ koeAlkaaKlo: e.target.value })}
          >
            <option value="">—</option>
            {KLO_PUOLI_TUNNIN_VAIHTOEHDOT.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Kesto (min)"
          value={data.kestoMin}
          onChange={(v) => patchTiiveyskoe({ kestoMin: v })}
        />
        <label>
          Koe päättyi (laskettu alusta + kesto)
          <div className="huolto-readonly-field">{loppuaika || '—'}</div>
        </label>
        <FormInput
          label="Testauslämpötila (°C)"
          value={data.testauslampotila}
          onChange={(v) => patchTiiveyskoe({ testauslampotila: v })}
        />
        <label>
          Tulos
          <select
            value={data.tulos}
            onChange={(e) =>
              patchTiiveyskoe({ tulos: e.target.value as TiiveyskoeTulos })
            }
          >
            {koeTulosOptions.map((opt) => (
              <option key={opt.value || 'empty'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Menetelmä / väline"
          value={data.menetelma}
          onChange={(v) => patchTiiveyskoe({ menetelma: v })}
          placeholder="Esim. paine- / kaasumenetelmä"
          className="huolto-span-all"
        />
        <label className="huolto-span-all">
          Huomiot
          <RichCommentEditor
            value={data.huom}
            onChange={(huom) => patchTiiveyskoe({ huom })}
            rows={3}
          />
        </label>
      </div>
      {reportId && userId ? (
        <EvidencePhotoUpload
          reportId={reportId}
          section="tiiveyskoe"
          items={data.todisteKuvat ?? []}
          userId={userId}
          onChange={(todisteKuvat) => patchTiiveyskoe({ todisteKuvat })}
        />
      ) : (
        <p className="muted">Tallenna luonnos ensin, jotta voit liittää kuvatodisteita.</p>
      )}
    </HuoltoModuleSection>
  );
}
