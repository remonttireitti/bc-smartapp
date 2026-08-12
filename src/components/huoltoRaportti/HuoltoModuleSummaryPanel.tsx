import type { ModuleSummaryRow } from '../../lib/huoltoRaportti/moduleSummaryRows';

type Props = {
  rows: ModuleSummaryRow[];
  complete?: boolean;
  onEdit: () => void;
  editLabel?: string;
  emptyHint?: string;
};

function SummaryRow({ label, value }: ModuleSummaryRow) {
  return (
    <div className="huolto-print-readonly-row">
      <span>{label}: </span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export function HuoltoModuleSummaryPanel({
  rows,
  complete = false,
  onEdit,
  editLabel = 'Muokkaa',
  emptyHint = 'Täytä tiedot painamalla Muokkaa.',
}: Props) {
  return (
    <div className="huolto-module-summary maintenance-device-summary">
      <div className="maintenance-device-summary-head">
        <div className="maintenance-device-summary-actions">
          {complete ? (
            <span className="badge badge-completed">Valmis</span>
          ) : (
            <span className="badge badge-scheduled">Puuttuu</span>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
            {editLabel}
          </button>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="huolto-module-summary-rows">
          {rows.map((row) => (
            <SummaryRow key={`${row.label}-${row.value}`} {...row} />
          ))}
        </div>
      ) : (
        <p className="muted huolto-module-summary-empty">{emptyHint}</p>
      )}
    </div>
  );
}
