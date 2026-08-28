import { Link } from 'react-router-dom';
import {
  refrigerantBillingPurchaseTotals,
  type RefrigerantBillingPurchaseRow,
} from '../lib/refrigerantBillingPurchases';
import { formatEuro } from '../lib/workReportBilling';
import { formatDate } from '../types';

export type RefrigerantPurchaseFilter = 'open' | 'charged' | 'all';

type Props = {
  rows: RefrigerantBillingPurchaseRow[];
  filter: RefrigerantPurchaseFilter;
  onFilterChange: (filter: RefrigerantPurchaseFilter) => void;
  canEdit: boolean;
  busyLineId: string | null;
  onToggle: (reportId: string, lineId: string, charged: boolean) => void;
};

export default function BillingRefrigerantPurchasesPanel({
  rows,
  filter,
  onFilterChange,
  canEdit,
  busyLineId,
  onToggle,
}: Props) {
  const totals = refrigerantBillingPurchaseTotals(rows);
  const filtered = rows.filter((row) => {
    if (filter === 'open') return !row.charged;
    if (filter === 'charged') return row.charged;
    return true;
  });

  if (rows.length === 0) {
    return (
      <section className="panel billing-refrigerant-purchases-panel">
        <h2>Kylmäaineostot</h2>
        <p className="muted">Ei kylmäaineostoja kumppanilaskutuksessa.</p>
      </section>
    );
  }

  return (
    <section className="panel billing-refrigerant-purchases-panel">
      <div className="billing-refrigerant-purchases-head">
        <div>
          <h2>Kylmäaineostot</h2>
          <p className="muted">
            Kumppanin työraporteilta käytetyt varasto-ostot. Merkitse veloitettuksi kun osto on kuitattu.
          </p>
        </div>
        <div className="billing-refrigerant-purchases-summary">
          <div>
            <span className="billing-refrigerant-purchases-stat-label">Veloitettavana</span>
            <strong>{formatEuro(totals.pending)}</strong>
            <span className="muted">{totals.pendingCount} kpl</span>
          </div>
          <div>
            <span className="billing-refrigerant-purchases-stat-label">Veloitettu</span>
            <strong>{formatEuro(totals.charged)}</strong>
            <span className="muted">{totals.chargedCount} kpl</span>
          </div>
        </div>
      </div>

      <div className="billing-filter-pills" style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={filter === 'open' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => onFilterChange('open')}
        >
          Avoimet ({totals.pendingCount})
        </button>
        <button
          type="button"
          className={filter === 'charged' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => onFilterChange('charged')}
        >
          Veloitettu ({totals.chargedCount})
        </button>
        <button
          type="button"
          className={filter === 'all' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => onFilterChange('all')}
        >
          Kaikki ({totals.totalCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Ei kylmäaineostoja valitulla suodattimella.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table billing-refrigerant-purchases-table">
            <thead>
              <tr>
                <th>Päivä</th>
                <th>Raportti</th>
                <th>Kumppani</th>
                <th>Asiakas</th>
                <th>Kylmäaine</th>
                <th className="num">Määrä</th>
                <th className="num">Summa</th>
                <th>Veloitettu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.lineId} className={row.charged ? 'billing-refrigerant-purchase-charged' : undefined}>
                  <td>{formatDate(row.logDate)}</td>
                  <td>
                    <Link to={`/tyoraportit/${row.reportId}`}>{row.reportTitle}</Link>
                  </td>
                  <td>{row.partnerName}</td>
                  <td>{row.customerName ?? '—'}</td>
                  <td>{row.refrigerantType}</td>
                  <td className="num">{row.qtyKg.toFixed(3)} kg</td>
                  <td className="num">{formatEuro(row.total)}</td>
                  <td>
                    <label className="inventory-check">
                      <input
                        type="checkbox"
                        checked={row.charged}
                        disabled={!canEdit || busyLineId === row.lineId}
                        onChange={(e) => onToggle(row.reportId, row.lineId, e.target.checked)}
                      />
                      {row.charged ? 'Veloitettu' : 'Veloitettava'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
