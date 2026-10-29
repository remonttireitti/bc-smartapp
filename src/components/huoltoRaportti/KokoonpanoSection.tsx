import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import {
  ilpJarjestelmaOptions,
  ilpSisayksikkoChoices,
  mlpJaahdytysOptions,
  vakHasRefrigerant,
  type IlpJarjestelma,
  type LaiteKokoonpano,
  type MlpJaahdytysTila,
} from '../../lib/huoltoRaportti/deviceKokoonpano';
import { createEmptyMittausSisayksikkoData, createEmptySisayksikkoData } from '../../lib/huoltoRaportti/defaults';
import ToggleSwitch from '../ToggleSwitch';

/** Kokoonpanon kytkin näkyy aina (FormCheckbox piilottaa pois-tilan dokumenttinäkymässä). */
function FormCheckbox(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <ToggleSwitch className="form-toggle huolto-span-all" {...props} />;
}

type Props = {
  form: HuoltoReportData;
  onFreeCoolingChange: (enabled: boolean) => void;
  onKokoonpanoChange: (next: LaiteKokoonpano, extra?: Partial<HuoltoReportData>) => void;
};

function ilpCountPatch(form: HuoltoReportData, jarjestelma: IlpJarjestelma): Partial<HuoltoReportData> {
  const choices = ilpSisayksikkoChoices(jarjestelma);
  const current = form.sisayksikkoMaara ?? 1;
  const count = choices.includes(current) ? current : choices[0];
  if (count === current) return {};
  const pad = <T,>(arr: T[] | undefined, create: () => T) => {
    const out = [...(arr ?? [])];
    while (out.length < count) out.push(create());
    return out.slice(0, count);
  };
  return {
    sisayksikkoMaara: count,
    sisayksikkoData: pad(form.sisayksikkoData, createEmptySisayksikkoData),
    sisaSamaKuinEnsimmainen: pad(form.sisaSamaKuinEnsimmainen, () => false),
    mittausSisayksikot: pad(form.mittausSisayksikot, createEmptyMittausSisayksikkoData),
    mittausSamaKuinEnsimmainen: pad(form.mittausSamaKuinEnsimmainen, () => false),
  };
}

export function KokoonpanoSection({ form, onFreeCoolingChange, onKokoonpanoChange }: Props) {
  const k = form.laiteKokoonpano ?? {};
  const type = form.laiteTyyppi;
  const set = (patch: Partial<LaiteKokoonpano>, extra?: Partial<HuoltoReportData>) =>
    onKokoonpanoChange({ ...k, ...patch }, extra);

  return (
    <section className="maintenance-report-tab-section huolto-kokoonpano form-grid">
      {type === 'vedenjäähdytyskone' ? (
        <>
          <FormCheckbox
            label="Vapaajäähdytys"
            checked={Boolean(form.vapaajahdytysKaytossa)}
            onChange={onFreeCoolingChange}
          />
          <FormCheckbox
            label="Lämmitystoiminto (piirit vaihtavat paikkaa)"
            checked={k.lammitysToiminto === true}
            onChange={(checked) => set({ lammitysToiminto: checked })}
          />
        </>
      ) : null}

      {type === 'vakioilmastointtikone' ? (
        <>
          <FormCheckbox
            label="Kylmäainepiiri (suora höyrystys)"
            checked={vakHasRefrigerant(form)}
            onChange={(checked) => set({ vakKylmaainepiiri: checked })}
          />
          <FormCheckbox
            label="Vapaajäähdytys"
            checked={Boolean(form.vapaajahdytysKaytossa)}
            onChange={onFreeCoolingChange}
          />
          <FormCheckbox
            label="Kostutus (höyrysylinteri)"
            checked={k.kostutus === true}
            onChange={(checked) => set({ kostutus: checked })}
          />
          <FormCheckbox
            label="Kuivaus (sähkövastukset)"
            checked={k.kuivaus === true}
            onChange={(checked) => set({ kuivaus: checked })}
          />
        </>
      ) : null}

      {type === 'mlp' ? (
        <label className="huolto-span-all">
          Jäähdytys *
          <select
            value={k.mlpJaahdytys ?? ''}
            onChange={(e) => set({ mlpJaahdytys: e.target.value as MlpJaahdytysTila })}
          >
            <option value="">Valitse…</option>
            {mlpJaahdytysOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      {type === 'lämpöpumppu' ? (
        <div className="huolto-span-all">
          <span className="huolto-kokoonpano-label">Järjestelmä *</span>
          <div className="btn-group huolto-kokoonpano-choices">
            {ilpJarjestelmaOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-secondary btn-sm${k.ilpJarjestelma === opt.value ? ' btn-active' : ''}`}
                aria-pressed={k.ilpJarjestelma === opt.value}
                onClick={() => set({ ilpJarjestelma: opt.value }, ilpCountPatch(form, opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="muted huolto-help">
            {ilpJarjestelmaOptions.find((opt) => opt.value === k.ilpJarjestelma)?.hint ?? 'Valitse järjestelmätyyppi.'}
          </p>
        </div>
      ) : null}

    </section>
  );
}
