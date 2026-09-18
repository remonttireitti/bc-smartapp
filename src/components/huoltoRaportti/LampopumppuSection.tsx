import type { HuomioLuonne, HuoltoReportData, SisayksikkoData } from '../../lib/huoltoRaportti/types';
import {
  createEmptySisayksikkoData,
  createEmptySisayksikkoMittausData,
} from '../../lib/huoltoRaportti/defaults';
import {
  SISAYKSIKKO_TARKASTUS_ITEMS,
  sisayksikkoTarkastusSummary,
  type SisayksikkoTarkastusField,
} from '../../lib/huoltoRaportti/sisayksikkoTarkastus';
import {
  normalizeLegacyInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import {
  lampopumppuMittauksetTitle,
  lampopumppuSisayksikkoTitle,
  lampopumppuUlkoyksikkoTitle,
} from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { RichCommentEditor } from './RichCommentEditor';
import { SisayksikkoSchematicPreview } from './SisayksikkoSchematicPreview';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';
import { UlkoyksikkoInspection } from './UlkoyksikkoInspection';
import { type ReactNode } from 'react';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  showUlkoyksikko?: boolean;
  showSisayksikko?: boolean;
  showMittaukset?: boolean;
  /** When set, render only one subsection (document popup tiles). */
  part?: 'ulkoyksikko' | 'sisayksikko' | 'mittaukset';
}

function sisayksikkoStatusLabel(unit: SisayksikkoData): { text: string; className: string } {
  const summary = sisayksikkoTarkastusSummary(unit);
  if (unit.huomioTyyppi === 'vika' || unit.huomio?.trim()) {
    return {
      text: unit.huomioTyyppi === 'vika' ? 'Vika' : 'Huomio',
      className: unit.huomioTyyppi === 'vika' ? 'konvektori-status konvektori-status--vika' : 'konvektori-status konvektori-status--note',
    };
  }
  if (!summary.complete) {
    return { text: `Tarkastus ${summary.answered}/${summary.total}`, className: 'konvektori-status konvektori-status--pending' };
  }
  if (summary.anyFaulty) {
    return { text: 'Vika', className: 'konvektori-status konvektori-status--vika' };
  }
  if (summary.allOk) {
    return { text: 'OK', className: 'konvektori-status konvektori-status--ok' };
  }
  return { text: 'Huomioita', className: 'konvektori-status konvektori-status--warn' };
}

export function LampopumppuSection({
  form,
  onChange,
  showUlkoyksikko = false,
  showSisayksikko = false,
  showMittaukset = false,
  part,
}: Props) {
  const renderUlkoyksikko = part ? part === 'ulkoyksikko' : showUlkoyksikko;
  const renderSisayksikko = part ? part === 'sisayksikko' : showSisayksikko;
  const renderMittaukset = part ? part === 'mittaukset' : showMittaukset;
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

  function wrapSection(
    moduleKey: 'ulkoyksikko' | 'sisayksikko' | 'mittaukset',
    title: string,
    children: ReactNode,
  ) {
    // Document popup already has a title — avoid a nested collapsed accordion.
    if (part) {
      return <div className="huolto-module-body">{children}</div>;
    }
    return (
      <HuoltoModuleSection moduleKey={moduleKey} title={title}>
        {children}
      </HuoltoModuleSection>
    );
  }

  return (
    <>
      {renderUlkoyksikko && wrapSection(
        'ulkoyksikko',
        lampopumppuUlkoyksikkoTitle(form.laiteTyyppi),
        <>
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
          <div className="huolto-part-inspection-list">
            <UlkoyksikkoInspection form={form} onChange={onChange} />
          </div>
        </>,
      )}

      {renderSisayksikko && wrapSection(
        'sisayksikko',
        lampopumppuSisayksikkoTitle(form.laiteTyyppi),
        <>
          <p className="muted huolto-help">
            Valitse tyyppi ja täytä tunnistetiedot. Lämpötilat, paineet ja tarkastuskohdat täytetään Mittaukset-osiossa.
          </p>
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

          {sisayksikkoData.slice(0, sisayksikkoMaara).map((yksikko, index) => {
            const mittaus = mittausSisayksikot[index] ?? createEmptySisayksikkoMittausData();
            const status = sisayksikkoStatusLabel(yksikko);
            return (
            <div key={index} className="huolto-submodule">
              <div className="sisayksikko-submodule-head">
                <h3>Sisäyksikkö {index + 1}</h3>
                <span className={status.className}>{status.text}</span>
              </div>
              {index > 0 && (
                <FormCheckbox
                  id={`sisayksikko-${index}-sama-kuin-1`}
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
              <SisayksikkoSchematicPreview unit={yksikko} mittaus={mittaus} />
            </div>
            );
          })}
        </>,
      )}

      {renderMittaukset && wrapSection(
        'mittaukset',
        lampopumppuMittauksetTitle(form.laiteTyyppi),
        <>
          <div className="line-form-grid">
            <FormCheckbox
              id="mittaus-jaahdytys-testattu"
              label="Jäähdytys toiminto testattu"
              checked={!!form.mittausJaahdytysTestattu}
              onChange={(v) => onChange({ mittausJaahdytysTestattu: v })}
            />
            <FormCheckbox
              id="mittaus-lammitys-testattu"
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

          {!form.mittausJaahdytysTestattu && !form.mittausLammitysTestattu ? (
            <p className="muted huolto-help">
              Merkitse jäähdytys ja/tai lämmitys testatuksi, jotta paine- ja lämpötilakentät tulevat näkyviin.
              Tarkastuskohdat ja huomiot täytetään alla jokaiselle sisäyksikölle.
            </p>
          ) : null}

          {Array.from({ length: sisayksikkoMaara }, (_, index) => {
            const mittaus = mittausSisayksikot[index] ?? createEmptySisayksikkoMittausData();
            const yksikko = sisayksikkoData[index] ?? createEmptySisayksikkoData();
            const patchMittaus = (patch: Partial<typeof mittaus>) => {
              const next = [...mittausSisayksikot];
              while (next.length <= index) next.push(createEmptySisayksikkoMittausData());
              next[index] = { ...next[index], ...patch };
              onChange({ mittausSisayksikot: next });
            };
            const patchUnit = (patch: Partial<SisayksikkoData>) => {
              const next = [...sisayksikkoData];
              while (next.length <= index) next.push(createEmptySisayksikkoData());
              next[index] = { ...next[index], ...patch };
              onChange({ sisayksikkoData: next });
            };
            const patchCheck = (
              field: SisayksikkoTarkastusField,
              value: Exclude<HuoltoInspectionStatus, null>,
            ) => {
              patchUnit({ [field]: value });
            };
            const disabled = !!mittausSama[index];
            return (
              <div key={index} className="huolto-submodule">
                <h3>Sisäyksikkö {index + 1} mittaukset</h3>
                {index > 0 && (
                  <FormCheckbox
                    id={`mittaus-${index}-sama-kuin-1`}
                    label={`Sisäyksikkö ${index + 1} mittaukset: sama kuin sisäyksikkö 1`}
                    checked={!!mittausSama[index]}
                    onChange={(v) => {
                      const nextSama = [...mittausSama];
                      nextSama[index] = v;
                      const nextMittaus = [...mittausSisayksikot];
                      if (v && nextMittaus[0] && nextMittaus[index]) {
                        nextMittaus[index] = { ...nextMittaus[index], ...nextMittaus[0] };
                      }
                      const nextUnits = [...sisayksikkoData];
                      if (v && nextUnits[0] && nextUnits[index]) {
                        nextUnits[index] = {
                          ...nextUnits[index],
                          asennettu: nextUnits[0].asennettu,
                          kennoPuhdas: nextUnits[0].kennoPuhdas,
                          eiAania: nextUnits[0].eiAania,
                          kondenssiTestattu: nextUnits[0].kondenssiTestattu,
                          huomio: nextUnits[0].huomio,
                          huomioTyyppi: nextUnits[0].huomioTyyppi,
                        };
                      }
                      onChange({
                        mittausSamaKuinEnsimmainen: nextSama,
                        mittausSisayksikot: nextMittaus,
                        sisayksikkoData: nextUnits,
                      });
                    }}
                  />
                )}

                {form.mittausJaahdytysTestattu ? (
                  <>
                    <p className="muted">Jäähdytys — paineet (bar)</p>
                    <div className="line-form-grid">
                      <FormInput
                        label="Imupaine jäähdytys"
                        value={mittaus.imupaineJaahdytys}
                        onChange={(v) => patchMittaus({ imupaineJaahdytys: v })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Korkeapaine jäähdytys"
                        value={mittaus.korkeapaineJaahdytys}
                        onChange={(v) => patchMittaus({ korkeapaineJaahdytys: v })}
                        type="number"
                        disabled={disabled}
                      />
                    </div>
                    <p className="muted">Jäähdytys — lämpötilat (°C)</p>
                    <div className="line-form-grid">
                      <FormInput
                        label="Sisälämpötila jäähdytys"
                        value={mittaus.sisalampotilaJaahdytys}
                        onChange={(v) => patchMittaus({
                          sisalampotilaJaahdytys: v,
                          sisalampotila: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Paluu ilman lämpötila jäähdytys"
                        value={mittaus.paluuLampotilaJaahdytys}
                        onChange={(v) => patchMittaus({
                          paluuLampotilaJaahdytys: v,
                          paluuLampotila: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Puhallus lämpötila jäähdytys"
                        value={mittaus.puhallusLampotilaJaahdytys}
                        onChange={(v) => patchMittaus({
                          puhallusLampotilaJaahdytys: v,
                          puhallusLampotila: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Ilmanmäärä jäähdytys (m³/h)"
                        value={mittaus.ilmanmaaraM3hJaahdytys}
                        onChange={(v) => patchMittaus({
                          ilmanmaaraM3hJaahdytys: v,
                          ilmanmaaraM3h: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                    </div>
                  </>
                ) : null}

                {form.mittausLammitysTestattu ? (
                  <>
                    <p className="muted">Lämmitys — paineet (bar)</p>
                    <div className="line-form-grid">
                      <FormInput
                        label="Imupaine lämmitys"
                        value={mittaus.imupaineLammitys}
                        onChange={(v) => patchMittaus({ imupaineLammitys: v })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Korkeapaine lämmitys"
                        value={mittaus.korkeapaineLammitys}
                        onChange={(v) => patchMittaus({ korkeapaineLammitys: v })}
                        type="number"
                        disabled={disabled}
                      />
                    </div>
                    <p className="muted">Lämmitys — lämpötilat (°C)</p>
                    <div className="line-form-grid">
                      <FormInput
                        label="Sisälämpötila lämmitys"
                        value={mittaus.sisalampotilaLammitys}
                        onChange={(v) => {
                          patchMittaus({ sisalampotilaLammitys: v, sisalampotila: v });
                          patchUnit({ huoneLampotila: v });
                        }}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Paluu ilman lämpötila lämmitys"
                        value={mittaus.paluuLampotilaLammitys}
                        onChange={(v) => patchMittaus({
                          paluuLampotilaLammitys: v,
                          paluuLampotila: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Puhallus lämpötila lämmitys"
                        value={mittaus.puhallusLampotilaLammitys}
                        onChange={(v) => patchMittaus({
                          puhallusLampotilaLammitys: v,
                          puhallusLampotila: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                      <FormInput
                        label="Ilmanmäärä lämmitys (m³/h)"
                        value={mittaus.ilmanmaaraM3hLammitys}
                        onChange={(v) => patchMittaus({
                          ilmanmaaraM3hLammitys: v,
                          ilmanmaaraM3h: v,
                        })}
                        type="number"
                        disabled={disabled}
                      />
                    </div>
                  </>
                ) : null}

                <p className="muted">Tarkastuskohdat</p>
                <div className="konvektori-tarkastus-list">
                  {SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => (
                    <div key={item.field} className="konvektori-tarkastus-item">
                      <span className="konvektori-tarkastus-label">{item.label}</span>
                      <TriStateInspectionToggle
                        name={`sisayksikko-${index}-${item.field}`}
                        value={normalizeLegacyInspectionStatus(yksikko[item.field])}
                        onChange={(value) => patchCheck(item.field, value)}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </div>

                <div className="konvektori-huomio-type">
                  <span className="konvektori-tarkastus-label">Huomion tyyppi</span>
                  <div className="konvektori-huomio-type-toggle" role="group" aria-label="Huomion tyyppi">
                    <button
                      type="button"
                      className={`konvektori-huomio-type-btn${yksikko.huomioTyyppi !== 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
                      aria-pressed={yksikko.huomioTyyppi !== 'vika'}
                      disabled={disabled}
                      onClick={() => patchUnit({ huomioTyyppi: 'kommentti' satisfies HuomioLuonne })}
                    >
                      Kommentti
                    </button>
                    <button
                      type="button"
                      className={`konvektori-huomio-type-btn konvektori-huomio-type-btn--vika${yksikko.huomioTyyppi === 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
                      aria-pressed={yksikko.huomioTyyppi === 'vika'}
                      disabled={disabled}
                      onClick={() => patchUnit({ huomioTyyppi: 'vika' satisfies HuomioLuonne })}
                    >
                      Vika (punainen)
                    </button>
                  </div>
                </div>

                <label className="konvektori-huomio-field">
                  Kommentti / huomio
                  <RichCommentEditor
                    rows={3}
                    value={yksikko.huomio ?? ''}
                    onChange={(huomio) => {
                      if (disabled) return;
                      patchUnit({ huomio });
                    }}
                    placeholder="Kirjoita huomio tähän…"
                  />
                </label>
              </div>
            );
          })}

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
        </>,
      )}
    </>
  );
}
