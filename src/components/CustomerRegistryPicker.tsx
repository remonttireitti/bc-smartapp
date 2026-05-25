import { useMemo, useState } from 'react';
import { customerToOption } from '../lib/registrySearch';
import type { Customer } from '../types';
import RegistryCombobox from './RegistryCombobox';

export type NewCustomerDraft = {
  name: string;
  address: string;
  city: string;
  phone: string;
};

const emptyDraft = (): NewCustomerDraft => ({
  name: '',
  address: '',
  city: '',
  phone: '',
});

type Props = {
  label?: string;
  customers: Customer[];
  customerId: string;
  myCompanyId?: string;
  disabled?: boolean;
  brandingName?: string;
  createRegistryName?: string;
  busy?: boolean;
  onSelect: (customerId: string) => void;
  onClear: () => void;
  onCreate: (draft: NewCustomerDraft) => Promise<void>;
};

export default function CustomerRegistryPicker({
  label = 'Asiakas',
  customers,
  customerId,
  myCompanyId,
  disabled,
  brandingName,
  createRegistryName,
  busy,
  onSelect,
  onClear,
  onCreate,
}: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draft, setDraft] = useState<NewCustomerDraft>(emptyDraft);

  const options = useMemo(
    () => customers.map((customer) => customerToOption(customer, myCompanyId)),
    [customers, myCompanyId],
  );
  const createTargetName = createRegistryName ?? brandingName ?? 'oma rekisteri';

  function openCreateForm(name: string) {
    setDraft({ ...emptyDraft(), name });
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
        placeholder="Nimi, osoite, kaupunki…"
        disabled={disabled}
        valueId={customerId}
        options={options}
        allowCreate
        createLabel={(query) => `+ Tallenna uusi asiakas (${createTargetName}): ${query}`}
        onSelect={onSelect}
        onClear={onClear}
        onCreateClick={openCreateForm}
      />

      {showCreateForm && (
        <div className="expense-section registry-create-form">
          <h3>Uusi asiakas{brandingName ? ` — ${brandingName}` : ''}</h3>
          <div className="line-form-grid">
            <label>
              Nimi *
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Osoite
              <input
                value={draft.address}
                onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
              />
            </label>
            <label>
              Kaupunki
              <input
                value={draft.city}
                onChange={(event) => setDraft((prev) => ({ ...prev, city: event.target.value }))}
              />
            </label>
            <label>
              Puhelin
              <input
                value={draft.phone}
                onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
          </div>
          <div className="btn-group">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitCreate()}>
              Tallenna asiakas ja valitse
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
