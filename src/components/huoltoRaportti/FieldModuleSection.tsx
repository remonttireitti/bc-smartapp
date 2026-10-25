import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { fieldModuleValues, findFieldModule } from '../../lib/huoltoRaportti/fieldModules';
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
      {def.fields.map((field) => {
        const value = typeof values[field.id] === 'string' ? (values[field.id] as string) : '';
        if (field.type === 'select') {
          return (
            <label key={field.id}>
              {field.label}{field.required ? ' *' : ''}
              <select value={value} onChange={(e) => patch(field.id, e.target.value)}>
                <option value="">Valitse…</option>
                {field.options.map((opt) => (
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
            required={field.required}
            value={value}
            onChange={(next) => patch(field.id, next)}
          />
        );
      })}
    </section>
  );
}
