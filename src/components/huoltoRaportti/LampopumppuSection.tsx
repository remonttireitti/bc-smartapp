import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import {
  createEmptySisayksikkoData,
  createEmptySisayksikkoMittausData,
} from '../../lib/huoltoRaportti/defaults';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  showUlkoyksikko?: boolean;
  showSisayksikko?: boolean;
  showMittaukset?: boolean;
}

export function LampopumppuSection({
  form,
  onChange,
  showUlkoyksikko = false,
  showSisayksikko = false,
  showMittaukset = false,
}: Props) {
  const sisayksikkoMaara = form.sisayksikkoMaara ?? 1;
  const sisayksikkoData = form.sisayksikkoData ?? [createEmptySisayksikkoData()];
  const sisaSama = form.sisaSamaKuinEnsimmainen ?? [];
  const mittausSisayksikot = form.mittausSisayksikot ?? [createEmptySisayksikkoMittausData()];
  const mittausSama = form.mittausSamaKuinEnsimmainen ?? [];

  function setSisayksikkoMaara(count: number) {
    const nextData = [...sisayksikkoData];
    const nextSama = [...sisaSama];
    while (nextData.length < count) nextData.push(createEmptySisayksikkoData());
    while (nextSama.length < count) nextSama.push(false);
    onChange({
      sisayksikkoMaara: count,
      sisayksikkoData: nextData.slice(0, count),
      sisaSamaKuinEnsimmainen: nextSama.slice(0, count),
      mittausSisayksikot: (form.mittausSisayksikot ?? mittausSisayksikot)
        .slice(0, count)
        .concat(Array.from({ length: Math.max(0, count - (form.mittausSisayksikot?.length ?? 0)) }, () =>
          createEmptySisayksikkoMittausData(),
        ))
        .slice(0, count),
    });
  }

  return (
    <>
      {showUlkoyksikko && (
        <HuoltoModuleSection moduleKey="ulkoyksikko" title="Ulkoyksikkö">
          <div className="line-form-grid">
            <FormInput
              label="Ulkoyksikkö malli"
              value={form.ulkoyksikkoMalli || ''}
              onChange={(v) => onChange({ ulkoyksikkoMalli: v })}
            />
            <FormInput
              label="Sarjanumero"
              value={form.ulkoyksikkoSarjanumero || ''}
              onChange={(v) => onChange({ ulkoyksikkoSarjanumero: v })}
            />
            <FormInput
              label="Nimellis jäähdytys teho (kW)"
              value={form.ulkoyksikkoJaahdytysTeho || ''}
              onChange={(v) => onChange({ ulkoyksikkoJaahdytysTeho: v })}
              type="number"
            />
            <FormInput
              label="Nimellis lämmitys teho (kW)"
              value={form.ulkoyksikkoLammitysTeho || ''}
              onChange={(v) => onChange({ ulkoyksikkoLammitysTeho: v })}
              type="number"
            />
            <label className="huolto-span-all">
              Ulkoyksikön asennustapa
              <select
                value={form.ulkoyksikkoAsennustapa || ''}
                onChange={(e) => onChange({ ulkoyksikkoAsennustapa: e.target.value })}
              >
                <option value="">Valitse…</option>
                <option value="maateline">Maateline</option>
                <option value="seinateline">Seinäteline</option>
                <option value="sokkeliteline">Sokkeliteline</option>
                <option value="parveketeline">Parveketeline</option>
                <option value="muu">Muu</option>
              </select>
            </label>
            {form.ulkoyksikkoAsennustapa === 'muu' && (
              <FormInput
                label="Muu asennustapa"
                value={form.ulkoyksikkoAsennustapaMuu || ''}
                onChange={(v) => onChange({ ulkoyksikkoAsennustapaMuu: v })}
                className="huolto-span-all"
              />
            )}
          </div>
          <div className="checkbox-grid">
            <FormCheckbox
              label="Kenno puhdistettu tai puhdas"
              checked={!!form.ulkoyksikkoKennosPuhdas}
              onChange={(v) =>
                onChange({
                  ulkoyksikkoKennosPuhdas: v,
                  ...(v ? {} : { ulkoyksikkoKennoPuhdistustapa: '' }),
                })
              }
            />
            {form.ulkoyksikkoKennosPuhdas && (
              <FormInput
                label="Kennon puhdistustapa"
                value={form.ulkoyksikkoKennoPuhdistustapa || ''}
                onChange={(v) => onChange({ ulkoyksikkoKennoPuhdistustapa: v })}
                className="huolto-span-all"
              />
            )}
            <FormCheckbox
              label="Ulkoyksiköllä sulatusveden keräily/ohjaus"
              checked={!!form.ulkoyksikkoSulatausVedenKeraily}
              onChange={(v) => onChange({ ulkoyksikkoSulatausVedenKeraily: v })}
            />
            {form.ulkoyksikkoSulatausVedenKeraily && (
              <FormCheckbox
                label="Sulatusveden keräily tarkistettu/kunnossa"
                checked={!!form.ulkoyksikkoSulatausVedenTarkistettu}
                onChange={(v) => onChange({ ulkoyksikkoSulatausVedenTarkistettu: v })}
              />
            )}
            <FormCheckbox
              label="Ulkoyksikön vieressä turvakytkin"
              checked={!!form.ulkoyksikkoTurvakytkin}
              onChange={(v) => onChange({ ulkoyksikkoTurvakytkin: v })}
            />
            <FormCheckbox
              label="Ulkoyksiköllä suojakotelo"
              checked={!!form.ulkoyksikkoSuojakotelo}
              onChange={(v) => onChange({ ulkoyksikkoSuojakotelo: v })}
            />
          </div>
        </HuoltoModuleSection>
      )}

      {showSisayksikko && (
        <HuoltoModuleSection moduleKey="sisayksikko" title="Sisäyksiköt">
          <div className="btn-group">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                className={`btn btn-secondary btn-sm ${sisayksikkoMaara === num ? 'btn-active' : ''}`}
                onClick={() => setSisayksikkoMaara(num)}
              >
                {num}
              </button>
            ))}
          </div>

          {sisayksikkoData.slice(0, sisayksikkoMaara).map((yksikko, index) => (
            <div key={index} className="huolto-submodule">
              <h3>Sisäyksikkö {index + 1}</h3>
              {index > 0 && (
                <FormCheckbox
                  label={`Sisäyksikkö ${index + 1}: sama kuin sisäyksikkö 1`}
                  checked={!!sisaSama[index]}
                  onChange={(v) => {
                    const nextSama = [...sisaSama];
                    nextSama[index] = v;
                    const nextData = [...sisayksikkoData];
                    if (v && nextData[0] && nextData[index]) {
                      nextData[index] = { ...nextData[index], ...nextData[0] };
                    }
                    onChange({ sisaSamaKuinEnsimmainen: nextSama, sisayksikkoData: nextData });
                  }}
                />
              )}
              <div className="line-form-grid">
                <label>
                  Sisäyksikön tyyppi
                  <select
                    value={yksikko.tyyppi}
                    disabled={!!sisaSama[index]}
                    onChange={(e) => {
                      const next = [...sisayksikkoData];
                      next[index] = { ...next[index], tyyppi: e.target.value };
                      onChange({ sisayksikkoData: next });
                    }}
                  >
                    <option value="">Valitse…</option>
                    <option value="seina">Seinä-asenteinen</option>
                    <option value="kattokasetti">Kattokasetti</option>
                    <option value="konsooli">Konsooli</option>
                    <option value="katto-pinta">Katto-pinta</option>
                    <option value="kanavoitava">Kanavoitava</option>
                  </select>
                </label>
                <FormInput
                  label="Tarkka malli"
                  value={yksikko.malli}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], malli: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
                <FormInput
                  label="Sarjanumero"
                  value={yksikko.sarjanumero}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], sarjanumero: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
                <label>
                  Kondenssiveden poisto
                  <select
                    value={yksikko.kondenssivesi}
                    disabled={!!sisaSama[index]}
                    onChange={(e) => {
                      const next = [...sisayksikkoData];
                      next[index] = {
                        ...next[index],
                        kondenssivesi: e.target.value,
                        pumppuMalli: e.target.value === 'pumpulla' ? next[index].pumppuMalli : '',
                      };
                      onChange({ sisayksikkoData: next });
                    }}
                  >
                    <option value="">Valitse…</option>
                    <option value="painovoimainen">Painovoimainen</option>
                    <option value="pumpulla">Kondenssiveden pumpulla</option>
                  </select>
                </label>
                {yksikko.kondenssivesi === 'pumpulla' && (
                  <FormInput
                    label="Pumpun malli"
                    value={yksikko.pumppuMalli}
                    onChange={(v) => {
                      const next = [...sisayksikkoData];
                      next[index] = { ...next[index], pumppuMalli: v };
                      onChange({ sisayksikkoData: next });
                    }}
                    disabled={!!sisaSama[index]}
                  />
                )}
              </div>
              <div className="checkbox-grid">
                <FormCheckbox
                  label="Asennettu vaatimusten mukaisesti"
                  checked={yksikko.asennettu}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], asennettu: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
                <FormCheckbox
                  label="Kenno ja siipipyörä puhdas/puhdistettu"
                  checked={yksikko.kennoPuhdas}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], kennoPuhdas: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
                <FormCheckbox
                  label="Ei kuulu sivuääniä"
                  checked={yksikko.eiAania}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], eiAania: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
                <FormCheckbox
                  label="Kondenssiveden poisto testattu/kunnossa"
                  checked={yksikko.kondenssiTestattu}
                  onChange={(v) => {
                    const next = [...sisayksikkoData];
                    next[index] = { ...next[index], kondenssiTestattu: v };
                    onChange({ sisayksikkoData: next });
                  }}
                  disabled={!!sisaSama[index]}
                />
              </div>
            </div>
          ))}
        </HuoltoModuleSection>
      )}

      {showMittaukset && (
        <HuoltoModuleSection moduleKey="mittaukset" title="Mittaukset">
          <div className="line-form-grid">
            <FormCheckbox
              label="Jäähdytys toiminto testattu"
              checked={!!form.mittausJaahdytysTestattu}
              onChange={(v) => onChange({ mittausJaahdytysTestattu: v })}
            />
            <FormCheckbox
              label="Lämmitys toiminto testattu"
              checked={!!form.mittausLammitysTestattu}
              onChange={(v) => onChange({ mittausLammitysTestattu: v })}
            />
            <FormInput
              label="Lämpötila testauksen aikana (°C)"
              value={form.mittausTestausLampotila || ''}
              onChange={(v) => onChange({ mittausTestausLampotila: v })}
              type="number"
            />
            <FormInput
              label="Ulkolämpötila (°C)"
              value={form.mittausUlkoLampotila || ''}
              onChange={(v) => onChange({ mittausUlkoLampotila: v })}
              type="number"
            />
          </div>

          {mittausSisayksikot.slice(0, sisayksikkoMaara).map((mittaus, index) => (
            <div key={index} className="huolto-submodule">
              <h3>Sisäyksikkö {index + 1} mittaukset</h3>
              {index > 0 && (
                <FormCheckbox
                  label={`Sisäyksikkö ${index + 1} mittaukset: sama kuin sisäyksikkö 1`}
                  checked={!!mittausSama[index]}
                  onChange={(v) => {
                    const nextSama = [...mittausSama];
                    nextSama[index] = v;
                    const nextMittaus = [...mittausSisayksikot];
                    if (v && nextMittaus[0] && nextMittaus[index]) {
                      nextMittaus[index] = { ...nextMittaus[index], ...nextMittaus[0] };
                    }
                    onChange({ mittausSamaKuinEnsimmainen: nextSama, mittausSisayksikot: nextMittaus });
                  }}
                />
              )}
              <p className="muted">Paineet (bar)</p>
              <div className="line-form-grid">
                <FormInput
                  label="Imupaine jäähdytys"
                  value={mittaus.imupaineJaahdytys}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], imupaineJaahdytys: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
                <FormInput
                  label="Korkeapaine jäähdytys"
                  value={mittaus.korkeapaineJaahdytys}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], korkeapaineJaahdytys: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
                <FormInput
                  label="Imupaine lämmitys"
                  value={mittaus.imupaineLammitys}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], imupaineLammitys: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
                <FormInput
                  label="Korkeapaine lämmitys"
                  value={mittaus.korkeapaineLammitys}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], korkeapaineLammitys: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
              </div>
              <p className="muted">Lämpötilat (°C)</p>
              <div className="line-form-grid">
                <FormInput
                  label="Sisälämpötila"
                  value={mittaus.sisalampotila}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], sisalampotila: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
                <FormInput
                  label="Paluu ilman lämpötila"
                  value={mittaus.paluuLampotila}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], paluuLampotila: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
                <FormInput
                  label="Puhallus lämpötila"
                  value={mittaus.puhallusLampotila}
                  onChange={(v) => {
                    const next = [...mittausSisayksikot];
                    next[index] = { ...next[index], puhallusLampotila: v };
                    onChange({ mittausSisayksikot: next });
                  }}
                  type="number"
                  disabled={!!mittausSama[index]}
                />
              </div>
            </div>
          ))}

          <div className="huolto-submodule">
            <h3>Ulkoyksikkö mittaukset</h3>
            <div className="line-form-grid">
              <label>
                Syöttöjännite
                <select
                  value={form.mittausVaiheMaara || '1'}
                  onChange={(e) => onChange({ mittausVaiheMaara: e.target.value })}
                >
                  <option value="1">230 V (1-vaihe)</option>
                  <option value="3">400 V (3-vaihe)</option>
                </select>
              </label>
              {form.mittausVaiheMaara === '3' ? (
                <>
                  <FormInput label="L1 (A)" value={form.mittausAmpeeriL1 || ''} onChange={(v) => onChange({ mittausAmpeeriL1: v })} type="number" />
                  <FormInput label="L2 (A)" value={form.mittausAmpeeriL2 || ''} onChange={(v) => onChange({ mittausAmpeeriL2: v })} type="number" />
                  <FormInput label="L3 (A)" value={form.mittausAmpeeriL3 || ''} onChange={(v) => onChange({ mittausAmpeeriL3: v })} type="number" />
                </>
              ) : (
                <FormInput label="Virta (A)" value={form.mittausAmpeeriL1 || ''} onChange={(v) => onChange({ mittausAmpeeriL1: v })} type="number" />
              )}
            </div>
          </div>
        </HuoltoModuleSection>
      )}
    </>
  );
}
