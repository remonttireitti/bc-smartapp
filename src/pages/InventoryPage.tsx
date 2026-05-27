import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import InventoryPhotoThumb from '../components/inventory/InventoryPhotoThumb';
import InventoryQtyStepper from '../components/inventory/InventoryQtyStepper';
import { useProfile } from '../hooks/useProfile';
import {
  loadInventoryPartnerships,
  warehouseAccessForCompany,
  warehouseOwnerTargets,
} from '../lib/reportCustomerRegistry';
import { removeInventoryImage, uploadInventoryImage } from '../lib/inventoryImages';
import { supabase } from '../lib/supabase';
import { refrigerantTypes } from '../lib/huoltoRaportti/constants';
import type { Partnership } from '../types';
import type { InventoryItem, RefrigerantCylinder, RefrigerantCylinderOwnership } from '../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_CYLINDER_STATUS_LABELS,
} from '../types/inventory';

interface Props {
  session: Session;
}

type Tab = 'materials' | 'refrigerant';
type AddPanel = 'material' | 'cylinder' | null;

const ZERO_EPS = 0.0005;

const CYLINDER_SELECT = `
  id, company_id, serial_number, refrigerant_type, purchased_kg, remaining_kg,
  owner_user_id, ownership_type, status, purchase_date, returned_at, notes, image_path,
  created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email)
`;

const WAREHOUSE_COMPANY_STORAGE_KEY = 'bc-smartapp-inventory-warehouse-company';

function deriveCylinderStatus(remaining: number, returnedAt: string | null): string {
  if (returnedAt) return 'returned';
  return remaining <= ZERO_EPS ? 'empty' : 'in_stock';
}

function cylinderStatusLabel(status: string): string {
  return REFRIGERANT_CYLINDER_STATUS_LABELS[status] ?? status;
}

function normalizeCylinder(row: Record<string, unknown>): RefrigerantCylinder {
  const c = row as RefrigerantCylinder;
  return {
    ...c,
    ownership_type: (c.ownership_type as RefrigerantCylinderOwnership) ?? 'owned',
    returned_at: c.returned_at ?? null,
    image_path: c.image_path ?? null,
  };
}

function readStoredWarehouseCompanyId(myCompanyId: string): string | null {
  try {
    return sessionStorage.getItem(`${WAREHOUSE_COMPANY_STORAGE_KEY}:${myCompanyId}`);
  } catch {
    return null;
  }
}

function writeStoredWarehouseCompanyId(myCompanyId: string, warehouseCompanyId: string) {
  try {
    sessionStorage.setItem(`${WAREHOUSE_COMPANY_STORAGE_KEY}:${myCompanyId}`, warehouseCompanyId);
  } catch {
    /* ignore */
  }
}

export default function InventoryPage({ session }: Props) {
  const { profile } = useProfile(session);
  const myCompanyId = profile?.company_id ?? '';
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [warehouseCompanyId, setWarehouseCompanyId] = useState('');
  const [tab, setTab] = useState<Tab>('refrigerant');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; email: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanel>(null);

  const [quickMaterial, setQuickMaterial] = useState({ name: '', qty: '1', unit: 'kpl' });
  const [quickCylinder, setQuickCylinder] = useState({
    serial_number: '',
    refrigerant_type: 'R-410A',
    purchased_kg: '',
    ownership_type: 'owned' as RefrigerantCylinderOwnership,
  });

  const warehouseTargets = useMemo(() => {
    if (!myCompanyId) return [];
    return warehouseOwnerTargets(myCompanyId, profile?.companies?.name ?? 'Oma yritys', partnerships);
  }, [myCompanyId, profile?.companies?.name, partnerships]);

  const warehouseAccess = useMemo(() => {
    if (!myCompanyId || !warehouseCompanyId) return 'write' as const;
    return warehouseAccessForCompany(myCompanyId, warehouseCompanyId, partnerships);
  }, [myCompanyId, warehouseCompanyId, partnerships]);

  const canEditWarehouse = warehouseAccess === 'write';
  const isPartnerWarehouse = Boolean(myCompanyId && warehouseCompanyId && warehouseCompanyId !== myCompanyId);
  const activeWarehouseLabel =
    warehouseTargets.find((target) => target.companyId === warehouseCompanyId)?.label ?? '—';

  useEffect(() => {
    if (!myCompanyId) return;
    void loadInventoryPartnerships(supabase, myCompanyId).then(setPartnerships);
  }, [myCompanyId]);

  useEffect(() => {
    if (!myCompanyId) return;
    const targets = warehouseOwnerTargets(myCompanyId, profile?.companies?.name ?? 'Oma yritys', partnerships);
    const stored = readStoredWarehouseCompanyId(myCompanyId);
    const validStored = stored && targets.some((target) => target.companyId === stored);
    setWarehouseCompanyId(validStored ? stored : myCompanyId);
  }, [myCompanyId, profile?.companies?.name, partnerships]);

  useEffect(() => {
    if (!warehouseCompanyId) return;
    void load(warehouseCompanyId);
  }, [warehouseCompanyId]);

  function onWarehouseCompanyChange(companyId: string) {
    setWarehouseCompanyId(companyId);
    if (myCompanyId) writeStoredWarehouseCompanyId(myCompanyId, companyId);
    setMessage(null);
    setError(null);
    setAddPanel(null);
  }

  async function load(companyId: string) {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    const loadUsersForCompany = companyId === myCompanyId;

    const [{ data: itemRows }, { data: cylinderRows }, { data: userRows }] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('item_type', 'material')
        .gt('qty_on_hand', ZERO_EPS)
        .order('name'),
      supabase
        .from('refrigerant_cylinders')
        .select(CYLINDER_SELECT)
        .eq('company_id', companyId)
        .neq('status', 'retired')
        .neq('status', 'returned')
        .gt('remaining_kg', ZERO_EPS)
        .order('serial_number'),
      loadUsersForCompany
        ? supabase
            .from('profiles')
            .select('id, display_name, email')
            .eq('company_id', companyId)
            .neq('role', 'customer')
            .order('display_name')
        : Promise.resolve({ data: [] as { id: string; display_name: string | null; email: string | null }[] }),
    ]);

    setItems(((itemRows as InventoryItem[]) ?? []).map((row) => ({ ...row, image_path: row.image_path ?? null })));
    setCylinders(((cylinderRows as unknown as Record<string, unknown>[]) ?? []).map(normalizeCylinder));
    setUsers((userRows as { id: string; display_name: string | null; email: string | null }[]) ?? []);
    setLoading(false);
  }

  async function removeCylinderFromWarehouse(cylinder: RefrigerantCylinder) {
    await removeInventoryImage(supabase, cylinder.image_path);
    await supabase.from('refrigerant_cylinders').delete().eq('id', cylinder.id);
  }

  async function setMaterialQty(item: InventoryItem, nextQty: number) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    setRowBusyId(item.id);
    setError(null);

    if (nextQty <= ZERO_EPS) {
      const { error: deleteError } = await supabase.from('inventory_items').delete().eq('id', item.id);
      setRowBusyId(null);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      await removeInventoryImage(supabase, item.image_path);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      return;
    }

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ qty_on_hand: nextQty })
      .eq('id', item.id);

    setRowBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, qty_on_hand: nextQty } : row)));
  }

  async function setCylinderRemaining(cylinder: RefrigerantCylinder, nextRemaining: number) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    setRowBusyId(cylinder.id);
    setError(null);

    if (nextRemaining <= ZERO_EPS) {
      const { error: deleteError } = await supabase.from('refrigerant_cylinders').delete().eq('id', cylinder.id);
      setRowBusyId(null);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      await removeInventoryImage(supabase, cylinder.image_path);
      setCylinders((prev) => prev.filter((row) => row.id !== cylinder.id));
      return;
    }

    const status = deriveCylinderStatus(nextRemaining, cylinder.returned_at);
    const { error: updateError } = await supabase
      .from('refrigerant_cylinders')
      .update({ remaining_kg: nextRemaining, status })
      .eq('id', cylinder.id);

    setRowBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCylinders((prev) =>
      prev.map((row) =>
        row.id === cylinder.id ? { ...row, remaining_kg: nextRemaining, status } : row,
      ),
    );
  }

  async function updateMaterialMeta(
    item: InventoryItem,
    patch: Partial<Pick<InventoryItem, 'name' | 'sku' | 'unit' | 'min_qty' | 'location'>>,
  ) {
    if (!canEditWarehouse) return;
    setRowBusyId(item.id);
    const { error: updateError } = await supabase.from('inventory_items').update(patch).eq('id', item.id);
    setRowBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...patch } : row)));
  }

  async function updateCylinderMeta(
    cylinder: RefrigerantCylinder,
    patch: Partial<
      Pick<
        RefrigerantCylinder,
        'serial_number' | 'refrigerant_type' | 'ownership_type' | 'notes' | 'owner_user_id'
      >
    >,
  ) {
    if (!canEditWarehouse) return;
    setRowBusyId(cylinder.id);
    const { error: updateError } = await supabase
      .from('refrigerant_cylinders')
      .update(patch)
      .eq('id', cylinder.id);
    setRowBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCylinders((prev) => prev.map((row) => (row.id === cylinder.id ? { ...row, ...patch } : row)));
  }

  async function uploadMaterialPhoto(item: InventoryItem, file: File) {
    if (!warehouseCompanyId) return;
    setRowBusyId(item.id);
    try {
      const path = await uploadInventoryImage(supabase, warehouseCompanyId, 'materials', item.id, file);
      await supabase.from('inventory_items').update({ image_path: path }).eq('id', item.id);
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, image_path: path } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kuvan lataus epäonnistui');
    } finally {
      setRowBusyId(null);
    }
  }

  async function uploadCylinderPhoto(cylinder: RefrigerantCylinder, file: File) {
    if (!warehouseCompanyId) return;
    setRowBusyId(cylinder.id);
    try {
      const path = await uploadInventoryImage(supabase, warehouseCompanyId, 'cylinders', cylinder.id, file);
      await supabase.from('refrigerant_cylinders').update({ image_path: path }).eq('id', cylinder.id);
      setCylinders((prev) => prev.map((row) => (row.id === cylinder.id ? { ...row, image_path: path } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kuvan lataus epäonnistui');
    } finally {
      setRowBusyId(null);
    }
  }

  async function clearMaterialPhoto(item: InventoryItem) {
    setRowBusyId(item.id);
    await removeInventoryImage(supabase, item.image_path);
    await supabase.from('inventory_items').update({ image_path: null }).eq('id', item.id);
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, image_path: null } : row)));
    setRowBusyId(null);
  }

  async function clearCylinderPhoto(cylinder: RefrigerantCylinder) {
    setRowBusyId(cylinder.id);
    await removeInventoryImage(supabase, cylinder.image_path);
    await supabase.from('refrigerant_cylinders').update({ image_path: null }).eq('id', cylinder.id);
    setCylinders((prev) => prev.map((row) => (row.id === cylinder.id ? { ...row, image_path: null } : row)));
    setRowBusyId(null);
  }

  async function markCylinderReturned(cylinder: RefrigerantCylinder) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    const today = new Date().toISOString().slice(0, 10);
    setRowBusyId(cylinder.id);
    if (Number(cylinder.remaining_kg) <= ZERO_EPS) {
      await removeCylinderFromWarehouse(cylinder);
      setCylinders((prev) => prev.filter((row) => row.id !== cylinder.id));
    } else {
      const { error: updateError } = await supabase
        .from('refrigerant_cylinders')
        .update({ returned_at: today, status: 'returned' })
        .eq('id', cylinder.id);
      if (updateError) setError(updateError.message);
      else setCylinders((prev) => prev.filter((row) => row.id !== cylinder.id));
    }
    setRowBusyId(null);
    setMessage('Vuokrapullo merkitty palautetuksi.');
  }

  async function quickAddMaterial(e: FormEvent) {
    e.preventDefault();
    if (!warehouseCompanyId || !canEditWarehouse || !quickMaterial.name.trim()) return;
    const qty = Number(quickMaterial.qty || 0);
    if (qty <= ZERO_EPS) {
      setError('Anna saldo suurempi kuin nolla.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('inventory_items')
      .insert({
        company_id: warehouseCompanyId,
        name: quickMaterial.name.trim(),
        unit: quickMaterial.unit.trim() || 'kpl',
        qty_on_hand: qty,
        item_type: 'material',
      })
      .select('*')
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setQuickMaterial({ name: '', qty: '1', unit: 'kpl' });
    setAddPanel(null);
    setMessage('Materiaali lisätty.');
    if (data) setItems((prev) => [...prev, { ...(data as InventoryItem), image_path: null }]);
  }

  async function quickAddCylinder(e: FormEvent) {
    e.preventDefault();
    if (!warehouseCompanyId || !canEditWarehouse || !quickCylinder.serial_number.trim()) return;
    const purchased = Number(quickCylinder.purchased_kg || 0);
    if (purchased <= ZERO_EPS) {
      setError('Anna määrä (kg) suurempi kuin nolla.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('refrigerant_cylinders')
      .insert({
        company_id: warehouseCompanyId,
        serial_number: quickCylinder.serial_number.trim(),
        refrigerant_type: quickCylinder.refrigerant_type,
        purchased_kg: purchased,
        remaining_kg: purchased,
        ownership_type: quickCylinder.ownership_type,
        status: 'in_stock',
      })
      .select(CYLINDER_SELECT)
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setQuickCylinder({
      serial_number: '',
      refrigerant_type: 'R-410A',
      purchased_kg: '',
      ownership_type: 'owned',
    });
    setAddPanel(null);
    setMessage('Pullo lisätty.');
    if (data) setCylinders((prev) => [...prev, normalizeCylinder(data as Record<string, unknown>)]);
  }

  const showAddMaterial = canEditWarehouse && addPanel === 'material';
  const showAddCylinder = canEditWarehouse && addPanel === 'cylinder';

  return (
    <AppLayout session={session}>
      <div className="page-header inventory-page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Varasto
          </p>
          <h1>Varasto</h1>
          <p className="muted">
            {activeWarehouseLabel}
            {canEditWarehouse ? '' : ' · vain katselu'}
          </p>
        </div>
        {canEditWarehouse && (
          <button
            type="button"
            className="btn btn-primary inventory-add-fab"
            onClick={() => setAddPanel(tab === 'materials' ? 'material' : 'cylinder')}
          >
            + Lisää
          </button>
        )}
      </div>

      {warehouseTargets.length > 1 && (
        <section className="panel inventory-warehouse-panel">
          <label>
            <strong>Hallittava varasto</strong>
            <select
              className="inventory-warehouse-select"
              value={warehouseCompanyId}
              onChange={(e) => onWarehouseCompanyChange(e.target.value)}
            >
              {warehouseTargets.map((target) => (
                <option key={target.companyId} value={target.companyId}>
                  {target.label}
                  {target.access === 'read' ? ' (vain luku)' : ''}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <div className="billing-filter-pills inventory-tabs">
        <button
          type="button"
          className={tab === 'refrigerant' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => {
            setTab('refrigerant');
            setAddPanel(null);
          }}
        >
          Kylmäaine
        </button>
        <button
          type="button"
          className={tab === 'materials' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => {
            setTab('materials');
            setAddPanel(null);
          }}
        >
          Materiaalit
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {showAddMaterial && (
        <section className="panel inventory-quick-add">
          <div className="inventory-quick-add-head">
            <h2>Uusi materiaali</h2>
            <button type="button" className="btn" onClick={() => setAddPanel(null)}>
              Sulje
            </button>
          </div>
          <form onSubmit={(e) => void quickAddMaterial(e)} className="inventory-quick-add-form">
            <label>
              Nimi *
              <input
                value={quickMaterial.name}
                onChange={(e) => setQuickMaterial({ ...quickMaterial, name: e.target.value })}
                required
                autoFocus
              />
            </label>
            <label>
              Saldo
              <input
                type="number"
                min="0.001"
                step="1"
                inputMode="decimal"
                value={quickMaterial.qty}
                onChange={(e) => setQuickMaterial({ ...quickMaterial, qty: e.target.value })}
              />
            </label>
            <label>
              Yksikkö
              <input
                value={quickMaterial.unit}
                onChange={(e) => setQuickMaterial({ ...quickMaterial, unit: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Lisää varastoon
            </button>
          </form>
        </section>
      )}

      {showAddCylinder && (
        <section className="panel inventory-quick-add">
          <div className="inventory-quick-add-head">
            <h2>Uusi pullo</h2>
            <button type="button" className="btn" onClick={() => setAddPanel(null)}>
              Sulje
            </button>
          </div>
          <form onSubmit={(e) => void quickAddCylinder(e)} className="inventory-quick-add-form">
            <label>
              Sarjanumero *
              <input
                value={quickCylinder.serial_number}
                onChange={(e) => setQuickCylinder({ ...quickCylinder, serial_number: e.target.value })}
                required
                autoFocus
              />
            </label>
            <label>
              Kylmäaine
              <select
                value={quickCylinder.refrigerant_type}
                onChange={(e) => setQuickCylinder({ ...quickCylinder, refrigerant_type: e.target.value })}
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
                inputMode="decimal"
                value={quickCylinder.purchased_kg}
                onChange={(e) => setQuickCylinder({ ...quickCylinder, purchased_kg: e.target.value })}
                required
              />
            </label>
            <label>
              Pullo
              <select
                value={quickCylinder.ownership_type}
                onChange={(e) =>
                  setQuickCylinder({
                    ...quickCylinder,
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
          </form>
        </section>
      )}

      {loading ? (
        <section className="panel">Ladataan…</section>
      ) : tab === 'refrigerant' ? (
        <section className="inventory-card-list">
          {cylinders.length === 0 ? (
            <p className="muted inventory-empty">
              Ei pulloja varastossa. Paina + Lisää tai vähennä saldoa nollaan poistaaksesi rivin.
            </p>
          ) : (
            cylinders.map((c) => {
              const rowBusy = rowBusyId === c.id;
              const qtyDisabled = !canEditWarehouse || Boolean(c.returned_at);
              return (
                <article key={c.id} className="inventory-card">
                  <div className="inventory-card-main">
                    <InventoryPhotoThumb
                      imagePath={c.image_path}
                      label={c.serial_number}
                      canEdit={canEditWarehouse}
                      busy={rowBusy}
                      onPick={(file) => uploadCylinderPhoto(c, file)}
                      onRemove={() => clearCylinderPhoto(c)}
                    />
                    <div className="inventory-card-body">
                      <h3>{c.serial_number}</h3>
                      <p className="muted inventory-card-sub">
                        {c.refrigerant_type} · {REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type]}
                        {c.owner_user?.display_name ? ` · ${c.owner_user.display_name}` : ''}
                      </p>
                      {c.status !== 'in_stock' && (
                        <p className="muted inventory-card-badge">{cylinderStatusLabel(c.status)}</p>
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
                    disabled={qtyDisabled}
                    busy={rowBusy}
                    onCommit={(next) => setCylinderRemaining(c, next)}
                  />
                  <p className="muted inventory-card-hint">
                    Saldo 0 poistaa pullon varastosta. Kuva valinnainen (pienennetään automaattisesti).
                  </p>
                  {canEditWarehouse && (
                    <details className="inventory-card-details">
                      <summary>Tiedot</summary>
                      <div className="inventory-details-grid">
                        <label>
                          Sarjanumero
                          <input
                            defaultValue={c.serial_number}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== c.serial_number) void updateCylinderMeta(c, { serial_number: v });
                            }}
                          />
                        </label>
                        <label>
                          Kylmäaine
                          <select
                            defaultValue={c.refrigerant_type}
                            disabled={rowBusy}
                            onChange={(e) => void updateCylinderMeta(c, { refrigerant_type: e.target.value })}
                          >
                            {refrigerantTypes.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Pullo
                          <select
                            defaultValue={c.ownership_type}
                            disabled={rowBusy}
                            onChange={(e) =>
                              void updateCylinderMeta(c, {
                                ownership_type: e.target.value as RefrigerantCylinderOwnership,
                              })
                            }
                          >
                            <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
                            <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
                          </select>
                        </label>
                        {!isPartnerWarehouse && (
                          <label>
                            Henkilövarasto
                            <select
                              defaultValue={c.owner_user_id ?? ''}
                              disabled={rowBusy}
                              onChange={(e) =>
                                void updateCylinderMeta(c, { owner_user_id: e.target.value || null })
                              }
                            >
                              <option value="">Yhteinen</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.display_name ?? u.email ?? u.id}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          Huomio
                          <input
                            defaultValue={c.notes ?? ''}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (c.notes ?? '')) void updateCylinderMeta(c, { notes: v || null });
                            }}
                          />
                        </label>
                        {c.ownership_type === 'rental' && !c.returned_at && (
                          <button
                            type="button"
                            className="btn"
                            disabled={rowBusy}
                            onClick={() => void markCylinderReturned(c)}
                          >
                            Merkitse palautetuksi
                          </button>
                        )}
                      </div>
                    </details>
                  )}
                </article>
              );
            })
          )}
        </section>
      ) : (
        <section className="inventory-card-list">
          {items.length === 0 ? (
            <p className="muted inventory-empty">Ei materiaaleja. Paina + Lisää.</p>
          ) : (
            items.map((item) => {
              const rowBusy = rowBusyId === item.id;
              return (
                <article key={item.id} className="inventory-card">
                  <div className="inventory-card-main">
                    <InventoryPhotoThumb
                      imagePath={item.image_path}
                      label={item.name}
                      canEdit={canEditWarehouse}
                      busy={rowBusy}
                      onPick={(file) => uploadMaterialPhoto(item, file)}
                      onRemove={() => clearMaterialPhoto(item)}
                    />
                    <div className="inventory-card-body">
                      <h3>{item.name}</h3>
                      <p className="muted inventory-card-sub">
                        {item.sku ? `SKU ${item.sku}` : '—'}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>
                  </div>
                  <InventoryQtyStepper
                    value={Number(item.qty_on_hand)}
                    step={1}
                    min={0}
                    unit={item.unit}
                    disabled={!canEditWarehouse}
                    busy={rowBusy}
                    onCommit={(next) => setMaterialQty(item, next)}
                  />
                  {canEditWarehouse && (
                    <details className="inventory-card-details">
                      <summary>Tiedot</summary>
                      <div className="inventory-details-grid">
                        <label>
                          Nimi
                          <input
                            defaultValue={item.name}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== item.name) void updateMaterialMeta(item, { name: v });
                            }}
                          />
                        </label>
                        <label>
                          SKU
                          <input
                            defaultValue={item.sku ?? ''}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (item.sku ?? '')) void updateMaterialMeta(item, { sku: v || null });
                            }}
                          />
                        </label>
                        <label>
                          Yksikkö
                          <input
                            defaultValue={item.unit}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || 'kpl';
                              if (v !== item.unit) void updateMaterialMeta(item, { unit: v });
                            }}
                          />
                        </label>
                        <label>
                          Minimi
                          <input
                            type="number"
                            step="1"
                            min="0"
                            defaultValue={String(item.min_qty)}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = Number(e.target.value || 0);
                              if (v !== Number(item.min_qty)) void updateMaterialMeta(item, { min_qty: v });
                            }}
                          />
                        </label>
                        <label>
                          Sijainti
                          <input
                            defaultValue={item.location ?? ''}
                            disabled={rowBusy}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (item.location ?? '')) void updateMaterialMeta(item, { location: v || null });
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  )}
                </article>
              );
            })
          )}
        </section>
      )}
    </AppLayout>
  );
}
