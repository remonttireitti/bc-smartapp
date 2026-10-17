import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import DataTable, { StatusMark } from '../components/DataTable';
import InventoryPhotoThumb from '../components/inventory/InventoryPhotoThumb';
import InventoryQtyStepper from '../components/inventory/InventoryQtyStepper';
import RefrigerantInventorySection from '../components/inventory/RefrigerantInventorySection';
import { useProfile } from '../hooks/useProfile';
import {
  loadInventoryPartnerships,
  warehouseAccessForCompany,
  warehouseOwnerTargets,
} from '../lib/reportCustomerRegistry';
import { removeInventoryImage, uploadInventoryImage } from '../lib/inventoryImages';
import { supabase } from '../lib/supabase';
import type { Partnership } from '../types';
import type { InventoryItem } from '../types/inventory';

interface Props {
  session: Session;
}

type Tab = 'materials' | 'refrigerant';
type AddPanel = 'material' | null;

const ZERO_EPS = 0.0005;

const WAREHOUSE_COMPANY_STORAGE_KEY = 'bc-smartapp-inventory-warehouse-company';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const myCompanyId = profile?.company_id ?? '';
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [warehouseCompanyId, setWarehouseCompanyId] = useState('');
  const [tab, setTab] = useState<Tab>('refrigerant');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanel>(null);

  const [quickMaterial, setQuickMaterial] = useState({ name: '', qty: '1', unit: 'kpl' });
  const warehouseTargets = useMemo(() => {
    if (!myCompanyId) return [];
    return warehouseOwnerTargets(myCompanyId, profile?.companies?.name ?? 'Oma yritys', partnerships);
  }, [myCompanyId, profile?.companies?.name, partnerships]);

  const warehouseAccess = useMemo(() => {
    if (!myCompanyId || !warehouseCompanyId) return 'write' as const;
    return warehouseAccessForCompany(myCompanyId, warehouseCompanyId, partnerships);
  }, [myCompanyId, warehouseCompanyId, partnerships]);

  const canEditWarehouse = warehouseAccess === 'write';
  const activeWarehouseLabel =
    warehouseTargets.find((target) => target.companyId === warehouseCompanyId)?.label ?? '—';
  const openCylinderId = searchParams.get('cylinder');

  useEffect(() => {
    if (openCylinderId) setTab('refrigerant');
  }, [openCylinderId]);

  // Sivupalkin alakohdat: /varasto?tab=refrigerant | materials
  const urlTab = searchParams.get('tab');
  useEffect(() => {
    if (urlTab === 'refrigerant' || urlTab === 'materials') setTab(urlTab);
  }, [urlTab]);

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

    const { data: itemRows } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('company_id', companyId)
      .eq('item_type', 'material')
      .gt('qty_on_hand', ZERO_EPS)
      .order('name');

    setItems(((itemRows as InventoryItem[]) ?? []).map((row) => ({ ...row, image_path: row.image_path ?? null })));
    setLoading(false);
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

  async function clearMaterialPhoto(item: InventoryItem) {
    setRowBusyId(item.id);
    await removeInventoryImage(supabase, item.image_path);
    await supabase.from('inventory_items').update({ image_path: null }).eq('id', item.id);
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, image_path: null } : row)));
    setRowBusyId(null);
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

  const showAddMaterial = canEditWarehouse && addPanel === 'material';

  return (
    <AppLayout session={session}>
      <div className="page-header inventory-page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only">
            <Link to="/">Etusivu</Link> / Varasto
          </p>
          <h1>Varasto</h1>
          <p className="muted">
            {activeWarehouseLabel}
            {canEditWarehouse ? '' : ' · vain katselu'}
          </p>
        </div>
        {canEditWarehouse && tab === 'materials' && (
          <button
            type="button"
            className="btn btn-primary inventory-add-fab"
            onClick={() => setAddPanel('material')}
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

      {tab === 'refrigerant' ? (
        <RefrigerantInventorySection
          warehouseCompanyId={warehouseCompanyId}
          warehouseCompanyName={activeWarehouseLabel}
          canEditWarehouse={canEditWarehouse}
          openCylinderId={openCylinderId}
          onOpenCylinderHandled={() => setSearchParams({}, { replace: true })}
          onMessage={setMessage}
          onError={setError}
        />
      ) : loading ? (
        <section className="panel">Ladataan…</section>
      ) : (
        <section className="panel inventory-table-panel">
          {items.length === 0 ? (
            <p className="muted inventory-empty">Ei materiaaleja. Paina + Lisää.</p>
          ) : (
            <DataTable
              rows={items}
              rowKey={(item) => item.id}
              onRowClick={(item) => setOpenItemId(item.id)}
              initialSort={{ key: 'name', dir: 'asc' }}
              filterPlaceholder="Suodata materiaaleja…"
              ariaLabel="Materiaalit"
              columns={[
                {
                  key: 'name',
                  label: 'Nimi',
                  value: (item) => item.name,
                  render: (item) => (
                    <span className="data-table-thumb-cell">
                      <InventoryPhotoThumb imagePath={item.image_path} label={item.name} size="sm" />
                      {item.name}
                    </span>
                  ),
                },
                { key: 'sku', label: 'Tuotenumero', value: (item) => item.sku ?? '' },
                {
                  key: 'qty',
                  label: 'Määrä',
                  value: (item) => Number(item.qty_on_hand),
                  render: (item) =>
                    canEditWarehouse ? (
                      <InventoryQtyStepper
                        value={Number(item.qty_on_hand)}
                        step={1}
                        min={0}
                        unit={item.unit}
                        busy={rowBusyId === item.id}
                        onCommit={(next) => setMaterialQty(item, next)}
                      />
                    ) : (
                      `${Number(item.qty_on_hand).toLocaleString('fi-FI')} ${item.unit}`
                    ),
                  className: 'nowrap',
                },
                {
                  key: 'min',
                  label: 'Minimi',
                  value: (item) => Number(item.min_qty) || '',
                  render: (item) =>
                    Number(item.min_qty) > 0 ? (
                      Number(item.qty_on_hand) < Number(item.min_qty) ? (
                        <StatusMark color="#ef4444" label={`${item.min_qty} (alle)`} />
                      ) : (
                        String(item.min_qty)
                      )
                    ) : (
                      '—'
                    ),
                  className: 'nowrap',
                },
                { key: 'location', label: 'Sijainti', value: (item) => item.location ?? '' },
              ]}
            />
          )}
        </section>
      )}
      {tab !== 'refrigerant' && openItemId && items.some((i) => i.id === openItemId) && (
        <div className="leave-draft-overlay" role="presentation" onClick={() => setOpenItemId(null)}>
          <div
            className="leave-draft-dialog panel row-edit-dialog inventory-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Materiaali"
            onClick={(e) => e.stopPropagation()}
          >
          {(
            items.filter((i) => i.id === openItemId).map((item) => {
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
                    <details className="inventory-card-details" open>
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
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOpenItemId(null)}>
                Sulje
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
