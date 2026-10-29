import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import DeviceQrPanel from '../components/equipment/DeviceQrPanel';
import DeviceNotesPanel from '../components/equipment/DeviceNotesPanel';
import DecommissionDialog from '../components/equipment/DecommissionDialog';
import { loadDecommissionedByIds, setEquipmentDecommissioned } from '../lib/equipmentDecommission';
import { emitDataChanged } from '../lib/dataRefresh';
import {
  latestSharedYmd,
  listEquipmentLinks,
  loadSharedHistory,
  maxYmd,
  sharedRowsToHistoryEntries,
  type SharedHistoryRow,
} from '../lib/equipmentLinks';
import { snapshotWithRefrigerant } from '../lib/equipmentRefrigerant';
import { HUOLTO_ASETUKSET_KEY, buildDeviceSchedule, defaultServiceIntervalMonths, formatTonnes, leakCheckInterval, readHuoltoAsetukset, refrigerantGwp, leakStatusText, serviceStatusText, todayYmdLocal } from '../lib/huoltoSchedule';
import { newHuoltoReportHrefForDevice } from '../lib/huoltoCategories';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getPortalCustomerId, getPortalSubscriberId } from '../lib/portalPreview';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { DeviceCardIcon, HistoryIcon } from '../components/PrintIcons';
import Tooltip from '../components/Tooltip';
import {
  effectiveDeviceFields,
  formatRefrigerant,
  loadEquipmentDeviceFields,
  parseChargeKg,
  type EquipmentDeviceFields,
} from '../lib/equipmentDeviceFields';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import {
  canEditCustomersAsStaff,
  CUSTOMER_SELECT,
  EQUIPMENT_SELECT,
  customerAddressLine,
} from '../lib/customers';
import {
  buildEquipmentCardPrintHtml,
  buildLatestMaintenanceByEquipment,
  buildLatestLeakCheckByEquipment,
  formatMaintenanceDateFi,
  parseMaintenanceDateMs,
  buildMaintenanceHistoryForEquipment,
  buildMaintenanceHistoryPrintHtml,
  loadCustomerMaintenanceContext,
} from '../lib/equipmentMaintenanceHistory';
import { loadCustomerLinkedDocuments, type CustomerLinkedDocument } from '../lib/customerDocuments';
import { deviceTypes } from '../lib/huoltoRaportti/constants';
import { deviceTypeLabel } from '../lib/huoltoRaportti/equipmentSnapshotDisplay';
import { customerDetailTrail, equipmentDetailTrail, withNavTrail } from '../lib/navigationTrail';
import { openPrintHtml } from '../lib/openPrintWindow';
import { supabase } from '../lib/supabase';
import { isPortalUser } from '../lib/portalWorkOrder';
import { useProfile } from '../hooks/useProfile';
import { loadEquipmentNotes, type EquipmentNote } from '../lib/equipmentNotes';
import type { Customer, Equipment, Partnership } from '../types';

interface Props {
  session: Session;
}


type EquipmentEditDraft = {
  name: string;
  tag: string;
  model: string;
  serial_number: string;
  location: string;
  device_type: string;
  notes: string;
  manufacturer: string;
  refrigerant: string;
  refrigerant_charge_kg: string;
  installed_on: string;
  huoltovaliKk: string;
  gwp: string;
};

function equipmentTitle(eq: Pick<Equipment, 'tag' | 'name'>): string {
  return eq.tag ? `${eq.tag} — ${eq.name}` : eq.name;
}

function draftFromEquipment(eq: Equipment, f?: EquipmentDeviceFields | null): EquipmentEditDraft {
  return {
    manufacturer: f?.manufacturer ?? '',
    refrigerant: f?.refrigerant ?? '',
    refrigerant_charge_kg: f?.refrigerant_charge_kg != null ? String(f.refrigerant_charge_kg).replace('.', ',') : '',
    installed_on: f?.installed_on ?? '',
    name: eq.name ?? '',
    tag: eq.tag ?? '',
    model: eq.model ?? '',
    serial_number: eq.serial_number ?? '',
    location: eq.location ?? '',
    device_type: eq.device_type ?? '',
    notes: eq.notes ?? '',
    ...(() => {
      const a = readHuoltoAsetukset(eq.huolto_technical_snapshot);
      return {
        huoltovaliKk: a.huoltovaliKk ? String(a.huoltovaliKk) : '',
        gwp: a.gwp != null ? String(a.gwp) : '',
      };
    })(),
  };
}

export default function EquipmentDetailPage({ session }: Props) {
  const { customerId, equipmentId } = useParams<{ customerId: string; equipmentId: string }>();
  const { profile } = useProfile(session);
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [infoEditing, setInfoEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EquipmentEditDraft | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<CustomerLinkedDocument[]>([]);
  const [equipmentNotes, setEquipmentNotes] = useState<EquipmentNote[] | null>(null);
  const [sharedRows, setSharedRows] = useState<SharedHistoryRow[]>([]);
  const [ownCompanyName, setOwnCompanyName] = useState<string | null>(null);
  const [maintenanceRows, setMaintenanceRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['maintenanceRows']
  >([]);
  const [workRows, setWorkRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['workRows']
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState<'card' | 'history' | null>(null);
  /** null = sarakkeita ei vielä ole (migraatio ajamatta) → näytetään tilannekuvasta vain luku. */
  const [deviceColumns, setDeviceColumns] = useState<EquipmentDeviceFields | null>(null);
  const [deviceColumnsSupported, setDeviceColumnsSupported] = useState(false);
  /** Poistopäivä (ymd) tai null = käytössä. decommissionSupported=false → sarake puuttuu (SQL ajamatta). */
  const [decommissionedOn, setDecommissionedOn] = useState<string | null>(null);
  const [decommissionSupported, setDecommissionSupported] = useState(false);
  const [decommissionOpen, setDecommissionOpen] = useState(false);
  const [decommissionBusy, setDecommissionBusy] = useState(false);
  const [decommissionError, setDecommissionError] = useState<string | null>(null);

  useEffect(() => {
    if (customerId && equipmentId) void load();
  }, [customerId, equipmentId, profile?.company_id]);

  async function loadPartnerships(): Promise<Partnership[]> {
    if (!profile?.company_id) return [];
    const { data } = await supabase
      .from('company_partnerships')
      .select('id, company_a_id, company_b_id, permissions_a_to_b, permissions_b_to_a, customer_access_restricted, status')
      .eq('status', 'active');
    const rows = (data ?? []) as Omit<Partnership, 'partner_company'>[];
    const mine = rows.filter(
      (p) => p.company_a_id === profile.company_id || p.company_b_id === profile.company_id,
    );
    const enriched: Partnership[] = [];
    for (const p of mine) {
      const partnerId = p.company_a_id === profile.company_id ? p.company_b_id : p.company_a_id;
      const { data: company } = await supabase.from('companies').select('id, name, slug').eq('id', partnerId).single();
      if (company) enriched.push({ ...p, partner_company: company });
    }
    return enriched;
  }

  async function loadLinks(id: string) {
    const list = await listEquipmentLinks(supabase, id);
    if (list && list.some((l) => l.status === 'active')) {
      setSharedRows((await loadSharedHistory(supabase, id)) ?? []);
    } else {
      setSharedRows([]);
    }
  }

  async function load() {
    if (!customerId || !equipmentId) return;
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    setInfoEditing(false);
    setEditDraft(null);

    const partnershipRows = await loadPartnerships();
    const [customerResult, equipmentResult, linkedDocuments, maintenanceContext] = await Promise.all([
      supabase.from('customers').select(CUSTOMER_SELECT).eq('id', customerId).maybeSingle(),
      supabase.from('equipment').select(EQUIPMENT_SELECT).eq('id', equipmentId).maybeSingle(),
      loadCustomerLinkedDocuments(supabase, customerId, { portalReadOnly: isPortalUser(profile) }),
      loadCustomerMaintenanceContext(supabase, customerId),
    ]);

    if (customerResult.error || !customerResult.data) {
      setError(customerResult.error?.message ?? 'Asiakasta ei löytynyt.');
      setLoading(false);
      return;
    }

    if (equipmentResult.error || !equipmentResult.data) {
      setError(equipmentResult.error?.message ?? 'Laitetta ei löytynyt.');
      setLoading(false);
      return;
    }

    const customerRow = customerResult.data as unknown as Customer;
    const equipmentRow = equipmentResult.data as Equipment;
    if (equipmentRow.customer_id !== customerId) {
      setError('Laite ei kuulu valittuun asiakkaaseen.');
      setLoading(false);
      return;
    }

    setCustomer(customerRow);
    setEquipment(equipmentRow);
    const fieldMap = await loadEquipmentDeviceFields(supabase, [equipmentRow.id]);
    setDeviceColumnsSupported(fieldMap !== null);
    setDeviceColumns(fieldMap?.get(equipmentRow.id) ?? null);
    const decomMap = await loadDecommissionedByIds(supabase, [equipmentRow.id]);
    setDecommissionSupported(decomMap !== null);
    setDecommissionedOn(decomMap?.get(equipmentRow.id) ?? null);
    setCanWrite(
      canEditCustomersAsStaff(profile, customerRow.owner_company_id, profile?.company_id, partnershipRows),
    );
    setDocuments(
      linkedDocuments.filter(
        (doc) =>
          doc.equipmentId === equipmentId
          || (doc.equipmentIds?.includes(equipmentId) ?? false),
      ),
    );
    setMaintenanceRows(maintenanceContext.maintenanceRows);
    void loadEquipmentNotes(supabase, { customerId: customerId }).then(setEquipmentNotes);
    void loadLinks(equipmentRow.id);
    if (profile?.company_id) {
      void supabase.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
        .then(({ data }) => setOwnCompanyName((data as { name?: string } | null)?.name ?? null));
    }
    setWorkRows(maintenanceContext.workRows);
    setLoading(false);
  }

  const latestMaintenanceByEquipment = useMemo(
    () => (equipment ? buildLatestMaintenanceByEquipment([equipment], maintenanceRows, equipmentNotes) : {}),
    [equipment, maintenanceRows, equipmentNotes],
  );

  const schedule = useMemo(() => {
    const f = equipment ? effectiveDeviceFields(deviceColumns, equipment.huolto_technical_snapshot) : null;
    return buildDeviceSchedule({
      deviceType: equipment?.device_type,
      refrigerant: f?.refrigerant,
      chargeKg: f?.refrigerant_charge_kg ?? null,
      asetukset: readHuoltoAsetukset(equipment?.huolto_technical_snapshot),
      lastServiceYmd: maxYmd(equipment ? latestMaintenanceByEquipment[equipment.id] ?? null : null, latestSharedYmd(sharedRows, 'service')),
      lastLeakCheckYmd: maxYmd(equipment ? buildLatestLeakCheckByEquipment(maintenanceRows)[equipment.id] ?? null : null, latestSharedYmd(sharedRows, 'leak')),
      todayYmd: todayYmdLocal(),
    });
  }, [equipment, deviceColumns, latestMaintenanceByEquipment, maintenanceRows, sharedRows]);

  /** Yksi huoltohistoria uusin ensin: pöytäkirjat (myös kesken), työraportit, merkinnät, linkitetyn laitteen toisen yrityksen rivit. */
  const historyRows = useMemo(() => {
    type Row = { key: string; ms: number; date: string; text: string; status?: string; href?: string };
    const rows: Row[] = [];
    for (const d of documents) {
      if (d.kind !== 'maintenance_report' && d.kind !== 'work_report') continue;
      const ms = parseMaintenanceDateMs(d.date);
      rows.push({
        key: `${d.kind}-${d.id}`,
        ms,
        date: formatMaintenanceDateFi(d.date),
        text: d.kind === 'work_report' ? `Työraportti: ${d.title}` : d.title,
        status: d.status === 'draft' ? 'Kesken' : undefined,
        href: d.href,
      });
    }
    for (const n of equipmentNotes ?? []) {
      if (n.equipment_id !== equipmentId) continue;
      rows.push({ key: `note-${n.id}`, ms: parseMaintenanceDateMs(n.entry_date), date: formatMaintenanceDateFi(n.entry_date), text: n.text });
    }
    // Linkitetyn laitteen rivit vain toiselta yritykseltä — omat ovat jo listassa.
    const foreign = sharedRows.filter((r) => !ownCompanyName || r.company !== ownCompanyName);
    sharedRowsToHistoryEntries(foreign).forEach((e, i) => rows.push({ key: `shared-${i}`, ms: e.sortMs, date: e.dateLabel, text: e.summary }));
    return rows.sort((x, y) => y.ms - x.ms);
  }, [documents, equipmentNotes, equipmentId, sharedRows, ownCompanyName]);

  async function loadPrintBranding(ownerCompanyId: string) {
    const { data } = await supabase.from('companies').select('name, logo_url').eq('id', ownerCompanyId).single();
    const row = data as { name: string; logo_url: string | null } | null;
    let logoUrl: string | null = null;
    try {
      logoUrl = await resolveCompanyLogoUrl(row?.logo_url);
    } catch {
      logoUrl = null;
    }
    return { companyName: row?.name?.trim() || customer?.name || '—', logoUrl };
  }

  async function changeDecommission(ymd: string | null) {
    if (!equipment) return;
    setDecommissionBusy(true);
    setDecommissionError(null);
    try {
      await setEquipmentDecommissioned(supabase, equipment.id, ymd);
    } catch (e) {
      setDecommissionBusy(false);
      setDecommissionError(e instanceof Error ? e.message : 'Tallennus epäonnistui.');
      if (ymd === null) setError(e instanceof Error ? e.message : 'Palautus epäonnistui.');
      return;
    }
    setDecommissionBusy(false);
    setDecommissionOpen(false);
    setDecommissionedOn(ymd);
    setSaveMessage(ymd ? 'Laite poistettu käytöstä.' : 'Laite palautettu käyttöön.');
    emitDataChanged();
  }

  async function printEquipmentCard() {
    if (!customer || !equipment) return;
    setPrintBusy('card');
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      openPrintHtml(
        buildEquipmentCardPrintHtml({
          customerName: customer.name,
          equipment,
          latestMaintenanceYmd: latestMaintenanceByEquipment[equipment.id] ?? null,
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Laitekortin tulostus epäonnistui.');
    } finally {
      setPrintBusy(null);
    }
  }

  async function printEquipmentHistory() {
    if (!customer || !equipment) return;
    setPrintBusy('history');
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      const entries = [...buildMaintenanceHistoryForEquipment(equipment, maintenanceRows, workRows, equipmentNotes), ...sharedRowsToHistoryEntries(sharedRows)].sort((a, b) => a.sortMs - b.sortMs);
      openPrintHtml(
        buildMaintenanceHistoryPrintHtml({
          customerName: customer.name,
          sections: [{ deviceLabel: equipmentTitle(equipment), entries }],
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Huoltohistorian tulostus epäonnistui.');
    } finally {
      setPrintBusy(null);
    }
  }

  function openInfoEdit() {
    if (!equipment || !canWrite) return;
    setEditDraft(draftFromEquipment(equipment, effectiveDeviceFields(deviceColumns, equipment.huolto_technical_snapshot)));
    setInfoEditing(true);
    setSaveMessage(null);
    setError(null);
  }

  async function saveEquipmentBasics(event: FormEvent) {
    event.preventDefault();
    if (!equipment || !editDraft || !canWrite) return;
    const name = editDraft.name.trim();
    if (!name) {
      setError('Laitteen nimi on pakollinen.');
      return;
    }
    setSaveBusy(true);
    setError(null);
    setSaveMessage(null);
    const payload = {
      name,
      tag: editDraft.tag.trim() || null,
      model: editDraft.model.trim() || null,
      serial_number: editDraft.serial_number.trim() || null,
      location: editDraft.location.trim() || null,
      device_type: editDraft.device_type.trim() || null,
      notes: editDraft.notes.trim() || null,
      huolto_technical_snapshot: {
        // Kylmäaine: laitekortti on lähde, tilannekuva peilaa sen (uusi pöytäkirja esitäytetään tästä).
        ...snapshotWithRefrigerant(
          (equipment.huolto_technical_snapshot as Record<string, unknown> | null) ?? {},
          { refrigerant: editDraft.refrigerant.trim() || null, refrigerant_charge_kg: parseChargeKg(editDraft.refrigerant_charge_kg) },
          { clear: true },
        ),
        [HUOLTO_ASETUKSET_KEY]: {
          // Vanhat tallennetut arvot (esim. vuodonilmaisin, hermeettinen) säilyvät koskemattomina; niitä ei enää käytetä.
          ...(((equipment.huolto_technical_snapshot as Record<string, unknown> | null)?.[HUOLTO_ASETUKSET_KEY] as Record<string, unknown> | undefined) ?? {}),
          huoltovaliKk: parseInt(editDraft.huoltovaliKk, 10) > 0 ? parseInt(editDraft.huoltovaliKk, 10) : null,
          gwp: editDraft.gwp.trim() !== '' && Number.isFinite(Number(editDraft.gwp.replace(',', '.'))) ? Number(editDraft.gwp.replace(',', '.')) : null,
        },
      },
    };
    const fieldPayload: EquipmentDeviceFields | null = deviceColumnsSupported
      ? {
          manufacturer: editDraft.manufacturer.trim() || null,
          refrigerant: editDraft.refrigerant.trim() || null,
          refrigerant_charge_kg: parseChargeKg(editDraft.refrigerant_charge_kg),
          installed_on: editDraft.installed_on || null,
        }
      : null;
    if (fieldPayload) {
      const { error: fieldError } = await supabase.from('equipment').update(fieldPayload).eq('id', equipment.id);
      if (fieldError) {
        setSaveBusy(false);
        setError(fieldError.message);
        return;
      }
      setDeviceColumns(fieldPayload);
    }
    const { data, error: updateError } = await supabase
      .from('equipment')
      .update(payload)
      .eq('id', equipment.id)
      .select(EQUIPMENT_SELECT)
      .single();
    setSaveBusy(false);
    if (updateError || !data) {
      setError(updateError?.message ?? 'Laitteen tallennus epäonnistui.');
      return;
    }
    const updated = data as Equipment;
    setEquipment(updated);
    setEditDraft(draftFromEquipment(updated, fieldPayload ?? deviceColumns));
    setInfoEditing(false);
    setSaveMessage('Laiteperustiedot tallennettu.');
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!customer || !equipment) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Laitetta ei löytynyt.'}</p>
        <Link to={customerId ? `/asiakkaat/${customerId}` : '/asiakkaat'} className="btn btn-secondary">
          ← Takaisin
        </Link>
      </AppLayout>
    );
  }

  const title = equipmentTitle(equipment);
  const shownFields = effectiveDeviceFields(deviceColumns, equipment.huolto_technical_snapshot);
  const trail = equipmentDetailTrail(customer.id, customer.name, title);
  const portalMode = isPortalUser(profile);
  const portalCustomerId = getPortalCustomerId(profile);
  const portalSubscriberId = getPortalSubscriberId(profile);
  if (portalMode && ((portalCustomerId && customer.id !== portalCustomerId)
    || (portalSubscriberId && (customer as { subscriber_id?: string | null }).subscriber_id !== portalSubscriberId))) {
    return <Navigate to="/laitteet" replace />;
  }

  const canDecommission = decommissionSupported && !portalMode && canWrite
    && (customer.owner_company_id === profile?.company_id || profile?.is_global_admin === true);

  return (
    <AppLayout session={session}>
      <DecommissionDialog
        open={decommissionOpen}
        deviceName={title}
        busy={decommissionBusy}
        error={decommissionError}
        onConfirm={(ymd) => void changeDecommission(ymd)}
        onCancel={() => setDecommissionOpen(false)}
      />
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/asiakkaat">Asiakkaat</Link> /{' '}
            <Link to={`/asiakkaat/${customer.id}`}>{customer.name}</Link> / {title}
          </p>
          <h1>{title}</h1>
          <p className="muted">
            <Link to={`/asiakkaat/${customer.id}`} {...withNavTrail(customerDetailTrail(customer.id, customer.name))}>
              {customer.name}
            </Link>{' '}
            • {customerAddressLine(customer)}
          </p>
        </div>
        <div className="page-header-actions">
          <Tooltip label="Tulosta laitekortti">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusy === 'card'}
              onClick={() => void printEquipmentCard()}
              aria-label="Tulosta laitekortti"
            >
              <DeviceCardIcon />
            </button>
          </Tooltip>
          <Tooltip label="Tulosta huoltohistoria">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusy === 'history'}
              onClick={() => void printEquipmentHistory()}
              aria-label="Tulosta huoltohistoria"
            >
              <HistoryIcon />
            </button>
          </Tooltip>
          {!portalMode && !decommissionedOn && huolto.loaded && huolto.access.moduleEnabled && (
            <Link
              to={newHuoltoReportHrefForDevice(huolto.access, equipment.device_type, `customerId=${customer.id}&equipmentId=${equipment.id}`)}
              className="btn btn-primary"
              {...withNavTrail(trail)}
            >
              + Uusi huoltoraportti
            </Link>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {saveMessage && <p className="success">{saveMessage}</p>}

      <section className="panel customer-info-panel">
        <h2 className="customer-section-title">Laitetiedot</h2>
        {infoEditing && editDraft ? (
          <form className="line-form-grid equipment-edit-form" onSubmit={(event) => void saveEquipmentBasics(event)}>
            <label>
              Nimi *
              <input
                value={editDraft.name}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                required
                disabled={saveBusy}
              />
            </label>
            <label>
              Tunniste
              <input
                value={editDraft.tag}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, tag: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            <label>
              Tyyppi
              <select
                value={editDraft.device_type}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, device_type: e.target.value } : prev))}
                disabled={saveBusy}
              >
                <option value="">Valitse…</option>
                {deviceTypes.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Malli
              <input
                value={editDraft.model}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, model: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            <label>
              Sarjanumero
              <input
                value={editDraft.serial_number}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, serial_number: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            <label>
              Sijainti
              <input
                value={editDraft.location}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, location: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            <label>
              Merkki
              <input
                value={editDraft.manufacturer}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, manufacturer: e.target.value } : prev))}
                disabled={saveBusy || !deviceColumnsSupported}
              />
            </label>
            <label>
              Kylmäaine
              <input
                value={editDraft.refrigerant}
                placeholder="esim. R-32"
                list="equipment-refrigerant-options"
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, refrigerant: e.target.value } : prev))}
                disabled={saveBusy || !deviceColumnsSupported}
              />
              <datalist id="equipment-refrigerant-options">
                {['R-32', 'R-410A', 'R-407C', 'R-134a', 'R-404A', 'R-448A', 'R-449A', 'R-452A', 'R-513A', 'R-290', 'R-744'].map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label>
              Täytös (kg)
              <input
                inputMode="decimal"
                value={editDraft.refrigerant_charge_kg}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, refrigerant_charge_kg: e.target.value } : prev))}
                disabled={saveBusy || !deviceColumnsSupported}
              />
            </label>
            <label>
              Huoltoväli (kk)
              <input
                inputMode="numeric"
                value={editDraft.huoltovaliKk}
                placeholder={String(defaultServiceIntervalMonths(editDraft.device_type))}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, huoltovaliKk: e.target.value.replace(/[^0-9]/g, '') } : prev))}
                disabled={saveBusy}
              />
            </label>
            <label>
              GWP
              <input
                inputMode="decimal"
                value={editDraft.gwp}
                placeholder={String(refrigerantGwp(editDraft.refrigerant) ?? '')}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, gwp: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            {(() => {
              const lc = leakCheckInterval({
                refrigerant: editDraft.refrigerant,
                chargeKg: parseChargeKg(editDraft.refrigerant_charge_kg),
                gwpOverride: editDraft.gwp.trim() ? Number(editDraft.gwp.replace(',', '.')) : null,
              });
              return (
                <p className="muted huolto-span-all">
                  CO₂e {formatTonnes(lc.co2eTonnes)} · Vuototarkastus {lc.intervalMonths ? `${lc.intervalMonths} kk` : 'ei vaadita'}
                </p>
              );
            })()}
            <label>
              Asennuspäivä
              <input
                type="date"
                value={editDraft.installed_on}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, installed_on: e.target.value } : prev))}
                disabled={saveBusy || !deviceColumnsSupported}
              />
            </label>
            {!deviceColumnsSupported ? (
              <p className="muted huolto-span-all">Merkki, kylmäaine ja asennuspäivä muokattavissa tietokantapäivityksen jälkeen.</p>
            ) : null}
            <label className="huolto-span-all">
              Huomiot
              <textarea
                rows={3}
                value={editDraft.notes}
                onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                disabled={saveBusy}
              />
            </label>
            <div className="form-actions huolto-span-all">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saveBusy}
                onClick={() => {
                  setInfoEditing(false);
                  setEditDraft(null);
                }}
              >
                Peruuta
              </button>
              <button type="submit" className="btn btn-primary" disabled={saveBusy}>
                {saveBusy ? 'Tallennetaan…' : 'Tallenna'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="detail-list">
              <div>
                <dt>Laite</dt>
                <dd>{equipment.name}</dd>
              </div>
              <div>
                <dt>Tunniste</dt>
                <dd>{equipment.tag || '—'}</dd>
              </div>
              <div>
                <dt>Tyyppi</dt>
                <dd>{deviceTypeLabel(equipment.device_type)}</dd>
              </div>
              <div>
                <dt>Malli</dt>
                <dd>{equipment.model || '—'}</dd>
              </div>
              <div>
                <dt>Sarjanumero</dt>
                <dd>{equipment.serial_number || '—'}</dd>
              </div>
              <div>
                <dt>Sijainti</dt>
                <dd>{equipment.location || '—'}</dd>
              </div>
              <div>
                <dt>Merkki</dt>
                <dd>{shownFields.manufacturer || '—'}</dd>
              </div>
              <div>
                <dt>Kylmäaine</dt>
                <dd>{formatRefrigerant(shownFields) || '—'}</dd>
              </div>
              <div>
                <dt>Asennuspäivä</dt>
                <dd>{shownFields.installed_on ? new Date(shownFields.installed_on).toLocaleDateString('fi-FI') : '—'}</dd>
              </div>
              {decommissionedOn ? (
                <div>
                  <dt>Tila</dt>
                  <dd data-testid="decommissioned-status">
                    <span className="device-removed-badge">Poistettu käytöstä</span> {formatMaintenanceDateFi(decommissionedOn)}
                  </dd>
                </div>
              ) : null}
              {!decommissionedOn ? (
              <div>
                <dt>Huolto</dt>
                <dd>
                  {schedule.serviceIntervalMonths} kk
                  {schedule.service.dueYmd ? ` · seuraava ${formatMaintenanceDateFi(schedule.service.dueYmd)}` : ''}
                  {' · '}
                  <span data-testid="service-status">{serviceStatusText(schedule.service, todayYmdLocal()).label}</span>
                </dd>
              </div>
              ) : null}
              {!decommissionedOn ? (
              <div>
                <dt>Vuototarkastus</dt>
                <dd>
                  CO₂e {formatTonnes(schedule.leak.co2eTonnes)} ·{' '}
                  {schedule.leak.intervalMonths
                    ? `${schedule.leak.intervalMonths} kk${schedule.leak.dueYmd ? ` · seuraava ${formatMaintenanceDateFi(schedule.leak.dueYmd)}` : ''}`
                    : 'ei vaadita'}
                  {leakStatusText(schedule.leak, todayYmdLocal()) ? ` · ${leakStatusText(schedule.leak, todayYmdLocal())!.label}` : ''}
                  {schedule.combineHint ? <small className="muted"> · tee huollon yhteydessä</small> : null}
                </dd>
              </div>
              ) : null}
              <div>
                <dt>Huomiot</dt>
                <dd>{equipment.notes || '—'}</dd>
              </div>
            </dl>
            {canWrite ? (
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={openInfoEdit}>
                  Muokkaa
                </button>
                {canDecommission && decommissionedOn ? (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={decommissionBusy} onClick={() => void changeDecommission(null)}>
                    Palauta käyttöön
                  </button>
                ) : null}
                {canDecommission && !decommissionedOn ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setDecommissionError(null);
                      setDecommissionOpen(true);
                    }}
                  >
                    Poista käytöstä
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="panel customer-section" data-testid="device-history">
        <div className="device-notes-head">
          <h2 className="customer-section-title">Huoltohistoria</h2>
        </div>
        {historyRows.length === 0 ? (
          <p className="muted">Ei merkintöjä.</p>
        ) : (
          <ul className="device-history-list">
            {historyRows.map((r) => {
              const body = (
                <>
                  <strong>{r.date}</strong>
                  <span className="device-history-text">{r.text}</span>
                  {r.status ? <span className="device-notes-badge">{r.status}</span> : null}
                </>
              );
              return (
                <li key={r.key}>
                  {r.href ? (
                    <Link to={r.href} className="device-history-row" {...withNavTrail(trail)}>{body}</Link>
                  ) : (
                    <div className="device-history-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!portalMode ? (
          <DeviceNotesPanel
            session={session}
            equipmentId={equipment.id}
            notes={equipmentNotes}
            canAdd
            bare
            showList={false}
            onAdded={() => void loadEquipmentNotes(supabase, { customerId: customer.id }).then(setEquipmentNotes)}
          />
        ) : null}
      </section>

      {!portalMode ? (
        <DeviceQrPanel equipmentId={equipment.id} name={equipment.name} tag={equipment.tag} canWrite={canWrite} />
      ) : null}

      {documents.some((d) => d.kind === 'file') ? (
        <section className="panel customer-section">
          <h2 className="customer-section-title">Tiedostot</h2>
          <ul className="device-history-list">
            {documents.filter((d) => d.kind === 'file').map((d) => (
              <li key={d.id}><a className="device-history-row" href={d.href} target="_blank" rel="noreferrer">{d.title}</a></li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppLayout>
  );
}
