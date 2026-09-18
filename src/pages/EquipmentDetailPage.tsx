import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { CustomerDocumentGrid, CustomerDocumentTile } from '../components/CustomerDocumentTile';
import EquipmentSnapshotTileView from '../components/equipment/EquipmentSnapshotTileView';
import { DeviceCardIcon, HistoryIcon } from '../components/PrintIcons';
import Tooltip from '../components/Tooltip';
import { WorkReportSectionTile, WorkReportSectionTileGrid } from '../components/WorkReportSectionTile';
import WorkReportSectionDialog from '../components/WorkReportSectionDialog';
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
  buildMaintenanceHistoryForEquipment,
  buildMaintenanceHistoryPrintHtml,
  formatMaintenanceDateFi,
  loadCustomerMaintenanceContext,
} from '../lib/equipmentMaintenanceHistory';
import {
  EQUIPMENT_SECTION_COLORS,
  equipmentDocumentsSubtitle,
  equipmentInfoSubtitle,
  equipmentSnapshotSubtitle,
} from '../lib/equipmentSectionHelpers';
import { loadCustomerLinkedDocuments, type CustomerLinkedDocument } from '../lib/customerDocuments';
import { deviceTypes } from '../lib/huoltoRaportti/constants';
import { deviceTypeLabel, parseEquipmentSnapshot } from '../lib/huoltoRaportti/equipmentSnapshotDisplay';
import { customerDetailTrail, equipmentDetailTrail, withNavTrail } from '../lib/navigationTrail';
import { openPrintHtml } from '../lib/openPrintWindow';
import { supabase } from '../lib/supabase';
import { isPortalUser } from '../lib/portalWorkOrder';
import { useProfile } from '../hooks/useProfile';
import type { Customer, Equipment, Partnership } from '../types';

interface Props {
  session: Session;
}

type EquipmentSectionDialog = 'info' | 'snapshot' | 'documents';

type EquipmentEditDraft = {
  name: string;
  tag: string;
  model: string;
  serial_number: string;
  location: string;
  device_type: string;
  notes: string;
};

function equipmentTitle(eq: Pick<Equipment, 'tag' | 'name'>): string {
  return eq.tag ? `${eq.tag} — ${eq.name}` : eq.name;
}

function draftFromEquipment(eq: Equipment): EquipmentEditDraft {
  return {
    name: eq.name ?? '',
    tag: eq.tag ?? '',
    model: eq.model ?? '',
    serial_number: eq.serial_number ?? '',
    location: eq.location ?? '',
    device_type: eq.device_type ?? '',
    notes: eq.notes ?? '',
  };
}

export default function EquipmentDetailPage({ session }: Props) {
  const { customerId, equipmentId } = useParams<{ customerId: string; equipmentId: string }>();
  const { profile } = useProfile(session);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [infoEditing, setInfoEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EquipmentEditDraft | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<CustomerLinkedDocument[]>([]);
  const [maintenanceRows, setMaintenanceRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['maintenanceRows']
  >([]);
  const [workRows, setWorkRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['workRows']
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState<'card' | 'history' | null>(null);
  const [sectionDialog, setSectionDialog] = useState<EquipmentSectionDialog | null>(null);

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
    setWorkRows(maintenanceContext.workRows);
    setLoading(false);
  }

  const latestMaintenanceByEquipment = useMemo(
    () => (equipment ? buildLatestMaintenanceByEquipment([equipment], maintenanceRows) : {}),
    [equipment, maintenanceRows],
  );

  const snapshot = useMemo(
    () => parseEquipmentSnapshot(equipment?.huolto_technical_snapshot),
    [equipment?.huolto_technical_snapshot],
  );

  const latestMaintenanceYmd = equipment ? latestMaintenanceByEquipment[equipment.id] ?? null : null;

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
      const entries = buildMaintenanceHistoryForEquipment(equipment, maintenanceRows, workRows);
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

  function closeSectionDialog() {
    setSectionDialog(null);
    setInfoEditing(false);
    setEditDraft(null);
  }

  function openInfoEdit() {
    if (!equipment || !canWrite) return;
    setEditDraft(draftFromEquipment(equipment));
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
    };
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
    setEditDraft(draftFromEquipment(updated));
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
  const trail = equipmentDetailTrail(customer.id, customer.name, title);
  const portalMode = isPortalUser(profile);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/asiakkaat">Asiakkaat</Link> /{' '}
            <Link to={`/asiakkaat/${customer.id}`}>{customer.name}</Link> / {title}
          </p>
          <h1>{title}</h1>
          <p className="muted">
            {deviceTypeLabel(equipment.device_type)} • {customerAddressLine(customer)}
            {equipment.location ? ` • ${equipment.location}` : ''}
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
          {!portalMode && (
            <Link
              to={`/huoltoraportit/uusi?customerId=${customer.id}&equipmentId=${equipment.id}`}
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

      <WorkReportSectionTileGrid>
        <WorkReportSectionTile
          title="Laiteperustiedot"
          subtitle={equipmentInfoSubtitle(equipment, latestMaintenanceYmd)}
          color={EQUIPMENT_SECTION_COLORS.info}
          active={sectionDialog === 'info'}
          onClick={() => setSectionDialog('info')}
        />
        <WorkReportSectionTile
          title="Kiinteät laitetiedot"
          subtitle={equipmentSnapshotSubtitle(snapshot)}
          color={EQUIPMENT_SECTION_COLORS.snapshot}
          active={sectionDialog === 'snapshot'}
          onClick={() => setSectionDialog('snapshot')}
        />
        <WorkReportSectionTile
          title={`Dokumentit (${documents.length})`}
          subtitle={equipmentDocumentsSubtitle(documents)}
          color={EQUIPMENT_SECTION_COLORS.documents}
          active={sectionDialog === 'documents'}
          onClick={() => setSectionDialog('documents')}
        />
      </WorkReportSectionTileGrid>

      <WorkReportSectionDialog open={sectionDialog === 'info'} title="Laiteperustiedot" onClose={closeSectionDialog}>
        {infoEditing && editDraft ? (
          <form className="line-form-grid" onSubmit={(event) => void saveEquipmentBasics(event)}>
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
                <dt>Asiakas</dt>
                <dd>
                  <Link to={`/asiakkaat/${customer.id}`} {...withNavTrail(customerDetailTrail(customer.id, customer.name))}>
                    {customer.name}
                  </Link>
                </dd>
              </div>
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
                <dt>Viimeisin huolto</dt>
                <dd>{latestMaintenanceYmd ? formatMaintenanceDateFi(latestMaintenanceYmd) : '—'}</dd>
              </div>
              <div>
                <dt>Huomiot</dt>
                <dd>{equipment.notes || '—'}</dd>
              </div>
            </dl>
            {canWrite ? (
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={openInfoEdit}>
                  Muokkaa
                </button>
              </div>
            ) : null}
          </>
        )}
      </WorkReportSectionDialog>

      <WorkReportSectionDialog
        open={sectionDialog === 'snapshot'}
        title="Kiinteät laitetiedot"
        onClose={closeSectionDialog}
        wide
      >
        {snapshot ? (
          <EquipmentSnapshotTileView snapshot={snapshot} />
        ) : (
          <p className="muted">
            Ei vielä tallennettua teknistä tilannekuvaa. Tiedot päivittyvät, kun huoltopöytäkirja tallentaa laiterekisteriin.
          </p>
        )}
      </WorkReportSectionDialog>

      <WorkReportSectionDialog
        open={sectionDialog === 'documents'}
        title={`Dokumentit (${documents.length})`}
        onClose={closeSectionDialog}
        wide
      >
        <p className="muted">Tälle laitteelle kohdistetut työraportit, huoltoraportit ja tarjouspyynnöt.</p>
        {documents.length === 0 ? (
          <p className="muted">Ei tälle laitteelle kohdistettuja raportteja tai tarjouksia.</p>
        ) : (
          <CustomerDocumentGrid>
            {documents.map((doc) => (
              <CustomerDocumentTile key={`${doc.kind}:${doc.id}`} document={doc} />
            ))}
          </CustomerDocumentGrid>
        )}
      </WorkReportSectionDialog>
    </AppLayout>
  );
}
