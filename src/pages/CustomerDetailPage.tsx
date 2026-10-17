import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { newHuoltoReportHref } from '../lib/huoltoCategories';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { CustomerDocumentTable } from '../components/CustomerDocumentTile';
import { CustomerEquipmentTable } from '../components/CustomerEquipmentTile';
import { HistoryIcon, PrinterIcon } from '../components/PrintIcons';
import Tooltip from '../components/Tooltip';
import ToggleSwitch from '../components/ToggleSwitch';
import SubscriberPicker from '../components/SubscriberPicker';
import CollapsibleSection from '../components/CollapsibleSection';
import CustomerPortalSection from '../components/CustomerPortalSection';
import CustomerSummaryStrip from '../components/CustomerSummaryStrip';
import WorkReportSectionDialog from '../components/WorkReportSectionDialog';
import {
  isCustomerExplicitlySharedWithPartner,
  isCustomerReportLinkedWithPartner,
  isCustomerVisibleToPartner,
  loadCustomerSharingByPartnerships,
  setCustomerSharedWithPartner,
  type CustomerSharingState,
} from '../lib/customerPartnerAccess';
import {
  CUSTOMER_SELECT,
  EQUIPMENT_SELECT,
  canEditCustomersAsStaff,
  customerAddressLine,
} from '../lib/customers';
import { updateRegistryCustomer } from '../lib/updateRegistryCustomer';
import { loadSubscribersForOwner, subscriberLabel } from '../lib/subscribers';
import { canDeleteCompanyOwnedEntity } from '../lib/deletePermissions';
import {
  partnershipModuleAccess,
  partnershipPermissionsForUs,
} from '../lib/management';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import {
  buildEquipmentCardPrintHtml,
  buildLatestMaintenanceByEquipment,
  buildMaintenanceHistoryForEquipment,
  buildMaintenanceHistoryPrintHtml,
  buildMaintenanceHistorySectionsForEquipmentList,
  equipmentLabel,
  formatMaintenanceDateFi,
  loadCustomerMaintenanceContext,
} from '../lib/equipmentMaintenanceHistory';
import { buildEquipmentListPrintHtml } from '../lib/equipmentListPrintHtml';
import { openPrintHtml } from '../lib/openPrintWindow';
import { isPortalUser } from '../lib/portalWorkOrder';
import { supabase } from '../lib/supabase';
import { effectiveDeviceFields, loadEquipmentDeviceFields, type EquipmentDeviceFields } from '../lib/equipmentDeviceFields';
import { customerDetailTrail, withNavTrail } from '../lib/navigationTrail';
import {
  loadCustomerLinkedDocuments,
  type CustomerLinkedDocument,
} from '../lib/customerDocuments';
import { useProfile } from '../hooks/useProfile';
import type { Customer, Equipment, Partnership, Subscriber } from '../types';

interface Props {
  session: Session;
}

type CustomerSectionDialog = 'info' | 'portal' | 'sharing' | 'equipment' | 'documents';

type ShareablePartner = {
  partnership: Partnership;
  sharing: CustomerSharingState;
};

function partnershipGrantsRegistryAccess(raw: unknown) {
  return (
    partnershipModuleAccess(raw, 'customers', 'read')
    || partnershipModuleAccess(raw, 'work_reports', 'write')
    || partnershipModuleAccess(raw, 'maintenance_reports', 'write')
  );
}

export default function CustomerDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useProfile(session);
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [documents, setDocuments] = useState<CustomerLinkedDocument[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState<CustomerSectionDialog | null>(null);
  const [infoEditing, setInfoEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    business_id: '',
    notes: '',
    subscriber_id: '',
  });
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [newEquipment, setNewEquipment] = useState({ name: '', tag: '', model: '', serial_number: '', location: '' });
  const [showNewEquipment, setShowNewEquipment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareablePartners, setShareablePartners] = useState<ShareablePartner[]>([]);
  const [ownerCustomerIds, setOwnerCustomerIds] = useState<string[]>([]);
  const [sharingBusyId, setSharingBusyId] = useState<string | null>(null);
  const [maintenanceRows, setMaintenanceRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['maintenanceRows']
  >([]);
  const [workRows, setWorkRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['workRows']
  >([]);
  const [printBusyId, setPrintBusyId] = useState<string | null>(null);
  const [equipmentDeviceFields, setEquipmentDeviceFields] = useState<Map<string, EquipmentDeviceFields> | null>(null);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(() => new Set());
  const [printingHistory, setPrintingHistory] = useState(false);
  const [printingEquipmentList, setPrintingEquipmentList] = useState(false);

  useEffect(() => {
    if (id) void load();
  }, [id, profile?.company_id]);

  useEffect(() => {
    if (!customer || location.hash !== '#customer-portal') return;
    setSectionDialog('portal');
    navigate(`${location.pathname}${location.search}`, { replace: true });
  }, [customer, location.hash, location.pathname, location.search, navigate]);

  async function loadPartnerships() {
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
    if (!id) return;
    setLoading(true);
    setError(null);

    const partnershipRows = await loadPartnerships();

    const { data: customerRow, error: customerError } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (customerError || !customerRow) {
      setError(customerError?.message ?? 'Asiakasta ei löytynyt tai ei oikeuksia.');
      setCustomer(null);
      setLoading(false);
      return;
    }

    const c = customerRow as unknown as Customer;
    setCustomer(c);
    setCanWrite(canEditCustomersAsStaff(profile, c.owner_company_id, profile?.company_id, partnershipRows));
    setForm({
      name: c.name,
      address: c.address ?? '',
      postal_code: c.postal_code ?? '',
      city: c.city ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      business_id: c.business_id ?? '',
      notes: c.notes ?? '',
      subscriber_id: c.subscriber_id ?? '',
    });

    if (c.owner_company_id === profile?.company_id) {
      try {
        setSubscribers(await loadSubscribersForOwner(supabase, c.owner_company_id));
      } catch {
        setSubscribers([]);
      }
    } else {
      setSubscribers([]);
    }

    const [{ data: equipmentRows }, linkedDocuments, maintenanceContext] = await Promise.all([
      supabase.from('equipment').select(EQUIPMENT_SELECT).eq('customer_id', id).order('name'),
      loadCustomerLinkedDocuments(supabase, id, { portalReadOnly: isPortalUser(profile) }),
      loadCustomerMaintenanceContext(supabase, id),
    ]);

    setEquipment((equipmentRows as Equipment[]) ?? []);
    void loadEquipmentDeviceFields(supabase, ((equipmentRows as Equipment[]) ?? []).map((eq) => eq.id)).then(setEquipmentDeviceFields);
    setDocuments(linkedDocuments);
    setMaintenanceRows(maintenanceContext.maintenanceRows);
    setWorkRows(maintenanceContext.workRows);

    if (profile?.company_id && c.owner_company_id === profile.company_id) {
      const grantable = partnershipRows.filter((partnership) => {
        const grantField = partnershipPermissionsForUs(partnership, profile.company_id!);
        if (!grantField) return false;
        return partnershipGrantsRegistryAccess(partnership[grantField]);
      });
      const [{ data: ownCustomerRows }, sharingByPartnership] = await Promise.all([
        supabase.from('customers').select('id').eq('owner_company_id', profile.company_id).order('name'),
        loadCustomerSharingByPartnerships(
          supabase,
          profile.company_id,
          grantable.map((partnership) => ({
            id: partnership.id,
            partnerCompanyId:
              partnership.company_a_id === profile.company_id
                ? partnership.company_b_id
                : partnership.company_a_id,
          })),
        ),
      ]);
      setOwnerCustomerIds((ownCustomerRows ?? []).map((row) => row.id as string));
      setShareablePartners(
        grantable.map((partnership) => ({
          partnership,
          sharing: sharingByPartnership[partnership.id] ?? {
            restricted: true,
            sharedCustomerIds: [],
            reportLinkedCustomerIds: [],
          },
        })),
      );
    } else {
      setShareablePartners([]);
      setOwnerCustomerIds([]);
    }

    setLoading(false);
  }

  async function togglePartnerSharing(partnershipId: string, shared: boolean) {
    if (!customer || !profile?.company_id || customer.owner_company_id !== profile.company_id) return;

    setSharingBusyId(partnershipId);
    setError(null);
    try {
      const entry = shareablePartners.find((row) => row.partnership.id === partnershipId);
      if (!entry) return;
      const result = await setCustomerSharedWithPartner(
        supabase,
        partnershipId,
        customer.id,
        shared,
        entry.sharing,
        ownerCustomerIds,
      );
      if (!result.changed) {
        if (result.reason === 'report_linked') {
          setError('Asiakas näkyy kumppanille raportin vuoksi — jakoa ei voi poistaa.');
        }
        return;
      }
      setMessage(shared ? 'Asiakas jaettu kumppanille.' : 'Asiakas piilotettu kumppanilta.');
      await load();
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Jaetun asiakkaan tallennus epäonnistui.');
    } finally {
      setSharingBusyId(null);
    }
  }

  async function saveCustomer(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    if (!canWrite) {
      setError('Sinulla ei ole oikeutta muokata asiakastietoja.');
      return;
    }
    if (!form.name.trim()) {
      setError('Asiakkaan nimi on pakollinen.');
      return;
    }

    setBusy(true);
    setError(null);

    const isOwner = customer.owner_company_id === profile?.company_id;

    const { customer: updated, error: updateError } = await updateRegistryCustomer(supabase, {
      customerId: customer.id,
      name: form.name,
      address: form.address.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      business_id: form.business_id.trim() || null,
      notes: form.notes.trim() || null,
      subscriberId: form.subscriber_id || null,
      touchSubscriberId: isOwner,
    });

    setBusy(false);
    if (updateError || !updated) {
      setError(updateError ?? 'Asiakkaan tallennus epäonnistui.');
      return;
    }

    if (isOwner) {
      const subscriberId = form.subscriber_id || null;
      await Promise.all([
        supabase.from('maintenance_reports').update({ subscriber_id: subscriberId }).eq('customer_id', customer.id),
        supabase.from('work_reports').update({ subscriber_id: subscriberId }).eq('customer_id', customer.id),
        supabase.from('quote_requests').update({ subscriber_id: subscriberId }).eq('customer_id', customer.id),
      ]);
    }

    setMessage('Asiakastiedot tallennettu.');
    setInfoEditing(false);
    setSectionDialog(null);
    await load();
  }

  async function addEquipment(e: FormEvent) {
    e.preventDefault();
    if (!customer || !canWrite || !newEquipment.name.trim()) return;

    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('equipment').insert({
      owner_company_id: customer.owner_company_id,
      customer_id: customer.id,
      name: newEquipment.name.trim(),
      tag: newEquipment.tag.trim() || null,
      model: newEquipment.model.trim() || null,
      serial_number: newEquipment.serial_number.trim() || null,
      location: newEquipment.location.trim() || null,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage('Laite lisätty.');
    setNewEquipment({ name: '', tag: '', model: '', serial_number: '', location: '' });
    setShowNewEquipment(false);
    await load();
  }

  async function deleteCustomer() {
    if (!customer) return;
    const equipmentCount = equipment.length;
    const warning = equipmentCount > 0
      ? `Asiakkaalla on ${equipmentCount} laitetta, jotka poistetaan samalla. `
      : '';
    if (!window.confirm(`${warning}Poistetaanko asiakas pysyvästi? Tätä toimintoa ei voi perua.`)) return;

    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', customer.id);
    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/asiakkaat');
  }

  async function loadPrintBranding(ownerCompanyId: string) {
    const { data } = await supabase
      .from('companies')
      .select('name, logo_url')
      .eq('id', ownerCompanyId)
      .single();
    const row = data as { name: string; logo_url: string | null } | null;
    let logoUrl: string | null = null;
    try {
      logoUrl = await resolveCompanyLogoUrl(row?.logo_url);
    } catch {
      logoUrl = null;
    }
    return {
      companyName: row?.name?.trim() || customer?.name || '—',
      logoUrl,
    };
  }

  async function printEquipmentCard(eq: Equipment) {
    if (!customer) return;
    setPrintBusyId(`card:${eq.id}`);
    setError(null);
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      const html = buildEquipmentCardPrintHtml({
        customerName: customer.name,
        equipment: eq,
        latestMaintenanceYmd: latestMaintenanceByEquipment[eq.id] ?? null,
        branding,
      });
      openPrintHtml(html);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Laitekortin tulostus epäonnistui.');
    } finally {
      setPrintBusyId(null);
    }
  }

  async function printEquipmentHistory(eq: Equipment) {
    if (!customer) return;
    setPrintBusyId(`history:${eq.id}`);
    setError(null);
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      const entries = buildMaintenanceHistoryForEquipment(eq, maintenanceRows, workRows);
      const html = buildMaintenanceHistoryPrintHtml({
        customerName: customer.name,
        sections: [{ deviceLabel: equipmentLabel(eq), entries }],
        branding,
      });
      openPrintHtml(html);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Huoltohistorian tulostus epäonnistui.');
    } finally {
      setPrintBusyId(null);
    }
  }

  function toggleEquipmentSelection(equipmentId: string, checked: boolean) {
    setSelectedEquipmentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(equipmentId);
      else next.delete(equipmentId);
      return next;
    });
  }

  async function printMaintenanceHistoryForEquipmentList(mode: 'all' | 'selected') {
    if (!customer) return;
    const list = mode === 'all' ? equipment : equipment.filter((eq) => selectedEquipmentIds.has(eq.id));
    if (list.length === 0) {
      setError(
        mode === 'selected'
          ? 'Valitse vähintään yksi laite (valintaruutu).'
          : 'Ei laitteita huoltohistoriaan.',
      );
      return;
    }

    setPrintingHistory(true);
    setError(null);
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      const sections = buildMaintenanceHistorySectionsForEquipmentList(list, maintenanceRows, workRows);
      openPrintHtml(
        buildMaintenanceHistoryPrintHtml({
          customerName: customer.name,
          sections,
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Huoltohistorian tulostus epäonnistui.');
    } finally {
      setPrintingHistory(false);
    }
  }

  async function printEquipmentList(mode: 'all' | 'selected') {
    if (!customer) return;
    const list = mode === 'all' ? equipment : equipment.filter((eq) => selectedEquipmentIds.has(eq.id));
    if (list.length === 0) {
      setError(
        mode === 'selected'
          ? 'Valitse vähintään yksi laite (valintaruutu).'
          : 'Ei laitteita luetteloon.',
      );
      return;
    }

    setPrintingEquipmentList(true);
    setError(null);
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      openPrintHtml(
        buildEquipmentListPrintHtml({
          customerName: customer.name,
          equipment: list,
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Laiteluettelon tulostus epäonnistui.');
    } finally {
      setPrintingEquipmentList(false);
    }
  }

  async function deleteEquipmentItem(equipmentId: string, equipmentName: string) {
    if (!customer) return;
    if (!window.confirm(`Poistetaanko laite "${equipmentName}" pysyvästi?`)) return;

    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from('equipment').delete().eq('id', equipmentId);
    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage('Laite poistettu.');
    await load();
  }

  const latestMaintenanceByEquipment = useMemo(
    () => buildLatestMaintenanceByEquipment(equipment, maintenanceRows),
    [equipment, maintenanceRows],
  );

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Asiakasta ei löytynyt.'}</p>
        <Link to="/asiakkaat" className="btn btn-secondary">← Takaisin</Link>
      </AppLayout>
    );
  }

  const canDeleteRegistry = canDeleteCompanyOwnedEntity(
    customer.owner_company_id,
    profile?.company_id,
    profile?.role,
    profile?.is_global_admin,
  );


  const managesRegistry = Boolean(
    customer && profile?.company_id && customer.owner_company_id === profile.company_id,
  );
  /** Asiakasportaalin luonti: oma rekisteri tai asiakashallinnan oikeus (kumppani / globaali admin). */
  const canManagePortal = managesRegistry || (canWrite && (profile?.role === 'admin' || profile?.is_global_admin === true));

  async function loadRegistrySubscribers(ownerCompanyId: string) {
    try {
      setSubscribers(await loadSubscribersForOwner(supabase, ownerCompanyId));
    } catch {
      setSubscribers([]);
    }
  }

  function openCustomerEdit() {
    if (!customer) return;
    setSectionDialog('info');
    setInfoEditing(true);
    if (managesRegistry) {
      void loadRegistrySubscribers(customer.owner_company_id);
    }
  }

  const sharedPartnerCount = shareablePartners.filter(({ sharing }) =>
    isCustomerVisibleToPartner(sharing, customer.id),
  ).length;
  const equipmentNavTrail = withNavTrail(customerDetailTrail(customer.id, customer.name));

  function closeSectionDialog() {
    setSectionDialog(null);
    setInfoEditing(false);
    setShowNewEquipment(false);
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/asiakkaat">Asiakkaat</Link> / {customer.name}
          </p>
          <h1>{customer.name}</h1>
          {!canWrite ? <p className="muted">Vain luku</p> : null}
        </div>
        {canWrite && (
          <div className="page-header-actions">
            {huolto.loaded && huolto.access.moduleEnabled ? (
              <Link
                to={newHuoltoReportHref(huolto.access, `customerId=${customer.id}`)}
                className="btn btn-primary"
                {...withNavTrail(customerDetailTrail(customer.id, customer.name))}
              >
                + Uusi huoltoraportti
              </Link>
            ) : null}
            {canManagePortal && (
              <button type="button" className="btn btn-secondary" onClick={() => setSectionDialog('portal')}>
                Asiakasportaali
              </button>
            )}
            {managesRegistry && shareablePartners.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setSectionDialog('sharing')}>
                Kumppanijako ({sharedPartnerCount}/{shareablePartners.length})
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <CustomerSummaryStrip
        equipmentCount={equipment.length}
        documents={documents}
      />

      <CollapsibleSection
        variant="plain"
        className="customer-info-panel customer-collapsible"
        title="Asiakastiedot"
        collapseKey="customer:info"
        open={infoOpen || infoEditing}
        onOpenChange={(o) => { setInfoOpen(o); if (!o) setInfoEditing(false); }}
      >
        {infoEditing ? (
          <form className="form-grid" onSubmit={saveCustomer}>
            {managesRegistry ? (
              <SubscriberPicker
                subscribers={subscribers}
                subscriberId={form.subscriber_id}
                disabled={busy}
                hint={
                  subscribers.length === 0 ? (
                    <>
                      Lisää tilaajia kohdassa{' '}
                      <Link to="/hallinta/tilaajat">Yrityksen hallinta → Tilaajaportaali</Link>.
                    </>
                  ) : (
                    'Linkitä kohde tilaajaan — tilaaja näkee kohteen raportit, laitteet ja voi lähettää työtilauksia.'
                  )
                }
                onChange={(id) => setForm((f) => ({ ...f, subscriber_id: id }))}
              />
            ) : canWrite ? (
              <p className="muted">
                Tilaajan voi asettaa vain rekisterin omistaja (
                <strong>{customer.owner_company?.name ?? '—'}</strong>).
              </p>
            ) : null}
            <div className="line-form-grid">
              <label>
                Nimi *
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </label>
              <label>
                Y-tunnus
                <input
                  value={form.business_id}
                  onChange={(e) => setForm((f) => ({ ...f, business_id: e.target.value }))}
                />
              </label>
              <label>
                Postiosoite
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </label>
              <label>
                Postinumero
                <input
                  value={form.postal_code}
                  onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                />
              </label>
              <label>
                Kaupunki
                <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </label>
              <label>
                Puhelin
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label>
                Sähköposti
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
            </div>
            <label>
              Muistiinpanot
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setInfoEditing(false)}>
                Peruuta
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Tallenna
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="detail-list">
              <div>
                <dt>Rekisteri</dt>
                <dd>{customer.owner_company?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Tilaaja</dt>
                <dd>{subscriberLabel(customer.subscriber ?? null)}</dd>
              </div>
              <div>
                <dt>Osoite</dt>
                <dd>{customerAddressLine(customer)}</dd>
              </div>
              <div>
                <dt>Puhelin</dt>
                <dd>{customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt>Sähköposti</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Y-tunnus</dt>
                <dd>{customer.business_id ?? '—'}</dd>
              </div>
              <div>
                <dt>Muistiinpanot</dt>
                <dd>{customer.notes ?? '—'}</dd>
              </div>
            </dl>
            {canWrite ? (
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={openCustomerEdit}>
                  Muokkaa
                </button>
              </div>
            ) : null}
          </>
        )}
      </CollapsibleSection>

      <WorkReportSectionDialog
        open={sectionDialog === 'portal'}
        title="Asiakasportaali"
        onClose={closeSectionDialog}
        wide
      >
        {customer.subscriber_id ? (
          <p className="muted">
            Kohde on linkitetty tilaajaan <strong>{customer.subscriber?.name ?? '—'}</strong>. Monikohteinen
            portaali hallitaan tilaajan kautta —{' '}
            <Link to="/hallinta/tilaajat">Yrityksen hallinta → Tilaajaportaali</Link> → valitse tilaaja → tilaajaportaali.
          </p>
        ) : (
          <CustomerPortalSection
            customerId={customer.id}
            customerName={customer.name}
            companyId={customer.owner_company_id}
            canManage={profile?.role === 'admin' || profile?.is_global_admin === true}
          />
        )}
      </WorkReportSectionDialog>

      <WorkReportSectionDialog
        open={sectionDialog === 'sharing'}
        title="Kumppanijako"
        onClose={closeSectionDialog}
        wide
      >
        <p className="muted">
          Oletus: kumppani ei näe asiakasta. Asiakas avautuu automaattisesti, kun kumppani on laatinut sille
          raportin. Voit jakaa asiakkaan etukäteen raportin luontia varten.
        </p>
        <ul className="report-list compact">
          {shareablePartners.map(({ partnership, sharing }) => {
            const reportLinked = isCustomerReportLinkedWithPartner(sharing, customer.id);
            const explicitlyShared = isCustomerExplicitlySharedWithPartner(sharing, customer.id);
            const visible = isCustomerVisibleToPartner(sharing, customer.id);
            const toggleChecked = sharing.restricted ? explicitlyShared : visible;
            const busyForPartner = sharingBusyId === partnership.id;
            return (
              <li key={partnership.id}>
                <div className="report-link-body">
                  <strong>{partnership.partner_company.name}</strong>
                  <span className="muted">
                    {reportLinked
                      ? 'Näkyy raportin kautta'
                      : explicitlyShared
                        ? 'Jaettu manuaalisesti'
                        : visible
                          ? 'Näkyy kumppanille'
                          : 'Piilotettu'}
                  </span>
                </div>
                {reportLinked ? (
                  <Tooltip label="Kumppani on laatinut raportin — asiakas pysyy näkyvissä automaattisesti.">
                    <span className="partner-customer-picker-badge open">Raportti</span>
                  </Tooltip>
                ) : (
                  <Tooltip label="Salli kumppanin nähdä asiakas ennen raporttia (esim. raportin luontia varten).">
                    <ToggleSwitch
                      checked={toggleChecked}
                      disabled={busyForPartner}
                      label="Jaettu"
                      onChange={(checked) => void togglePartnerSharing(partnership.id, checked)}
                    />
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      </WorkReportSectionDialog>

      <CollapsibleSection
        variant="plain"
        className="customer-section customer-collapsible"
        title={`Laitteet (${equipment.length})`}
        collapseKey="customer:equipment"
      >
        {canWrite && (
          <div className="section-head compact-section-head">
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewEquipment((v) => !v)}>
              {showNewEquipment ? 'Peruuta' : '+ Lisää laite'}
            </button>
          </div>
        )}

        {showNewEquipment && (
          <form className="form-grid nested-form" onSubmit={addEquipment}>
            <div className="line-form-grid">
              <label>
                Nimi *
                <input
                  value={newEquipment.name}
                  onChange={(e) => setNewEquipment((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Tagi
                <input value={newEquipment.tag} onChange={(e) => setNewEquipment((f) => ({ ...f, tag: e.target.value }))} />
              </label>
              <label>
                Malli
                <input
                  value={newEquipment.model}
                  onChange={(e) => setNewEquipment((f) => ({ ...f, model: e.target.value }))}
                />
              </label>
              <label>
                Sarjanumero
                <input
                  value={newEquipment.serial_number}
                  onChange={(e) => setNewEquipment((f) => ({ ...f, serial_number: e.target.value }))}
                />
              </label>
              <label>
                Sijainti
                <input
                  value={newEquipment.location}
                  onChange={(e) => setNewEquipment((f) => ({ ...f, location: e.target.value }))}
                />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Tallenna laite
            </button>
          </form>
        )}

        {equipment.length === 0 ? (
          <p className="muted">Ei laitteita rekisteröitynä.</p>
        ) : (
          <>
            <div className="customer-equipment-bulk-toolbar">
              <ToggleSwitch
                className="customer-equipment-select-all-toggle"
                checked={equipment.length > 0 && selectedEquipmentIds.size === equipment.length}
                onChange={(checked) => {
                  if (checked) {
                    setSelectedEquipmentIds(new Set(equipment.map((e) => e.id)));
                  } else {
                    setSelectedEquipmentIds(new Set());
                  }
                }}
                label="Valitse kaikki laitteet"
              />
              <div className="customer-equipment-bulk-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={printingEquipmentList || equipment.length === 0}
                  onClick={() => void printEquipmentList('all')}
                >
                  <PrinterIcon />
                  {printingEquipmentList ? 'Valmistellaan…' : 'Tulosta laiteluettelo (kaikki)'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={printingEquipmentList || selectedEquipmentIds.size === 0}
                  onClick={() => void printEquipmentList('selected')}
                >
                  <PrinterIcon />
                  {printingEquipmentList ? 'Valmistellaan…' : 'Tulosta laiteluettelo (valitut)'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={printingHistory || equipment.length === 0}
                  onClick={() => void printMaintenanceHistoryForEquipmentList('all')}
                >
                  <HistoryIcon />
                  {printingHistory ? 'Haetaan…' : 'Tulosta huoltohistoria (kaikki)'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={printingHistory || selectedEquipmentIds.size === 0}
                  onClick={() => void printMaintenanceHistoryForEquipmentList('selected')}
                >
                  <HistoryIcon />
                  {printingHistory ? 'Haetaan…' : 'Tulosta huoltohistoria (valitut)'}
                </button>
              </div>
            </div>
            <p className="muted customer-equipment-bulk-hint">
              Valitse laitteet rivin valintaruudulla ja tulosta valittujen huoltohistoria.
            </p>
            <CustomerEquipmentTable
              equipment={equipment}
              deviceFields={(eq) => effectiveDeviceFields(equipmentDeviceFields?.get(eq.id), eq.huolto_technical_snapshot)}
              customerId={customer.id}
              latestMaintenance={(eq) =>
                latestMaintenanceByEquipment[eq.id]
                  ? { raw: latestMaintenanceByEquipment[eq.id], label: formatMaintenanceDateFi(latestMaintenanceByEquipment[eq.id]) }
                  : null}
              selectedIds={selectedEquipmentIds}
              canWrite={canWrite}
              canDelete={canDeleteRegistry}
              busy={busy}
              printBusyId={printBusyId}
              navTrail={equipmentNavTrail}
              onToggleSelected={toggleEquipmentSelection}
              onPrintCard={(eq) => void printEquipmentCard(eq)}
              onPrintHistory={(eq) => void printEquipmentHistory(eq)}
              onDelete={(eq) => void deleteEquipmentItem(eq.id, eq.name)}
            />
          </>
        )}
      </CollapsibleSection>

      {([
        ['work_report', 'Työraportit'],
        ['maintenance_report', 'Huoltoraportit'],
        ['quote_request', 'Tarjouspyynnöt ja laskennat'],
        ['temp_monitor_report', 'Seurantaraportit'],
        ['file', 'Tiedostot'],
      ] as const).map(([kind, label]) => {
        const list = documents.filter((d) => d.kind === kind);
        if (list.length === 0 && (kind === 'temp_monitor_report' || kind === 'file')) return null;
        return (
          <CollapsibleSection
            key={kind}
            variant="plain"
            className="customer-section customer-collapsible"
            title={`${label} (${list.length})`}
            collapseKey={`customer:${kind}`}
          >
            {list.length === 0 ? (
              <p className="muted">Ei vielä.</p>
            ) : (
              <CustomerDocumentTable documents={list} hideKind />
            )}
          </CollapsibleSection>
        );
      })}

      {canDeleteRegistry && (
        <div className="customer-danger-zone">
          <button type="button" className="btn btn-link btn-danger-link" disabled={busy} onClick={() => void deleteCustomer()}>
            Poista asiakas…
          </button>
        </div>
      )}
    </AppLayout>
  );
}
