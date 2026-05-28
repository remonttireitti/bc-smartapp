import { FormEvent, useEffect, useMemo, useState } from 'react';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import InventoryQtyStepper from './InventoryQtyStepper';
import { uploadInventoryImage } from '../../lib/inventoryImages';
import {
  bottleCapacityKg,
  bottleFillRatio,
  formatBottleContent,
  formatCapacityLabel,
  groupBottlesByCapacity,
  isBottleEmpty,
  STANDARD_BOTTLE_CAPACITIES_KG,
  type BottleFillFilter,
} from '../../lib/refrigerantBottle';
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
} from '../../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_MOVEMENT_TYPE_LABELS,
} from '../../types/inventory';

const ZERO_EPS = 0.0005;

const CYLINDER_SELECT = `
  id, company_id, serial_number, refrigerant_type, purchased_kg, remaining_kg, capacity_kg,
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

function normalizeCylinder(row: Record<string, unknown>): RefrigerantCylinder {
  const c = row as RefrigerantCylinder;
  const cap = Number(c.capacity_kg) || Number(c.purchased_kg) || 0;
  return {
    ...c,
    capacity_kg: cap,
    purchased_kg: cap > 0 ? cap : Number(c.purchased_kg),
    ownership_type: (c.ownership_type as RefrigerantCylinderOwnership) ?? 'owned',
    stock_source: c.stock_source ?? 'purchase',
    customer_id: c.customer_id ?? null,
    location: c.location ?? null,
    returned_at: c.returned_at ?? null,
    image_path: c.image_path ?? null,
    refrigerant_type: c.refrigerant_type ?? null,
    customer: (row.customer as { name: string | null } | null) ?? null,
  };
}

async function logMovement(params: {
  companyId: string;
  cylinderId: string;
  movementType: string;
  qtyKg: number;
  refrigerantType: string;
  serialNumber: string;
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
    p_serial_number: params.serialNumber,
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
  const [fillFilter, setFillFilter] = useState<BottleFillFilter>('all');
  const [capacityFilter, setCapacityFilter] = useState<string>('all');
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [movements, setMovements] = useState<RefrigerantCylinderMovement[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [showAddBottle, setShowAddBottle] = useState(false);
  const [fillBottleId, setFillBottleId] = useState<string | null>(null);

  const [newBottle, setNewBottle] = useState({
    serial_number: '',
    capacity_kg: '11.3',
    ownership_type: 'owned' as RefrigerantCylinderOwnership,
    location: '',
    start_empty: true,
    refrigerant_type: 'R-410A',
    fill_kg: '',
    customer_id: '',
  });

  const [fillForm, setFillForm] = useState({
    refrigerant_type: 'R-410A',
    fill_kg: '',
    customer_id: '',
    location: '',
    from_customer: true,
  });

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportBusy, setReportBusy] = useState(false);

  const capacityOptions = useMemo(() => {
    const fromData = new Set(cylinders.map((c) => bottleCapacityKg(c)).filter((v) => v > 0));
    for (const v of STANDARD_BOTTLE_CAPACITIES_KG) fromData.add(v);
    return [...fromData].sort((a, b) => a - b);
  }, [cylinders]);

  const filteredBottles = useMemo(() => {
    return cylinders.filter((c) => {
      const cap = bottleCapacityKg(c);
      if (capacityFilter !== 'all' && cap !== Number(capacityFilter)) return false;
      if (fillFilter === 'empty' && !isBottleEmpty(c)) return false;
      if (fillFilter === 'filled' && isBottleEmpty(c)) return false;
      return true;
    });
  }, [cylinders, capacityFilter, fillFilter]);

  const groupedBottles = useMemo(() => groupBottlesByCapacity(filteredBottles), [filteredBottles]);

  async function loadStock() {
    const { data, error } = await supabase
      .from('refrigerant_cylinders')
      .select(CYLINDER_SELECT)
      .eq('company_id', warehouseCompanyId)
      .neq('status', 'recycled')
      .neq('status', 'returned')
      .neq('status', 'retired')
      .order('capacity_kg', { ascending: false })
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
      await loadStock();
      if (view === 'history') await loadHistory();
      if (canEditWarehouse && !isPartnerWarehouse) await loadCustomers();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [warehouseCompanyId, view]);

  async function addBottle(e: FormEvent) {
    e.preventDefault();
    if (!canEditWarehouse || !newBottle.serial_number.trim()) return;

    const cap = Number(newBottle.capacity_kg);
    if (!(cap > 0)) {
      onError('Valitse pulmon tilavuus (kg).');
      return;
    }

    let remaining = 0;
    let refType: string | null = null;
    let stockSource: 'purchase' | 'customer_retrieved' = 'purchase';
    let customerId: string | null = null;

    if (!newBottle.start_empty) {
      remaining = Number(newBottle.fill_kg || 0);
      if (remaining <= 0 || remaining > cap) {
        onError(`Anna täyttömäärä 0–${cap} kg.`);
        return;
      }
      refType = newBottle.refrigerant_type;
      customerId = newBottle.customer_id || null;
      if (customerId) stockSource = 'customer_retrieved';
    }

    setBusy(true);
    onError(null);

    const { data, error: insertError } = await supabase
      .from('refrigerant_cylinders')
      .insert({
        company_id: warehouseCompanyId,
        serial_number: newBottle.serial_number.trim(),
        capacity_kg: cap,
        purchased_kg: cap,
        remaining_kg: remaining,
        refrigerant_type: refType,
        ownership_type: newBottle.ownership_type,
        stock_source: stockSource,
        customer_id: customerId,
        location: newBottle.location.trim() || null,
        status: remaining <= ZERO_EPS ? 'empty' : 'in_stock',
      })
      .select(CYLINDER_SELECT)
      .single();

    if (insertError) {
      setBusy(false);
      onError(insertError.message);
      return;
    }

    const bottle = normalizeCylinder(data as Record<string, unknown>);
    try {
      if (remaining > ZERO_EPS) {
        await logMovement({
          companyId: warehouseCompanyId,
          cylinderId: bottle.id,
          movementType: stockSource === 'customer_retrieved' ? 'customer_retrieve' : 'purchase',
          qtyKg: remaining,
          refrigerantType: refType || '—',
          serialNumber: bottle.serial_number,
          customerId,
          location: bottle.location,
          ownershipType: bottle.ownership_type,
          notes: stockSource === 'customer_retrieved' ? 'Asiakkaalta talteen' : 'Varastoon',
        });
      }
    } catch (movErr) {
      onError(movErr instanceof Error ? movErr.message : 'Liikekirjaus epäonnistui');
    }

    setBusy(false);
    setShowAddBottle(false);
    setNewBottle({
      serial_number: '',
      capacity_kg: '11.3',
      ownership_type: 'owned',
      location: '',
      start_empty: true,
      refrigerant_type: 'R-410A',
      fill_kg: '',
      customer_id: '',
    });
    onMessage(remaining > 0 ? 'Pullo lisätty sisällöllä.' : 'Tyhjä pullo lisätty varastoon.');
    setCylinders((p) => [...p, bottle]);
  }

  async function submitFillBottle(cylinder: RefrigerantCylinder, e: FormEvent) {
    e.preventDefault();
    const cap = bottleCapacityKg(cylinder);
    const kg = Number(fillForm.fill_kg);
    if (!(kg > 0) || kg > cap) {
      onError(`Anna määrä 0–${cap} kg.`);
      return;
    }
    if (fillForm.from_customer && !fillForm.customer_id) {
      onError('Valitse asiakas, jolta aine on otettu talteen.');
      return;
    }

    setRowBusyId(cylinder.id);
    onError(null);

    const patch = {
      remaining_kg: kg,
      refrigerant_type: fillForm.refrigerant_type,
      customer_id: fillForm.from_customer ? fillForm.customer_id : cylinder.customer_id,
      location: fillForm.location.trim() || cylinder.location,
      stock_source: fillForm.from_customer ? 'customer_retrieved' : cylinder.stock_source,
      status: 'in_stock',
    };

    const { error } = await supabase.from('refrigerant_cylinders').update(patch).eq('id', cylinder.id);
    if (error) {
      setRowBusyId(null);
      onError(error.message);
      return;
    }

    try {
      await logMovement({
        companyId: warehouseCompanyId,
        cylinderId: cylinder.id,
        movementType: fillForm.from_customer ? 'customer_retrieve' : 'adjustment',
        qtyKg: kg,
        refrigerantType: fillForm.refrigerant_type,
        serialNumber: cylinder.serial_number,
        customerId: patch.customer_id,
        location: patch.location,
        ownershipType: cylinder.ownership_type,
        notes: fillForm.from_customer ? 'Täytetty asiakkaalta talteenotulla aineella' : 'Pullo täytetty',
      });
    } catch (movErr) {
      onError(movErr instanceof Error ? movErr.message : 'Liikekirjaus epäonnistui');
    }

    setRowBusyId(null);
    setFillBottleId(null);
    onMessage('Pullo täytetty.');
    await loadStock();
  }

  async function setContentKg(cylinder: RefrigerantCylinder, nextKg: number) {
    if (!canEditWarehouse) return;
    const cap = bottleCapacityKg(cylinder);
    const clamped = Math.min(cap, Math.max(0, nextKg));
    setRowBusyId(cylinder.id);

    if (clamped <= ZERO_EPS) {
      const { error } = await supabase
        .from('refrigerant_cylinders')
        .update({ remaining_kg: 0, refrigerant_type: null, status: 'empty' })
        .eq('id', cylinder.id);
      setRowBusyId(null);
      if (error) onError(error.message);
      else {
        onMessage('Pullo merkitty tyhjäksi.');
        setCylinders((p) =>
          p.map((r) =>
            r.id === cylinder.id ? { ...r, remaining_kg: 0, refrigerant_type: null, status: 'empty' } : r,
          ),
        );
      }
      return;
    }

    const refType = (cylinder.refrigerant_type || '').trim() || 'R-410A';
    const { error } = await supabase
      .from('refrigerant_cylinders')
      .update({ remaining_kg: clamped, refrigerant_type: refType, status: 'in_stock' })
      .eq('id', cylinder.id);

    setRowBusyId(null);
    if (error) onError(error.message);
    else
      setCylinders((p) =>
        p.map((r) =>
          r.id === cylinder.id ? { ...r, remaining_kg: clamped, refrigerant_type: refType, status: 'in_stock' } : r,
        ),
      );
  }

  async function markRecycled(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse) return;
    if (!window.confirm(`Merkitään ${cylinder.serial_number} kierrätykseen? Pullo poistuu varastosta, historia säilyy.`)) return;
    setRowBusyId(cylinder.id);
    const { error } = await supabase.rpc('mark_refrigerant_cylinder_recycled', {
      p_cylinder_id: cylinder.id,
      p_notes: null,
    });
    setRowBusyId(null);
    if (error) onError(error.message);
    else {
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
      onMessage('Kierrätykseen merkitty.');
    }
  }

  async function runReportPrint() {
    setReportBusy(true);
    try {
      const { rows, summary } = await loadRefrigerantPeriodReport(
        supabase,
        warehouseCompanyId,
        `${reportFrom}T00:00:00.000Z`,
        `${reportTo}T23:59:59.999Z`,
      );
      printRefrigerantPeriodReport(
        buildRefrigerantPeriodReportHtml({
          companyName: warehouseCompanyName,
          fromLabel: new Date(reportFrom).toLocaleDateString('fi-FI'),
          toLabel: new Date(reportTo).toLocaleDateString('fi-FI'),
          summary,
          rows,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Raportti epäonnistui');
    } finally {
      setReportBusy(false);
    }
  }

  function renderBottleCard(c: RefrigerantCylinder) {
    const rowBusy = rowBusyId === c.id;
    const empty = isBottleEmpty(c);
    const cap = bottleCapacityKg(c);
    const ratio = bottleFillRatio(c);
    const showFill = fillBottleId === c.id;

    return (
      <article key={c.id} className={`inventory-card inventory-bottle-card${empty ? ' inventory-bottle-empty' : ''}`}>
        <div className="inventory-card-main">
          <InventoryPhotoThumb
            imagePath={c.image_path}
            label={c.serial_number}
            canEdit={canEditWarehouse}
            busy={rowBusy}
            onPick={async (file) => {
              setRowBusyId(c.id);
              try {
                const path = await uploadInventoryImage(supabase, warehouseCompanyId, 'cylinders', c.id, file);
                await supabase.from('refrigerant_cylinders').update({ image_path: path }).eq('id', c.id);
                setCylinders((p) => p.map((r) => (r.id === c.id ? { ...r, image_path: path } : r)));
              } finally {
                setRowBusyId(null);
              }
            }}
            onRemove={() => {}}
          />
          <div className="inventory-card-body">
            <div className="inventory-bottle-title-row">
              <h3>{c.serial_number}</h3>
              <span className="inventory-bottle-badge">{formatCapacityLabel(cap)}</span>
              <span className="inventory-bottle-badge inventory-bottle-badge-muted">
                {REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type]}
              </span>
            </div>
            <p className={`inventory-bottle-state${empty ? ' inventory-bottle-state-empty' : ''}`}>
              {formatBottleContent(c)}
            </p>
            {!empty && cap > 0 && (
              <div className="inventory-bottle-meter" aria-hidden>
                <div className="inventory-bottle-meter-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            )}
            {(c.location || c.customer?.name) && (
              <p className="muted inventory-card-sub">
                {[c.customer?.name, c.location].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {!empty && canEditWarehouse && (
          <InventoryQtyStepper
            value={Number(c.remaining_kg)}
            step={0.5}
            min={0}
            max={cap}
            unit="kg"
            decimals={1}
            disabled={!canEditWarehouse}
            busy={rowBusy}
            onCommit={(next) => setContentKg(c, next)}
          />
        )}

        {canEditWarehouse && (
          <div className="inventory-card-actions">
            {empty && (
              <button type="button" className="btn btn-primary btn-sm" disabled={rowBusy} onClick={() => {
                setFillBottleId(c.id);
                setFillForm({
                  refrigerant_type: 'R-410A',
                  fill_kg: String(cap),
                  customer_id: '',
                  location: c.location ?? '',
                  from_customer: true,
                });
              }}>
                Täytä pullo
              </button>
            )}
            {!empty && (
              <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void setContentKg(c, 0)}>
                Tyhjennä
              </button>
            )}
            <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void markRecycled(c)}>
              Kierrätys
            </button>
          </div>
        )}

        {showFill && (
          <form className="inventory-fill-form panel" onSubmit={(e) => void submitFillBottle(c, e)}>
            <h4>Täytä pullo {c.serial_number}</h4>
            <label className="inventory-check">
              <input
                type="checkbox"
                checked={fillForm.from_customer}
                onChange={(e) => setFillForm({ ...fillForm, from_customer: e.target.checked })}
              />
              Aine asiakkaalta talteen
            </label>
            {fillForm.from_customer && (
              <label>
                Asiakas *
                <select
                  value={fillForm.customer_id}
                  onChange={(e) => setFillForm({ ...fillForm, customer_id: e.target.value })}
                  required
                >
                  <option value="">Valitse…</option>
                  {customers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Kylmäaine
              <select
                value={fillForm.refrigerant_type}
                onChange={(e) => setFillForm({ ...fillForm, refrigerant_type: e.target.value })}
              >
                {refrigerantTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Määrä (kg), max {cap}
              <input
                type="number"
                step="0.1"
                min="0.001"
                max={cap}
                value={fillForm.fill_kg}
                onChange={(e) => setFillForm({ ...fillForm, fill_kg: e.target.value })}
                required
              />
            </label>
            <label>
              Sijainti
              <input
                value={fillForm.location}
                onChange={(e) => setFillForm({ ...fillForm, location: e.target.value })}
              />
            </label>
            <div className="inventory-fill-form-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={rowBusy}>
                Tallenna
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setFillBottleId(null)}>
                Peruuta
              </button>
            </div>
          </form>
        )}
      </article>
    );
  }

  return (
    <>
      <div className="billing-filter-pills inventory-subtabs">
        <button type="button" className={view === 'stock' ? 'billing-pill active' : 'billing-pill'} onClick={() => setView('stock')}>
          Pullovarasto
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
        <button type="button" className={view === 'report' ? 'billing-pill active' : 'billing-pill'} onClick={() => setView('report')}>
          Raportti
        </button>
      </div>

      {view === 'stock' && (
        <>
          <div className="inventory-stock-toolbar">
            <div className="inventory-stock-filters">
              <label className="inventory-filter-label">
                Tilavuus
                <select value={capacityFilter} onChange={(e) => setCapacityFilter(e.target.value)}>
                  <option value="all">Kaikki</option>
                  {capacityOptions.map((kg) => (
                    <option key={kg} value={String(kg)}>
                      {formatCapacityLabel(kg)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="billing-filter-pills">
                {(
                  [
                    ['all', 'Kaikki'],
                    ['empty', 'Tyhjät'],
                    ['filled', 'Sisältää ainetta'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={fillFilter === key ? 'billing-pill active' : 'billing-pill'}
                    onClick={() => setFillFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {canEditWarehouse && (
              <button type="button" className="btn btn-primary" onClick={() => setShowAddBottle((v) => !v)}>
                + Lisää pullo
              </button>
            )}
          </div>

          {showAddBottle && canEditWarehouse && (
            <section className="panel inventory-quick-add">
              <h2>Uusi pullo varastoon</h2>
              <p className="muted">Voit lisätä tyhjän pullon (täytät myöhemmin) tai pullon, jossa on jo kylmäainetta.</p>
              <form onSubmit={(e) => void addBottle(e)} className="inventory-quick-add-form inventory-bottle-add-form">
                <label>
                  Sarjanumero / tunniste *
                  <input
                    value={newBottle.serial_number}
                    onChange={(e) => setNewBottle({ ...newBottle, serial_number: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Tilavuus (kg) *
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    list="standard-bottle-capacities"
                    value={newBottle.capacity_kg}
                    onChange={(e) => setNewBottle({ ...newBottle, capacity_kg: e.target.value })}
                    required
                  />
                  <datalist id="standard-bottle-capacities">
                    {STANDARD_BOTTLE_CAPACITIES_KG.map((kg) => (
                      <option key={kg} value={String(kg)} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Omistus
                  <select
                    value={newBottle.ownership_type}
                    onChange={(e) =>
                      setNewBottle({ ...newBottle, ownership_type: e.target.value as RefrigerantCylinderOwnership })
                    }
                  >
                    <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
                    <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
                  </select>
                </label>
                <label>
                  Sijainti
                  <input
                    value={newBottle.location}
                    onChange={(e) => setNewBottle({ ...newBottle, location: e.target.value })}
                    placeholder="Varasto, hylly, auto…"
                  />
                </label>
                <label className="inventory-check">
                  <input
                    type="checkbox"
                    checked={newBottle.start_empty}
                    onChange={(e) => setNewBottle({ ...newBottle, start_empty: e.target.checked })}
                  />
                  Tyhjä pullo (täytetään myöhemmin)
                </label>
                {!newBottle.start_empty && (
                  <>
                    <label>
                      Kylmäaine
                      <select
                        value={newBottle.refrigerant_type}
                        onChange={(e) => setNewBottle({ ...newBottle, refrigerant_type: e.target.value })}
                      >
                        {refrigerantTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Määrä nyt (kg)
                      <input
                        type="number"
                        step="0.1"
                        min="0.001"
                        value={newBottle.fill_kg}
                        onChange={(e) => setNewBottle({ ...newBottle, fill_kg: e.target.value })}
                      />
                    </label>
                    <label>
                      Asiakas (jos talteen asiakkaalta)
                      <select
                        value={newBottle.customer_id}
                        onChange={(e) => setNewBottle({ ...newBottle, customer_id: e.target.value })}
                      >
                        <option value="">—</option>
                        {customers.map((cust) => (
                          <option key={cust.id} value={cust.id}>
                            {cust.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Lisää pullo
                </button>
                <button type="button" className="btn" onClick={() => setShowAddBottle(false)}>
                  Peruuta
                </button>
              </form>
            </section>
          )}

          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : filteredBottles.length === 0 ? (
            <p className="muted inventory-empty">Ei pulloja valituilla suodattimilla.</p>
          ) : (
            [...groupedBottles.entries()].map(([capKg, bottles]) => (
              <section key={capKg} className="inventory-capacity-group">
                <h3 className="inventory-capacity-heading">
                  {capKg > 0 ? formatCapacityLabel(capKg) : 'Tilavuus määrittämätön'} ({bottles.length})
                </h3>
                <div className="inventory-card-list">{bottles.map(renderBottleCard)}</div>
              </section>
            ))
          )}
        </>
      )}

      {view === 'history' && (
        <section className="panel">
          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : movements.length === 0 ? (
            <p className="muted">Ei liikkeitä.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Aika</th>
                    <th>Tapahtuma</th>
                    <th>Pullo</th>
                    <th>Aine</th>
                    <th>kg</th>
                    <th>Asiakas</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString('fi-FI')}</td>
                      <td>{REFRIGERANT_MOVEMENT_TYPE_LABELS[m.movement_type]}</td>
                      <td>{m.serial_number ?? '—'}</td>
                      <td>{m.refrigerant_type}</td>
                      <td>{Number(m.qty_kg).toFixed(2)}</td>
                      <td>{m.customer?.name ?? '—'}</td>
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
              Tulosta
            </button>
          </div>
        </section>
      )}
    </>
  );
}
