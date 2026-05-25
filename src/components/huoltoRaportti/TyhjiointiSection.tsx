import {
  KLO_PUOLI_TUNNIN_VAIHTOEHDOT,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from '../../lib/huoltoRaportti/kokeAikaUtils';
import type { HuoltoReportData, TyhjiointiData, TyhjiointiPaineYksikko } from '../../lib/huoltoRaportti/types';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string | null;
  userId?: string;
}

export function TyhjiointiSection({ form, onChange, reportId, userId }: Props) {
  const data = form.tyhjiointiData;

  function patchTyhjiointi(patch: Partial<TyhjiointiData>) {
    onChange({ tyhjiointiData: { ...data, ...patch } });
  }

  const resolved = resolveKoePaivamaaraJaKello(
    data.koeAlkaaPvm,
    data.koeAlkaaKlo,
    form.huoltoPaivamaara,
  );
  const loppuaika = laskeKokeLoppuaikaFi(resolved.pvmIso, resolved.klo, data.kestoMin);

  return (
    <HuoltoModuleSection moduleKey="tyhjiointi" title="Tyhjiöinti">
      <div className="line-form-grid">
        <FormInput
          label="Loppupaine (arvo)"
          value={data.loppupaineArvo}
          onChange={(v) => patchTyhjiointi({ loppupaineArvo: v })}
          placeholder="Esim. 500 tai 0,05"
        />
        <label>
          Loppupaineen yksikkö
          <select
            value={data.loppupaineYksikko}
            onChange={(e) =>
              patchTyhjiointi({
                loppupaineYksikko: (e.target.value === 'mbar' ? 'mbar' : 'micron') as TyhjiointiPaineYksikko,
              })
            }
          >
            <option value="micron">µm (micron)</option>
            <option value="mbar">mbar (millibar)</option>
          </select>
        </label>
        <label>
          Koe alkoi — päivämäärä
          <input
            type="date"
            value={data.koeAlkaaPvm}
            onChange={(e) => patchTyhjiointi({ koeAlkaaPvm: e.target.value })}
          />
        </label>
        <label>
          Koe alkoi — kellonaika (puolen tunnin tarkkuus)
          <select
            value={data.koeAlkaaKlo}
            onChange={(e) => patchTyhjiointi({ koeAlkaaKlo: e.target.value })}
          >
            <option value="">—</option>
            {KLO_PUOLI_TUNNIN_VAIHTOEHDOT.map((k) => (
              <option key={`tyhj-${k}`} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Kesto (min)"
          value={data.kestoMin}
          onChange={(v) => patchTyhjiointi({ kestoMin: v })}
        />
        <label>
          Koe päättyi (laskettu alusta + kesto)
          <div className="huolto-readonly-field">{loppuaika || '—'}</div>
        </label>
        <FormInput
          label="Käytetty painemittari"
          value={data.kaytettyPainemittari}
          onChange={(v) => patchTyhjiointi({ kaytettyPainemittari: v })}
          placeholder="Malli / tunniste"
          className="huolto-span-all"
        />
        <label className="huolto-span-all">
          Huomiot
          <textarea
            value={data.huom}
            onChange={(e) => patchTyhjiointi({ huom: e.target.value })}
            rows={3}
          />
        </label>
      </div>
      {reportId && userId ? (
        <EvidencePhotoUpload
          reportId={reportId}
          section="tyhjiointi"
          paths={data.todisteKuvat ?? []}
          userId={userId}
          onChange={(paths) => patchTyhjiointi({ todisteKuvat: paths })}
        />
      ) : (
        <p className="muted">Tallenna luonnos ensin, jotta voit liittää kuvatodisteita.</p>
      )}
    </HuoltoModuleSection>
  );
}
