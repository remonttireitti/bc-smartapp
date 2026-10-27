import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { type FieldModuleField, fieldModuleFieldRequired, fieldModuleFieldVisible, fieldModuleValues, findFieldModule } from '../../lib/huoltoRaportti/fieldModules';
import { FormInput } from './FormInput';

type Props = {
  moduleId: string;
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
};

/** Kokoonpanon mukainen kenttämoduuli (ohjaukset, kostutus, kuivaus, …). */
export function FieldModuleSection({ moduleId, form, onPatchForm }: Props) {
  const def = findFieldModule(moduleId);
  if (!def) return null;
  const values = fieldModuleValues(form, moduleId);
  const patch = (fieldId: string, value: string) =>
    onPatchForm({
      kenttaModuulit: {
        ...(form.kenttaModuulit ?? {}),
        [moduleId]: { ...values, [fieldId]: value },
      },
    });

  return (
    <section className="maintenance-report-tab-section form-grid huolto-field-module">
      {def.fields.filter((field) => fieldModuleFieldVisible(field, values, form)).map((field, i, shown) => {
        const required = fieldModuleFieldRequired(field, values, form);
        const heading = field.section && field.section !== shown[i - 1]?.section
          ? <h4 key={`h-${field.section}`} className="huolto-span-all huolto-field-module-heading">{field.section}</h4>
          : null;
        return [heading, renderField(field, required)];
      })}
    </section>
  );

  function renderField(field: FieldModuleField, required: boolean) {
        const value = typeof values[field.id] === 'string' ? (values[field.id] as string) : '';
        if (field.type === 'select') {
          return (
            <label key={field.id}>
              {field.label}{required ? ' *' : ''}
              <select value={value} onChange={(e) => patch(field.id, e.target.value)}>
                <option value="">Valitse…</option>
                {(value && !field.options.includes(value) ? [value, ...field.options] : field.options).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === 'textarea') {
          return (
            <label key={field.id} className="huolto-span-all">
              {field.label}
              <textarea rows={3} value={value} onChange={(e) => patch(field.id, e.target.value)} />
            </label>
          );
        }
        return (
          <FormInput
            key={field.id}
            label={field.unit ? `${field.label} (${field.unit})` : field.label}
            required={required}
            value={value}
            onChange={(next) => patch(field.id, next)}
          />
        );
  }
}
