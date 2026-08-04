import type { HuoltoReportData, KompressorinVaiheValinta, MlpData, PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import {
  kayttovesiLisalammitinSijaintiOptions,
} from '../../lib/huoltoRaportti/constants';
import {
  isChillerLikeDevice,
  showChillerPropertySubsections,
  showMlpKeruupiiriSubsection,
  showMlpLatauspiiriSubsection,
  showMlpMaalampoSubsections,
} from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  energiatehokkuusSectionTitle,
  kiinteistoPiiriSectionTitle,
  mlpJaahdytyspiiriSectionTitle,
  mlpKeruupiiriSectionTitle,
} from '../../lib/huoltoRaportti/sectionTitles';
import { createEmptyHeatingCircuitData, createEmptyHeatingElementData } from '../../lib/huoltoRaportti/defaults';
import { getKokoLaiteSahkoVaiheValinta, getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { hideMaintenancePrintWarnings } from '../../lib/huoltoRaportti/defaults';
import { computeChillerEnergyFromMlp } from '../../lib/huoltoRaportti/mlpEnergyCalc';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HeatingElementModule } from './HeatingElementModule';
import { MlpEnergyDashboard } from './MlpEnergyDashboard';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { MlpKeruupiiriInspection } from './MlpKeruupiiriInspection';
import { MlpLatauspiiriInspection } from './MlpLatauspiiriInspection';
import { MlpLampopiiritInspection } from './MlpLampopiiritInspection';
interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  /** VJ/VAK: näytä vain yksi osio omalla välilehdellä. */
  part?: 'kiinteisto' | 'energia';
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpSection({ form, onChange, part }: Props) {
  const mlp = form.mlpData;
  if (!mlp) return null;

  const patchMlp = (patch: Partial<MlpData>) => onChange({ mlpData: { ...mlp, ...patch } });

  const setPumpSyotto = (
    field: keyof MlpData,
    legacyField: keyof MlpData,
    v: PumpunSyottoValinta,
  ) => {
    patchMlp({
      [field]: v,
      [legacyField]: v === '400_3' ? true : v === '230_1' ? false : undefined,
    } as Partial<MlpData>);
  };

  const showMaalampoOnly = showMlpMaalampoSubsections(form.laiteTyyppi);
  const showKeruupiiri = showMlpKeruupiiriSubsection(form.laiteTyyppi);
  const showChillerParts = showChillerPropertySubsections(form.laiteTyyppi);
  const showLatauspiiri = showMlpLatauspiiriSubsection(
    form.laiteTyyppi,
    form.lauhdutinTyyppiLaite ?? form.condenserData[0]?.tyyppi,
  );
  const showHeatPumpCircuits = !isChillerLikeDevice(form.laiteTyyppi);
  const keruuPower = calcPower(mlp.keruupiiriVirtaus, mlp.keruupiiriMeno, mlp.keruupiiriTulo, parseFloat(mlp.keruupiiriNeste) || 0);
  const latausPower = calcPower(mlp.latausVirtaus, mlp.latausMeno, mlp.latausTulo, parseFloat(mlp.latausNeste) || 0);

  function setLampoCount(count: number) {
    if (!form.mlpData) return;
    const next = [...form.mlpData.lampoPiirit];
    while (next.length < count) next.push(createEmptyHeatingCircuitData());
    patchMlp({ lampoPiireja: String(count), lampoPiirit: next.slice(0, count) });
  }

  const showKiinteistoBlock = (showHeatPumpCircuits || showChillerParts) && (!part || part === 'kiinteisto');
  const showEnergyBlock = (showMaalampoOnly || showChillerParts) && (!part || part === 'energia');

  return (
    <>
      {showKeruupiiri && !part && (
      <HuoltoModuleSection moduleKey="mlpKeruupiiri" title={mlpKeruupiiriSectionTitle(form.laiteTyyppi)}>
        <div className="huolto-part-inspection-list">
          <MlpKeruupiiriInspection
            title={mlpKeruupiiriSectionTitle(form.laiteTyyppi)}
            mlp={mlp}
            onChange={patchMlp}
            keruuPower={keruuPower}
          />
        </div>
      </HuoltoModuleSection>
      )}

      {showMaalampoOnly && !part && (
      <HuoltoModuleSection moduleKey="mlpJaahdytyspiiri" title={mlpJaahdytyspiiriSectionTitle(form.laiteTyyppi)}>
        <div className="checkbox-grid huolto-toggle-grid">
          <FormCheckbox label="Erillinen piiri" checked={mlp.keruuJaahdytysPiiri} onChange={(v) => patchMlp({ keruuJaahdytysPiiri: v })} />
          <FormCheckbox label="Piirissä pumppu" checked={mlp.keruuJaahdytysPiiriPumppu} onChange={(v) => patchMlp({ keruuJaahdytysPiiriPumppu: v })} />
        </div>
        {mlp.keruuJaahdytysPiiriPumppu && (
          <>
            <div className="line-form-grid">
              <FormInput label="Pumpun valmistaja" value={mlp.keruuJaahdytysPumpunValmistaja} onChange={(v) => patchMlp({ keruuJaahdytysPumpunValmistaja: v })} />
              <FormInput label="Pumpun malli" value={mlp.keruuJaahdytysPumpunMalli} onChange={(v) => patchMlp({ keruuJaahdytysPumpunMalli: v })} />
            </div>
            <PumpSupplyMeasurementBlock
              syottoValinta={getMlpPumpSyottoValinta(mlp.keruuJaahdytysPumpunSyottoValinta, mlp.keruuJaahdytysPumppuKolmeVaihetta)}
              onSyottoValintaChange={(v) => setPumpSyotto('keruuJaahdytysPumpunSyottoValinta', 'keruuJaahdytysPumppuKolmeVaihetta', v)}
              virta1vaihe={mlp.keruuJaahdytysPumppuVirta1vaihe}
              virtaL1={mlp.keruuJaahdytysPumppuVirtaL1}
              virtaL2={mlp.keruuJaahdytysPumppuVirtaL2}
              virtaL3={mlp.keruuJaahdytysPumppuVirtaL3}
              onVirta1vaihe={(v) => patchMlp({ keruuJaahdytysPumppuVirta1vaihe: v })}
              onVirtaL1={(v) => patchMlp({ keruuJaahdytysPumppuVirtaL1: v })}
              onVirtaL2={(v) => patchMlp({ keruuJaahdytysPumppuVirtaL2: v })}
              onVirtaL3={(v) => patchMlp({ keruuJaahdytysPumppuVirtaL3: v })}
            />
          </>
        )}
        <div className="line-form-grid">
          <FormInput label="Virtaus (l/s)" value={mlp.keruuJaahdytysVirtaus} onChange={(v) => patchMlp({ keruuJaahdytysVirtaus: v })} type="number" />
          <FormInput label="Meno (°C)" value={mlp.keruuJaahdytysMenoLampotila} onChange={(v) => patchMlp({ keruuJaahdytysMenoLampotila: v })} type="number" />
          <FormInput label="Paluu (°C)" value={mlp.keruuJaahdytysPaluuLampotila} onChange={(v) => patchMlp({ keruuJaahdytysPaluuLampotila: v })} type="number" />
          <FormInput label="Käyntivirta (A)" value={mlp.keruuJaahdytysKayntivirta} onChange={(v) => patchMlp({ keruuJaahdytysKayntivirta: v })} type="number" />
        </div>
      </HuoltoModuleSection>
      )}

      {showLatauspiiri && showHeatPumpCircuits && !part && (
      <HuoltoModuleSection moduleKey="mlpLatauspiiri" title="5.2 Latauspiiri">
        <div className="huolto-part-inspection-list">
          <MlpLatauspiiriInspection mlp={mlp} onChange={patchMlp} latausPower={latausPower} />
        </div>
      </HuoltoModuleSection>
      )}

      {showHeatPumpCircuits && !part && (
      <HuoltoModuleSection moduleKey="mlpKayttovesi" title="5.3 Käyttöveden lämmitys">
        <FormCheckbox label="Käyttövesi mukana" checked={mlp.kayttovesiEnabled} onChange={(v) => patchMlp({ kayttovesiEnabled: v })} />
        {mlp.kayttovesiEnabled && (
          <div className="huolto-form-stack">
            <div className="line-form-grid">
              <FormInput label="Tilavuus (l)" value={mlp.kayttovesiTilavuus} onChange={(v) => patchMlp({ kayttovesiTilavuus: v })} />
              <FormInput label="Lämpötila-asetus (°C)" value={mlp.kayttovesiLampotilaAsetus} onChange={(v) => patchMlp({ kayttovesiLampotilaAsetus: v })} />
              <FormInput label="Nykyinen lämpötila (°C)" value={mlp.kayttovesiLampotilaNykyinen} onChange={(v) => patchMlp({ kayttovesiLampotilaNykyinen: v })} />
              <FormCheckbox label="Toimilaitteet OK" checked={mlp.kayttovesiToimilaitteetOK} onChange={(v) => patchMlp({ kayttovesiToimilaitteetOK: v })} />
            </div>
            <FormCheckbox
              label="Lisälämmittin (sähkövastukset)"
              checked={mlp.kayttovesiSahkoVastuksetEnabled}
              onChange={(v) =>
                patchMlp({
                  kayttovesiSahkoVastuksetEnabled: v,
                  ...(v
                    ? {}
                    : {
                        kayttovesiSahkoVastuksetSijainti: '',
                        kayttovesiSahkoVastuksetMaara: '',
                        kayttovesiSahkoVastukset: [],
                      }),
                })
              }
            />
            {mlp.kayttovesiSahkoVastuksetEnabled && (
              <>
                <label style={{ maxWidth: '320px' }}>
                  Lisälämmittimen sijainti
                  <select
                    value={mlp.kayttovesiSahkoVastuksetSijainti}
                    onChange={(e) => {
                      const sijainti = e.target.value as MlpData['kayttovesiSahkoVastuksetSijainti'];
                      if (sijainti === 'integroitu') {
                        patchMlp({
                          kayttovesiSahkoVastuksetSijainti: sijainti,
                          kayttovesiSahkoVastuksetMaara: '',
                          kayttovesiSahkoVastukset: [],
                        });
                      } else if (sijainti === 'ulkopuolinen') {
                        const count = Math.max(1, parseInt(mlp.kayttovesiSahkoVastuksetMaara, 10) || 1);
                        let next = [...mlp.kayttovesiSahkoVastukset];
                        while (next.length < count) next.push(createEmptyHeatingElementData());
                        patchMlp({
                          kayttovesiSahkoVastuksetSijainti: sijainti,
                          kayttovesiSahkoVastuksetMaara: String(count),
                          kayttovesiSahkoVastukset: next.slice(0, count),
                        });
                      } else {
                        patchMlp({ kayttovesiSahkoVastuksetSijainti: sijainti });
                      }
                    }}
                  >
                    {kayttovesiLisalammitinSijaintiOptions.map((opt) => (
                      <option key={opt.value || 'empty'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {mlp.kayttovesiSahkoVastuksetSijainti === 'integroitu' && (
                  <p className="muted">Lisälämmittin on integroitu laitteeseen.</p>
                )}
                {mlp.kayttovesiSahkoVastuksetSijainti === 'ulkopuolinen' && (
                  <>
                    <FormInput
                      label="Lisälämmittimien määrä (kpl)"
                      value={mlp.kayttovesiSahkoVastuksetMaara}
                      onChange={(v) => {
                        const newCount = Math.max(0, parseInt(v, 10) || 0);
                        let next = [...mlp.kayttovesiSahkoVastukset];
                        while (next.length < newCount) next.push(createEmptyHeatingElementData());
                        patchMlp({
                          kayttovesiSahkoVastuksetMaara: v,
                          kayttovesiSahkoVastukset: next.slice(0, newCount),
                        });
                      }}
                      type="number"
                    />
                    {mlp.kayttovesiSahkoVastukset.map((vastus, idx) => (
                      <HeatingElementModule
                        key={idx}
                        index={idx}
                        data={vastus}
                        compact
                        onChange={(data) => {
                          const next = [...mlp.kayttovesiSahkoVastukset];
                          next[idx] = data;
                          patchMlp({ kayttovesiSahkoVastukset: next });
                        }}
                        onRemove={() => {
                          const next = mlp.kayttovesiSahkoVastukset.filter((_, i) => i !== idx);
                          patchMlp({
                            kayttovesiSahkoVastukset: next,
                            kayttovesiSahkoVastuksetMaara: String(next.length),
                          });
                        }}
                      />
                    ))}
                  </>
                )}
              </>
            )}
            <FormCheckbox
              label="Käyttövesikierto käytössä"
              checked={mlp.kayttovesiKiertoEnabled}
              onChange={(v) => patchMlp({ kayttovesiKiertoEnabled: v })}
            />
            {mlp.kayttovesiKiertoEnabled && (
              <div className="line-form-grid">
                <FormInput label="Kierron pumpun valmistaja" value={mlp.kayttovesiKiertoPumpunValmistaja} onChange={(v) => patchMlp({ kayttovesiKiertoPumpunValmistaja: v })} />
                <FormInput label="Kierron pumpun malli" value={mlp.kayttovesiKiertoPumpunMalli} onChange={(v) => patchMlp({ kayttovesiKiertoPumpunMalli: v })} />
                <FormInput label="Virtaus (l/s)" value={mlp.kayttovesiKiertoVirtaus} onChange={(v) => patchMlp({ kayttovesiKiertoVirtaus: v })} type="number" />
                <FormInput label="Käyntivirta (A)" value={mlp.kayttovesiKiertoKayntivirta} onChange={(v) => patchMlp({ kayttovesiKiertoKayntivirta: v })} type="number" />
              </div>
            )}
          </div>
        )}
      </HuoltoModuleSection>
      )}

      {showKiinteistoBlock && (
      <HuoltoModuleSection moduleKey="mlpLampopiirit" title={kiinteistoPiiriSectionTitle(form.laiteTyyppi)}>
        <FormCheckbox
          label={
            isChillerLikeDevice(form.laiteTyyppi)
              ? 'Tulosta ja tallenna laitekorttiin (kiinteistön jäähdytyspiiri)'
              : 'Tulosta ja tallenna laitekorttiin (kiinteistön lämmityspiiri)'
          }
          checked={mlp.kiinteistoPiiritSisallytetaan !== false}
          onChange={(v) => patchMlp({ kiinteistoPiiritSisallytetaan: v })}
          className="huolto-lampopiirit-wide"
        />
        <label className="huolto-lampopiirit-piireja">
          Piirejä
          <select
            value={mlp.lampoPiirit.length || parseInt(mlp.lampoPiireja, 10) || 0}
            onChange={(e) => setLampoCount(parseInt(e.target.value, 10))}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="huolto-part-inspection-list">
          <MlpLampopiiritInspection title={kiinteistoPiiriSectionTitle(form.laiteTyyppi)} mlp={mlp} onChange={patchMlp} />
        </div>
      </HuoltoModuleSection>
      )}

      {showEnergyBlock && (
      <HuoltoModuleSection moduleKey="mlpEnergia" title={energiatehokkuusSectionTitle(form.laiteTyyppi)}>
        <FormCheckbox
          label="Mittaan koko laitteiston sähkönkulutuksen COP-laskentaan"
          checked={mlp.mittaaKokoLaiteSahko}
          onChange={(v) => patchMlp({ mittaaKokoLaiteSahko: v })}
        />
        {mlp.mittaaKokoLaiteSahko && (
          <div className="line-form-grid">
            <label className="huolto-span-all">
              Koko laitteiston virrankulutus
              <select
                value={getKokoLaiteSahkoVaiheValinta(mlp)}
                onChange={(e) => {
                  const v = e.target.value as KompressorinVaiheValinta;
                  patchMlp({
                    kokoLaiteSahkoVaiheValinta: v,
                    kokoLaiteSahkoKolmeVaihetta: v === '3' ? true : v === '1' ? false : undefined,
                  });
                }}
              >
                <option value="">Valitse…</option>
                <option value="1">230 V (1-vaihe)</option>
                <option value="3">400 V (3-vaihe)</option>
              </select>
            </label>
            {getKokoLaiteSahkoVaiheValinta(mlp) === '1' && (
              <FormInput label="1-vaihe (A)" value={mlp.kokoLaiteVirta1vaihe} onChange={(v) => patchMlp({ kokoLaiteVirta1vaihe: v })} type="number" />
            )}
            {getKokoLaiteSahkoVaiheValinta(mlp) === '3' && (
              <>
                <FormInput label="L1 (A)" value={mlp.kokoLaiteVirtaL1} onChange={(v) => patchMlp({ kokoLaiteVirtaL1: v })} type="number" />
                <FormInput label="L2 (A)" value={mlp.kokoLaiteVirtaL2} onChange={(v) => patchMlp({ kokoLaiteVirtaL2: v })} type="number" />
                <FormInput label="L3 (A)" value={mlp.kokoLaiteVirtaL3} onChange={(v) => patchMlp({ kokoLaiteVirtaL3: v })} type="number" />
              </>
            )}
          </div>
        )}
        {showMaalampoOnly ? (
          <MlpEnergyDashboard
            mlp={mlp}
            kp1={form.kylmaainePiiri1}
            wholeDeviceElectric={!!mlp.mittaaKokoLaiteSahko}
            hideWarnings={hideMaintenancePrintWarnings(form)}
          />
        ) : null}
        {showChillerParts && !showMaalampoOnly ? (() => {
          const chiller = computeChillerEnergyFromMlp(mlp, form.kylmaainePiiri1);
          return (
            <div className="huolto-energy-summary">
              <div className="huolto-energy-cop">
                <span className="huolto-energy-cop-label">Jäähdytyksen COP</span>
                <strong className="huolto-energy-cop-value">
                  {chiller.cop != null && chiller.cop > 0 ? chiller.cop.toFixed(2) : '—'}
                </strong>
              </div>
              <div className="line-form-grid huolto-energy-grid">
                {chiller.qCoolKw != null && chiller.qCoolKw > 0 ? (
                  <div className="huolto-alert huolto-alert-success">
                    Jäähdytysteho: {chiller.qCoolKw.toFixed(2)} kW
                  </div>
                ) : null}
                {chiller.pInKw != null ? (
                  <div className="huolto-alert">Sähköteho: {chiller.pInKw.toFixed(2)} kW</div>
                ) : null}
              </div>
            </div>
          );
        })() : null}
      </HuoltoModuleSection>
      )}
    </>
  );
}
