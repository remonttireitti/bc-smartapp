import { useState } from 'react';
import type { RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { koneikkoCustomComponents, koneikkoLegacyReadOnly, koneikkoView } from '../../lib/huoltoRaportti/koneikkoComponents';
import {
  createEmptyRefrigerantCircuitComponent,
  ensureRefrigerantCircuitComponents,
  refrigerantCircuitComponentLabel,
  refrigerantCircuitComponentSubtitle,
  updateRefrigerantCircuitComponents,
} from '../../lib/huoltoRaportti/refrigerantCircuitComponents';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: Array<[T, string, boolean]>; onChange: (v: T) => void }) {
  return (
    <div className="konvektori-tarkastus-item">
      <span className="konvektori-tarkastus-label">{label}</span>
      <div className="konvektori-yesno" role="group" aria-label={label}>
        {options.map(([v, l, bad]) => (
          <button
            key={v}
            type="button"
            className={`konvektori-yesno-btn${value === v ? ` konvektori-yesno-btn--active ${bad ? 'konvektori-yesno-btn--no' : 'konvektori-yesno-btn--yes'}` : ''}`}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

const LEGACY_NOTE: Record<string, string> = {
  paisuntaventtiili: 'nyt höyrystimellä',
  magneettiventtiili: 'nyt höyrystimellä',
  lauhdutimenTalvivarustus: 'nyt lauhduttimella',
};

/** Kylmiö: koneikon komponentit, 1 kpl / koneikko. */
export function KoneikkoComponentsForm({ data, onChange }: { data: RefrigerantCircuitData; onChange: (d: RefrigerantCircuitData) => void }) {
  const v = koneikkoView(data);
  const set = (patch: Partial<RefrigerantCircuitData>) => onChange({ ...data, ...patch });
  const legacy = koneikkoLegacyReadOnly(data);
  const custom = koneikkoCustomComponents(data);
  const [customName, setCustomName] = useState('');
  const all = ensureRefrigerantCircuitComponents(data);

  return (
    <div className="huolto-circuit-components-module">
      <FormCheckbox label="Nestelasi" checked={v.nestelasiOn} onChange={(on) => set({ nestelasiKaytossa: on })} />
      {v.nestelasiOn ? (
        <div className="huolto-submodule">
          <Choice label="Kuplat" value={v.nestelasiKuplat} options={[['kupliton', 'Kupliton', false], ['kuplii', 'Kuplii', true]]} onChange={(x) => set({ nestelasiKuplat: x })} />
          <Choice label="Kosteusindikaattori" value={v.nestelasiKosteus} options={[['kuiva', 'Kuiva', false], ['kostea', 'Kostea', true]]} onChange={(x) => set({ nestelasiKosteus: x })} />
        </div>
      ) : null}

      <FormCheckbox label="Kuivain" checked={v.kuivainOn} onChange={(on) => set({ kuivainKaytossa: on })} />
      {v.kuivainOn ? (
        <div className="huolto-submodule">
          <FormCheckbox label="Kuivain vaihdettu" checked={v.kuivainVaihdettu} onChange={(on) => set({ kuivainVaihdettu: on })} />
          <FormInput label="Kuivaimen malli" value={v.kuivainMalli} onChange={(x) => set({ koneikkoKuivainMalli: x })} />
        </div>
      ) : null}

      <FormCheckbox label="Imusuodatin" checked={v.imusuodatinOn} onChange={(on) => set({ imusuodatinKaytossa: on })} />
      {v.imusuodatinOn ? (
        <div className="huolto-submodule">
          <FormCheckbox label="Imusuodatin vaihdettu" checked={v.imusuodatinVaihdettu} onChange={(on) => set({ imusuodatinVaihdettu: on })} />
        </div>
      ) : null}

      <FormCheckbox label="Tärinänvaimennus" checked={v.tarinaOn} onChange={(on) => set({ tarinanvaimennusKaytossa: on })} />

      {custom.map((c) => (
        <div key={c.id} className="huolto-circuit-component-row">
          <span>{refrigerantCircuitComponentLabel(c)}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(updateRefrigerantCircuitComponents(data, all.filter((x) => x.id !== c.id)))}>Poista</button>
        </div>
      ))}
      <div className="huolto-circuit-custom-component">
        <FormInput label="Muu komponentti" value={customName} onChange={setCustomName} placeholder="Komponentin nimi" />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!customName.trim()}
          onClick={() => {
            onChange(updateRefrigerantCircuitComponents(data, [...all, { ...createEmptyRefrigerantCircuitComponent('custom', customName.trim()), tila: 'ok' }]));
            setCustomName('');
          }}
        >
          + Lisää
        </button>
      </div>

      {legacy.length > 0 ? (
        <div className="huolto-submodule">
          <h4>Aiemmin kirjattu</h4>
          {legacy.map((c) => (
            <p key={c.id} className="muted huolto-legacy-component">
              {refrigerantCircuitComponentLabel(c)}
              {refrigerantCircuitComponentSubtitle(c) ? ` · ${refrigerantCircuitComponentSubtitle(c)}` : ''}
              {c.kommentti ? ` · ${c.kommentti}` : ''}
              {LEGACY_NOTE[c.type] ? ` (${LEGACY_NOTE[c.type]})` : ''}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
