import type { CompressorData, KompressorinVaiheValinta } from '../../lib/huoltoRaportti/types';
import { ohjaustapaOptions } from '../../lib/huoltoRaportti/constants';
import { compressorKolmeVaijetta, getCompressorVaiheValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartSection } from './HuoltoPartSection';

interface CompressorModuleProps {
  number: number;
  data: CompressorData;
  onChange: (data: CompressorData) => void;
  lockManufacturerModel?: boolean;
}

export function CompressorModule({
  number,
  data,
  onChange,
  lockManufacturerModel = false,
}: CompressorModuleProps) {
  const vaiheValinta = getCompressorVaiheValinta(data);
  const kolmeVai = compressorKolmeVaijetta(data);

  const calculatePhaseImbalance = (): { percentage: number; level: 'ok' | 'warning' | 'danger' } | null => {
    const l1 = parseFloat(data.virtaL1) || 0;
    const l2 = parseFloat(data.virtaL2) || 0;
    const l3 = parseFloat(data.virtaL3) || 0;
    if (l1 <= 0 || l2 <= 0 || l3 <= 0) return null;
    const avg = (l1 + l2 + l3) / 3;
    if (avg <= 0) return null;
    const deviations = [Math.abs(l1 - avg), Math.abs(l2 - avg), Math.abs(l3 - avg)];
    const maxDeviation = Math.max(...deviations);
    const percentage = (maxDeviation / avg) * 100;
    let level: 'ok' | 'warning' | 'danger' = 'ok';
    if (percentage > 10) level = 'danger';
    else if (percentage > 5) level = 'warning';
    return { percentage, level };
  };

  const imbalance = kolmeVai ? calculatePhaseImbalance() : null;

  const setVaiheValinta = (v: KompressorinVaiheValinta) => {
    onChange({
      ...data,
      kompressorinVaiheValinta: v,
      onkoKolmeVaihetta: v === '3' ? true : v === '1' ? false : undefined,
    });
  };

  const syncLegacyTyyppi = (val: string, mall: string) =>
    [val, mall].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');

  return (
    <HuoltoPartSection title={`Kompressori ${number}`} partKey={`comp-${number}`} defaultOpen={number === 1}>
      <div className="line-form-grid">
        <FormInput
          label="Valmistaja"
          value={data.valmistaja ?? ''}
          onChange={(v) =>
            onChange({ ...data, valmistaja: v, tyyppi: syncLegacyTyyppi(v, data.malli ?? '') })
          }
          disabled={lockManufacturerModel}
        />
        <FormInput
          label="Malli"
          value={data.malli ?? ''}
          onChange={(v) =>
            onChange({ ...data, malli: v, tyyppi: syncLegacyTyyppi(data.valmistaja ?? '', v) })
          }
          disabled={lockManufacturerModel}
        />
        {lockManufacturerModel && (
          <p className="muted huolto-span-all">Valmistaja ja malli haetaan kompressorista 1.</p>
        )}

        <label className="huolto-span-all">
          Syöttöjännite
          <select
            value={vaiheValinta}
            onChange={(e) => setVaiheValinta(e.target.value as KompressorinVaiheValinta)}
          >
            <option value="">Valitse</option>
            <option value="1">230 V (1-vaihe)</option>
            <option value="3">400 V (3-vaihe)</option>
          </select>
        </label>

        {vaiheValinta === '1' && (
          <FormInput
            label="Ampeeri kulutus (A)"
            value={data.virta1vaihe}
            onChange={(v) => onChange({ ...data, virta1vaihe: v })}
            placeholder="0.0"
            type="number"
            className="huolto-span-all"
          />
        )}

        {vaiheValinta === '3' && (
          <div className="huolto-span-all">
            <div className="line-form-grid huolto-phase-grid">
              <FormInput
                label="L1 (A)"
                value={data.virtaL1}
                onChange={(v) => onChange({ ...data, virtaL1: v })}
                placeholder="0.0"
                type="number"
              />
              <FormInput
                label="L2 (A)"
                value={data.virtaL2}
                onChange={(v) => onChange({ ...data, virtaL2: v })}
                placeholder="0.0"
                type="number"
              />
              <FormInput
                label="L3 (A)"
                value={data.virtaL3}
                onChange={(v) => onChange({ ...data, virtaL3: v })}
                placeholder="0.0"
                type="number"
              />
            </div>
            {imbalance && imbalance.level !== 'ok' && (
              <div className={`huolto-alert huolto-alert-${imbalance.level}`}>
                {imbalance.level === 'danger'
                  ? 'Vaarallinen → vaihevirrat epätasaisia'
                  : 'Riski → vaihevirrat epätasaisia'}{' '}
                <span className="muted">(poikkeama {imbalance.percentage.toFixed(1)}%)</span>
              </div>
            )}
          </div>
        )}

        <label className="huolto-span-all">
          Ohjaustapa
          <select
            value={data.ohjaustapa}
            onChange={(e) => onChange({ ...data, ohjaustapa: e.target.value })}
          >
            {ohjaustapaOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        {data.ohjaustapa === 'suorakaynnistys' && (
          <>
            <FormCheckbox
              label="Kontaktorit tarkastettu"
              checked={data.kontaktoritTarkastettu}
              onChange={(v) => onChange({ ...data, kontaktoritTarkastettu: v })}
            />
            <FormInput
              label="Kontaktorin tyyppi"
              value={data.kontaktoriTyyppi}
              onChange={(v) => onChange({ ...data, kontaktoriTyyppi: v })}
            />
          </>
        )}

        {data.ohjaustapa === 'pehmokaynnistys' && (
          <>
            <FormCheckbox
              label="Pehmokäynnistin tarkastettu"
              checked={data.pehmokaynnistinTarkastettu}
              onChange={(v) => onChange({ ...data, pehmokaynnistinTarkastettu: v })}
            />
            <FormInput
              label="Pehmokäynnistimen tyyppi/malli"
              value={data.pehmokaynnistinTyyppi}
              onChange={(v) => onChange({ ...data, pehmokaynnistinTyyppi: v })}
            />
          </>
        )}

        {data.ohjaustapa === 'taajuusmuuttaja' && (
          <>
            <FormCheckbox
              label="Taajuusmuuttaja tarkastettu"
              checked={data.taajuusmuuttajaTarkastettu}
              onChange={(v) => onChange({ ...data, taajuusmuuttajaTarkastettu: v })}
            />
            <FormInput
              label="Taajuusmuuttajan tyyppi/malli"
              value={data.taajuusmuuttajaTyyppi}
              onChange={(v) => onChange({ ...data, taajuusmuuttajaTyyppi: v })}
            />
          </>
        )}

        {data.ohjaustapa === 'muu' && (
          <FormInput
            label="Ohjaustapa (vapaamuotoinen kuvaus)"
            value={data.ohjaustapaMuu}
            onChange={(v) => onChange({ ...data, ohjaustapaMuu: v })}
            placeholder="Esim. Dol-starter, rinnankytkentä…"
            className="huolto-span-all"
          />
        )}

        <FormCheckbox
          label="Öljy määrä oikea"
          checked={data.oljyMaaraOikea}
          onChange={(v) => onChange({ ...data, oljyMaaraOikea: v })}
        />
        <FormCheckbox
          label="Öljy kirkas"
          checked={data.oljyKirkas}
          onChange={(v) => onChange({ ...data, oljyKirkas: v })}
        />
        <FormInput
          label="Öljy määrä/Laatu"
          value={data.oljyMaaraLaatu}
          onChange={(v) => onChange({ ...data, oljyMaaraLaatu: v })}
        />
      </div>
    </HuoltoPartSection>
  );
}
