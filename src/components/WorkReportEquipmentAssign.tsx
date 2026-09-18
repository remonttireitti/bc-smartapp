import type { Equipment } from '../types';
import { formatEquipmentOptionLabel } from '../lib/workReportEquipment';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from './EquipmentRegistryPicker';

type Props = {
  label?: string;
  equipment: Equipment[];
  selectedIds: string[];
  disabled?: boolean;
  busy?: boolean;
  onChange: (ids: string[]) => void;
  onCreate?: (draft: NewEquipmentDraft) => Promise<void>;
};

export default function WorkReportEquipmentAssign({
  label = 'Laitteet',
  equipment,
  selectedIds,
  disabled,
  busy,
  onChange,
  onCreate,
}: Props) {
  const selectedSet = new Set(selectedIds);
  const selectedEquipment = equipment.filter((entry) => selectedSet.has(entry.id));

  function toggle(id: string, checked: boolean) {
    if (checked) {
      if (selectedSet.has(id)) return;
      onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((entry) => entry !== id));
  }

  function addFromPicker(id: string) {
    if (!id || selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
  }

  return (
    <div className="work-report-equipment-assign">
      <div className="work-report-equipment-assign-label">{label}</div>
      <p className="muted work-report-equipment-assign-hint">
        Voit kohdistaa raportin yhteen tai useaan laitteeseen. Kohdistuksen voi tehdä myös jälkikäteen.
      </p>

      {equipment.length > 0 ? (
        <div className="work-report-equipment-assign-list">
          {equipment.map((entry) => {
            const checked = selectedSet.has(entry.id);
            return (
              <label key={entry.id} className="work-report-equipment-assign-row">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || busy}
                  onChange={(event) => toggle(entry.id, event.target.checked)}
                />
                <span>{formatEquipmentOptionLabel(entry)}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="muted">Asiakkaalla ei ole vielä laitteita rekisterissä.</p>
      )}

      {selectedEquipment.length > 0 ? (
        <div className="work-report-equipment-assign-chips">
          {selectedEquipment.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="work-report-equipment-assign-chip"
              disabled={disabled || busy}
              onClick={() => toggle(entry.id, false)}
              title="Poista kohdistus"
            >
              {formatEquipmentOptionLabel(entry)} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Ei kohdistettu mihinkään laitteeseen.</p>
      )}

      {onCreate ? (
        <EquipmentRegistryPicker
          label="Lisää uusi laite rekisteriin"
          equipment={equipment}
          equipmentId=""
          disabled={disabled}
          busy={busy}
          excludeEquipmentIds={selectedIds}
          onSelect={addFromPicker}
          onClear={() => undefined}
          onCreate={onCreate}
        />
      ) : null}
    </div>
  );
}
