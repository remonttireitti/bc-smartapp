import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { type FieldModuleField, fieldModuleDisplayValue, fieldModuleFieldArchived, fieldModuleFieldRequired, fieldModuleFieldVisible, fieldModuleValues, findFieldModule } from '../../lib/huoltoRaportti/fieldModules';
import { getPressureFromSaturationTemp, getSaturationTempFromPressure, hasRefrigerantPtData } from '../../lib/huoltoRaportti/refrigerantPt';
import { FormInput } from './FormInput';
import { TempMeasuredToggle, useTempMeasured } from './TempMeasuredToggle';

type Props = {
  moduleId: string;
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
};

/** Kokoonpanon mukainen kenttämoduuli (ohjaukset, kostutus, kuivaus, …). */
export function FieldModuleSection({ moduleId, form, onPatchForm }: Props) {
  const def = findFieldModule(moduleId);
  const values = def ? fieldModuleValues(form, moduleId) : {};
  const measuredFields = (def?.fields ?? []).filter((f) => f.measured && fieldModuleFieldVisible(f, values, form));
  const temp = useTempMeasured(measuredFields.some((f) => String(values[f.id] ?? '').trim() !== ''));
  if (!def) return null;
  const patchMany = (next: Record<string, string>) =>
    onPatchForm({
      kenttaModuulit: {
        ...(form.kenttaModuulit ?? {}),
        [moduleId]: { ...values, ...next },
      },
    });
  const patch = (fieldId: string, value: string) => patchMany({ [fieldId]: value });
  const archived = def.fields.filter((f) => fieldModuleFieldArchived(f, values, form));
  const refrigerant = String(form.kylmaaineTyyppi ?? '');
  const fmt = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d) : '');

  return (
    <section className="maintenance-report-tab-section form-grid huolto-field-module">
      {def.fields.filter((field) => fieldModuleFieldVisible(field, values, form)).map((field, i, shown) => {
        const required = fieldModuleFieldRequired(field, values, form);
        const heading = field.section && field.section !== shown[i - 1]?.section
          ? <h4 key={`h-${field.section}`} className="huolto-span-all huolto-field-module-heading">{field.section}</h4>
          : null;
        if (field.measured) {
          const first = measuredFields[0]?.id === field.id;
          const toggle = first ? <TempMeasuredToggle key={`tm-${moduleId}`} on={temp.on} onChange={temp.setOn} /> : null;
          return [heading, toggle, temp.show ? renderField(field, required) : null];
        }
        return [heading, renderField(field, required)];
      })}
      {archived.length > 0 && (
        <div className="huolto-span-all huolto-archived">
          <h4 className="huolto-field-module-heading">Aiemmin kirjattu</h4>
          {archived.map((f) => (
            <p key={f.id} className="muted huolto-archived-row">{f.label}: {fieldModuleDisplayValue(f, values)}</p>
          ))}
        </div>
      )}
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
        if (field.type === 'pt') {
          const tempValue = typeof values[field.tempId] === 'string' ? (values[field.tempId] as string) : '';
          const pt = hasRefrigerantPtData(refrigerant);
          return (
            <div key={field.id} className="huolto-span-all line-form-grid huolto-pt-pair">
              <FormInput
                label={`${field.label} (bar)`}
                type="number"
                value={value}
                onChange={(next) => {
                  const t = pt && next.trim() ? getSaturationTempFromPressure(Number(next.replace(',', '.')), refrigerant) : NaN;
                  patchMany({ [field.id]: next, [field.tempId]: fmt(t, 1) });
                }}
              />
              <FormInput
                label="Höyrystyminen (°C)"
                type="number"
                value={tempValue}
                onChange={(next) => {
                  const p = pt && next.trim() ? getPressureFromSaturationTemp(Number(next.replace(',', '.')), refrigerant) : NaN;
                  patchMany({ [field.tempId]: next, [field.id]: fmt(p, 2) });
                }}
              />
              {!pt && <p className="muted huolto-span-all">Valitse kylmäaine, niin paine ↔ lämpötila lasketaan.</p>}
            </div>
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
