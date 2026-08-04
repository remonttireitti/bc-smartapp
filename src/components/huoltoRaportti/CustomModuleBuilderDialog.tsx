import { useEffect, useState } from 'react';
import {
  createCustomModuleField,
  createEmptyCustomModule,
  customModuleFieldTypeLabel,
  mergeCustomModuleValues,
  type CustomModuleField,
  type CustomModuleFieldType,
  type CustomReportModule,
} from '../../lib/huoltoRaportti/customModuleTypes';
import { FormInput } from './FormInput';

type Props = {
  open: boolean;
  module: CustomReportModule | null;
  onSave: (module: CustomReportModule) => void;
  onClose: () => void;
};

const FIELD_TYPES: CustomModuleFieldType[] = ['text', 'textarea', 'select', 'checkbox'];

export function CustomModuleBuilderDialog({ open, module, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CustomReportModule>(() => createEmptyCustomModule());

  useEffect(() => {
    if (!open) return;
    setDraft(module ? { ...module, fields: [...module.fields] } : createEmptyCustomModule());
  }, [open, module]);

  if (!open) return null;

  function patchField(index: number, patch: Partial<CustomModuleField>) {
    setDraft((prev) => {
      const fields = [...prev.fields];
      fields[index] = { ...fields[index], ...patch } as CustomModuleField;
      return { ...prev, fields };
    });
  }

  function addField(type: CustomModuleFieldType) {
    setDraft((prev) => ({
      ...prev,
      fields: [...prev.fields, createCustomModuleField(type)],
    }));
  }

  function removeField(index: number) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  }

  function moveField(index: number, direction: 'up' | 'down') {
    setDraft((prev) => {
      const fields = [...prev.fields];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= fields.length) return prev;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...prev, fields };
    });
  }

  function handleSave() {
    const title = draft.title.trim() || 'Oma moduuli';
    onSave({
      ...draft,
      title,
      values: mergeCustomModuleValues(draft.fields, draft.values),
    });
    onClose();
  }

  return (
    <div
      className="maintenance-report-tab-overlay custom-module-builder-overlay leave-draft-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="maintenance-report-tab-dialog custom-module-builder-dialog leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-module-builder-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="maintenance-report-tab-dialog-header">
          <h2 id="custom-module-builder-title">
            {module ? 'Muokkaa moduulia' : 'Luo oma moduuli'}
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Sulje
          </button>
        </header>

        <div className="maintenance-report-tab-dialog-body">
          <p className="muted">
            Anna moduulille otsikko ja lisää tarvitsemasi kentät. Kentät näkyvät raportissa omalla välilehdellään.
          </p>

          <FormInput
            className="huolto-span-all"
            label="Moduulin otsikko"
            value={draft.title}
            onChange={(value) => setDraft((prev) => ({ ...prev, title: value }))}
            required
          />

          <section className="custom-module-builder-fields">
            <div className="custom-module-builder-fields-header">
              <h3>Kentät</h3>
              <div className="custom-module-builder-add-buttons">
                {FIELD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addField(type)}
                  >
                    + {customModuleFieldTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>

            {draft.fields.length === 0 ? (
              <p className="muted">Ei kenttiä vielä — lisää yllä olevista painikkeista.</p>
            ) : (
              <ul className="custom-module-builder-field-list">
                {draft.fields.map((field, index) => (
                  <li key={field.id} className="custom-module-builder-field-item panel">
                    <div className="custom-module-builder-field-toolbar">
                      <span className="custom-module-builder-field-type">
                        {customModuleFieldTypeLabel(field.type)}
                      </span>
                      <div className="maintenance-module-structure-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={index === 0}
                          onClick={() => moveField(index, 'up')}
                          aria-label="Siirrä kenttä ylös"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={index === draft.fields.length - 1}
                          onClick={() => moveField(index, 'down')}
                          aria-label="Siirrä kenttä alas"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => removeField(index)}
                        >
                          Poista
                        </button>
                      </div>
                    </div>

                    <div className="line-form-grid">
                      <FormInput
                        className="huolto-span-all"
                        label="Kentän otsikko"
                        value={field.label}
                        onChange={(value) => patchField(index, { label: value })}
                        required
                      />
                      <FormInput
                        className="huolto-span-all"
                        label="Selitys / ohje (valinnainen)"
                        value={field.helpText ?? ''}
                        onChange={(value) => patchField(index, { helpText: value })}
                      />
                      {field.type === 'select' ? (
                        <label className="huolto-span-all">
                          Valinnat (yksi per rivi)
                          <textarea
                            rows={4}
                            value={field.options.join('\n')}
                            onChange={(event) =>
                              patchField(index, {
                                options: event.target.value
                                  .split('\n')
                                  .map((line) => line.trim())
                                  .filter(Boolean),
                              } as Partial<CustomModuleField>)
                            }
                          />
                        </label>
                      ) : null}
                      {field.type !== 'checkbox' ? (
                        <label className="checkbox-inline huolto-span-all">
                          <input
                            type="checkbox"
                            checked={field.required === true}
                            onChange={(event) => patchField(index, { required: event.target.checked })}
                          />
                          <span>Pakollinen kenttä</span>
                        </label>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="maintenance-report-tab-dialog-footer leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Peruuta
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Tallenna moduuli
          </button>
        </footer>
      </div>
    </div>
  );
}
