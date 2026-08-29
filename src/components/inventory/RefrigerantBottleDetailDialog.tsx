import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import {
  formatBottleContent,
  formatBottleLabel,
  formatBottleSizeLabel,
  formatRentalSupplierLabel,
  isBottleEmpty,
} from '../../lib/refrigerantBottle';
import {
  collectRefrigerantHistoryTypes,
  filterRefrigerantHistoryByType,
  loadRefrigerantInventoryHistory,
  refrigerantHistoryDirectionLabel,
  summarizeRefrigerantHistoryBalance,
  type RefrigerantInventoryHistoryRow,
} from '../../lib/refrigerantInventoryHistory';
import {
  buildRefrigerantBottleReportHtml,
  loadRefrigerantPeriodReport,
  printRefrigerantPeriodReport,
} from '../../lib/refrigerantInventoryReport';
import { openSimplePrintPlaceholder } from '../../lib/openPrintWindow';
import { supabase } from '../../lib/supabase';
import type { RefrigerantCylinder } from '../../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_CYLINDER_STATUS_LABELS,
  REFRIGERANT_STOCK_SOURCE_LABELS,
} from '../../types/inventory';
import RefrigerantRentalInfo from './RefrigerantRentalInfo';

type Props = {
  open: boolean;
  cylinder: RefrigerantCylinder | null;
  warehouseCompanyId: string;
  warehouseCompanyName: string;
  canEdit: boolean;
  busy?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onShowQr?: () => void;
  onError?: (message: string) => void;
};

function defaultHistoryFrom(cylinder: RefrigerantCylinder): string {
  const from = cylinder.purchase_date ?? cylinder.created_at?.slice(0, 10);
  if (from) return from;
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);
  return date.toISOString().slice(0, 10);
}

export default function RefrigerantBottleDetailDialog({
  open,
  cylinder,
  warehouseCompanyId,
  warehouseCompanyName,
  canEdit,
  busy = false,
  onClose,
  onEdit,
  onShowQr,
  onError,
}: Props) {
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyRows, setHistoryRows] = useState<RefrigerantInventoryHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    if (!open || !cylinder) return;
    setHistoryFrom(defaultHistoryFrom(cylinder));
    setHistoryTypeFilter('all');
  }, [open, cylinder?.id]);

  const loadHistory = useCallback(async () => {
    if (!cylinder || !warehouseCompanyId) return;
    setHistoryLoading(true);
    try {
      const rows = await loadRefrigerantInventoryHistory(
        supabase,
        warehouseCompanyId,
        historyFrom,
        historyTo,
        warehouseCompanyId,
        cylinder.id,
      );
      setHistoryRows(rows);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
    } finally {
      setHistoryLoading(false);
    }
  }, [cylinder, warehouseCompanyId, historyFrom, historyTo, onError]);

  useEffect(() => {
    if (!open || !cylinder) return;
    void loadHistory();
  }, [open, cylinder?.id, loadHistory]);

  const historyTypeOptions = useMemo(() => collectRefrigerantHistoryTypes(historyRows), [historyRows]);
  const filteredHistoryRows = useMemo(
    () => filterRefrigerantHistoryByType(historyRows, historyTypeFilter),
    [historyRows, historyTypeFilter],
  );
  const historyBalance = useMemo(
    () => summarizeRefrigerantHistoryBalance(filteredHistoryRows),
    [filteredHistoryRows],
  );

  async function runBottleReportPrint() {
    if (!cylinder) return;
    const printWindow = openSimplePrintPlaceholder();
    if (!printWindow) {
      onError?.('Tulostusikkunaa ei voitu avata. Salli ponnahdusikkunat.');
      return;
    }
    setReportBusy(true);
    try {
      const { rows, summary, stock } = await loadRefrigerantPeriodReport(
        supabase,
        warehouseCompanyId,
        `${historyFrom}T00:00:00.000Z`,
        `${historyTo}T23:59:59.999Z`,
        historyFrom,
        historyTo,
        { cylinderId: cylinder.id },
      );
      printRefrigerantPeriodReport(
        buildRefrigerantBottleReportHtml({
          cylinderLabel: formatBottleLabel(cylinder),
          companyName: warehouseCompanyName,
          fromLabel: new Date(historyFrom).toLocaleDateString('fi-FI'),
          toLabel: new Date(historyTo).toLocaleDateString('fi-FI'),
          summary,
          rows,
          stock,
        }),
        `Kylmäainepullo ${formatBottleLabel(cylinder)}`,
        printWindow,
      );
    } catch (err) {
      try {
        printWindow.close();
      } catch {
        /* already closed */
      }
      onError?.(err instanceof Error ? err.message : 'Raportti epäonnistui');
    } finally {
      setReportBusy(false);
    }
  }

  if (!open || !cylinder) return null;

  const empty = isBottleEmpty(cylinder);
  const locationLine = [cylinder.location, cylinder.customer?.name].filter(Boolean).join(' · ');

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog inventory-bottle-detail-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-bottle-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inventory-bottle-detail-head">
          <InventoryPhotoThumb
            imagePath={cylinder.image_path}
            label={formatBottleLabel(cylinder)}
            canEdit={false}
            busy={busy}
            placeholder="bottle"
            size="xl"
          />
          <div className="inventory-bottle-detail-head-text">
            <h2 id="inventory-bottle-detail-title">{formatBottleLabel(cylinder)}</h2>
            <p className={`inventory-bottle-state${empty ? ' inventory-bottle-state-empty' : ''}`}>
              {formatBottleContent(cylinder)}
            </p>
          </div>
        </div>

        <RefrigerantRentalInfo cylinder={cylinder} variant="detail" />

        <dl className="detail-list inventory-bottle-detail-list">
          <dt>Koko</dt>
          <dd>{formatBottleSizeLabel(cylinder.bottle_size)}</dd>
          <dt>Omistus</dt>
          <dd>{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[cylinder.ownership_type]}</dd>
          {cylinder.ownership_type === 'rental' && formatRentalSupplierLabel(cylinder.rental_supplier) ? (
            <>
              <dt>Vuokraaja</dt>
              <dd>{formatRentalSupplierLabel(cylinder.rental_supplier)}</dd>
            </>
          ) : null}
          <dt>Tila</dt>
          <dd>{REFRIGERANT_CYLINDER_STATUS_LABELS[cylinder.status] ?? cylinder.status}</dd>
          <dt>Lähde</dt>
          <dd>{REFRIGERANT_STOCK_SOURCE_LABELS[cylinder.stock_source]}</dd>
          {cylinder.owner_user?.display_name || cylinder.owner_user?.email ? (
            <>
              <dt>Vastuuhenkilö</dt>
              <dd>{cylinder.owner_user.display_name || cylinder.owner_user.email}</dd>
            </>
          ) : null}
          {locationLine ? (
            <>
              <dt>Sijainti</dt>
              <dd>{locationLine}</dd>
            </>
          ) : null}
          {cylinder.notes ? (
            <>
              <dt>Muistiinpano</dt>
              <dd>{cylinder.notes}</dd>
            </>
          ) : null}
        </dl>

        <section className="inventory-bottle-detail-history">
          <h3>Historia</h3>
          <div className="inventory-report-dates">
            <label>
              Alku
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
              />
            </label>
            <label>
              Loppu
              <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
            </label>
            {historyTypeOptions.length > 1 ? (
              <label>
                Aine
                <select value={historyTypeFilter} onChange={(e) => setHistoryTypeFilter(e.target.value)}>
                  <option value="all">Kaikki</option>
                  {historyTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={historyLoading}
              onClick={() => void loadHistory()}
            >
              Päivitä
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={reportBusy || historyLoading}
              onClick={() => void runBottleReportPrint()}
            >
              Tulosta
            </button>
          </div>
          {historyLoading ? (
            <p className="muted">Ladataan…</p>
          ) : filteredHistoryRows.length === 0 ? (
            <p className="muted">Ei tapahtumia valitulla jaksolla.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table inventory-history-table">
                <thead>
                  <tr>
                    <th>Aika</th>
                    <th>±</th>
                    <th>Tapahtuma</th>
                    <th className="num">kg</th>
                    <th>Asiakas</th>
                    <th>Työraportti</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryRows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.at).toLocaleString('fi-FI')}</td>
                      <td>{refrigerantHistoryDirectionLabel(row.direction)}</td>
                      <td>{row.eventLabel}</td>
                      <td className="num">{row.qty_kg.toFixed(3)}</td>
                      <td>{row.customer_name}</td>
                      <td>
                        {row.work_report_id && row.work_report_title ? (
                          <Link to={`/tyoraportit/${row.work_report_id}`}>{row.work_report_title}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {historyBalance.length > 0 ? (
                  <tfoot>
                    {historyBalance.map((row) => (
                      <tr key={row.refrigerant_type}>
                        <td colSpan={3}>
                          <strong>Saldo ({row.refrigerant_type})</strong>
                        </td>
                        <td className="num">
                          +{row.in_kg.toFixed(3)} / −{row.out_kg.toFixed(3)} = {row.net_kg.toFixed(3)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </section>

        <div className="leave-draft-actions inventory-bottle-detail-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
          {onShowQr ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onShowQr}>
              QR-koodi ja linkki
            </button>
          ) : null}
          {canEdit && onEdit ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onEdit}>
              Muokkaa
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
