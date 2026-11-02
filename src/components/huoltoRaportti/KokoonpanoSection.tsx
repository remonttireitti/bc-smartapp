import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import {
  ilpJarjestelmaOptions,
  ilpSisayksikkoChoices,
  mlpJaahdytysOptions,
  vakCondenserChoices,
  vakCondenserForVariant,
  vakHasWaterCoil,
  vakVariantOptions,
  vakVariantti,
  type VakVariantti,
  vakKostutinTyyppiOptions,
  vakLammitysTyyppiOptions,
  vakVesiventtiiliOptions,
  type IlpJarjestelma,
  type LaiteKokoonpano,
  type MlpJaahdytysTila,
} from '../../lib/huoltoRaportti/deviceKokoonpano';
import { createEmptyMittausSisayksikkoData, createEmptySisayksikkoData } from '../../lib/huoltoRaportti/defaults';
import ToggleSwitch from '../ToggleSwitch';
import { FormInput } from './FormInput';

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
  const variantti = vakVariantti(form);
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
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
          <label className="huolto-span-all">
            Jäähdytystapa
            <select
              value={variantti}
              onChange={(e) => {
                const v = e.target.value as VakVariantti;
                set(
                  { vakVariantti: v, vakKylmaainepiiri: v !== 'nestekierto' },
                  v === 'nestekierto'
                    ? undefined
                    : { lauhdutinTyyppiLaite: vakCondenserForVariant(v, form.lauhdutinTyyppiLaite) as HuoltoReportData['lauhdutinTyyppiLaite'] },
                );
              }}
            >
              {vakVariantOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {variantti !== 'nestekierto' ? (
            <>
              <label className="huolto-span-all">
                Lauhdutustapa
                <select
                  value={vakCondenserForVariant(variantti, form.lauhdutinTyyppiLaite)}
                  onChange={(e) => set({}, { lauhdutinTyyppiLaite: e.target.value as HuoltoReportData['lauhdutinTyyppiLaite'] })}
                >
                  {vakCondenserChoices[variantti].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {variantti === 'dx_neste' ? (
                <label className="huolto-span-all">
                  Lauhdutusveden venttiili
                  <select value={k.vakVesiventtiili ?? ''} onChange={(e) => set({ vakVesiventtiili: e.target.value as LaiteKokoonpano['vakVesiventtiili'] })}>
                    <option value="">Valitse…</option>
                    {vakVesiventtiiliOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ) : null}
              {variantti === 'dx_neste' && form.lauhdutinTyyppiLaite === 'nestekiertoinen' && circuitCount > 1 ? (
                <FormCheckbox
                  label="Yhteinen nestelauhdutin kaikille piireille"
                  checked={form.vjNestelauhdutusJaettu ?? true}
                  onChange={(checked) => set({}, { vjNestelauhdutusJaettu: checked })}
                />
              ) : null}
              <FormCheckbox
                label="Lisäksi vesikenno (dual fluid)"
                checked={vakHasWaterCoil(form)}
                onChange={(checked) => set({ vakVesikenno: checked })}
              />
            </>
          ) : null}
          <FormCheckbox
            label="Jäähdytys"
            checked={k.vakJaahdytys !== false}
            onChange={(checked) => set({ vakJaahdytys: checked })}
          />
          <FormCheckbox
            label="Lämmitys"
            checked={k.vakLammitys === true}
            onChange={(checked) => set({ vakLammitys: checked })}
          />
          {k.vakLammitys === true ? (
            <>
              <label>
                Lämmityksen tyyppi
                <select value={k.vakLammitysTyyppi ?? ''} onChange={(e) => set({ vakLammitysTyyppi: e.target.value as LaiteKokoonpano['vakLammitysTyyppi'] })}>
                  <option value="">Valitse…</option>
                  {vakLammitysTyyppiOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {k.vakLammitysTyyppi === 'sahko' ? (
                <FormInput label="Lämmitysteho (kW)" type="number" value={k.vakLammitysKw ?? ''} onChange={(v) => set({ vakLammitysKw: v })} />
              ) : null}
            </>
          ) : null}
          <FormCheckbox
            label="Kostutus"
            checked={k.kostutus === true}
            onChange={(checked) => set({ kostutus: checked })}
          />
          {k.kostutus === true ? (
            <>
              <label>
                Kostuttimen tyyppi
                <select value={k.vakKostutinTyyppi ?? ''} onChange={(e) => set({ vakKostutinTyyppi: e.target.value as LaiteKokoonpano['vakKostutinTyyppi'] })}>
                  <option value="">Valitse…</option>
                  {vakKostutinTyyppiOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <FormInput label="Kostuttimen malli" value={k.vakKostutinMalli ?? ''} onChange={(v) => set({ vakKostutinMalli: v })} />
            </>
          ) : null}
          <FormCheckbox
            label="Kuivaus"
            checked={k.kuivaus === true}
            onChange={(checked) => set({ kuivaus: checked })}
          />
          {k.kuivaus === true ? (
            <FormInput label="Kuivauksen vastusteho (kW)" type="number" value={k.vakKuivausKw ?? ''} onChange={(v) => set({ vakKuivausKw: v })} />
          ) : null}
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
