import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import { uploadInventoryImage } from '../../lib/inventoryImages';
import {
  bottleMaxContentKg,
  bottleSize,
  BOTTLE_SIZE_LABELS,
  BOTTLE_SIZE_ORDER,
  defaultCapacityKgForSize,
  formatBottleContent,
  formatBottleLabel,
  formatBottleSizeLabel,
  groupBottlesBySize,
  isBottleEmpty,
  maxContentKgForSize,
  type BottleFillFilter,
} from '../../lib/refrigerantBottle';
import {
  buildRefrigerantPeriodReportHtml,
  loadRefrigerantPeriodReport,
  printRefrigerantPeriodReport,
} from '../../lib/refrigerantInventoryReport';
import { loadWarehouseCustomerPicker, type WarehouseCustomerPickerOption } from '../../lib/customers';
import { supabase } from '../../lib/supabase';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import type { Partnership } from '../../types';
import type {
  BottleSize,
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
  id, company_id, serial_number, bottle_size, non_recyclable, refrigerant_type,
  purchased_kg, remaining_kg, capacity_kg, owner_user_id, ownership_type, stock_source,
  customer_id, location, status, purchase_date, returned_at, notes, image_path,
  created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email),
  customer:customers(name)
`;

const MOVEMENT_SELECT = `
  id, company_id, cylinder_id, movement_type, qty_kg, refrigerant_type, serial_number,
  customer_id, location, ownership_type, work_report_id, notes, created_at,
  customer:customers(name)
`;

type RefrigerantView = 'registry' | 'history' | 'report';

type BottleFormState = {
  serial_number: string;
  bottle_size: BottleSize;
  ownership_type: RefrigerantCylinderOwnership;
  location: string;
  notes: string;
  has_content: boolean;
  refrigerant_type: string;
  remaining_kg: string;
  non_recyclable: boolean;
};

function emptyBottleForm(): BottleFormState {
  return {
    serial_number: '',
    bottle_size: 'medium',
    ownership_type: 'owned',
    location: '',
    notes: '',
    has_content: false,
    refrigerant_type: 'R-410A',
    remaining_kg: '',
    non_recyclable: false,
  };
}

function normalizeCylinder(row: Record<string, unknown>): RefrigerantCylinder {
  const c = row as RefrigerantCylinder;
  const cap = Number(c.capacity_kg) || Number(c.purchased_kg) || defaultCapacityKgForSize(bottleSize(c));
  const size =
    c.bottle_size === 'small' || c.bottle_size === 'large' ? c.bottle_size : bottleSize(c);
  return {
    ...c,
    serial_number: c.serial_number ?? null,
    bottle_size: size,
    non_recyclable: Boolean(c.non_recyclable),
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

function formFromCylinder(c: RefrigerantCylinder): BottleFormState {
  const empty = isBottleEmpty(c);
  return {
    serial_number: c.serial_number ?? '',
    bottle_size: bottleSize(c),
    ownership_type: c.ownership_type,
    location: c.location ?? '',
    notes: c.notes ?? '',
    has_content: !empty,
    refrigerant_type: c.refrigerant_type ?? 'R-410A',
    remaining_kg: empty ? '' : String(Number(c.remaining_kg)),
    non_recyclable: c.non_recyclable,
  };
}

async function logMovement(params: {
  companyId: string;
  cylinderId: string;
  movementType: string;
  qtyKg: number;
  refrigerantType: string;
  serialNumber: string | null;
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
  myCompanyId: string;
  partnerships: Partnership[];
  warehouseCompanyId: string;
  warehouseCompanyName: string;
  canEditWarehouse: boolean;
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export default function RefrigerantInventorySection({
  myCompanyId,
  partnerships,
  warehouseCompanyId,
  warehouseCompanyName,
  canEditWarehouse,
  onMessage,
  onError,
}: Props) {
  const [view, setView] = useState<RefrigerantView>('registry');
  const [fillFilter, setFillFilter] = useState<BottleFillFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<BottleSize | 'all'>('all');
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [movements, setMovements] = useState<RefrigerantCylinderMovement[]>([]);
  const [customers, setCustomers] = useState<WarehouseCustomerPickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bottleForm, setBottleForm] = useState(emptyBottleForm);

  const [retrieveBottleId, setRetrieveBottleId] = useState<string | null>(null);
  const [retrieveForm, setRetrieveForm] = useState({
    customer_id: '',
    refrigerant_type: 'R-410A',
    fill_kg: '',
    location: '',
    non_recyclable: false,
    notes: '',
  });

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportBusy, setReportBusy] = useState(false);

  const filteredBottles = useMemo(() => {
    return cylinders.filter((c) => {
      if (sizeFilter !== 'all' && bottleSize(c) !== sizeFilter) return false;
      if (fillFilter === 'empty' && !isBottleEmpty(c)) return false;
      if (fillFilter === 'filled' && isBottleEmpty(c)) return false;
      return true;
    });
  }, [cylinders, sizeFilter, fillFilter]);

  const groupedBottles = useMemo(() => groupBottlesBySize(filteredBottles), [filteredBottles]);

  async function loadStock() {
    const { data, error } = await supabase
      .from('refrigerant_cylinders')
      .select(CYLINDER_SELECT)
      .eq('company_id', warehouseCompanyId)
      .neq('status', 'recycled')
      .neq('status', 'returned')
      .neq('status', 'retired')
      .order('bottle_size')
      .order('serial_number', { nullsFirst: false });

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
    if (!myCompanyId || !warehouseCompanyId) {
      setCustomers([]);
      return;
    }
    setCustomers(await loadWarehouseCustomerPicker(supabase, myCompanyId, warehouseCompanyId, partnerships));
  }

  async function reload() {
    if (!warehouseCompanyId) return;
    setLoading(true);
    onError(null);
    try {
      await loadStock();
      if (view === 'history') await loadHistory();
      if (canEditWarehouse) await loadCustomers();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [warehouseCompanyId, view, myCompanyId, partnerships]);

  function openAdd() {
    setBottleForm(emptyBottleForm());
    setEditingId(null);
    setEditorMode('add');
    setRetrieveBottleId(null);
  }

  function openEdit(c: RefrigerantCylinder) {
    setBottleForm(formFromCylinder(c));
    setEditingId(c.id);
    setEditorMode('edit');
    setRetrieveBottleId(null);
  }

  function closeEditor() {
    setEditorMode(null);
    setEditingId(null);
  }

  async function saveBottleForm(e: FormEvent) {
    e.preventDefault();
    if (!canEditWarehouse) return;

    const size = bottleForm.bottle_size;
    const cap = defaultCapacityKgForSize(size);
    const maxKg = maxContentKgForSize(size);
    const serial = bottleForm.serial_number.trim() || null;

    let remaining = 0;
    let refType: string | null = null;
    if (bottleForm.has_content) {
      remaining = Number(bottleForm.remaining_kg || 0);
      if (remaining <= 0 || remaining > maxKg) {
        onError(`Anna määrä 0–${maxKg} kg (${formatBottleSizeLabel(size).toLowerCase()} pullo).`);
        return;
      }
      refType = bottleForm.refrigerant_type;
    }

    setBusy(true);
    onError(null);

    const payload: Record<string, unknown> = {
      serial_number: serial,
      bottle_size: size,
      capacity_kg: Math.max(cap, remaining),
      purchased_kg: Math.max(cap, remaining),
      remaining_kg: remaining,
      refrigerant_type: refType,
      ownership_type: bottleForm.ownership_type,
      location: bottleForm.location.trim() || null,
      notes: bottleForm.notes.trim() || null,
      non_recyclable: bottleForm.non_recyclable,
      status: remaining <= ZERO_EPS ? 'empty' : 'in_stock',
    };

    if (remaining <= ZERO_EPS) {
      payload.stock_source = 'purchase';
      payload.customer_id = null;
    }

    try {
      if (editorMode === 'edit' && editingId) {
        const { error } = await supabase.from('refrigerant_cylinders').update(payload).eq('id', editingId);
        if (error) throw error;
        onMessage('Pullo päivitetty.');
      } else {
        const { data, error } = await supabase
          .from('refrigerant_cylinders')
          .insert({
            ...payload,
            company_id: warehouseCompanyId,
            stock_source: 'purchase',
            customer_id: null,
          })
          .select(CYLINDER_SELECT)
          .single();
        if (error) throw error;
        const bottle = normalizeCylinder(data as Record<string, unknown>);
        if (remaining > ZERO_EPS) {
          await logMovement({
            companyId: warehouseCompanyId,
            cylinderId: bottle.id,
            movementType: 'purchase',
            qtyKg: remaining,
            refrigerantType: refType || '—',
            serialNumber: serial,
            ownershipType: bottle.ownership_type,
            notes: 'Varastoon',
          });
        }
        onMessage('Pullo lisätty rekisteriin.');
      }
      closeEditor();
      await loadStock();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function submitRetrieve(e: FormEvent, cylinder: RefrigerantCylinder) {
    e.preventDefault();
    if (!canEditWarehouse) return;

    const maxKg = bottleMaxContentKg(cylinder);
    const kg = Number(retrieveForm.fill_kg);
    if (!(kg > 0) || kg > maxKg) {
      onError(`Anna määrä 0–${maxKg} kg.`);
      return;
    }
    if (!retrieveForm.customer_id) {
      onError('Valitse asiakas, jolta aine on otettu talteen.');
      return;
    }

    setRowBusyId(cylinder.id);
    onError(null);

    const patch = {
      remaining_kg: kg,
      refrigerant_type: retrieveForm.refrigerant_type,
      customer_id: retrieveForm.customer_id,
      location: retrieveForm.location.trim() || cylinder.location,
      stock_source: 'customer_retrieved' as const,
      non_recyclable: retrieveForm.non_recyclable,
      status: 'in_stock',
      purchased_kg: Math.max(Number(cylinder.purchased_kg) || 0, kg),
      capacity_kg: Math.max(Number(cylinder.capacity_kg) || 0, kg),
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
        movementType: 'customer_retrieve',
        qtyKg: kg,
        refrigerantType: retrieveForm.refrigerant_type,
        serialNumber: cylinder.serial_number,
        customerId: retrieveForm.customer_id,
        location: patch.location,
        ownershipType: cylinder.ownership_type,
        notes: retrieveForm.notes.trim() || 'Asiakkaalta talteen',
      });
    } catch (movErr) {
      onError(movErr instanceof Error ? movErr.message : 'Liikekirjaus epäonnistui');
    }

    setRowBusyId(null);
    setRetrieveBottleId(null);
    onMessage('Pullo merkitty asiakkaalta talteen.');
    await loadStock();
  }

  async function emptyBottle(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse) return;
    setRowBusyId(cylinder.id);
    const { error } = await supabase
      .from('refrigerant_cylinders')
      .update({
        remaining_kg: 0,
        refrigerant_type: null,
        status: 'empty',
        customer_id: null,
        stock_source: 'purchase',
      })
      .eq('id', cylinder.id);
    setRowBusyId(null);
    if (error) onError(error.message);
    else {
      onMessage('Pullo tyhjennetty.');
      await loadStock();
    }
  }

  async function markRecycled(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse) return;
    if (cylinder.non_recyclable) {
      onError('Pullo on merkitty kierrätyskelpaamattomaksi.');
      return;
    }
    const label = formatBottleLabel(cylinder);
    if (!window.confirm(`Merkitään ${label} kierrätykseen? Pullo poistuu rekisteristä, historia säilyy.`)) return;
    setRowBusyId(cylinder.id);
    const { error } = await supabase.rpc('mark_refrigerant_cylinder_recycled', {
      p_cylinder_id: cylinder.id,
      p_notes: null,
    });
    setRowBusyId(null);
    if (error) onError(error.message);
    else {
      onMessage('Kierrätykseen merkitty.');
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
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

  function renderBottleForm(title: string) {
    return (
      <form className="panel inventory-bottle-editor" onSubmit={(e) => void saveBottleForm(e)}>
        <h2>{title}</h2>
        <p className="muted">Sarjanumero ja kommentti ovat valinnaisia. Asiakas valitaan vain talteenotossa.</p>
        <div className="inventory-bottle-editor-grid">
          <label>
            Sarjanumero (valinnainen)
            <input
              value={bottleForm.serial_number}
              onChange={(e) => setBottleForm({ ...bottleForm, serial_number: e.target.value })}
              placeholder="Esim. SN-123"
            />
          </label>
          <label>
            Koko *
            <select
              value={bottleForm.bottle_size}
              onChange={(e) => setBottleForm({ ...bottleForm, bottle_size: e.target.value as BottleSize })}
            >
              {BOTTLE_SIZE_ORDER.slice()
                .reverse()
                .map((size) => (
                  <option key={size} value={size}>
                    {BOTTLE_SIZE_LABELS[size]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Omistus *
            <select
              value={bottleForm.ownership_type}
              onChange={(e) =>
                setBottleForm({ ...bottleForm, ownership_type: e.target.value as RefrigerantCylinderOwnership })
              }
            >
              <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
              <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
            </select>
          </label>
          <label>
            Sijainti
            <input
              value={bottleForm.location}
              onChange={(e) => setBottleForm({ ...bottleForm, location: e.target.value })}
            />
          </label>
          <label className="inventory-bottle-editor-wide">
            Kommentti / kuvaus
            <input
              value={bottleForm.notes}
              onChange={(e) => setBottleForm({ ...bottleForm, notes: e.target.value })}
              placeholder="Tunnistamiseen, jos ei sarjanumeroa"
            />
          </label>
          <label className="inventory-check">
            <input
              type="checkbox"
              checked={bottleForm.has_content}
              onChange={(e) => setBottleForm({ ...bottleForm, has_content: e.target.checked })}
            />
            Pullossa on kylmäainetta
          </label>
          {bottleForm.has_content && (
            <>
              <label>
                Kylmäaine
                <select
                  value={bottleForm.refrigerant_type}
                  onChange={(e) => setBottleForm({ ...bottleForm, refrigerant_type: e.target.value })}
                >
                  {refrigerantTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Määrä (kg)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={bottleForm.remaining_kg}
                  onChange={(e) => setBottleForm({ ...bottleForm, remaining_kg: e.target.value })}
                  required
                />
              </label>
            </>
          )}
          <label className="inventory-check inventory-bottle-editor-wide">
            <input
              type="checkbox"
              checked={bottleForm.non_recyclable}
              onChange={(e) => setBottleForm({ ...bottleForm, non_recyclable: e.target.checked })}
            />
            Kierrätyskelpaamaton aine
          </label>
        </div>
        <div className="inventory-fill-form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Tallenna
          </button>
          <button type="button" className="btn" onClick={closeEditor}>
            Peruuta
          </button>
        </div>
      </form>
    );
  }

  function renderRetrieveForm(cylinder: RefrigerantCylinder) {
    const maxKg = bottleMaxContentKg(cylinder);
    return (
      <form className="inventory-fill-form panel" onSubmit={(e) => void submitRetrieve(e, cylinder)}>
        <h4>Asiakkaalta talteen — {formatBottleLabel(cylinder)}</h4>
        <label>
          Asiakas *
          <select
            value={retrieveForm.customer_id}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, customer_id: e.target.value })}
            required
          >
            <option value="">Valitse…</option>
            {customers.map((cust) => (
              <option key={cust.id} value={cust.id}>
                {cust.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kylmäaine *
          <select
            value={retrieveForm.refrigerant_type}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, refrigerant_type: e.target.value })}
          >
            {refrigerantTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Määrä (kg), max {maxKg}
          <input
            type="number"
            step="0.1"
            min="0"
            max={maxKg}
            value={retrieveForm.fill_kg}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, fill_kg: e.target.value })}
            required
          />
        </label>
        <label>
          Sijainti
          <input
            value={retrieveForm.location}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, location: e.target.value })}
          />
        </label>
        <label className="inventory-check">
          <input
            type="checkbox"
            checked={retrieveForm.non_recyclable}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, non_recyclable: e.target.checked })}
          />
          Kierrätyskelpaamaton aine
        </label>
        <label>
          Huomio
          <input
            value={retrieveForm.notes}
            onChange={(e) => setRetrieveForm({ ...retrieveForm, notes: e.target.value })}
          />
        </label>
        <div className="inventory-fill-form-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={rowBusyId === cylinder.id}>
            Tallenna
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setRetrieveBottleId(null)}>
            Peruuta
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="billing-filter-pills inventory-subtabs">
        <button
          type="button"
          className={view === 'registry' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => setView('registry')}
        >
          Pullo rekisteri
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

      {view === 'registry' && (
        <>
          <div className="inventory-stock-toolbar">
            <div className="inventory-stock-filters">
              <label className="inventory-filter-label">
                Koko
                <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value as BottleSize | 'all')}>
                  <option value="all">Kaikki</option>
                  {BOTTLE_SIZE_ORDER.map((size) => (
                    <option key={size} value={size}>
                      {BOTTLE_SIZE_LABELS[size]}
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
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                + Lisää pullo
              </button>
            )}
          </div>

          {editorMode === 'add' && renderBottleForm('Uusi pullo')}
          {editorMode === 'edit' && renderBottleForm('Muokkaa pulloa')}

          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : filteredBottles.length === 0 ? (
            <p className="muted inventory-empty">Ei pulloja valituilla suodattimilla.</p>
          ) : (
            [...groupedBottles.entries()].map(([size, bottles]) => (
              <section key={size} className="inventory-capacity-group">
                <h3 className="inventory-capacity-heading">
                  {formatBottleSizeLabel(size)} ({bottles.length})
                </h3>
                <div className="table-wrap">
                  <table className="data-table inventory-bottle-table">
                    <thead>
                      <tr>
                        <th>Pullo</th>
                        <th>Omistus</th>
                        <th>Sisältö</th>
                        <th>Sijainti / asiakas</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bottles.map((c) => {
                        const rowBusy = rowBusyId === c.id;
                        return (
                          <Fragment key={c.id}>
                            <tr className={isBottleEmpty(c) ? 'inventory-bottle-row-empty' : ''}>
                              <td>
                                <div className="inventory-bottle-cell-id">
                                  <InventoryPhotoThumb
                                    imagePath={c.image_path}
                                    label={formatBottleLabel(c)}
                                    canEdit={canEditWarehouse}
                                    busy={rowBusy}
                                    onPick={async (file) => {
                                      setRowBusyId(c.id);
                                      try {
                                        const path = await uploadInventoryImage(
                                          supabase,
                                          warehouseCompanyId,
                                          'cylinders',
                                          c.id,
                                          file,
                                        );
                                        await supabase
                                          .from('refrigerant_cylinders')
                                          .update({ image_path: path })
                                          .eq('id', c.id);
                                        setCylinders((p) =>
                                          p.map((r) => (r.id === c.id ? { ...r, image_path: path } : r)),
                                        );
                                      } finally {
                                        setRowBusyId(null);
                                      }
                                    }}
                                    onRemove={() => {}}
                                  />
                                  <strong>{formatBottleLabel(c)}</strong>
                                  {c.notes && <span className="muted inventory-bottle-note">{c.notes}</span>}
                                </div>
                              </td>
                              <td>{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type]}</td>
                              <td>{formatBottleContent(c)}</td>
                              <td className="muted">
                                {[c.location, c.customer?.name].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="inventory-bottle-actions">
                                {canEditWarehouse && (
                                  <div className="inventory-card-actions">
                                    <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => openEdit(c)}>
                                      Muokkaa
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-primary"
                                      disabled={rowBusy}
                                      onClick={() => {
                                        setRetrieveBottleId(c.id);
                                        setEditorMode(null);
                                        setRetrieveForm({
                                          customer_id: '',
                                          refrigerant_type: 'R-410A',
                                          fill_kg: '',
                                          location: c.location ?? '',
                                          non_recyclable: false,
                                          notes: '',
                                        });
                                      }}
                                    >
                                      Talteen asiakkaalta
                                    </button>
                                    {!isBottleEmpty(c) && (
                                      <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void emptyBottle(c)}>
                                        Tyhjennä
                                      </button>
                                    )}
                                    {!c.non_recyclable && (
                                      <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => void markRecycled(c)}>
                                        Kierrätys
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                            {retrieveBottleId === c.id && (
                              <tr>
                                <td colSpan={5}>{renderRetrieveForm(c)}</td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
                      <td>{m.serial_number?.trim() || '—'}</td>
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
