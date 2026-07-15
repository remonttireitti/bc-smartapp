import type { InstallationPlanSection } from '../../lib/installationPlan/types';
import { createInstallationPlanSection } from '../../lib/installationPlan/defaults';

type Props = {
  sections: InstallationPlanSection[];
  disabled?: boolean;
  onChange: (sections: InstallationPlanSection[]) => void;
};

export default function InstallationPlanSectionsEditor({ sections, disabled, onChange }: Props) {
  function updateSection(id: string, patch: Partial<InstallationPlanSection>) {
    onChange(sections.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  }

  function moveSection(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  function removeSection(id: string) {
    onChange(sections.filter((section) => section.id !== id));
  }

  return (
    <div className="installation-plan-sections">
      {sections.map((section, index) => (
        <div key={section.id} className="installation-plan-section-card">
          <div className="installation-plan-section-head">
            <strong>Osa {index + 1}</strong>
            <div className="installation-plan-section-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled || index === 0}
                onClick={() => moveSection(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled || index === sections.length - 1}
                onClick={() => moveSection(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled || sections.length <= 1}
                onClick={() => removeSection(section.id)}
              >
                Poista
              </button>
            </div>
          </div>
          <label className="form-field">
            <span>Otsikko</span>
            <input
              type="text"
              value={section.title}
              disabled={disabled}
              onChange={(event) => updateSection(section.id, { title: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Sisältö</span>
            <textarea
              rows={6}
              value={section.body}
              disabled={disabled}
              onChange={(event) => updateSection(section.id, { body: event.target.value })}
              placeholder="Kuvaus tai luettelomerkit (•)"
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        onClick={() => onChange([...sections, createInstallationPlanSection()])}
      >
        + Lisää osio
      </button>
    </div>
  );
}
