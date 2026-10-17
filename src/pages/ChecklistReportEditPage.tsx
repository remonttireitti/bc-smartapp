import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';
import HuoltoWorkReportTransfer from '../components/huoltoRaportti/HuoltoWorkReportTransfer';
import SignaturePad from '../components/huoltoRaportti/SignaturePad';
import { useProfile } from '../hooks/useProfile';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import { EQUIPMENT_SELECT, formatCustomerAddressParts } from '../lib/customers';
import { huoltoCategoryLabel, isChecklistCategory, type ChecklistCategoryKey } from '../lib/huoltoCategories';
import {
  CHECKLIST_OVERALL_LABELS,
  buildChecklistReportTitle,
  checklistDeviceLabel,
  checklistSummary,
  circuitViolations,
  createEmptyChecklistReport,
  derivedItemValues,
  measurementLimitText,
  measurementViolation,
  normalizeChecklistReport,
  type ChecklistCircuitRow,
  type ChecklistItemState,
  type ChecklistReportData,
} from '../lib/huoltoChecklist/logic';
import { CIRCUIT_LIMITS, checklistTemplate, type ChecklistItem, type ChecklistStatus } from '../lib/huoltoChecklist/templates';
import { huoltoPerformerDisplayName } from '../lib/huoltoRaportti/performerFromProfile';
import { AddMaintenanceReportImages, deleteMaintenanceReportImage, MaintenanceReportImageThumb } from '../lib/maintenanceReportImages';
import { isMaintenanceReportPublished } from '../lib/maintenanceReportStatus';
import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';
import { isPortalUser } from '../lib/portalWorkOrder';
import {
  defaultReportContext,
  loadAccessibleReportCustomers,
  loadReportPartnerships,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';
import { resolveSubscriberIdForReport } from '../lib/subscribers';
import { supabase } from '../lib/supabase';
import type { Customer, Equipment, Partnership } from '../types';

interface Props {
  session: Session;
  /** Uusi raportti: laji reitiltä. Olemassa oleva: laji raportin datasta. */
  category?: ChecklistCategoryKey;
}

type RowMeta = {
  owner_company_id: string;
  branding_company_id: string | null;
  partnership_id: string | null;
  subscriber_id: string | null;
};

const STATUS_BUTTONS: Array<{ value: ChecklistStatus | null; label: string; cls: string }> = [
  { value: 'ok', label: 'OK', cls: 'konvektori-yesno-btn--yes' },
  { value: 'huom', label: 'Huomautus', cls: 'konvektori-yesno-btn--warn' },
  { value: 'vika', label: 'Vika', cls: 'konvektori-yesno-btn--no' },
  { value: null, label: 'Ei kuulu', cls: 'konvektori-yesno-btn--na' },
];

function newCircuit(): ChecklistCircuitRow {
  return { id: crypto.randomUUID().slice(0, 8), keskus: '', ryhma: '', suoja: '', riso: '', zs: '', rcdMs: '' };
}

export default function ChecklistReportEditPage({ session, category: routeCategory }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: profileLoading } = useProfile(session);
  const portalMode = isPortalUser(profile);

  const [reportId, setReportId] = useState<string | null>(id ?? null);
  const [status, setStatus] = useState<'draft' | 'submitted'>('draft');
  const [data, setData] = useState<ChecklistReportData>(() =>
    createEmptyChecklistReport(routeCategory ?? 'lvi'),
  );
  const [customerId, setCustomerId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [rowMeta, setRowMeta] = useState<RowMeta | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set());

  const stateRef = useRef({ data, customerId, equipmentId, status, reportId });
  stateRef.current = { data, customerId, equipmentId, status, reportId };
  const saveInFlight = useRef(false);

  const category = data.reportCategory;
  const template = checklistTemplate(category);
  const summary = useMemo(() => checklistSummary(data, template), [data, template]);
  const myCompanyId = profile?.company_id ?? '';
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const selectedEquipment = equipment.find((e) => e.id === equipmentId) ?? null;

  const context = useMemo(() => {
    if (!myCompanyId) return defaultReportContext('');
    if (selectedCustomer) return resolveReportContextFromCustomer(selectedCustomer, myCompanyId, partnerships);
    if (rowMeta) return resolveReportContextFromOwner(rowMeta.owner_company_id, myCompanyId, partnerships);
    return defaultReportContext(myCompanyId);
  }, [myCompanyId, selectedCustomer, rowMeta, partnerships]);

  useEffect(() => {
    if (!myCompanyId) return;
    void loadReportPartnerships(supabase, myCompanyId, 'maintenance_reports', 'write').then(setPartnerships);
  }, [myCompanyId]);

  useEffect(() => {
    if (!myCompanyId) return;
    void loadAccessibleReportCustomers(supabase, myCompanyId, partnerships)
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Asiakkaiden lataus epäonnistui.'));
  }, [myCompanyId, partnerships]);

  const loadEquipment = useCallback(async (cid: string) => {
    if (!cid) {
      setEquipment([]);
      return;
    }
    const { data: rows } = await supabase.from('equipment').select(EQUIPMENT_SELECT).eq('customer_id', cid).order('name');
    setEquipment((rows as unknown as Equipment[]) ?? []);
  }, []);

  useEffect(() => {
    void loadEquipment(customerId);
  }, [customerId, loadEquipment]);

  // Olemassa olevan raportin lataus.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: row, error: loadError } = await supabase
        .from('maintenance_reports')
        .select('id, status, data, owner_company_id, branding_company_id, partnership_id, customer_id, equipment_id, subscriber_id')
        .eq('id', id)
        .single();
      if (cancelled) return;
      if (loadError || !row) {
        setError(loadError?.message ?? 'Raporttia ei löytynyt.');
        setLoading(false);
        return;
      }
      const r = row as {
        id: string;
        status: string;
        data: Record<string, unknown>;
        owner_company_id: string;
        branding_company_id: string | null;
        partnership_id: string | null;
        customer_id: string | null;
        equipment_id: string | null;
        subscriber_id: string | null;
      };
      const cat = isChecklistCategory(r.data?.reportCategory) ? r.data.reportCategory : routeCategory ?? 'lvi';
      setData(normalizeChecklistReport(r.data, cat));
      setStatus(isMaintenanceReportPublished(r.status) ? 'submitted' : 'draft');
      setCustomerId(r.customer_id ?? '');
      setEquipmentId(r.equipment_id ?? '');
      setRowMeta({
        owner_company_id: r.owner_company_id,
        branding_company_id: r.branding_company_id,
        partnership_id: r.partnership_id,
        subscriber_id: r.subscriber_id,
      });
      setReportId(r.id);
      setLoading(false);
      if (portalMode) navigate(`/huoltoraportit/${r.id}/tuloste`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, routeCategory, portalMode, navigate]);

  // Uusi: esitäyttö (suorittaja, asiakas/laite kyselystä).
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (id || profileLoading || !profile || prefilledRef.current) return;
    prefilledRef.current = true;
    setData((prev) => (prev.suorittajaNimi ? prev : { ...prev, suorittajaNimi: huoltoPerformerDisplayName(profile, session) }));
    const cid = searchParams.get('customerId');
    const eid = searchParams.get('equipmentId');
    if (cid) setCustomerId(cid);
    if (eid) setEquipmentId(eid);
  }, [id, profileLoading, profile, session, searchParams]);

  // Asiakas- ja laitetiedot raportin dataan (lista ja tuloste).
  useEffect(() => {
    if (!selectedCustomer) return;
    setData((prev) => {
      const address = formatCustomerAddressParts(selectedCustomer);
      if (prev.customerId === selectedCustomer.id && prev.asiakas === selectedCustomer.name && prev.osoite === address) return prev;
      return { ...prev, customerId: selectedCustomer.id, asiakas: selectedCustomer.name, osoite: address };
    });
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedEquipment) return;
    setData((prev) => {
      const next = {
        laiteTunnus: selectedEquipment.tag ?? '',
        laiteMalli: selectedEquipment.model ?? '',
        laiteSijainti: selectedEquipment.location ?? '',
      };
      if (prev.laiteTunnus === next.laiteTunnus && prev.laiteMalli === next.laiteMalli && prev.laiteSijainti === next.laiteSijainti) return prev;
      return { ...prev, ...next };
    });
  }, [selectedEquipment]);

  function patch(next: Partial<ChecklistReportData>) {
    setData((prev) => ({ ...prev, ...next }));
    setDirty(true);
  }

  function patchItem(itemId: string, next: Partial<ChecklistItemState>) {
    setData((prev) => ({ ...prev, items: { ...prev.items, [itemId]: { ...prev.items[itemId], ...next } } }));
    setDirty(true);
  }

  function patchMeasurement(mid: string, value: string) {
    setData((prev) => ({ ...prev, measurements: { ...prev.measurements, [mid]: value } }));
    setDirty(true);
  }

  function patchCircuit(rowId: string, next: Partial<ChecklistCircuitRow>) {
    setData((prev) => ({ ...prev, circuits: prev.circuits.map((r) => (r.id === rowId ? { ...r, ...next } : r)) }));
    setDirty(true);
  }

  async function save(nextStatus?: 'draft' | 'submitted', opts?: { auto?: boolean }): Promise<string | null> {
    if (saveInFlight.current) return stateRef.current.reportId;
    const cur = stateRef.current;
    if (!myCompanyId) return null;
    if (!cur.customerId) {
      if (!opts?.auto) setError('Valitse asiakas.');
      return null;
    }
    const partnership = context.contextMode === 'partner' ? partnerships.find((p) => p.id === context.partnerId) : null;
    if (context.contextMode === 'partner' && !partnership) {
      if (!opts?.auto) setError('Kumppani ei ole antanut huoltoraportin kirjoitusoikeutta.');
      return null;
    }
    saveInFlight.current = true;
    if (!opts?.auto) {
      setBusy(true);
      setError(null);
    }
    try {
      const customerName = customers.find((c) => c.id === cur.customerId)?.name ?? cur.data.asiakas;
      const resolvedStatus = nextStatus ?? cur.status;
      const payload: Record<string, unknown> = {
        title: buildChecklistReportTitle(customerName, cur.data),
        data: cur.data,
        customer_id: cur.customerId,
        equipment_id: cur.equipmentId || null,
        status: resolvedStatus,
        subscriber_id: resolveSubscriberIdForReport(cur.customerId, rowMeta?.subscriber_id ?? '', customers),
      };
      if (nextStatus === 'submitted') payload.completed_at = new Date().toISOString();
      if (nextStatus === 'draft') payload.completed_at = null;
      let savedId = cur.reportId;
      if (savedId) {
        const { error: updateError } = await supabase.from('maintenance_reports').update(payload).eq('id', savedId);
        if (updateError) throw new Error(updateError.message);
      } else {
        const insertPayload = {
          ...payload,
          owner_company_id: context.ownerCompanyId,
          created_by_company_id: myCompanyId,
          branding_company_id: context.ownerCompanyId,
          partnership_id: partnership?.id ?? null,
          assigned_user_id: session.user.id,
        };
        const { data: created, error: insertError } = await supabase
          .from('maintenance_reports')
          .insert(insertPayload)
          .select('id')
          .single();
        if (insertError || !created) throw new Error(insertError?.message ?? 'Tallennus epäonnistui.');
        savedId = (created as { id: string }).id;
        setReportId(savedId);
        setRowMeta({
          owner_company_id: context.ownerCompanyId,
          branding_company_id: context.ownerCompanyId,
          partnership_id: partnership?.id ?? null,
          subscriber_id: (payload.subscriber_id as string | null) ?? null,
        });
        navigate(`/huoltoraportit/${savedId}`, { replace: true, state: location.state });
      }
      if (nextStatus) setStatus(nextStatus);
      // Muutokset tallennuksen aikana jäävät likaisiksi.
      if (stateRef.current.data === cur.data) setDirty(false);
      setSavedAt(new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }));
      return savedId;
    } catch (err) {
      if (!opts?.auto) setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
      return null;
    } finally {
      saveInFlight.current = false;
      if (!opts?.auto) setBusy(false);
    }
  }

  // Automaattitallennus (asiakas valittu).
  useEffect(() => {
    if (!dirty || !customerId || loading || portalMode) return;
    const t = window.setTimeout(() => void save(undefined, { auto: true }), 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, data, customerId, equipmentId, loading, portalMode]);

  async function createCustomer(draft: NewCustomerDraft) {
    if (!myCompanyId || !draft.name.trim()) {
      setError('Asiakkaan nimi on pakollinen.');
      return;
    }
    setBusy(true);
    const { customer, error: createError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: myCompanyId,
      name: draft.name,
      address: draft.address,
      postal_code: draft.postal_code,
      city: draft.city,
      phone: draft.phone,
      subscriberId: null,
    });
    setBusy(false);
    if (createError || !customer) {
      setError(createError ?? 'Asiakkaan luonti epäonnistui.');
      return;
    }
    setCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setCustomerId(customer.id);
    setEquipmentId('');
    setDirty(true);
  }

  async function createEquipment(draft: NewEquipmentDraft) {
    if (!customerId || !selectedCustomer) {
      setError('Valitse ensin asiakas.');
      return;
    }
    const name = draft.name.trim() || draft.tag.trim() || draft.model.trim();
    if (!name) {
      setError('Laitteen nimi on pakollinen.');
      return;
    }
    setBusy(true);
    const { data: created, error: insertError } = await supabase
      .from('equipment')
      .insert({
        owner_company_id: selectedCustomer.owner_company_id,
        customer_id: customerId,
        name,
        tag: draft.tag.trim() || null,
        model: draft.model.trim() || null,
        serial_number: draft.serial_number.trim() || null,
        location: draft.location.trim() || null,
      })
      .select(EQUIPMENT_SELECT)
      .single();
    setBusy(false);
    if (insertError || !created) {
      setError(insertError?.message ?? 'Laitteen luonti epäonnistui.');
      return;
    }
    const eq = created as unknown as Equipment;
    setEquipment((prev) => [...prev, eq].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setEquipmentId(eq.id);
    setDirty(true);
  }

  function toggleDetails(itemId: string) {
    setOpenDetails((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function renderItem(item: ChecklistItem) {
    const state = data.items[item.id] ?? {};
    const st = state.status ?? null;
    const photos = state.photos ?? [];
    const hasExtra = Boolean(state.comment?.trim()) || photos.length > 0;
    const showDetails = st === 'huom' || st === 'vika' || hasExtra || openDetails.has(item.id);
    const derived = derivedItemValues(item.id, data.measurements);
    return (
      <li key={item.id} className={`checklist-row checklist-row--${st ?? 'na'}`}>
        <div className="checklist-row-main">
          <span className="checklist-row-label">{item.label}</span>
          <div className="konvektori-yesno huolto-tristate-inspection checklist-status" role="group" aria-label={item.label}>
            {STATUS_BUTTONS.map((b) => (
              <button
                key={b.label}
                type="button"
                className={`konvektori-yesno-btn${st === b.value ? ` konvektori-yesno-btn--active ${b.cls}` : ''}`}
                aria-pressed={st === b.value}
                disabled={busy}
                onClick={() => patchItem(item.id, { status: b.value })}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {item.measurements?.length ? (
          <div className="checklist-measurements">
            {item.measurements.map((m) => {
              const value = data.measurements[m.id] ?? '';
              const bad = measurementViolation(m, value);
              return (
                <label key={m.id} className={bad ? `checklist-measure checklist-measure--${bad}` : 'checklist-measure'}>
                  <span>
                    {m.label}
                    {m.unit ? ` (${m.unit})` : ''}
                  </span>
                  <input
                    inputMode={m.text ? 'text' : 'decimal'}
                    value={value}
                    onChange={(e) => patchMeasurement(m.id, e.target.value)}
                  />
                  {bad ? <small>Raja {measurementLimitText(m)}</small> : null}
                </label>
              );
            })}
            {derived.map((d) => (
              <span key={d} className="checklist-derived">{d}</span>
            ))}
          </div>
        ) : null}
        {showDetails ? (
          <div className="checklist-details">
            <input
              type="text"
              value={state.comment ?? ''}
              placeholder="Kommentti"
              onChange={(e) => patchItem(item.id, { comment: e.target.value })}
            />
            {reportId ? (
              <div className="checklist-photos">
                {photos.map((p) => (
                  <span key={p.storagePath} className="checklist-photo">
                    <MaintenanceReportImageThumb path={p.storagePath} />
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        void deleteMaintenanceReportImage(p.storagePath);
                        patchItem(item.id, { photos: photos.filter((x) => x.storagePath !== p.storagePath) });
                      }}
                    >
                      Poista
                    </button>
                  </span>
                ))}
                <AddMaintenanceReportImages
                  reportId={reportId}
                  section="huomiot"
                  userId={session.user.id}
                  items={photos}
                  onChange={(items) => patchItem(item.id, { photos: items })}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="link-btn checklist-add-note" onClick={() => toggleDetails(item.id)}>
            + Kommentti / kuva
          </button>
        )}
      </li>
    );
  }

  const circuitBad = useMemo(() => circuitViolations(data.circuits), [data.circuits]);
  const isBad = (rowId: string, field: 'riso' | 'rcdMs') => circuitBad.some((v) => v.rowId === rowId && v.field === field);

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  const overallCls = summary.overall === 'vika' ? 'bad' : summary.overall === 'huom' ? 'warn' : summary.overall === 'ok' ? 'ok' : 'na';
  const customerName = selectedCustomer?.name ?? data.asiakas;
  const transferReport =
    reportId && rowMeta
      ? {
          id: reportId,
          owner_company_id: rowMeta.owner_company_id,
          branding_company_id: rowMeta.branding_company_id,
          partnership_id: rowMeta.partnership_id,
          customer_id: customerId || null,
          equipment_id: equipmentId || null,
          subscriber_id: rowMeta.subscriber_id,
        }
      : null;

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/huoltoraportit">Huoltoraportit</Link> / {huoltoCategoryLabel(category)}
          </p>
          <h1>
            {huoltoCategoryLabel(category)}
            {customerName ? ` – ${customerName}` : ''}
          </h1>
          <p className="checklist-head-status">
            <span className={`checklist-verdict checklist-verdict--${overallCls}`}>{CHECKLIST_OVERALL_LABELS[summary.overall]}</span>
            <span className="muted">
              {status === 'submitted' ? 'Valmis' : 'Luonnos'}
              {dirty ? ' · tallentamatta' : savedAt ? ` · tallennettu ${savedAt}` : ''}
            </span>
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel form-grid checklist-basics">
        <CustomerRegistryPicker
          customers={customers}
          customerId={customerId}
          myCompanyId={myCompanyId}
          busy={busy}
          onSelect={(cid) => {
            setCustomerId(cid);
            setEquipmentId('');
            setDirty(true);
          }}
          onClear={() => {
            setCustomerId('');
            setEquipmentId('');
            setDirty(true);
          }}
          onCreate={createCustomer}
        />
        <EquipmentRegistryPicker
          equipment={equipment}
          equipmentId={equipmentId}
          disabled={!customerId}
          busy={busy}
          onSelect={(eid) => {
            setEquipmentId(eid);
            setDirty(true);
          }}
          onClear={() => {
            setEquipmentId('');
            setDirty(true);
          }}
          onCreate={createEquipment}
        />
        <label>
          Kohde / järjestelmä
          <input value={data.kohde} onChange={(e) => patch({ kohde: e.target.value })} placeholder={category === 'iv' ? 'Esim. TK01, vesikatto' : category === 'sahko' ? 'Esim. pääkeskus PK1' : 'Esim. lämmönjakohuone'} />
        </label>
        <label>
          Päivämäärä
          <input type="date" value={data.tarkastusPvm} onChange={(e) => patch({ tarkastusPvm: e.target.value })} />
        </label>
      </section>

      {template.sections.map((section) => (
        <section key={section.id} className="panel checklist-section">
          <h2>{section.title}</h2>
          <ul className="checklist-list">{section.items.map(renderItem)}</ul>
        </section>
      ))}

      {template.circuitTable ? (
        <section className="panel checklist-section">
          <h2>Mittaukset ryhmittäin</h2>
          {data.circuits.length ? (
            <div className="checklist-circuits-wrap">
              <table className="checklist-circuits">
                <thead>
                  <tr>
                    <th>Keskus</th>
                    <th>Ryhmä</th>
                    <th>Suojalaite</th>
                    <th>Riso MΩ (≥ {CIRCUIT_LIMITS.risoMinMohm})</th>
                    <th>Zs Ω</th>
                    <th>RCD ms (≤ {CIRCUIT_LIMITS.rcdMaxMs})</th>
                    <th aria-label="Poista" />
                  </tr>
                </thead>
                <tbody>
                  {data.circuits.map((r) => (
                    <tr key={r.id}>
                      <td><input value={r.keskus} onChange={(e) => patchCircuit(r.id, { keskus: e.target.value })} /></td>
                      <td><input value={r.ryhma} onChange={(e) => patchCircuit(r.id, { ryhma: e.target.value })} /></td>
                      <td><input value={r.suoja} placeholder="C16 / 30 mA" onChange={(e) => patchCircuit(r.id, { suoja: e.target.value })} /></td>
                      <td className={isBad(r.id, 'riso') ? 'checklist-measure--vika' : ''}><input inputMode="decimal" value={r.riso} onChange={(e) => patchCircuit(r.id, { riso: e.target.value })} /></td>
                      <td><input inputMode="decimal" value={r.zs} onChange={(e) => patchCircuit(r.id, { zs: e.target.value })} /></td>
                      <td className={isBad(r.id, 'rcdMs') ? 'checklist-measure--vika' : ''}><input inputMode="decimal" value={r.rcdMs} onChange={(e) => patchCircuit(r.id, { rcdMs: e.target.value })} /></td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => patch({ circuits: data.circuits.filter((x) => x.id !== r.id) })}>
                          Poista
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ circuits: [...data.circuits, newCircuit()] })}>
            + Lisää ryhmä
          </button>
        </section>
      ) : null}

      <section className="panel form-grid checklist-summary">
        <h2>Yhteenveto</h2>
        <p>
          <span className={`checklist-verdict checklist-verdict--${overallCls}`}>{CHECKLIST_OVERALL_LABELS[summary.overall]}</span>{' '}
          <span className="muted">
            OK {summary.ok} · Huomautus {summary.huom} · Vika {summary.vika} · Ei kuulu {summary.na}
          </span>
        </p>
        <label className="full-width">
          Toimenpide-ehdotukset
          <textarea rows={4} value={data.toimenpiteet} onChange={(e) => patch({ toimenpiteet: e.target.value })} />
        </label>
        <label>
          Seuraava huolto
          <input type="date" value={data.seuraavaHuolto} onChange={(e) => patch({ seuraavaHuolto: e.target.value })} />
        </label>
      </section>

      <section className="panel form-grid checklist-performer">
        <h2>Suorittaja</h2>
        <label>
          Nimi
          <input value={data.suorittajaNimi} onChange={(e) => patch({ suorittajaNimi: e.target.value })} />
        </label>
        <label>
          {template.qualificationLabel}
          <input
            value={data.suorittajaPatevyys}
            placeholder={category === 'sahko' ? 'S1 / S2 / S3' : ''}
            onChange={(e) => patch({ suorittajaPatevyys: e.target.value })}
          />
        </label>
        <label>
          Mittalaitteet
          <input value={data.mittalaitteet} onChange={(e) => patch({ mittalaitteet: e.target.value })} />
        </label>
        <div className="full-width">
          <span className="field-label">Allekirjoitus</span>
          <SignaturePad
            value={data.signature}
            onChange={(sig) => patch({ signature: sig, signedAt: sig ? new Date().toISOString() : undefined })}
          />
        </div>
      </section>

      <div className="panel checklist-actions btn-group">
        <button type="button" className="btn btn-secondary" disabled={busy || !customerId} onClick={() => void save()}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
        {status === 'submitted' ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void save('draft')}>
            Palauta luonnokseksi
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || !customerId} onClick={() => void save('submitted')}>
            Merkitse valmiiksi
          </button>
        )}
        {reportId ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const saved = dirty ? await save() : reportId;
                if (saved) navigate(`/huoltoraportit/${saved}/tuloste`, withNavTrail(maintenanceListTrail()));
              })();
            }}
          >
            Tulosta / PDF
          </button>
        ) : null}
        {reportId ? (
          <HuoltoWorkReportTransfer
            session={session}
            report={transferReport}
            typeKey={category}
            typeLabel={huoltoCategoryLabel(category)}
            customerName={customerName}
            deviceLabel={selectedEquipment?.tag || selectedEquipment?.name || checklistDeviceLabel(data) || undefined}
            logDate={data.tarkastusPvm}
            done={status === 'submitted'}
            linkedWorkReportId={data.huoltoWorkReportId}
            disabled={busy}
            beforeTransfer={async () => Boolean(await save())}
            onLinked={async (wid) => {
              const next = { ...stateRef.current.data, huoltoWorkReportId: wid };
              stateRef.current = { ...stateRef.current, data: next };
              setData(next);
              await save();
            }}
          />
        ) : null}
      </div>
    </AppLayout>
  );
}
