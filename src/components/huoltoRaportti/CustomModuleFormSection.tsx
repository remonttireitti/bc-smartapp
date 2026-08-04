import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import type { CustomModuleField, CustomReportModule } from '../../lib/huoltoRaportti/customModuleTypes';

type Props = {
  module: CustomReportModule;
  onChange: (values: Record<string, string | boolean>) => void;
};

function renderField(
  field: CustomModuleField,
  value: string | boolean | undefined,
  onPatch: (fieldId: string, next: string | boolean) => void,
) {
  if (field.type === 'checkbox') {
    return (
      <div key={field.id} className="custom-module-field custom-module-field-checkbox">
        <FormCheckbox
          label={field.label}
          checked={value === true}
          onChange={(checked) => onPatch(field.id, checked)}
        />
        {field.helpText ? <p className="muted custom-module-field-help">{field.helpText}</p> : null}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <label key={field.id} className="custom-module-field">
        {field.label}
        {field.required ? <span className="required-mark"> *</span> : null}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onPatch(field.id, event.target.value)}
        >
          <option value="">Valitse…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.helpText ? <p className="muted custom-module-field-help">{field.helpText}</p> : null}
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label key={field.id} className="custom-module-field huolto-span-all">
        {field.label}
        {field.required ? <span className="required-mark"> *</span> : null}
        <textarea
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onPatch(field.id, event.target.value)}
        />
        {field.helpText ? <p className="muted custom-module-field-help">{field.helpText}</p> : null}
      </label>
    );
  }

  return (
    <FormInput
      key={field.id}
      className="custom-module-field"
      label={field.label}
      required={field.required}
      value={typeof value === 'string' ? value : ''}
      onChange={(next) => onPatch(field.id, next)}
    />
  );
}

export function CustomModuleFormSection({ module, onChange }: Props) {
  function patchField(fieldId: string, next: string | boolean) {
    onChange({ ...module.values, [fieldId]: next });
  }

  if (module.fields.length === 0) {
    return (
      <p className="muted">
        Moduulissa ei ole vielä kenttiä. Lisää kenttiä Moduulirakenne-valikosta.
      </p>
    );
  }

  return (
    <section className="custom-module-form-section">
      <div className="line-form-grid custom-module-form-grid">
        {module.fields.map((field) => {
          const fieldNode = renderField(field, module.values[field.id], patchField);
          if (field.type === 'text' && field.helpText) {
            return (
              <div key={field.id} className="custom-module-field-wrap">
                {fieldNode}
                <p className="muted custom-module-field-help">{field.helpText}</p>
              </div>
            );
          }
          return fieldNode;
        })}
      </div>
    </section>
  );
}
