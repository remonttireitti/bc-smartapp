import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { refrigerantTypes } from '../lib/huoltoRaportti/constants';
import type { InventoryItem, RefrigerantCylinder } from '../types/inventory';

interface Props {
  session: Session;
}

type Tab = 'materials' | 'refrigerant';

const CYLINDER_SELECT = `
  id, company_id, serial_number, refrigerant_type, purchased_kg, remaining_kg,
  owner_user_id, status, purchase_date, notes, created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email)
`;

export default function InventoryPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [tab, setTab] = useState<Tab>('refrigerant');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; email: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState({ name: '', sku: '', unit: 'kpl', qty_on_hand: '', min_qty: '', location: '' });
  const [cylinderForm, setCylinderForm] = useState({
    serial_number: '',
    refrigerant_type: 'R-410A',
    purchased_kg: '',
    remaining_kg: '',
    owner_user_id: '',
    purchase_date: '',
    notes: '',
  });

  useEffect(() => {
    if (profile?.company_id) void load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);

    const [{ data: itemRows }, { data: cylinderRows }, { data: userRows }] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('item_type', 'material')
        .order('name'),
      supabase
        .from('refrigerant_cylinders')
        .select(CYLINDER_SELECT)
        .eq('company_id', profile.company_id)
        .order('serial_number'),
      supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('company_id', profile.company_id)
        .neq('role', 'customer')
        .order('display_name'),
    ]);

    setItems((itemRows as InventoryItem[]) ?? []);
    setCylinders((cylinderRows as unknown as RefrigerantCylinder[]) ?? []);
    setUsers((userRows as { id: string; display_name: string | null; email: string | null }[]) ?? []);
    setLoading(false);
  }

  async function addMaterial(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !itemForm.name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('inventory_items').insert({
      company_id: profile.company_id,
      name: itemForm.name.trim(),
      sku: itemForm.sku.trim() || null,
      unit: itemForm.unit.trim() || 'kpl',
      qty_on_hand: Number(itemForm.qty_on_hand || 0),
      min_qty: Number(itemForm.min_qty || 0),
      location: itemForm.location.trim() || null,
      item_type: 'material',
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setItemForm({ name: '', sku: '', unit: 'kpl', qty_on_hand: '', min_qty: '', location: '' });
    setMessage('Materiaali lisätty.');
    await load();
  }

  async function addCylinder(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !cylinderForm.serial_number.trim()) return;
    setBusy(true);
    setError(null);
    const purchased = Number(cylinderForm.purchased_kg || 0);
    const remainingRaw = cylinderForm.remaining_kg.trim();
    const remaining = remainingRaw ? Number(remainingRaw) : purchased;

    const { error: insertError } = await supabase.from('refrigerant_cylinders').insert({
      company_id: profile.company_id,
      serial_number: cylinderForm.serial_number.trim(),
      refrigerant_type: cylinderForm.refrigerant_type,
      purchased_kg: purchased,
      remaining_kg: remaining,
      owner_user_id: cylinderForm.owner_user_id || null,
      purchase_date: cylinderForm.purchase_date || null,
      notes: cylinderForm.notes.trim() || null,
      status: remaining > 0.005 ? 'in_stock' : 'empty',
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCylinderForm({
      serial_number: '',
      refrigerant_type: 'R-410A',
      purchased_kg: '',
      remaining_kg: '',
      owner_user_id: '',
      purchase_date: '',
      notes: '',
    });
    setMessage('Kylmäainepullo lisätty.');
    await load();
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Varasto
          </p>
          <h1>Varastohallinta</h1>
          <p className="muted">Materiaalit ja kylmäainepullojen seuranta (sarjanumero, ostomäärä, jäljellä).</p>
        </div>
      </div>

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
          <section className="panel form-section">
            <h2>Lisää kylmäainepullo</h2>
            <form onSubmit={(e) => void addCylinder(e)} className="line-form-grid">
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
              <label>
                Huomio
                <input
                  value={cylinderForm.notes}
                  onChange={(e) => setCylinderForm({ ...cylinderForm, notes: e.target.value })}
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Tallennetaan…' : 'Lisää pullo'}
                </button>
              </div>
            </form>
          </section>

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
                      <th className="num">Ostettu kg</th>
                      <th className="num">Jäljellä kg</th>
                      <th>Varasto</th>
                      <th>Tila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cylinders.map((c) => (
                      <tr key={c.id}>
                        <td>{c.serial_number}</td>
                        <td>{c.refrigerant_type}</td>
                        <td className="num">{Number(c.purchased_kg).toFixed(3)}</td>
                        <td className="num">{Number(c.remaining_kg).toFixed(3)}</td>
                        <td>{c.owner_user?.display_name ?? 'Yhteinen'}</td>
                        <td>{c.status === 'empty' ? 'Tyhjä' : 'Varastossa'}</td>
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
          <section className="panel form-section">
            <h2>Lisää materiaali</h2>
            <form onSubmit={(e) => void addMaterial(e)} className="line-form-grid">
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
                  {busy ? 'Tallennetaan…' : 'Lisää'}
                </button>
              </div>
            </form>
          </section>

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
                      <th>Yksikkö</th>
                      <th>Sijainti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.sku ?? '—'}</td>
                        <td className="num">{Number(item.qty_on_hand).toFixed(3)}</td>
                        <td>{item.unit}</td>
                        <td>{item.location ?? '—'}</td>
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
