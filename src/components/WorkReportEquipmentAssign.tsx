import type { Equipment } from '../types';
import { formatEquipmentOptionLabel } from '../lib/workReportEquipment';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from './EquipmentRegistryPicker';
import ToggleSwitch from './ToggleSwitch';

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
  const selectedCount = selectedIds.length;
  const interactionLocked = Boolean(disabled || busy);

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
        <div className="work-report-equipment-assign-toggles" role="group" aria-label={label}>
          {equipment.map((entry) => {
            const checked = selectedSet.has(entry.id);
            const optionLabel = formatEquipmentOptionLabel(entry);
            return (
              <div
                key={entry.id}
                className={`work-report-equipment-assign-toggle${checked ? ' is-selected' : ''}`}
              >
                <ToggleSwitch
                  label={optionLabel}
                  checked={checked}
                  disabled={interactionLocked}
                  onChange={(next) => toggle(entry.id, next)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">Asiakkaalla ei ole vielä laitteita rekisterissä.</p>
      )}

      {equipment.length > 0 ? (
        <p className="muted work-report-equipment-assign-summary">
          {selectedCount > 0
            ? `${selectedCount} ${selectedCount === 1 ? 'laite' : 'laitetta'} kohdistettu.`
            : 'Ei kohdistettu mihinkään laitteeseen.'}
        </p>
      ) : null}

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
