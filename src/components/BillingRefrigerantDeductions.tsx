import type { BillableLine } from '../lib/workReportBilling';
import { formatEuro } from '../lib/workReportBilling';

type Props = {
  lines: BillableLine[];
  pending: number;
  deducted: number;
  canEdit: boolean;
  busyLineId: string | null;
  onToggle: (lineId: string, deducted: boolean) => void;
  compact?: boolean;
};

export default function BillingRefrigerantDeductions({
  lines,
  pending,
  deducted,
  canEdit,
  busyLineId,
  onToggle,
  compact = false,
}: Props) {
  if (lines.length === 0 && pending <= 0.005 && deducted <= 0.005) return null;

  return (
    <div className={`billing-refrigerant-deductions${compact ? ' billing-refrigerant-deductions--compact' : ''}`}>
      <h4>Varasto-ostot (vähennys)</h4>
      {lines.length > 0 ? (
        <ul className="billing-refrigerant-deduction-list">
          {lines.map((line) => {
            const lineId = line.refrigerantLineId ?? line.expenseLineId;
            const isDeducted = line.warehouseDeduction === 'deducted';
            return (
              <li key={lineId ?? `${line.logId}-${line.description}`}>
                <span className="billing-refrigerant-deduction-desc">{line.description}</span>
                <span className="billing-refrigerant-deduction-amount">{formatEuro(line.total)}</span>
                {lineId ? (
                  <label className="inventory-check billing-refrigerant-deduction-check">
                    <input
                      type="checkbox"
                      checked={isDeducted}
                      disabled={!canEdit || busyLineId === lineId}
                      onChange={(e) => onToggle(lineId, e.target.checked)}
                    />
                    {isDeducted ? 'Vähennetty' : 'Vähennettävä'}
                  </label>
                ) : (
                  <span className="muted">{isDeducted ? 'Vähennetty' : 'Vähennettävä'}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Ei varasto-ostorivejä.</p>
      )}
      {(pending > 0.005 || deducted > 0.005) && (
        <p className="billing-refrigerant-deduction-totals muted">
          {pending > 0.005 ? `Vähennettävänä ${formatEuro(pending)}` : null}
          {pending > 0.005 && deducted > 0.005 ? ' · ' : null}
          {deducted > 0.005 ? `Vähennetty ${formatEuro(deducted)}` : null}
        </p>
      )}
    </div>
  );
}
