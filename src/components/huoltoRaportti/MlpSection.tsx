import type { HuoltoReportData, KompressorinVaiheValinta, MlpData, PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import { lampoJakotapaOptions, mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import { isWaterAirHeatPump, mlpSectionTitle } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { createEmptyHeatingCircuitData, createEmptyHeatingElementData } from '../../lib/huoltoRaportti/defaults';
import { getKokoLaiteSahkoVaiheValinta, getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HeatingElementModule } from './HeatingElementModule';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';
import { HuoltoModuleSection } from './HuoltoModuleSection';
interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpSection({ form, onChange }: Props) {
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

  const keruuPower = calcPower(mlp.keruupiiriVirtaus, mlp.keruupiiriMeno, mlp.keruupiiriTulo, parseFloat(mlp.keruupiiriNeste) || 0);
  const latausPower = calcPower(mlp.latausVirtaus, mlp.latausMeno, mlp.latausTulo, parseFloat(mlp.latausNeste) || 0);

  function setLampoCount(count: number) {
    if (!form.mlpData) return;
    const next = [...form.mlpData.lampoPiirit];
    while (next.length < count) next.push(createEmptyHeatingCircuitData());
    patchMlp({ lampoPiireja: String(count), lampoPiirit: next.slice(0, count) });
  }

  return (
    <HuoltoModuleSection moduleKey="mlpPiirit" title={mlpSectionTitle(form.laiteTyyppi)}>

      {!isWaterAirHeatPump(form.laiteTyyppi) && (
      <div className="huolto-submodule">
        <h3>Keruupiiri (maa/vesi)</h3>
        <div className="checkbox-grid">
          <FormCheckbox label="Paine tarkastettu" checked={mlp.keruupiirinPaineTarkastettu} onChange={(v) => patchMlp({ keruupiirinPaineTarkastettu: v, ...(v ? {} : { keruupiiriPaineBar: '' }) })} />
          <FormCheckbox label="Mutasihti puhdistettu" checked={mlp.keruupiirissaMutapussiPuhdistettu} onChange={(v) => patchMlp({ keruupiirissaMutapussiPuhdistettu: v })} />
          <FormCheckbox label="Pumppu tarkastettu" checked={mlp.keruupiirinPumppuTarkastettu} onChange={(v) => patchMlp({ keruupiirinPumppuTarkastettu: v })} />
          <FormCheckbox label="Eristeet kunnossa" checked={mlp.keruupiirinEristeetKunnossa} onChange={(v) => patchMlp({ keruupiirinEristeetKunnossa: v })} />
          <FormCheckbox label="Automaattinen ilmaus tarkistettu" checked={mlp.keruupiirissaAutomaattinenIlmausTarkistettu} onChange={(v) => patchMlp({ keruupiirissaAutomaattinenIlmausTarkistettu: v })} />
          <FormCheckbox label="Paisunta-astia tarkastettu" checked={mlp.keruuPaisuntaAstiaTarkistettu} onChange={(v) => patchMlp({ keruuPaisuntaAstiaTarkistettu: v })} />
        </div>
        {mlp.keruupiirinPaineTarkastettu && (
          <FormInput label="Mitattu paine (bar)" value={mlp.keruupiiriPaineBar} onChange={(v) => patchMlp({ keruupiiriPaineBar: v })} type="number" />
        )}
        {mlp.keruupiirinPumppuTarkastettu && (
          <>
            <div className="line-form-grid">
              <FormInput label="Pumpun valmistaja" value={mlp.keruupiiriPumpunValmistaja} onChange={(v) => patchMlp({ keruupiiriPumpunValmistaja: v })} />
              <FormInput label="Pumpun malli" value={mlp.keruupiiriPumpunMalli} onChange={(v) => patchMlp({ keruupiiriPumpunMalli: v })} />
            </div>
            <PumpSupplyMeasurementBlock
              syottoValinta={getMlpPumpSyottoValinta(mlp.keruupiiriPumpunSyottoValinta, mlp.keruupiiriPumppuKolmeVaihetta)}
              onSyottoValintaChange={(v) => setPumpSyotto('keruupiiriPumpunSyottoValinta', 'keruupiiriPumppuKolmeVaihetta', v)}
              virta1vaihe={mlp.keruupiiriPumppuVirta1vaihe}
              virtaL1={mlp.keruupiiriPumppuVirtaL1}
              virtaL2={mlp.keruupiiriPumppuVirtaL2}
              virtaL3={mlp.keruupiiriPumppuVirtaL3}
              onVirta1vaihe={(v) => patchMlp({ keruupiiriPumppuVirta1vaihe: v })}
              onVirtaL1={(v) => patchMlp({ keruupiiriPumppuVirtaL1: v })}
              onVirtaL2={(v) => patchMlp({ keruupiiriPumppuVirtaL2: v })}
              onVirtaL3={(v) => patchMlp({ keruupiiriPumppuVirtaL3: v })}
            />
          </>
        )}
        {mlp.keruuPaisuntaAstiaTarkistettu && (
          <div className="line-form-grid">
            <FormInput label="Paisunta-astia koko" value={mlp.keruuPaisuntaAstiaKoko} onChange={(v) => patchMlp({ keruuPaisuntaAstiaKoko: v })} className="huolto-span-all" />
            <FormInput label="Esipaine (bar)" value={mlp.keruuPaisuntaAstiaEsipaine} onChange={(v) => patchMlp({ keruuPaisuntaAstiaEsipaine: v })} type="number" />
          </div>
        )}
        <div className="line-form-grid">
          <FormInput label="Virtaus (l/s)" value={mlp.keruupiiriVirtaus} onChange={(v) => patchMlp({ keruupiiriVirtaus: v })} type="number" />
          <FormInput label="Meno (°C)" value={mlp.keruupiiriMeno} onChange={(v) => patchMlp({ keruupiiriMeno: v })} type="number" />
          <FormInput label="Tulo (°C)" value={mlp.keruupiiriTulo} onChange={(v) => patchMlp({ keruupiiriTulo: v })} type="number" />
          <label>
            Neste
            <select value={mlp.keruupiiriNeste} onChange={(e) => patchMlp({ keruupiiriNeste: e.target.value })}>
              {mlpNestOptions.map((o) => (
                <option key={o.label} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        {keruuPower && (
          <div className="huolto-alert huolto-alert-success">Keruupiirin teho: {keruuPower} kW</div>
        )}
      </div>
      )}

      <div className="huolto-submodule">
        <h3>Erillinen jäähdytyspiiri</h3>
        <div className="checkbox-grid">
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
        </div>
      </div>

      <div className="huolto-submodule">
        <h3>Lämmityspiiri</h3>
        <div className="checkbox-grid">
          <FormCheckbox label="Paine tarkastettu" checked={mlp.latausPaineTarkastettu} onChange={(v) => patchMlp({ latausPaineTarkastettu: v, ...(v ? {} : { latausPaineBar: '' }) })} />
          <FormCheckbox label="Mutapussi puhdistettu" checked={mlp.latausMutapussiPuhdistettu} onChange={(v) => patchMlp({ latausMutapussiPuhdistettu: v })} />
          <FormCheckbox label="Pumppu tarkastettu" checked={mlp.latausPumppuTarkastettu} onChange={(v) => patchMlp({ latausPumppuTarkastettu: v })} />
          <FormCheckbox label="Eristeet kunnossa" checked={mlp.latausEristeetKunnossa} onChange={(v) => patchMlp({ latausEristeetKunnossa: v })} />
          <FormCheckbox label="Automaattinen ilmaus tarkistettu" checked={mlp.latausAutomaattinenIlmausTarkistettu} onChange={(v) => patchMlp({ latausAutomaattinenIlmausTarkistettu: v })} />
          <FormCheckbox label="Tulistuspiiri" checked={mlp.latausTulistuspiiri} onChange={(v) => patchMlp({ latausTulistuspiiri: v })} />
        </div>
        {mlp.latausPaineTarkastettu && (
          <FormInput label="Mitattu paine (bar)" value={mlp.latausPaineBar} onChange={(v) => patchMlp({ latausPaineBar: v })} type="number" />
        )}
        {mlp.latausPumppuTarkastettu && (
          <>
            <div className="line-form-grid">
              <FormInput label="Pumpun valmistaja" value={mlp.latausPumpunValmistaja} onChange={(v) => patchMlp({ latausPumpunValmistaja: v })} />
              <FormInput label="Pumpun malli" value={mlp.latausPumpunMalli} onChange={(v) => patchMlp({ latausPumpunMalli: v })} />
            </div>
            <PumpSupplyMeasurementBlock
              syottoValinta={getMlpPumpSyottoValinta(mlp.latausPumpunSyottoValinta, mlp.latausPumppuKolmeVaihetta)}
              onSyottoValintaChange={(v) => setPumpSyotto('latausPumpunSyottoValinta', 'latausPumppuKolmeVaihetta', v)}
              virta1vaihe={mlp.latausPumppuVirta1vaihe}
              virtaL1={mlp.latausPumppuVirtaL1}
              virtaL2={mlp.latausPumppuVirtaL2}
              virtaL3={mlp.latausPumppuVirtaL3}
              onVirta1vaihe={(v) => patchMlp({ latausPumppuVirta1vaihe: v })}
              onVirtaL1={(v) => patchMlp({ latausPumppuVirtaL1: v })}
              onVirtaL2={(v) => patchMlp({ latausPumppuVirtaL2: v })}
              onVirtaL3={(v) => patchMlp({ latausPumppuVirtaL3: v })}
            />
          </>
        )}
        <div className="line-form-grid">
          <FormInput label="Virtaus (l/s)" value={mlp.latausVirtaus} onChange={(v) => patchMlp({ latausVirtaus: v })} type="number" />
          <FormInput label="Meno (°C)" value={mlp.latausMeno} onChange={(v) => patchMlp({ latausMeno: v })} type="number" />
          <FormInput label="Tulo (°C)" value={mlp.latausTulo} onChange={(v) => patchMlp({ latausTulo: v })} type="number" />
          <label>
            Neste
            <select value={mlp.latausNeste} onChange={(e) => patchMlp({ latausNeste: e.target.value })}>
              {mlpNestOptions.map((o) => (
                <option key={`l-${o.label}`} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        {latausPower && (
          <div className="huolto-alert huolto-alert-success">Latauspiirin teho: {latausPower} kW</div>
        )}
        <div className="line-form-grid">
          <FormInput
            label="Järjestelmän neste"
            value={mlp.latausJarjestelmanNeste}
            onChange={(v) => patchMlp({ latausJarjestelmanNeste: v })}
            className="huolto-span-all"
          />
          <FormInput
            label="Glykolin pakkaskestävyys (°C)"
            value={mlp.latausGlykoliPakkaskestavyys}
            onChange={(v) => patchMlp({ latausGlykoliPakkaskestavyys: v })}
            type="number"
          />
        </div>
        {mlp.latausTulistuspiiri && (
          <div className="huolto-submodule">
            <FormCheckbox
              label="Tulistuspiirissä pumppu"
              checked={mlp.latausTulistuspiiriPumppu}
              onChange={(v) => patchMlp({ latausTulistuspiiriPumppu: v })}
            />
            {mlp.latausTulistuspiiriPumppu && (
              <>
                <div className="line-form-grid">
                  <FormInput
                    label="Pumpun valmistaja"
                    value={mlp.latausTulistusPumpunValmistaja}
                    onChange={(v) => patchMlp({ latausTulistusPumpunValmistaja: v })}
                  />
                  <FormInput
                    label="Pumpun malli"
                    value={mlp.latausTulistusPumpunMalli}
                    onChange={(v) => patchMlp({ latausTulistusPumpunMalli: v })}
                  />
                </div>
                <PumpSupplyMeasurementBlock
                  syottoValinta={getMlpPumpSyottoValinta(
                    mlp.latausTulistusPumpunSyottoValinta,
                    mlp.latausTulistusPumppuKolmeVaihetta,
                  )}
                  onSyottoValintaChange={(v) =>
                    setPumpSyotto('latausTulistusPumpunSyottoValinta', 'latausTulistusPumppuKolmeVaihetta', v)
                  }
                  virta1vaihe={mlp.latausTulistusPumppuVirta1vaihe}
                  virtaL1={mlp.latausTulistusPumppuVirtaL1}
                  virtaL2={mlp.latausTulistusPumppuVirtaL2}
                  virtaL3={mlp.latausTulistusPumppuVirtaL3}
                  onVirta1vaihe={(v) => patchMlp({ latausTulistusPumppuVirta1vaihe: v })}
                  onVirtaL1={(v) => patchMlp({ latausTulistusPumppuVirtaL1: v })}
                  onVirtaL2={(v) => patchMlp({ latausTulistusPumppuVirtaL2: v })}
                  onVirtaL3={(v) => patchMlp({ latausTulistusPumppuVirtaL3: v })}
                />
              </>
            )}
            <div className="line-form-grid">
              <label>
                Neste
                <select value={mlp.latausTulistusNeste} onChange={(e) => patchMlp({ latausTulistusNeste: e.target.value })}>
                  {mlpNestOptions.map((o) => (
                    <option key={`t-${o.label}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput label="Virtaus (l/s)" value={mlp.latausTulistusVirtaus} onChange={(v) => patchMlp({ latausTulistusVirtaus: v })} type="number" />
              <FormInput label="Meno (°C)" value={mlp.latausTulistusMeno} onChange={(v) => patchMlp({ latausTulistusMeno: v })} type="number" />
              <FormInput label="Tulo (°C)" value={mlp.latausTulistusTulo} onChange={(v) => patchMlp({ latausTulistusTulo: v })} type="number" />
            </div>
          </div>
        )}
      </div>

      <div className="huolto-submodule">
        <h3>Käyttövesi</h3>
        <FormCheckbox label="Käyttövesi mukana" checked={mlp.kayttovesiEnabled} onChange={(v) => patchMlp({ kayttovesiEnabled: v })} />
        {mlp.kayttovesiEnabled && (
          <>
            <div className="line-form-grid">
              <FormInput label="Tilavuus (l)" value={mlp.kayttovesiTilavuus} onChange={(v) => patchMlp({ kayttovesiTilavuus: v })} />
              <FormInput label="Lämpötila-asetus (°C)" value={mlp.kayttovesiLampotilaAsetus} onChange={(v) => patchMlp({ kayttovesiLampotilaAsetus: v })} />
              <FormInput label="Nykyinen lämpötila (°C)" value={mlp.kayttovesiLampotilaNykyinen} onChange={(v) => patchMlp({ kayttovesiLampotilaNykyinen: v })} />
              <FormCheckbox label="Toimilaitteet OK" checked={mlp.kayttovesiToimilaitteetOK} onChange={(v) => patchMlp({ kayttovesiToimilaitteetOK: v })} />
            </div>
            <FormCheckbox
              label="Sähkövastukset käytössä"
              checked={mlp.kayttovesiSahkoVastuksetEnabled}
              onChange={(v) => patchMlp({ kayttovesiSahkoVastuksetEnabled: v })}
            />
            {mlp.kayttovesiSahkoVastuksetEnabled && (
              <>
                <FormInput
                  label="Vastusten määrä (kpl)"
                  value={mlp.kayttovesiSahkoVastuksetMaara}
                  onChange={(v) => {
                    const newCount = parseInt(v, 10) || 0;
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
          </>
        )}
      </div>

      <div className="huolto-submodule">
        <h3>Lämpöpiirit</h3>
        <FormCheckbox
          label="Tulosta ja tallenna laitekorttiin (kiinteistön lämmityspiiri)"
          checked={mlp.kiinteistoPiiritSisallytetaan !== false}
          onChange={(v) => patchMlp({ kiinteistoPiiritSisallytetaan: v })}
          className="huolto-span-all"
        />
        <label>
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
        <div className="checkbox-grid">
          <FormCheckbox label="Toimilaitteet testattu" checked={mlp.lampoToimilaitteetOK} onChange={(v) => patchMlp({ lampoToimilaitteetOK: v })} />
          <FormCheckbox label="Automaattinen ilmanpoisto testattu" checked={mlp.lampoAutomaattinenIlmausTarkistettu} onChange={(v) => patchMlp({ lampoAutomaattinenIlmausTarkistettu: v })} />
          <FormCheckbox label="Mutasihti puhdistettu" checked={mlp.lampoMutapussiPuhdistettu} onChange={(v) => patchMlp({ lampoMutapussiPuhdistettu: v })} />
        </div>
        <FormCheckbox
          label="Paisunta-astia esipaine tarkistettu"
          checked={mlp.lampoPaisuntaAstiaTarkistettu}
          onChange={(v) => patchMlp({ lampoPaisuntaAstiaTarkistettu: v })}
        />
        {mlp.lampoPaisuntaAstiaTarkistettu && (
          <div className="line-form-grid">
            <FormInput label="Paisunta-astian koko" value={mlp.lampoPaisuntaAstiaKoko} onChange={(v) => patchMlp({ lampoPaisuntaAstiaKoko: v })} className="huolto-span-all" />
            <FormInput label="Esipaine (bar)" value={mlp.lampoPaisuntaAstiaEsipaine} onChange={(v) => patchMlp({ lampoPaisuntaAstiaEsipaine: v })} type="number" />
          </div>
        )}
        {mlp.lampoPiirit.map((piiri, idx) => (
          <div key={idx} className="huolto-submodule">
            <h4>Lämpöpiiri {idx + 1}</h4>
            <div className="line-form-grid">
              <label>
                Jakotapa
                <select
                  value={piiri.jakotapa}
                  onChange={(e) => {
                    const next = [...mlp.lampoPiirit];
                    next[idx] = { ...next[idx], jakotapa: e.target.value };
                    patchMlp({ lampoPiirit: next });
                  }}
                >
                  {lampoJakotapaOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              {piiri.jakotapa === 'muu' && (
                <FormInput
                  label="Muu jakotapa"
                  value={piiri.jakotapaMuu}
                  onChange={(v) => {
                    const next = [...mlp.lampoPiirit];
                    next[idx] = { ...next[idx], jakotapaMuu: v };
                    patchMlp({ lampoPiirit: next });
                  }}
                />
              )}
              <FormCheckbox
                label="Pumppu tarkastettu"
                checked={!!piiri.pumppuTarkastettu}
                onChange={(v) => {
                  const next = [...mlp.lampoPiirit];
                  next[idx] = { ...next[idx], pumppuTarkastettu: v };
                  patchMlp({ lampoPiirit: next });
                }}
              />
              {piiri.pumppuTarkastettu && (
                <>
                  <FormInput label="Pumpun valmistaja" value={piiri.pumppuValmistaja || ''} onChange={(v) => {
                    const next = [...mlp.lampoPiirit];
                    next[idx] = { ...next[idx], pumppuValmistaja: v };
                    patchMlp({ lampoPiirit: next });
                  }} />
                  <FormInput label="Pumpun malli" value={piiri.pumppuMalli || ''} onChange={(v) => {
                    const next = [...mlp.lampoPiirit];
                    next[idx] = { ...next[idx], pumppuMalli: v };
                    patchMlp({ lampoPiirit: next });
                  }} />
                  <PumpSupplyMeasurementBlock
                    syottoValinta={getMlpPumpSyottoValinta(piiri.pumppuSyottoValinta, piiri.pumppuKolmeVaihetta)}
                    onSyottoValintaChange={(v) => {
                      const next = [...mlp.lampoPiirit];
                      next[idx] = {
                        ...next[idx],
                        pumppuSyottoValinta: v,
                        pumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined,
                      };
                      patchMlp({ lampoPiirit: next });
                    }}
                    virta1vaihe={piiri.pumppuVirta1vaihe}
                    virtaL1={piiri.pumppuVirtaL1}
                    virtaL2={piiri.pumppuVirtaL2}
                    virtaL3={piiri.pumppuVirtaL3}
                    onVirta1vaihe={(v) => {
                      const next = [...mlp.lampoPiirit];
                      next[idx] = { ...next[idx], pumppuVirta1vaihe: v };
                      patchMlp({ lampoPiirit: next });
                    }}
                    onVirtaL1={(v) => {
                      const next = [...mlp.lampoPiirit];
                      next[idx] = { ...next[idx], pumppuVirtaL1: v };
                      patchMlp({ lampoPiirit: next });
                    }}
                    onVirtaL2={(v) => {
                      const next = [...mlp.lampoPiirit];
                      next[idx] = { ...next[idx], pumppuVirtaL2: v };
                      patchMlp({ lampoPiirit: next });
                    }}
                    onVirtaL3={(v) => {
                      const next = [...mlp.lampoPiirit];
                      next[idx] = { ...next[idx], pumppuVirtaL3: v };
                      patchMlp({ lampoPiirit: next });
                    }}
                  />
                </>
              )}
              <FormInput label="Virtaus (l/s)" value={piiri.virtaus} onChange={(v) => {
                const next = [...mlp.lampoPiirit];
                next[idx] = { ...next[idx], virtaus: v };
                patchMlp({ lampoPiirit: next });
              }} type="number" />
              <FormInput label="Meno (°C)" value={piiri.meno} onChange={(v) => {
                const next = [...mlp.lampoPiirit];
                next[idx] = { ...next[idx], meno: v };
                patchMlp({ lampoPiirit: next });
              }} type="number" />
              <FormInput label="Tulo (°C)" value={piiri.tulo} onChange={(v) => {
                const next = [...mlp.lampoPiirit];
                next[idx] = { ...next[idx], tulo: v };
                patchMlp({ lampoPiirit: next });
              }} type="number" />
            </div>
          </div>
        ))}
        <FormCheckbox
          label="Sähkökattila varalämmitykseen"
          checked={mlp.lampoSahkoKattilaVaralampitykseen}
          onChange={(v) => patchMlp({ lampoSahkoKattilaVaralampitykseen: v })}
        />
        {mlp.lampoSahkoKattilaVaralampitykseen && (
          <div className="line-form-grid">
            <FormInput label="Kattilan tyyppi/malli" value={mlp.lampoSahkoKattilaTyyppi} onChange={(v) => patchMlp({ lampoSahkoKattilaTyyppi: v })} />
            <FormInput label="Teho (kW)" value={mlp.lampoSahkoKattilaTeho} onChange={(v) => patchMlp({ lampoSahkoKattilaTeho: v })} type="number" />
          </div>
        )}
      </div>

      <div className="huolto-submodule">
        <h3>Kylmäaine (MLP)</h3>
        <div className="checkbox-grid">
          <FormCheckbox label="Päästöventtiili tarkastettu" checked={mlp.kylmaainePaetosTarkastettu} onChange={(v) => patchMlp({ kylmaainePaetosTarkastettu: v })} />
          <FormCheckbox label="Vuotoja havaittu" checked={mlp.kylmaaineVuotoja} onChange={(v) => patchMlp({ kylmaaineVuotoja: v })} />
        </div>
        <div className="line-form-grid">
          <FormInput label="Paine lauhdutin (bar)" value={mlp.kylmaainePaineLauhdutinBar} onChange={(v) => patchMlp({ kylmaainePaineLauhdutinBar: v })} type="number" />
          <FormInput label="Kyllästyslämpötila (°C)" value={mlp.kylmaaineKyllaestymisLampotila} onChange={(v) => patchMlp({ kylmaaineKyllaestymisLampotila: v })} type="number" />
          <FormInput label="Nesteputki (°C)" value={mlp.kylmaaineNestePutkiLampotila} onChange={(v) => patchMlp({ kylmaaineNestePutkiLampotila: v })} type="number" />
          <FormInput label="Alijäähdytys (K)" value={mlp.kylmaaineAlijaahdytys} onChange={(v) => patchMlp({ kylmaaineAlijaahdytys: v })} type="number" />
        </div>
      </div>

      <div className="huolto-submodule">
        <h3>Energiatehokkuus</h3>
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
      </div>
    </HuoltoModuleSection>
  );
}
