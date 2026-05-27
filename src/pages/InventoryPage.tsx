import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import {
  loadInventoryPartnerships,
  warehouseAccessForCompany,
  warehouseOwnerTargets,
} from '../lib/reportCustomerRegistry';
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

const CYLINDER_SELECT = `
  id, company_id, serial_number, refrigerant_type, purchased_kg, remaining_kg,
  owner_user_id, ownership_type, status, purchase_date, returned_at, notes, created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email)
`;

const WAREHOUSE_COMPANY_STORAGE_KEY = 'bc-smartapp-inventory-warehouse-company';

type ItemFormState = {
  name: string;
  sku: string;
  unit: string;
  qty_on_hand: string;
  min_qty: string;
  location: string;
};

type CylinderFormState = {
  serial_number: string;
  refrigerant_type: string;
  purchased_kg: string;
  remaining_kg: string;
  owner_user_id: string;
  ownership_type: RefrigerantCylinderOwnership;
  purchase_date: string;
  returned_at: string;
  notes: string;
};

function emptyItemForm(): ItemFormState {
  return { name: '', sku: '', unit: 'kpl', qty_on_hand: '', min_qty: '', location: '' };
}

function emptyCylinderForm(): CylinderFormState {
  return {
    serial_number: '',
    refrigerant_type: 'R-410A',
    purchased_kg: '',
    remaining_kg: '',
    owner_user_id: '',
    ownership_type: 'owned',
    purchase_date: '',
    returned_at: '',
    notes: '',
  };
}

function itemToForm(item: InventoryItem): ItemFormState {
  return {
    name: item.name,
    sku: item.sku ?? '',
    unit: item.unit,
    qty_on_hand: String(item.qty_on_hand),
    min_qty: String(item.min_qty),
    location: item.location ?? '',
  };
}

function cylinderToForm(cylinder: RefrigerantCylinder): CylinderFormState {
  return {
    serial_number: cylinder.serial_number,
    refrigerant_type: cylinder.refrigerant_type,
    purchased_kg: String(cylinder.purchased_kg),
    remaining_kg: String(cylinder.remaining_kg),
    owner_user_id: cylinder.owner_user_id ?? '',
    ownership_type: cylinder.ownership_type ?? 'owned',
    purchase_date: cylinder.purchase_date ?? '',
    returned_at: cylinder.returned_at ?? '',
    notes: cylinder.notes ?? '',
  };
}

function deriveCylinderStatus(remaining: number, returnedAt: string | null): string {
  if (returnedAt) return 'returned';
  return remaining <= 0.005 ? 'empty' : 'in_stock';
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingCylinderId, setEditingCylinderId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [cylinderForm, setCylinderForm] = useState(emptyCylinderForm);

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
    cancelEdits();
  }

  function cancelEdits() {
    setEditingItemId(null);
    setEditingCylinderId(null);
    setItemForm(emptyItemForm());
    setCylinderForm(emptyCylinderForm());
  }

  function startEditMaterial(item: InventoryItem) {
    setEditingItemId(item.id);
    setEditingCylinderId(null);
    setCylinderForm(emptyCylinderForm());
    setItemForm(itemToForm(item));
    setMessage(null);
    setError(null);
  }

  function startEditCylinder(cylinder: RefrigerantCylinder) {
    setEditingCylinderId(cylinder.id);
    setEditingItemId(null);
    setItemForm(emptyItemForm());
    setCylinderForm(cylinderToForm(cylinder));
    setMessage(null);
    setError(null);
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
        .order('name'),
      supabase
        .from('refrigerant_cylinders')
        .select(CYLINDER_SELECT)
        .eq('company_id', companyId)
        .neq('status', 'retired')
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

    setItems((itemRows as InventoryItem[]) ?? []);
    setCylinders(((cylinderRows as unknown as Record<string, unknown>[]) ?? []).map(normalizeCylinder));
    setUsers((userRows as { id: string; display_name: string | null; email: string | null }[]) ?? []);
    if (!loadUsersForCompany) {
      setCylinderForm((prev) => ({ ...prev, owner_user_id: '' }));
    }
    setLoading(false);
  }

  async function saveMaterial(e: FormEvent) {
    e.preventDefault();
    if (!warehouseCompanyId || !canEditWarehouse || !itemForm.name.trim()) return;
    setBusy(true);
    setError(null);

    const payload = {
      name: itemForm.name.trim(),
      sku: itemForm.sku.trim() || null,
      unit: itemForm.unit.trim() || 'kpl',
      qty_on_hand: Number(itemForm.qty_on_hand || 0),
      min_qty: Number(itemForm.min_qty || 0),
      location: itemForm.location.trim() || null,
    };

    const { error: saveError } = editingItemId
      ? await supabase.from('inventory_items').update(payload).eq('id', editingItemId)
      : await supabase.from('inventory_items').insert({
          ...payload,
          company_id: warehouseCompanyId,
          item_type: 'material',
        });

    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    const wasEdit = Boolean(editingItemId);
    cancelEdits();
    setMessage(wasEdit ? 'Materiaali päivitetty.' : 'Materiaali lisätty.');
    await load(warehouseCompanyId);
  }

  async function deleteMaterial(itemId: string) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    if (!window.confirm('Poistetaanko materiaali varastosta?')) return;
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from('inventory_items').delete().eq('id', itemId);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (editingItemId === itemId) cancelEdits();
    setMessage('Materiaali poistettu.');
    await load(warehouseCompanyId);
  }

  async function saveCylinder(e: FormEvent) {
    e.preventDefault();
    if (!warehouseCompanyId || !canEditWarehouse || !cylinderForm.serial_number.trim()) return;
    setBusy(true);
    setError(null);

    const purchased = Number(cylinderForm.purchased_kg || 0);
    const remainingRaw = cylinderForm.remaining_kg.trim();
    const remaining = remainingRaw ? Number(remainingRaw) : purchased;
    const returnedAt = cylinderForm.returned_at.trim() || null;
    const status = deriveCylinderStatus(remaining, returnedAt);

    const payload = {
      serial_number: cylinderForm.serial_number.trim(),
      refrigerant_type: cylinderForm.refrigerant_type,
      purchased_kg: purchased,
      remaining_kg: remaining,
      owner_user_id: cylinderForm.owner_user_id || null,
      ownership_type: cylinderForm.ownership_type,
      purchase_date: cylinderForm.purchase_date || null,
      returned_at: returnedAt,
      notes: cylinderForm.notes.trim() || null,
      status,
    };

    const { error: saveError } = editingCylinderId
      ? await supabase.from('refrigerant_cylinders').update(payload).eq('id', editingCylinderId)
      : await supabase.from('refrigerant_cylinders').insert({
          ...payload,
          company_id: warehouseCompanyId,
        });

    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    const wasEdit = Boolean(editingCylinderId);
    cancelEdits();
    setMessage(wasEdit ? 'Pullo päivitetty.' : 'Kylmäainepullo lisätty.');
    await load(warehouseCompanyId);
  }

  async function markCylinderReturnedToday(cylinderId: string) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    const today = new Date().toISOString().slice(0, 10);
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('refrigerant_cylinders')
      .update({ returned_at: today, status: 'returned' })
      .eq('id', cylinderId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (editingCylinderId === cylinderId) {
      setCylinderForm((prev) => ({ ...prev, returned_at: today }));
    }
    setMessage('Pullo merkitty palautetuksi.');
    await load(warehouseCompanyId);
  }

  async function clearCylinderReturned(cylinderId: string, remainingKg: number) {
    if (!warehouseCompanyId || !canEditWarehouse) return;
    setBusy(true);
    setError(null);
    const status = deriveCylinderStatus(remainingKg, null);
    const { error: updateError } = await supabase
      .from('refrigerant_cylinders')
      .update({ returned_at: null, status })
      .eq('id', cylinderId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (editingCylinderId === cylinderId) {
      setCylinderForm((prev) => ({ ...prev, returned_at: '' }));
    }
    setMessage('Palautusmerkintä poistettu.');
    await load(warehouseCompanyId);
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Varasto
          </p>
          <h1>Varastohallinta</h1>
          <p className="muted">
            {activeWarehouseLabel}
            {canEditWarehouse ? ' · muokkausoikeus' : ' · vain katselu'}
          </p>
        </div>
      </div>

      {warehouseTargets.length > 1 && (
        <section className="panel" style={{ marginBottom: '1rem' }}>
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
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Jokaisella yrityksellä on oma varasto. Kumppani voi myöntää oikeuden hallita toisen varastoa
            (Hallinta → Kumppanuudet → Varasto).
          </p>
          {isPartnerWarehouse && !canEditWarehouse && (
            <p className="muted">
              Sinulla on vain lukuoikeus tähän varastoon — et voi lisätä tai muokata rivejä.
            </p>
          )}
        </section>
      )}

      <div className="billing-filter-pills" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={tab === 'refrigerant' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => setTab('refrigerant')}
        >
          Kylmäaine
        </button>
        <button
          type="button"
          className={tab === 'materials' ? 'billing-pill active' : 'billing-pill'}
          onClick={() => setTab('materials')}
        >
          Materiaalit
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {loading ? (
        <section className="panel">Ladataan…</section>
      ) : tab === 'refrigerant' ? (
        <>
          {canEditWarehouse && (
            <section className="panel form-section">
              <h2>{editingCylinderId ? 'Muokkaa kylmäainepulloa' : 'Lisää kylmäainepullo'}</h2>
              <form onSubmit={(e) => void saveCylinder(e)} className="line-form-grid">
                <label>
                  Sarjanumero *
                  <input
                    value={cylinderForm.serial_number}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, serial_number: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Kylmäaine
                  <select
                    value={cylinderForm.refrigerant_type}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, refrigerant_type: e.target.value })}
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
                    value={cylinderForm.ownership_type}
                    onChange={(e) =>
                      setCylinderForm({
                        ...cylinderForm,
                        ownership_type: e.target.value as RefrigerantCylinderOwnership,
                      })
                    }
                  >
                    <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
                    <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
                  </select>
                </label>
                <label>
                  Ostettu (kg)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={cylinderForm.purchased_kg}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, purchased_kg: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Jäljellä (kg)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={cylinderForm.remaining_kg}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, remaining_kg: e.target.value })}
                    placeholder="Oletus = ostettu"
                  />
                </label>
                <label>
                  Varasto (henkilö)
                  <select
                    value={cylinderForm.owner_user_id}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, owner_user_id: e.target.value })}
                    disabled={isPartnerWarehouse}
                  >
                    <option value="">Yhteinen varasto</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name ?? u.email ?? u.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ostopäivä
                  <input
                    type="date"
                    value={cylinderForm.purchase_date}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, purchase_date: e.target.value })}
                  />
                </label>
                {cylinderForm.ownership_type === 'rental' && (
                  <label>
                    Palautettu (päivä)
                    <input
                      type="date"
                      value={cylinderForm.returned_at}
                      onChange={(e) => setCylinderForm({ ...cylinderForm, returned_at: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Huomio
                  <input
                    value={cylinderForm.notes}
                    onChange={(e) => setCylinderForm({ ...cylinderForm, notes: e.target.value })}
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Tallennetaan…' : editingCylinderId ? 'Tallenna muutokset' : 'Lisää pullo'}
                  </button>
                  {editingCylinderId && (
                    <button type="button" className="btn" disabled={busy} onClick={cancelEdits}>
                      Peruuta
                    </button>
                  )}
                </div>
              </form>
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Tyhjä pullo jää varastoon (tila Tyhjä). Vuokrapullon voi merkitä palautetuksi — se poistuu
                työraportin valinnasta mutta näkyy varastolistassa.
              </p>
            </section>
          )}

          <section className="panel">
            <h2>Kylmäainepullot ({cylinders.length})</h2>
            {cylinders.length === 0 ? (
              <p className="muted">Ei pulloja vielä. Lisää ensimmäinen sarjanumerolla.</p>
            ) : (
              <div className="table-wrap">
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Sarjanro</th>
                      <th>Typpi</th>
                      <th>Pullo</th>
                      <th className="num">Ostettu kg</th>
                      <th className="num">Jäljellä kg</th>
                      <th>Varasto</th>
                      <th>Tila</th>
                      {canEditWarehouse && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {cylinders.map((c) => (
                      <tr key={c.id}>
                        <td>{c.serial_number}</td>
                        <td>{c.refrigerant_type}</td>
                        <td>{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type] ?? c.ownership_type}</td>
                        <td className="num">{Number(c.purchased_kg).toFixed(3)}</td>
                        <td className="num">{Number(c.remaining_kg).toFixed(3)}</td>
                        <td>{c.owner_user?.display_name ?? 'Yhteinen'}</td>
                        <td>
                          {cylinderStatusLabel(c.status)}
                          {c.returned_at ? ` (${c.returned_at})` : ''}
                        </td>
                        {canEditWarehouse && (
                          <td className="inventory-row-actions">
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => startEditCylinder(c)}
                            >
                              Muokkaa
                            </button>
                            {c.ownership_type === 'rental' && !c.returned_at && (
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void markCylinderReturnedToday(c.id)}
                              >
                                Palautettu
                              </button>
                            )}
                            {c.returned_at && (
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void clearCylinderReturned(c.id, Number(c.remaining_kg))}
                              >
                                Peru palautus
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {canEditWarehouse && (
            <section className="panel form-section">
              <h2>{editingItemId ? 'Muokkaa materiaalia' : 'Lisää materiaali'}</h2>
              <form onSubmit={(e) => void saveMaterial(e)} className="line-form-grid">
                <label>
                  Nimi *
                  <input
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  SKU
                  <input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
                </label>
                <label>
                  Yksikkö
                  <input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
                </label>
                <label>
                  Saldo
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={itemForm.qty_on_hand}
                    onChange={(e) => setItemForm({ ...itemForm, qty_on_hand: e.target.value })}
                  />
                </label>
                <label>
                  Minimi
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={itemForm.min_qty}
                    onChange={(e) => setItemForm({ ...itemForm, min_qty: e.target.value })}
                  />
                </label>
                <label>
                  Sijainti
                  <input
                    value={itemForm.location}
                    onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Tallennetaan…' : editingItemId ? 'Tallenna muutokset' : 'Lisää'}
                  </button>
                  {editingItemId && (
                    <button type="button" className="btn" disabled={busy} onClick={cancelEdits}>
                      Peruuta
                    </button>
                  )}
                </div>
              </form>
            </section>
          )}

          <section className="panel">
            <h2>Materiaalit ({items.length})</h2>
            {items.length === 0 ? (
              <p className="muted">Ei materiaaleja vielä.</p>
            ) : (
              <div className="table-wrap">
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Nimi</th>
                      <th>SKU</th>
                      <th className="num">Saldo</th>
                      <th className="num">Minimi</th>
                      <th>Yksikkö</th>
                      <th>Sijainti</th>
                      {canEditWarehouse && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.sku ?? '—'}</td>
                        <td className="num">{Number(item.qty_on_hand).toFixed(3)}</td>
                        <td className="num">{Number(item.min_qty).toFixed(3)}</td>
                        <td>{item.unit}</td>
                        <td>{item.location ?? '—'}</td>
                        {canEditWarehouse && (
                          <td className="inventory-row-actions">
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => startEditMaterial(item)}
                            >
                              Muokkaa
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void deleteMaterial(item.id)}
                            >
                              Poista
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppLayout>
  );
}
