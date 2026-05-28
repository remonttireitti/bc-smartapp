import { FormEvent, useEffect, useMemo, useState } from 'react';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import InventoryQtyStepper from './InventoryQtyStepper';
import { removeInventoryImage, uploadInventoryImage } from '../../lib/inventoryImages';
import {
  buildRefrigerantPeriodReportHtml,
  loadRefrigerantPeriodReport,
  printRefrigerantPeriodReport,
} from '../../lib/refrigerantInventoryReport';
import { supabase } from '../../lib/supabase';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import type {
  RefrigerantCylinder,
  RefrigerantCylinderMovement,
  RefrigerantCylinderOwnership,
  RefrigerantStockSource,
} from '../../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_MOVEMENT_TYPE_LABELS,
  REFRIGERANT_STOCK_SOURCE_LABELS,
} from '../../types/inventory';

const ZERO_EPS = 0.0005;

const CYLINDER_SELECT = `
  id, company_id, serial_number, refrigerant_type, purchased_kg, remaining_kg,
  owner_user_id, ownership_type, stock_source, customer_id, location, status,
  purchase_date, returned_at, notes, image_path, created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email),
  customer:customers(name)
`;

const MOVEMENT_SELECT = `
  id, company_id, cylinder_id, movement_type, qty_kg, refrigerant_type, serial_number,
  customer_id, location, ownership_type, work_report_id, notes, created_at,
  customer:customers(name)
`;

type RefrigerantView = 'stock' | 'history' | 'report';
type AddPanel = 'purchase' | 'customer' | null;
type StockFilter = 'all' | RefrigerantStockSource;

function deriveCylinderStatus(remaining: number, returnedAt: string | null, status: string): string {
  if (status === 'recycled') return 'recycled';
  if (returnedAt) return 'returned';
  return remaining <= ZERO_EPS ? 'empty' : 'in_stock';
}

function normalizeCylinder(row: Record<string, unknown>): RefrigerantCylinder {
  const c = row as RefrigerantCylinder;
  return {
    ...c,
    ownership_type: (c.ownership_type as RefrigerantCylinderOwnership) ?? 'owned',
    stock_source: (c.stock_source as RefrigerantStockSource) ?? 'purchase',
    customer_id: c.customer_id ?? null,
    location: c.location ?? null,
    returned_at: c.returned_at ?? null,
    image_path: c.image_path ?? null,
    customer: (row.customer as { name: string | null } | null) ?? null,
  };
}

async function logMovement(params: {
  companyId: string;
  cylinderId: string | null;
  movementType: string;
  qtyKg: number;
  refrigerantType: string;
  serialNumber?: string;
  customerId?: string | null;
  location?: string | null;
  ownershipType?: string;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc('log_refrigerant_cylinder_movement', {
    p_company_id: params.companyId,
    p_cylinder_id: params.cylinderId,
    p_movement_type: params.movementType,
    p_qty_kg: params.qtyKg,
    p_refrigerant_type: params.refrigerantType,
    p_serial_number: params.serialNumber ?? null,
    p_customer_id: params.customerId ?? null,
    p_location: params.location ?? null,
    p_ownership_type: params.ownershipType ?? null,
    p_work_report_id: null,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
}

type Props = {
  warehouseCompanyId: string;
  warehouseCompanyName: string;
  canEditWarehouse: boolean;
  isPartnerWarehouse: boolean;
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export default function RefrigerantInventorySection({
  warehouseCompanyId,
  warehouseCompanyName,
  canEditWarehouse,
  isPartnerWarehouse,
  onMessage,
  onError,
}: Props) {
  const [view, setView] = useState<RefrigerantView>('stock');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [movements, setMovements] = useState<RefrigerantCylinderMovement[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanel>(null);

  const [quickPurchase, setQuickPurchase] = useState({
    serial_number: '',
    refrigerant_type: 'R-410A',
    purchased_kg: '',
    ownership_type: 'owned' as RefrigerantCylinderOwnership,
  });

  const [quickCustomer, setQuickCustomer] = useState({
    serial_number: '',
    refrigerant_type: 'R-410A',
    purchased_kg: '',
    ownership_type: 'owned' as RefrigerantCylinderOwnership,
    customer_id: '',
    location: '',
  });

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportBusy, setReportBusy] = useState(false);

  const filteredCylinders = useMemo(() => {
    if (stockFilter === 'all') return cylinders;
    return cylinders.filter((c) => c.stock_source === stockFilter);
  }, [cylinders, stockFilter]);

  async function loadStock() {
    const { data, error } = await supabase
      .from('refrigerant_cylinders')
      .select(CYLINDER_SELECT)
      .eq('company_id', warehouseCompanyId)
      .neq('status', 'recycled')
      .neq('status', 'returned')
      .neq('status', 'retired')
      .gt('remaining_kg', ZERO_EPS)
      .order('serial_number');

    if (error) throw error;
    setCylinders(((data as unknown as Record<string, unknown>[]) ?? []).map(normalizeCylinder));
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from('refrigerant_cylinder_movements')
      .select(MOVEMENT_SELECT)
      .eq('company_id', warehouseCompanyId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    setMovements(
      ((data as unknown as Record<string, unknown>[]) ?? []).map((row) => {
        const cust = row.customer;
        const customer =
          cust && typeof cust === 'object' && !Array.isArray(cust)
            ? (cust as { name: string | null })
            : Array.isArray(cust) && cust[0]
              ? (cust[0] as { name: string | null })
              : null;
        return { ...(row as unknown as RefrigerantCylinderMovement), customer };
      }),
    );
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('owner_company_id', warehouseCompanyId)
      .order('name');
    setCustomers((data as { id: string; name: string }[]) ?? []);
  }

  async function reload() {
    if (!warehouseCompanyId) return;
    setLoading(true);
    onError(null);
    try {
      await Promise.all([
        loadStock(),
        view === 'history' ? loadHistory() : Promise.resolve(),
        canEditWarehouse && !isPartnerWarehouse ? loadCustomers() : Promise.resolve(),
      ]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [warehouseCompanyId, view]);

  async function setCylinderRemaining(cylinder: RefrigerantCylinder, nextRemaining: number) {
    if (!canEditWarehouse) return;
    setRowBusyId(cylinder.id);
    onError(null);

    const prev = Number(cylinder.remaining_kg);
    const delta = nextRemaining - prev;

    if (nextRemaining <= ZERO_EPS) {
      if (cylinder.stock_source === 'customer_retrieved' || Number(cylinder.remaining_kg) > ZERO_EPS) {
        setRowBusyId(null);
        onError('Käytä ”Kierrätykseen” tyhjälle asiakaspullolle — historia säilyy.');
        return;
      }
      const { error: deleteError } = await supabase.from('refrigerant_cylinders').delete().eq('id', cylinder.id);
      setRowBusyId(null);
      if (deleteError) {
        onError(deleteError.message);
        return;
      }
      await removeInventoryImage(supabase, cylinder.image_path);
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
      return;
    }

    const status = deriveCylinderStatus(nextRemaining, cylinder.returned_at, cylinder.status);
    const { error: updateError } = await supabase
      .from('refrigerant_cylinders')
      .update({ remaining_kg: nextRemaining, status })
      .eq('id', cylinder.id);

    if (!updateError && Math.abs(delta) > ZERO_EPS) {
      try {
        await logMovement({
          companyId: warehouseCompanyId,
          cylinderId: cylinder.id,
          movementType: 'adjustment',
          qtyKg: Math.abs(delta),
          refrigerantType: cylinder.refrigerant_type,
          serialNumber: cylinder.serial_number,
          customerId: cylinder.customer_id,
          location: cylinder.location,
          ownershipType: cylinder.ownership_type,
          notes: delta < 0 ? 'Saldo vähennetty' : 'Saldo lisätty',
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Liikekirjaus epäonnistui');
      }
    }

    setRowBusyId(null);
    if (updateError) {
      onError(updateError.message);
      return;
    }
    setCylinders((p) =>
      p.map((r) => (r.id === cylinder.id ? { ...r, remaining_kg: nextRemaining, status } : r)),
    );
  }

  async function markRecycled(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse) return;
    if (!window.confirm(`Merkitään pullo ${cylinder.serial_number} kierrätykseen toimitetuksi?`)) return;
    setRowBusyId(cylinder.id);
    onError(null);
    const { error } = await supabase.rpc('mark_refrigerant_cylinder_recycled', {
      p_cylinder_id: cylinder.id,
      p_notes: null,
    });
    setRowBusyId(null);
    if (error) {
      onError(error.message);
      return;
    }
    setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
    onMessage('Pullo merkitty kierrätykseen — poistettu varastosaldosta.');
    if (view === 'history') void loadHistory();
  }

  async function addCylinder(
    e: FormEvent,
    stockSource: RefrigerantStockSource,
    form: typeof quickPurchase | typeof quickCustomer,
  ) {
    e.preventDefault();
    if (!canEditWarehouse || !form.serial_number.trim()) return;
    const purchased = Number('purchased_kg' in form ? form.purchased_kg : 0);
    if (purchased <= ZERO_EPS) {
      onError('Anna määrä (kg) suurempi kuin nolla.');
      return;
    }

    const customerId = 'customer_id' in form ? form.customer_id || null : null;
    const location = 'location' in form ? form.location.trim() || null : null;

    if (stockSource === 'customer_retrieved' && !customerId) {
      onError('Valitse asiakas talteenotetulle pullelle.');
      return;
    }

    setBusy(true);
    onError(null);

    const { data, error: insertError } = await supabase
      .from('refrigerant_cylinders')
      .insert({
        company_id: warehouseCompanyId,
        serial_number: form.serial_number.trim(),
        refrigerant_type: form.refrigerant_type,
        purchased_kg: purchased,
        remaining_kg: purchased,
        ownership_type: form.ownership_type,
        stock_source: stockSource,
        customer_id: customerId,
        location,
        status: 'in_stock',
      })
      .select(CYLINDER_SELECT)
      .single();

    if (insertError) {
      setBusy(false);
      onError(insertError.message);
      return;
    }

    const cylinder = normalizeCylinder(data as Record<string, unknown>);
    try {
      await logMovement({
        companyId: warehouseCompanyId,
        cylinderId: cylinder.id,
        movementType: stockSource === 'customer_retrieved' ? 'customer_retrieve' : 'purchase',
        qtyKg: purchased,
        refrigerantType: cylinder.refrigerant_type,
        serialNumber: cylinder.serial_number,
        customerId,
        location,
        ownershipType: cylinder.ownership_type,
        notes: stockSource === 'customer_retrieved' ? 'Asiakkaalta talteenotettu' : 'Ostettu varastoon',
      });
    } catch (movErr) {
      onError(movErr instanceof Error ? movErr.message : 'Liikekirjaus epäonnistui');
    }

    setBusy(false);
    setAddPanel(null);
    onMessage(stockSource === 'customer_retrieved' ? 'Talteenotettu pullo lisätty.' : 'Pullo lisätty varastoon.');
    setCylinders((p) => [...p, cylinder]);
  }

  async function runReportPrint() {
    setReportBusy(true);
    onError(null);
    try {
      const fromIso = `${reportFrom}T00:00:00.000Z`;
      const toIso = `${reportTo}T23:59:59.999Z`;
      const { rows, summary } = await loadRefrigerantPeriodReport(supabase, warehouseCompanyId, fromIso, toIso);
      const html = buildRefrigerantPeriodReportHtml({
        companyName: warehouseCompanyName,
        fromLabel: new Date(reportFrom).toLocaleDateString('fi-FI'),
        toLabel: new Date(reportTo).toLocaleDateString('fi-FI'),
        summary,
        rows,
      });
      printRefrigerantPeriodReport(html);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Raportin muodostus epäonnistui');
    } finally {
      setReportBusy(false);
    }
  }

  async function markCylinderReturned(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse) return;
    const today = new Date().toISOString().slice(0, 10);
    setRowBusyId(cylinder.id);
    if (Number(cylinder.remaining_kg) <= ZERO_EPS) {
      await supabase.from('refrigerant_cylinders').delete().eq('id', cylinder.id);
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
    } else {
      await supabase
        .from('refrigerant_cylinders')
        .update({ returned_at: today, status: 'returned' })
        .eq('id', cylinder.id);
      try {
        await logMovement({
          companyId: warehouseCompanyId,
          cylinderId: cylinder.id,
          movementType: 'return_rental',
          qtyKg: Number(cylinder.remaining_kg),
          refrigerantType: cylinder.refrigerant_type,
          serialNumber: cylinder.serial_number,
          ownershipType: 'rental',
          notes: 'Vuokrapullo palautettu',
        });
      } catch {
        /* ignore */
      }
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
    }
    setRowBusyId(null);
    onMessage('Vuokrapullo merkitty palautetuksi.');
  }

  async function uploadCylinderPhoto(cylinder: RefrigerantCylinder, file: File) {
    setRowBusyId(cylinder.id);
    try {
      const path = await uploadInventoryImage(supabase, warehouseCompanyId, 'cylinders', cylinder.id, file);
      await supabase.from('refrigerant_cylinders').update({ image_path: path }).eq('id', cylinder.id);
      setCylinders((p) => p.map((r) => (r.id === cylinder.id ? { ...r, image_path: path } : r)));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kuvan lataus epäonnistui');
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <>
      <div className="billing-filter-pills inventory-subtabs">
        <button
          type="button"
          className={view === 'stock' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => setView('stock')}
        >
          Varasto
        </button>
        <button
          type="button"
          className={view === 'history' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => {
            setView('history');
            void loadHistory();
          }}
        >
          Historia
        </button>
        <button
          type="button"
          className={view === 'report' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => setView('report')}
        >
          Raportti
        </button>
      </div>

      {view === 'stock' && (
        <>
          <div className="inventory-stock-filters">
            <span className="muted">Näytä:</span>
            {(['all', 'purchase', 'customer_retrieved'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={stockFilter === f ? 'billing-pill active' : 'billing-pill'}
                onClick={() => setStockFilter(f)}
              >
                {f === 'all' ? 'Kaikki' : REFRIGERANT_STOCK_SOURCE_LABELS[f]}
              </button>
            ))}
            {canEditWarehouse && (
              <div className="inventory-add-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddPanel('purchase')}>
                  + Ostettu pullo
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddPanel('customer')}>
                  + Asiakkaalta talteen
                </button>
              </div>
            )}
          </div>

          {addPanel === 'purchase' && (
            <section className="panel inventory-quick-add">
              <h2>Uusi ostettu pullo</h2>
              <form onSubmit={(e) => void addCylinder(e, 'purchase', quickPurchase)} className="inventory-quick-add-form">
                <label>
                  Sarjanumero *
                  <input
                    value={quickPurchase.serial_number}
                    onChange={(e) => setQuickPurchase({ ...quickPurchase, serial_number: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Kylmäaine
                  <select
                    value={quickPurchase.refrigerant_type}
                    onChange={(e) => setQuickPurchase({ ...quickPurchase, refrigerant_type: e.target.value })}
                  >
                    {refrigerantTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Määrä (kg) *
                  <input
                    type="number"
                    step="0.1"
                    min="0.001"
                    value={quickPurchase.purchased_kg}
                    onChange={(e) => setQuickPurchase({ ...quickPurchase, purchased_kg: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Omistus
                  <select
                    value={quickPurchase.ownership_type}
                    onChange={(e) =>
                      setQuickPurchase({
                        ...quickPurchase,
                        ownership_type: e.target.value as RefrigerantCylinderOwnership,
                      })
                    }
                  >
                    <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
                    <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Lisää
                </button>
                <button type="button" className="btn" onClick={() => setAddPanel(null)}>
                  Peruuta
                </button>
              </form>
            </section>
          )}

          {addPanel === 'customer' && (
            <section className="panel inventory-quick-add">
              <h2>Asiakkaalta talteenotettu</h2>
              <form onSubmit={(e) => void addCylinder(e, 'customer_retrieved', quickCustomer)} className="inventory-quick-add-form">
                <label>
                  Asiakas *
                  <select
                    value={quickCustomer.customer_id}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, customer_id: e.target.value })}
                    required
                  >
                    <option value="">Valitse…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pullo / sarjanumero *
                  <input
                    value={quickCustomer.serial_number}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, serial_number: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Missä pullossa / sijainti
                  <input
                    value={quickCustomer.location}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, location: e.target.value })}
                    placeholder="esim. ulkovarasto, hylly 3"
                  />
                </label>
                <label>
                  Kylmäaine
                  <select
                    value={quickCustomer.refrigerant_type}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, refrigerant_type: e.target.value })}
                  >
                    {refrigerantTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Määrä (kg) *
                  <input
                    type="number"
                    step="0.1"
                    min="0.001"
                    value={quickCustomer.purchased_kg}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, purchased_kg: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Omistus / vuokra
                  <select
                    value={quickCustomer.ownership_type}
                    onChange={(e) =>
                      setQuickCustomer({
                        ...quickCustomer,
                        ownership_type: e.target.value as RefrigerantCylinderOwnership,
                      })
                    }
                  >
                    <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
                    <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Lisää varastoon
                </button>
                <button type="button" className="btn" onClick={() => setAddPanel(null)}>
                  Peruuta
                </button>
              </form>
            </section>
          )}

          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : filteredCylinders.length === 0 ? (
            <p className="muted inventory-empty">Ei pulloja valitulla suodattimella.</p>
          ) : (
            <section className="inventory-card-list">
              {filteredCylinders.map((c) => {
                const rowBusy = rowBusyId === c.id;
                return (
                  <article key={c.id} className="inventory-card">
                    <div className="inventory-card-main">
                      <InventoryPhotoThumb
                        imagePath={c.image_path}
                        label={c.serial_number}
                        canEdit={canEditWarehouse}
                        busy={rowBusy}
                        onPick={(file) => uploadCylinderPhoto(c, file)}
                        onRemove={() => {}}
                      />
                      <div className="inventory-card-body">
                        <h3>{c.serial_number}</h3>
                        <p className="muted inventory-card-sub">
                          {c.refrigerant_type} · {REFRIGERANT_STOCK_SOURCE_LABELS[c.stock_source]} ·{' '}
                          {REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type]}
                        </p>
                        {c.stock_source === 'customer_retrieved' && (
                          <p className="muted inventory-card-sub">
                            {c.customer?.name ?? '—'}
                            {c.location ? ` · ${c.location}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <InventoryQtyStepper
                      value={Number(c.remaining_kg)}
                      step={1}
                      min={0}
                      max={Number(c.purchased_kg)}
                      unit="kg"
                      decimals={1}
                      disabled={!canEditWarehouse}
                      busy={rowBusy}
                      onCommit={(next) => setCylinderRemaining(c, next)}
                    />
                    {canEditWarehouse && (
                      <div className="inventory-card-actions">
                        <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void markRecycled(c)}>
                          Kierrätykseen toimitettu
                        </button>
                        {c.ownership_type === 'rental' && !c.returned_at && (
                          <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void markCylinderReturned(c)}>
                            Palauta vuokra
                          </button>
                        )}
                      </div>
                    )}
                    <p className="muted inventory-card-hint">
                      Tyhjennä asiakaspullo kierrätyspainikkeella — historia säilyy. Ostetun pullon saldo 0 poistaa rivin.
                    </p>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {view === 'history' && (
        <section className="panel">
          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : movements.length === 0 ? (
            <p className="muted">Ei kirjattuja liikkeitä.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Aika</th>
                    <th>Tapahtuma</th>
                    <th>Aine</th>
                    <th>Pullo</th>
                    <th>kg</th>
                    <th>Asiakas</th>
                    <th>Sijainti</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString('fi-FI')}</td>
                      <td>{REFRIGERANT_MOVEMENT_TYPE_LABELS[m.movement_type]}</td>
                      <td>{m.refrigerant_type}</td>
                      <td>{m.serial_number ?? '—'}</td>
                      <td>{Number(m.qty_kg).toFixed(2)}</td>
                      <td>{m.customer?.name ?? '—'}</td>
                      <td>{m.location ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === 'report' && (
        <section className="panel inventory-report-panel">
          <h2>Kylmäaineraportti</h2>
          <p className="muted">Yhteenveto ja tapahtumat valitulta aikajaksolta (ostettu, asiakkaalta talteen, myyty, käyttö, kierrätys).</p>
          <div className="inventory-report-dates">
            <label>
              Alku
              <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
            </label>
            <label>
              Loppu
              <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={reportBusy} onClick={() => void runReportPrint()}>
              Tulosta raportti
            </button>
          </div>
        </section>
      )}
    </>
  );
}
