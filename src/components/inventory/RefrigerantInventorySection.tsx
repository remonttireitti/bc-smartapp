import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { IconScan } from '../icons';
import RefrigerantBottleCard from './RefrigerantBottleCard';
import RefrigerantBottleQrDialog from './RefrigerantBottleQrDialog';
import RefrigerantBottleDetailDialog from './RefrigerantBottleDetailDialog';
import { uploadInventoryImage } from '../../lib/inventoryImages';
import {
  bottleMaxContentKg,
  bottleSize,
  BOTTLE_SIZE_LABELS,
  BOTTLE_SIZE_ORDER,
  defaultCapacityKgForSize,
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
import {
  collectRefrigerantHistoryTypes,
  filterRefrigerantHistoryByType,
  loadRefrigerantInventoryHistory,
  refrigerantHistoryDirectionLabel,
  summarizeRefrigerantHistoryBalance,
  type RefrigerantInventoryHistoryRow,
} from '../../lib/refrigerantInventoryHistory';
import { resolveCylinderFromScan } from '../../lib/refrigerantCylinderCode';
import { loadWarehouseCustomerPicker, type WarehouseCustomerPickerOption } from '../../lib/customers';
import RefrigerantBottleScanDialog from './RefrigerantBottleScanDialog';
import { supabase } from '../../lib/supabase';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import type {
  BottleSize,
  RefrigerantCylinder,
  RefrigerantCylinderOwnership,
  RefrigerantRentalSupplier,
} from '../../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_RENTAL_SUPPLIER_LABELS,
  REFRIGERANT_RENTAL_SUPPLIER_ORDER,
} from '../../types/inventory';

const ZERO_EPS = 0.0005;

const CYLINDER_SELECT = `
  id, company_id, serial_number, bottle_size, non_recyclable, refrigerant_type,
  purchased_kg, remaining_kg, capacity_kg, owner_user_id, ownership_type, rental_supplier, stock_source,
  customer_id, location, status, purchase_date, returned_at, notes, image_path,
  created_at, updated_at,
  owner_user:profiles!refrigerant_cylinders_owner_user_id_fkey(display_name, email),
  customer:customers(name)
`;

type RefrigerantView = 'registry' | 'history' | 'report';

type BottleFormState = {
  serial_number: string;
  bottle_size: BottleSize;
  ownership_type: RefrigerantCylinderOwnership;
  rental_supplier: RefrigerantRentalSupplier | '';
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
    rental_supplier: '',
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
    rental_supplier: (c.rental_supplier as RefrigerantRentalSupplier | null) ?? null,
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
    rental_supplier: c.rental_supplier ?? '',
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
  warehouseCompanyId: string;
  warehouseCompanyName: string;
  canEditWarehouse: boolean;
  openCylinderId?: string | null;
  onOpenCylinderHandled?: () => void;
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export default function RefrigerantInventorySection({
  warehouseCompanyId,
  warehouseCompanyName,
  canEditWarehouse,
  openCylinderId = null,
  onOpenCylinderHandled,
  onMessage,
  onError,
}: Props) {
  const [view, setView] = useState<RefrigerantView>('registry');
  const [fillFilter, setFillFilter] = useState<BottleFillFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<BottleSize | 'all'>('all');
  const [cylinders, setCylinders] = useState<RefrigerantCylinder[]>([]);
  const [historyRows, setHistoryRows] = useState<RefrigerantInventoryHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
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
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [detailCylinder, setDetailCylinder] = useState<RefrigerantCylinder | null>(null);
  const [qrCylinder, setQrCylinder] = useState<RefrigerantCylinder | null>(null);

  const filteredBottles = useMemo(() => {
    return cylinders.filter((c) => {
      if (sizeFilter !== 'all' && bottleSize(c) !== sizeFilter) return false;
      if (fillFilter === 'empty' && !isBottleEmpty(c)) return false;
      if (fillFilter === 'filled' && isBottleEmpty(c)) return false;
      return true;
    });
  }, [cylinders, sizeFilter, fillFilter]);

  const groupedBottles = useMemo(() => groupBottlesBySize(filteredBottles), [filteredBottles]);

  const historyTypeOptions = useMemo(() => collectRefrigerantHistoryTypes(historyRows), [historyRows]);

  const filteredHistoryRows = useMemo(
    () => filterRefrigerantHistoryByType(historyRows, historyTypeFilter),
    [historyRows, historyTypeFilter],
  );

  const historyBalanceSummaries = useMemo(
    () => summarizeRefrigerantHistoryBalance(filteredHistoryRows),
    [filteredHistoryRows],
  );

  const historyBalanceTotal = useMemo(
    () =>
      historyBalanceSummaries.reduce(
        (totals, summary) => ({
          in_kg: totals.in_kg + summary.in_kg,
          out_kg: totals.out_kg + summary.out_kg,
          net_kg: totals.net_kg + summary.net_kg,
        }),
        { in_kg: 0, out_kg: 0, net_kg: 0 },
      ),
    [historyBalanceSummaries],
  );

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
    setHistoryLoading(true);
    onError(null);
    try {
      const rows = await loadRefrigerantInventoryHistory(
        supabase,
        warehouseCompanyId,
        reportFrom,
        reportTo,
      );
      setHistoryRows(rows);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadCustomers() {
    if (!warehouseCompanyId) {
      setCustomers([]);
      return;
    }
    setCustomers(await loadWarehouseCustomerPicker(supabase, warehouseCompanyId));
  }

  async function reload() {
    if (!warehouseCompanyId) return;
    setLoading(true);
    onError(null);
    try {
      await loadStock();
      if (view === 'history') await loadHistory();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [warehouseCompanyId, view]);

  useEffect(() => {
    setCustomers([]);
    setRetrieveBottleId(null);
    if (warehouseCompanyId && canEditWarehouse) {
      void loadCustomers();
    }
  }, [warehouseCompanyId, canEditWarehouse]);

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

  const openCylinderDetails = useCallback((cylinder: RefrigerantCylinder) => {
    setDetailCylinder(cylinder);
    setView('registry');
  }, []);

  const openCylinderQr = useCallback((cylinder: RefrigerantCylinder) => {
    setQrCylinder(cylinder);
    setView('registry');
  }, []);

  async function handleScanText(text: string) {
    if (!warehouseCompanyId) return;
    setScanOpen(false);
    setScanBusy(true);
    onError(null);
    try {
      const row = await resolveCylinderFromScan(
        supabase,
        warehouseCompanyId,
        text,
        cylinders,
        CYLINDER_SELECT,
      );
      if (!row) {
        onError('Pulloa ei löytynyt tästä varastosta.');
        return;
      }
      openCylinderDetails(normalizeCylinder(row as unknown as Record<string, unknown>));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Skannaus epäonnistui');
    } finally {
      setScanBusy(false);
    }
  }

  useEffect(() => {
    if (!openCylinderId || !warehouseCompanyId || loading) return;
    const local = cylinders.find((c) => c.id === openCylinderId);
    if (local) {
      openCylinderDetails(local);
      onOpenCylinderHandled?.();
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('refrigerant_cylinders')
        .select(CYLINDER_SELECT)
        .eq('company_id', warehouseCompanyId)
        .eq('id', openCylinderId)
        .maybeSingle();
      if (cancelled) return;
      onOpenCylinderHandled?.();
      if (error || !data) {
        onError('Pulloa ei löytynyt.');
        return;
      }
      openCylinderDetails(normalizeCylinder(data as unknown as Record<string, unknown>));
    })();
    return () => {
      cancelled = true;
    };
  }, [openCylinderId, warehouseCompanyId, loading, cylinders, openCylinderDetails, onOpenCylinderHandled, onError]);

  async function saveBottleForm(e: FormEvent) {
    e.preventDefault();
    if (!canEditWarehouse) return;

    const size = bottleForm.bottle_size;
    const cap = defaultCapacityKgForSize(size);
    const maxKg = maxContentKgForSize(size);
    const serial = bottleForm.serial_number.trim() || null;

    if (bottleForm.ownership_type === 'rental' && !bottleForm.rental_supplier) {
      onError('Valitse vuokrapullon vuokraaja.');
      return;
    }

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
      rental_supplier:
        bottleForm.ownership_type === 'rental' ? bottleForm.rental_supplier || null : null,
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
            purchase_date: new Date().toISOString().slice(0, 10),
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

  async function returnRentalBottle(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse || cylinder.ownership_type !== 'rental') return;
    const label = formatBottleLabel(cylinder);
    if (
      !window.confirm(
        `Merkitään ${label} palautetuksi tukkurille? Pullo poistuu varastonäkymästä, historia säilyy.`,
      )
    ) {
      return;
    }
    setRowBusyId(cylinder.id);
    onError(null);
    const { error } = await supabase.rpc('mark_refrigerant_cylinder_returned_rental', {
      p_cylinder_id: cylinder.id,
      p_notes: null,
    });
    setRowBusyId(null);
    if (error) onError(error.message);
    else {
      onMessage('Vuokrapullo merkitty palautetuksi.');
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
    }
  }

  async function retireOwnedBottle(cylinder: RefrigerantCylinder) {
    if (!canEditWarehouse || cylinder.ownership_type !== 'owned') return;
    const label = formatBottleLabel(cylinder);
    if (
      !window.confirm(
        `Poistetaanko ${label} varastosta (myyty tai hävitetty)? Pullo ei näy enää rekisterissä, historia säilyy.`,
      )
    ) {
      return;
    }
    setRowBusyId(cylinder.id);
    onError(null);
    const { error } = await supabase.rpc('mark_refrigerant_cylinder_retired', {
      p_cylinder_id: cylinder.id,
      p_notes: null,
    });
    setRowBusyId(null);
    if (error) onError(error.message);
    else {
      onMessage('Pullo poistettu varastosta.');
      setCylinders((p) => p.filter((r) => r.id !== cylinder.id));
    }
  }

  async function uploadBottlePhoto(cylinder: RefrigerantCylinder, file: File) {
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
        `Kylmäaineraportti ${warehouseCompanyName}`,
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
              onChange={(e) => {
                const ownership_type = e.target.value as RefrigerantCylinderOwnership;
                setBottleForm({
                  ...bottleForm,
                  ownership_type,
                  rental_supplier: ownership_type === 'rental' ? bottleForm.rental_supplier : '',
                });
              }}
            >
              <option value="owned">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned}</option>
              <option value="rental">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental}</option>
            </select>
          </label>
          {bottleForm.ownership_type === 'rental' ? (
            <label>
              Vuokraaja *
              <select
                value={bottleForm.rental_supplier}
                onChange={(e) =>
                  setBottleForm({
                    ...bottleForm,
                    rental_supplier: e.target.value as RefrigerantRentalSupplier,
                  })
                }
                required
              >
                <option value="">Valitse vuokraaja</option>
                {REFRIGERANT_RENTAL_SUPPLIER_ORDER.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {REFRIGERANT_RENTAL_SUPPLIER_LABELS[supplier]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
        <p className="muted">Asiakasrekisteri: {warehouseCompanyName}</p>
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
            <div className="inventory-stock-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary inventory-scan-btn"
                disabled={!warehouseCompanyId || scanBusy}
                onClick={() => setScanOpen(true)}
              >
                <IconScan /> Skannaa pullo
              </button>
              {canEditWarehouse && (
                <button type="button" className="btn btn-primary" onClick={openAdd}>
                  + Lisää pullo
                </button>
              )}
            </div>
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
                <div className="inventory-bottle-grid">
                  {bottles.map((c) => {
                    const rowBusy = rowBusyId === c.id;
                    return (
                      <Fragment key={c.id}>
                        <RefrigerantBottleCard
                          cylinder={c}
                          canEdit={canEditWarehouse}
                          busy={rowBusy}
                          onPickPhoto={(file) => void uploadBottlePhoto(c, file)}
                          onShowDetails={() => openCylinderDetails(c)}
                          onShowQr={() => openCylinderQr(c)}
                          onEdit={() => openEdit(c)}
                          onRetrieve={() => {
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
                          onEmpty={() => void emptyBottle(c)}
                          onRecycle={() => void markRecycled(c)}
                          onReturnRental={() => void returnRentalBottle(c)}
                          onRetire={() => void retireOwnedBottle(c)}
                        />
                        {retrieveBottleId === c.id && (
                          <div className="inventory-bottle-grid-span">{renderRetrieveForm(c)}</div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {view === 'history' && (
        <section className="panel inventory-report-panel">
          <h2>Historia</h2>
          <p className="muted">
            Varaston fyysiset liikkeet (osto, käyttö, talteenotto, poisto) ja tukkurin osto/myynti työmaalla.
            Kumppanin laskutusmyynti omalle asiakkaalle ei näy tässä — varasto vähenee käyttö-kirjauksessa.
          </p>
          <div className="inventory-report-dates">
            <label>
              Alku
              <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
            </label>
            <label>
              Loppu
              <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
            </label>
            <label>
              Kylmäaine
              <select value={historyTypeFilter} onChange={(e) => setHistoryTypeFilter(e.target.value)}>
                <option value="all">Kaikki</option>
                {historyTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={historyLoading}
              onClick={() => void loadHistory()}
            >
              Päivitä
            </button>
          </div>
          {historyLoading ? (
            <p className="muted">Ladataan…</p>
          ) : historyRows.length === 0 ? (
            <p className="muted">Ei tapahtumia valitulla jaksolla.</p>
          ) : filteredHistoryRows.length === 0 ? (
            <p className="muted">Ei tapahtumia valitulla kylmäaineella.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table inventory-history-table">
                <thead>
                  <tr>
                    <th>Aika</th>
                    <th className="inventory-history-sign-col" aria-label="Suunta" />
                    <th>Tapahtuma</th>
                    <th>Työraportti</th>
                    <th>Asiakas</th>
                    <th>Aine</th>
                    <th className="num">kg</th>
                    <th>Pullo</th>
                    <th>Omistus</th>
                    <th>Lähde</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryRows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.at).toLocaleString('fi-FI')}</td>
                      <td
                        className={`inventory-history-sign inventory-history-sign-${row.direction}`}
                        aria-hidden
                      >
                        {refrigerantHistoryDirectionLabel(row.direction)}
                      </td>
                      <td>{row.eventLabel}</td>
                      <td>
                        {row.work_report_id && row.work_report_title ? (
                          <Link to={`/tyoraportit/${row.work_report_id}`}>{row.work_report_title}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{row.customer_name}</td>
                      <td>{row.refrigerant_type}</td>
                      <td className="num inventory-history-qty">
                        <span className={`inventory-history-qty-sign inventory-history-qty-sign-${row.direction}`}>
                          {refrigerantHistoryDirectionLabel(row.direction)}
                        </span>
                        {row.qty_kg.toFixed(2)}
                      </td>
                      <td>{row.serial_number}</td>
                      <td>{row.ownership}</td>
                      <td>{row.source_label}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {historyTypeFilter === 'all' ? (
                    historyBalanceSummaries.map((summary) => (
                      <tr key={summary.refrigerant_type} className="inventory-history-balance-row">
                        <td colSpan={6}>
                          <strong>Saldo {summary.refrigerant_type}</strong>
                        </td>
                        <td className="num inventory-history-balance-qty">
                          <span className="inventory-history-qty-sign inventory-history-qty-sign-in">+</span>
                          {summary.in_kg.toFixed(2)}
                          <span className="inventory-history-balance-sep"> / </span>
                          <span className="inventory-history-qty-sign inventory-history-qty-sign-out">−</span>
                          {summary.out_kg.toFixed(2)}
                          <span className="inventory-history-balance-sep"> = </span>
                          <strong>
                            {summary.net_kg >= 0 ? '+' : '−'}
                            {Math.abs(summary.net_kg).toFixed(2)}
                          </strong>
                        </td>
                        <td colSpan={3} />
                      </tr>
                    ))
                  ) : (
                    <tr className="inventory-history-balance-row">
                      <td colSpan={6}>
                        <strong>Varastosaldo ({historyTypeFilter})</strong>
                      </td>
                      <td className="num inventory-history-balance-qty">
                        <span className="inventory-history-qty-sign inventory-history-qty-sign-in">+</span>
                        {historyBalanceTotal.in_kg.toFixed(2)}
                        <span className="inventory-history-balance-sep"> / </span>
                        <span className="inventory-history-qty-sign inventory-history-qty-sign-out">−</span>
                        {historyBalanceTotal.out_kg.toFixed(2)}
                        <span className="inventory-history-balance-sep"> = </span>
                        <strong>
                          {historyBalanceTotal.net_kg >= 0 ? '+' : '−'}
                          {Math.abs(historyBalanceTotal.net_kg).toFixed(2)}
                        </strong>
                      </td>
                      <td colSpan={3} />
                    </tr>
                  )}
                </tfoot>
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

      <RefrigerantBottleScanDialog
        open={scanOpen}
        busy={scanBusy}
        onClose={() => setScanOpen(false)}
        onScan={(text) => void handleScanText(text)}
      />
      <RefrigerantBottleDetailDialog
        open={detailCylinder != null}
        cylinder={detailCylinder}
        canEdit={canEditWarehouse}
        busy={scanBusy}
        onClose={() => setDetailCylinder(null)}
        onEdit={
          detailCylinder
            ? () => {
                openEdit(detailCylinder);
                setDetailCylinder(null);
              }
            : undefined
        }
        onShowQr={
          detailCylinder
            ? () => {
                openCylinderQr(detailCylinder);
                setDetailCylinder(null);
              }
            : undefined
        }
      />
      <RefrigerantBottleQrDialog
        open={qrCylinder != null}
        cylinder={qrCylinder}
        onClose={() => setQrCylinder(null)}
        onMessage={onMessage}
      />
    </>
  );
}
