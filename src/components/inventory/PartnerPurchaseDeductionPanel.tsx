import {
  formatPartnerPurchaseDeductionLabel,
  isPartnerPurchaseOwedToViewer,
  partnerPurchaseLineTotal,
} from '../../lib/partnerPurchaseDeduction';
import { formatEuro } from '../../lib/workReportBilling';
import type { WorkReportDailyLog } from '../../types';
import type { WorkReportPartnerPurchaseLine } from '../../types/partnerPurchase';

type Row = {
  line: WorkReportPartnerPurchaseLine;
  logDate: string;
};

type Props = {
  logs: WorkReportDailyLog[];
  partnerCompanyId: string;
  canEdit: boolean;
  busyLineId: string | null;
  onToggle: (lineId: string, deducted: boolean) => void;
};

function collectRows(logs: WorkReportDailyLog[], partnerCompanyId: string): Row[] {
  const rows: Row[] = [];
  for (const log of logs) {
    for (const line of log.partner_purchase_lines ?? []) {
      if (!isPartnerPurchaseOwedToViewer(line, partnerCompanyId)) continue;
      rows.push({ line, logDate: log.log_date });
    }
  }
  return rows;
}

export default function PartnerPurchaseDeductionPanel({
  logs,
  partnerCompanyId,
  canEdit,
  busyLineId,
  onToggle,
}: Props) {
  const rows = collectRows(logs, partnerCompanyId);
  if (rows.length === 0) return null;

  return (
    <section className="panel refrigerant-warehouse-deduction-panel partner-purchase-deduction-panel">
      <h3>Työkalu/varaosa-ostot (kumppanin piikki)</h3>
      <p className="muted">
        Nämä ostot veloitetaan kumppanilaskutuksesta. Merkitse vähennetyksi kun osto on kuitattu.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Päivä</th>
              <th>Rivi</th>
              <th className="num">Yhteensä</th>
              <th>Vähennetty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, logDate }) => {
              const total = partnerPurchaseLineTotal(line);
              return (
                <tr key={line.id}>
                  <td>{new Date(`${logDate}T12:00:00`).toLocaleDateString('fi-FI')}</td>
                  <td>{formatPartnerPurchaseDeductionLabel(line, Boolean(line.cost_deducted))}</td>
                  <td className="num">{formatEuro(total)}</td>
                  <td>
                    <label className="inventory-check">
                      <input
                        type="checkbox"
                        checked={Boolean(line.cost_deducted)}
                        disabled={!canEdit || busyLineId === line.id}
                        onChange={(e) => onToggle(line.id, e.target.checked)}
                      />
                      {line.cost_deducted ? 'Vähennetty' : 'Vähennettävä'}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
