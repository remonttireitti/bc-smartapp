import { useMemo, useState } from 'react';
import { equipmentToOption } from '../lib/registrySearch';
import type { Equipment } from '../types';
import RegistryCombobox from './RegistryCombobox';

export type NewEquipmentDraft = {
  name: string;
  tag: string;
  model: string;
  serial_number: string;
  location: string;
};

const emptyDraft = (): NewEquipmentDraft => ({
  name: '',
  tag: '',
  model: '',
  serial_number: '',
  location: '',
});

type Props = {
  label?: string;
  equipment: Equipment[];
  equipmentId: string;
  disabled?: boolean;
  busy?: boolean;
  placeholders?: Partial<NewEquipmentDraft>;
  onSelect: (equipmentId: string) => void;
  onClear: () => void;
  onCreate: (draft: NewEquipmentDraft) => Promise<void>;
};

export default function EquipmentRegistryPicker({
  label = 'Laite',
  equipment,
  equipmentId,
  disabled,
  busy,
  placeholders,
  onSelect,
  onClear,
  onCreate,
}: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draft, setDraft] = useState<NewEquipmentDraft>(emptyDraft);

  const options = useMemo(() => equipment.map(equipmentToOption), [equipment]);

  function openCreateForm(name: string) {
    setDraft({
      name: name || placeholders?.name || '',
      tag: placeholders?.tag || '',
      model: placeholders?.model || '',
      serial_number: placeholders?.serial_number || '',
      location: placeholders?.location || '',
    });
    setShowCreateForm(true);
  }

  async function submitCreate() {
    await onCreate(draft);
    setShowCreateForm(false);
    setDraft(emptyDraft());
  }

  return (
    <>
      <RegistryCombobox
        label={label}
        placeholder="Nimi, tagi, malli, sarjanumero…"
        disabled={disabled}
        valueId={equipmentId}
        options={options}
        allowCreate
        createLabel={(query) => `+ Tallenna uusi laite: ${query}`}
        onSelect={onSelect}
        onClear={onClear}
        onCreateClick={openCreateForm}
      />

      {equipment.length === 0 && !showCreateForm && (
        <p className="muted">Asiakkaalla ei vielä laitteita rekisterissä. Kirjoita hakeaksesi tai luo uusi.</p>
      )}

      {showCreateForm && (
        <div className="expense-section registry-create-form">
          <h3>Uusi laite</h3>
          <div className="line-form-grid">
            <label>
              Nimi *
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={placeholders?.name || 'Laite'}
              />
            </label>
            <label>
              Tagi / tunnus
              <input
                value={draft.tag}
                onChange={(event) => setDraft((prev) => ({ ...prev, tag: event.target.value }))}
                placeholder={placeholders?.tag}
              />
            </label>
            <label>
              Malli
              <input
                value={draft.model}
                onChange={(event) => setDraft((prev) => ({ ...prev, model: event.target.value }))}
                placeholder={placeholders?.model}
              />
            </label>
            <label>
              Sarjanumero
              <input
                value={draft.serial_number}
                onChange={(event) => setDraft((prev) => ({ ...prev, serial_number: event.target.value }))}
                placeholder={placeholders?.serial_number}
              />
            </label>
            <label>
              Sijainti
              <input
                value={draft.location}
                onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
                placeholder={placeholders?.location}
              />
            </label>
          </div>
          <div className="btn-group">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitCreate()}>
              Tallenna laite ja valitse
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowCreateForm(false);
                setDraft(emptyDraft());
              }}
            >
              Peruuta
            </button>
          </div>
        </div>
      )}
    </>
  );
}
