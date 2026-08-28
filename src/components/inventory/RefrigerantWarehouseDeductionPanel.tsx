import { formatRefrigerantWarehouseCostLabel } from '../../lib/refrigerantInventory';
import { isRefrigerantWarehouseCostLine } from '../../lib/refrigerantPassThrough';
import { formatEuro } from '../../lib/workReportBilling';
import type { WorkReportDailyLog } from '../../types';
import type { WorkReportRefrigerantLine } from '../../types/inventory';

type Row = {
  line: WorkReportRefrigerantLine;
  logDate: string;
};

type Props = {
  logs: WorkReportDailyLog[];
  warehouseCompanyId: string;
  canEdit: boolean;
  busyLineId: string | null;
  onToggle: (lineId: string, deducted: boolean) => void;
};

function collectRows(logs: WorkReportDailyLog[], warehouseCompanyId: string): Row[] {
  const rows: Row[] = [];
  for (const log of logs) {
    for (const line of log.refrigerant_lines ?? []) {
      if (!isRefrigerantWarehouseCostLine(line, warehouseCompanyId)) continue;
      rows.push({ line, logDate: log.log_date });
    }
  }
  return rows;
}

export default function RefrigerantWarehouseDeductionPanel({
  logs,
  warehouseCompanyId,
  canEdit,
  busyLineId,
  onToggle,
}: Props) {
  const rows = collectRows(logs, warehouseCompanyId);
  if (rows.length === 0) return null;

  return (
    <section className="panel refrigerant-warehouse-deduction-panel">
      <h3>Kylmäaineostot</h3>
      <p className="muted">
        Nämä ostot veloitetaan kumppanilaskutuksesta. Merkitse veloitettuksi kun osto on kuitattu.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Päivä</th>
              <th>Rivi</th>
              <th className="num">Yhteensä</th>
              <th>Veloitettu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, logDate }) => {
              const unit = Number(line.unit_price) || 0;
              const total = Math.round(Number(line.qty_kg) * unit * 100) / 100;
              return (
                <tr key={line.id}>
                  <td>{new Date(`${logDate}T12:00:00`).toLocaleDateString('fi-FI')}</td>
                  <td>{formatRefrigerantWarehouseCostLabel(line, Boolean(line.warehouse_cost_deducted))}</td>
                  <td className="num">{formatEuro(total)}</td>
                  <td>
                    <label className="inventory-check">
                      <input
                        type="checkbox"
                        checked={Boolean(line.warehouse_cost_deducted)}
                        disabled={!canEdit || busyLineId === line.id}
                        onChange={(e) => onToggle(line.id, e.target.checked)}
                      />
                      {line.warehouse_cost_deducted ? 'Veloitettu' : 'Veloitettava'}
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
