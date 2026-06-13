import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';
import SubscriberPicker from '../components/SubscriberPicker';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import QuoteIilpDevicesSection from '../components/quoteRequest/QuoteIilpDevicesSection';
import QuoteIilpSiteSection from '../components/quoteRequest/QuoteIilpSiteSection';
import QuoteOptionalItemsSection from '../components/quoteRequest/QuoteOptionalItemsSection';
import QuotePumpDevicesSection from '../components/quoteRequest/QuotePumpDevicesSection';
import QuoteVilpConfigSection from '../components/quoteRequest/QuoteVilpConfigSection';
import QuoteVilpSiteSection from '../components/quoteRequest/QuoteVilpSiteSection';
import QuoteRepairWorkItemsSection from '../components/quoteRequest/QuoteRepairWorkItemsSection';
import { supabase } from '../lib/supabase';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import {
  defaultReportContext,
  loadAccessibleReportCustomers,
  loadReportPartnerships,
  quoteReportOwnerTargets,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';
import {
  loadAccessibleSubscribers,
  resolveSubscriberIdForReport,
} from '../lib/subscribers';
import { partnershipModuleAccess, partnershipPermsActingOnOwner, parseCompanySettings } from '../lib/management';
import { computeKotitalousDeduction, computePumpSizingNeedKw, computeQuoteTotals } from '../lib/quoteRequest/calculations';
import { deliveryFeesFromCompanySettings } from '../lib/quoteRequest/deviceCatalog';
import { setActiveDeviceRegistry, snapshotFromCompanySettings } from '../lib/quoteRequest/deviceRegistryState';
import {
  BUILDING_TYPE_OPTIONS,
  QUOTE_REGION_LABELS,
  QUOTE_SECTION_LABELS,
  QUOTE_TYPE_LABELS,
  QUOTE_TYPE_ORDER,
  QUOTE_VAT_PROFILE_LABELS,
  isPumpQuoteType,
  isRepairQuoteType,
  quoteShowsKotitalousDeduction,
  quoteUsesTravelCost,
  quoteVatPrintNotice,
  vatRateForQuoteProfile,
} from '../lib/quoteRequest/constants';
import {
  applyQuoteTypeChange,
  brandModeOptions,
  createEmptyMaterial,
  createEmptyQuoteRequestData,
  createEmptyWorkItem,
  normalizeQuoteRequestData,
  quoteRequestStoredTitle,
  resolveQuoteDisplayTitle,
  resolveQuoteBrandingCompanyId,
  syncCustomerFieldsToForm,
} from '../lib/quoteRequest/defaults';
import type { QuoteEditSection, QuoteRequestData, QuoteType, QuoteVatProfile } from '../lib/quoteRequest/types';
import { quoteListTrail } from '../lib/navigationTrail';
import { useProfile } from '../hooks/useProfile';
import { useRegisterDraftSaver } from '../hooks/useRegisterDraftSaver';
import { localQuoteDraftKey, writeLocalQuoteDraft } from '../lib/quoteRequestDraftStorage';
import type { Company, Customer, Equipment, Partnership, Subscriber } from '../types';

interface Props {
  session: Session;
}

const SECTIONS: QuoteEditSection[] = ['asiakas', 'kohde', 'tyot', 'hinnoittelu'];

export default function QuoteRequestEditPage({ session }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { profile, loading: profileLoading } = useProfile(session);

  const [quoteId, setQuoteId] = useState<string | null>(id ?? null);
  const [status, setStatus] = useState<'draft' | 'sent'>('draft');
  const [form, setForm] = useState<QuoteRequestData>(() => createEmptyQuoteRequestData());
  const [activeSection, setActiveSection] = useState<QuoteEditSection>('asiakas');
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [ownerCompany, setOwnerCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [subscriberId, setSubscriberId] = useState('');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [reportOwnerCompanyId, setReportOwnerCompanyId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [loadingQuote, setLoadingQuote] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [storedDbTitle, setStoredDbTitle] = useState<string | null>(null);
  const [registryMessage, setRegistryMessage] = useState<string | null>(null);
  const titleMigratedRef = useRef(false);
  const [companySettings, setCompanySettings] = useState<ReturnType<typeof parseCompanySettings> | null>(null);
  const quoteDraftStorageKey = localQuoteDraftKey(quoteId, session.user.id);

  const deliveryFeeMap = useMemo(
    () => deliveryFeesFromCompanySettings(companySettings),
    [companySettings],
  );

  useEffect(() => {
    setActiveDeviceRegistry(snapshotFromCompanySettings(companySettings));
  }, [companySettings]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const reportContext = useMemo(() => {
    if (!profile?.company_id) return defaultReportContext('');
    if (selectedCustomer) {
      return resolveReportContextFromCustomer(selectedCustomer, profile.company_id, partnerships);
    }
    if (reportOwnerCompanyId) {
      return resolveReportContextFromOwner(reportOwnerCompanyId, profile.company_id, partnerships);
    }
    return defaultReportContext(profile.company_id);
  }, [selectedCustomer, reportOwnerCompanyId, profile?.company_id, partnerships]);
  const { contextMode, partnerId, ownerCompanyId } = reportContext;

  const reportOwnerTargets = useMemo(() => {
    if (!profile?.company_id) return [];
    return quoteReportOwnerTargets(
      profile.company_id,
      profile.companies?.name ?? 'Oma rekisteri',
      partnerships,
    );
  }, [profile?.company_id, profile?.companies?.name, partnerships]);

  const reportOwnerName =
    reportOwnerTargets.find((target) => target.companyId === (reportOwnerCompanyId || ownerCompanyId))?.label
    ?? ownerCompany?.name
    ?? profile?.companies?.name
    ?? '—';

  const customersForPicker = useMemo(() => {
    const ownerId = ownerCompanyId || reportOwnerCompanyId || profile?.company_id;
    if (!ownerId) return customers;
    return customers.filter((customer) => customer.owner_company_id === ownerId);
  }, [customers, ownerCompanyId, reportOwnerCompanyId, profile?.company_id]);

  const canEdit = isNew || status === 'draft' || status === 'sent';
  const pumpSizingNeedKw = useMemo(
    () => (isPumpQuoteType(form.type) ? computePumpSizingNeedKw(form) : null),
    [form],
  );
  const totals = useMemo(() => computeQuoteTotals(form, deliveryFeeMap), [form, deliveryFeeMap]);
  const kotitalous = useMemo(() => computeKotitalousDeduction(form), [form]);
  const quoteTypeLabel = QUOTE_TYPE_LABELS[form.type];
  const pageTitle = useMemo(
    () =>
      resolveQuoteDisplayTitle({
        customerName: selectedCustomer?.name,
        quoteTypeLabel,
        storedTitle: storedDbTitle,
      }),
    [selectedCustomer?.name, quoteTypeLabel, storedDbTitle],
  );
  const storedTitle = quoteRequestStoredTitle(selectedCustomer?.name, quoteTypeLabel);
  const brandOptions = useMemo(() => {
    if (!profile?.company_id) return [];
    return brandModeOptions({
      myCompanyId: profile.company_id,
      myCompanyName: profile.companies?.name ?? 'Oma yritys',
      ownerCompanyId: ownerCompanyId || profile.company_id,
      partnerships,
    });
  }, [profile?.company_id, profile?.companies?.name, ownerCompanyId, partnerships]);

  function patchForm(patch: Partial<QuoteRequestData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function changeQuoteType(nextType: QuoteType) {
    if (nextType === form.type) return;
    const crossingFamily =
      isPumpQuoteType(form.type) !== isPumpQuoteType(nextType)
      || isRepairQuoteType(form.type) !== isRepairQuoteType(nextType);
    const hasWork =
      form.workItems.some(
        (w) =>
          w.description.trim() ||
          Number(w.hours) > 0 ||
          (w.materials ?? []).some((m) => m.name.trim()),
      ) || form.materials.some((m) => m.name.trim());
    if (
      crossingFamily
      && hasWork
      && !window.confirm(
        'Vaihdat tarjouksen tyyppiä. Työt ja tarvikkeet säilyvät — tarkista rivit ja ALV-asetus tarpeen mukaan.',
      )
    ) {
      return;
    }
    setForm((prev) => applyQuoteTypeChange(prev, nextType));
  }

  function changeVatProfile(profile: QuoteVatProfile) {
    patchForm({
      quoteVatProfile: profile,
      vatRate: vatRateForQuoteProfile(profile),
    });
  }

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadPartnerships();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!isNew && id) void loadQuote(id);
  }, [id, isNew]);

  useEffect(() => {
    if (!profile?.company_id || profileLoading) return;
    void loadAccessibleCustomers();
  }, [profile?.company_id, partnerships, profileLoading]);

  useEffect(() => {
    if (!profile?.company_id || profileLoading) return;
    void loadAccessibleSubscribers(supabase, profile.company_id, partnerships)
      .then(setSubscribers)
      .catch((err) => console.error('Tilaajien lataus epäonnistui:', err));
  }, [profile?.company_id, partnerships, profileLoading]);

  const subscribersForOwner = useMemo(() => {
    if (!ownerCompanyId) return subscribers;
    return subscribers.filter((s) => s.owner_company_id === ownerCompanyId);
  }, [subscribers, ownerCompanyId]);

  useEffect(() => {
    if (!reportOwnerCompanyId) return;
    void loadOwnerCompany(reportOwnerCompanyId);
  }, [reportOwnerCompanyId]);

  useEffect(() => {
    if (selectedCustomer) {
      setReportOwnerCompanyId(selectedCustomer.owner_company_id);
      return;
    }
    if (reportOwnerCompanyId) return;
    if (profile?.company_id) setReportOwnerCompanyId(profile.company_id);
  }, [selectedCustomer, profile?.company_id, reportOwnerCompanyId]);

  useEffect(() => {
    if (!isNew || loadingQuote || profileLoading || !profile?.company_id || customerId || reportOwnerCompanyId) return;
    setReportOwnerCompanyId(profile.company_id);
  }, [isNew, loadingQuote, profileLoading, profile?.company_id, customerId, reportOwnerCompanyId]);

  useEffect(() => {
    if (!isNew || !ownerCompanyId) return;
    const cid = searchParams.get('customerId');
    const eid = searchParams.get('equipmentId');
    if (cid) setCustomerId(cid);
    if (eid) setEquipmentId(eid);
  }, [isNew, ownerCompanyId, searchParams]);

  useEffect(() => {
    if (!customerId) {
      setEquipment([]);
      if (!searchParams.get('equipmentId')) setEquipmentId('');
      return;
    }
    void loadEquipment(customerId);
  }, [customerId, searchParams]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setForm((prev) => syncCustomerFieldsToForm(prev, selectedCustomer));
    if (selectedCustomer.name && isRepairQuoteType(form.type) && !form.deviceModel && selectedCustomer.name) {
      const eq = equipment.find((item) => item.id === equipmentId);
      if (eq) {
        patchForm({
          deviceBrand: eq.tag ?? '',
          deviceModel: [eq.name, eq.model].filter(Boolean).join(' '),
        });
      }
    }
  }, [selectedCustomer?.id, equipmentId, equipment.length]);

  useEffect(() => {
    if (form.type !== 'ilma-ilma') return;
    if (form.buildingType === 'kerrostalo' && form.iilpPurpose !== 'cooling') {
      patchForm({ iilpPurpose: 'cooling' });
    }
  }, [form.type, form.buildingType, form.iilpPurpose]);

  useEffect(() => {
    if (form.type !== 'ilma-ilma' || !form.iilpBaseInstallEnabled) return;
    const needsFixLaborHours = Number(form.laborHours || 0) !== 0;
    const needsFixWorkRow = form.workItems.some(
      (wi) => wi.description === 'Työ' && Number(wi.hours || 0) !== 0,
    );
    if (!needsFixLaborHours && !needsFixWorkRow) return;
    patchForm({
      laborHours: 0,
      workItems: form.workItems.map((wi) =>
        wi.description === 'Työ' ? { ...wi, hours: 0 } : wi,
      ),
    });
  }, [form.type, form.iilpBaseInstallEnabled, form.laborHours, form.workItems]);

  async function loadPartnerships() {
    if (!profile?.company_id) return;
    const rows = await loadReportPartnerships(supabase, profile.company_id, 'quotes');
    setPartnerships(rows);
  }

  async function loadAccessibleCustomers() {
    if (!profile?.company_id) return;
    try {
      const rows = await loadAccessibleReportCustomers(supabase, profile.company_id, partnerships);
      setCustomers(rows);
    } catch (loadError) {
      console.error(loadError);
      setCustomers([]);
    }
  }

  async function loadOwnerCompany(companyId: string) {
    const { data } = await supabase.from('companies').select('id, name, slug, settings').eq('id', companyId).single();
    setOwnerCompany((data as Company) ?? null);
    setCompanySettings(parseCompanySettings((data as { settings?: unknown } | null)?.settings));
  }

  async function loadEquipment(activeCustomerId: string) {
    const { data, error: loadError } = await supabase
      .from('equipment')
      .select('id, name, tag, customer_id, owner_company_id, model, serial_number, location')
      .eq('customer_id', activeCustomerId)
      .order('name');
    if (loadError) {
      console.error(loadError);
      setEquipment([]);
      return;
    }
    setEquipment((data as Equipment[]) ?? []);
  }

  async function loadQuote(quoteIdToLoad: string) {
    setLoadingQuote(true);
    const { data, error: loadError } = await supabase
      .from('quote_requests')
      .select(`
        id, title, status, data, owner_company_id, created_by_company_id,
        branding_company_id, partnership_id, customer_id, equipment_id, subscriber_id
      `)
      .eq('id', quoteIdToLoad)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Tarjouspyyntöä ei löytynyt.');
      setLoadingQuote(false);
      return;
    }

    const row = data as {
      id: string;
      title: string | null;
      status: 'draft' | 'sent';
      data: QuoteRequestData;
      owner_company_id: string;
      customer_id: string | null;
      equipment_id: string | null;
      subscriber_id: string | null;
    };

    const normalized = normalizeQuoteRequestData(row.data);

    setQuoteId(row.id);
    setStoredDbTitle(row.title);
    titleMigratedRef.current = false;
    setStatus(row.status);
    setForm(normalized);

    let resolvedCustomerId = row.customer_id ?? '';
    if (profile?.company_id) {
      const partnershipRows = await loadReportPartnerships(supabase, profile.company_id, 'quotes');
      setPartnerships(partnershipRows);
      const customerRows = await loadAccessibleReportCustomers(
        supabase,
        profile.company_id,
        partnershipRows,
      );
      setCustomers(customerRows);
      if (!resolvedCustomerId && normalized.legacyCustomerName?.trim()) {
        const legacy = normalized.legacyCustomerName.trim().toLowerCase();
        const match = customerRows.find((entry) => entry.name.trim().toLowerCase() === legacy);
        if (match) resolvedCustomerId = match.id;
      }
    } else {
      await loadAccessibleCustomers();
    }

    setCustomerId(resolvedCustomerId);
    setSubscriberId(row.subscriber_id ?? '');
    setEquipmentId(row.equipment_id ?? '');
    setReportOwnerCompanyId(row.owner_company_id);

    await loadOwnerCompany(row.owner_company_id);
    if (resolvedCustomerId) await loadEquipment(resolvedCustomerId);
    setLoadingQuote(false);
  }

  useEffect(() => {
    if (!quoteId || titleMigratedRef.current || !storedTitle.trim()) return;
    if (!storedDbTitle?.includes(' • ')) return;
    if (storedDbTitle.trim() === storedTitle.trim()) return;
    titleMigratedRef.current = true;
    void supabase.from('quote_requests').update({ title: storedTitle }).eq('id', quoteId).then(({ error: patchError }) => {
      if (!patchError) setStoredDbTitle(storedTitle);
    });
  }, [quoteId, storedDbTitle, storedTitle]);

  async function saveQuote(nextStatus?: 'draft' | 'sent') {
    if (!profile?.company_id || !ownerCompanyId) {
      setError('Profiilista puuttuu yritys.');
      return false;
    }
    if (!customerId) {
      setError('Valitse asiakas.');
      setActiveSection('asiakas');
      return false;
    }
    const hasWorkContent = form.workItems.some(
      (item) =>
        item.description.trim() ||
        Number(item.hours) > 0 ||
        (item.materials ?? []).some((mat) => mat.name.trim()),
    );
    if (!hasWorkContent && !form.laborHours) {
      setError('Lisää vähintään yksi työ tai tarvike.');
      setActiveSection('tyot');
      return false;
    }

    setBusy(true);
    setError(null);

    const partnership = contextMode === 'partner' ? partnerships.find((p) => p.id === partnerId) : null;
    if (contextMode === 'partner') {
      if (!partnership) {
        setError('Valitse kumppanuus, jonka nimissä tarjous laaditaan.');
        setBusy(false);
        return false;
      }
      const partnerPerms = partnershipPermsActingOnOwner(
        partnership,
        profile.company_id,
        ownerCompanyId,
      );
      if (!partnershipModuleAccess(partnerPerms, 'quotes', 'write')) {
        setError(
          'Kumppani ei ole myöntänyt tarjouspyynnön luontioikeutta. Pyydä oikeutta kohdasta Hallinta → Kumppanuudet.',
        );
        setBusy(false);
        return false;
      }
    }

    const brandingCompanyId = resolveQuoteBrandingCompanyId({
      brandMode: form.brandMode,
      myCompanyId: profile.company_id,
      ownerCompanyId,
      partnership: partnership ?? null,
    });

    const rowPayload = {
      owner_company_id: ownerCompanyId,
      created_by_company_id: profile.company_id,
      branding_company_id: brandingCompanyId,
      partnership_id: partnership?.id ?? null,
      customer_id: customerId,
      subscriber_id: resolveSubscriberIdForReport(customerId, subscriberId, customers),
      equipment_id: equipmentId || null,
      title: storedTitle,
      status: nextStatus ?? status,
      data: form,
    };

    if (quoteId) {
      const { error: updateError } = await supabase
        .from('quote_requests')
        .update(rowPayload)
        .eq('id', quoteId);

      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return false;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('quote_requests')
        .insert(rowPayload)
        .select('id')
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? 'Tallennus epäonnistui.');
        setBusy(false);
        return false;
      }

      setQuoteId((data as { id: string }).id);
      navigate(`/tarjouspyynnot/${(data as { id: string }).id}`, { replace: true });
    }

    setStatus(nextStatus ?? status);
    setSavedAt(new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }));
    setBusy(false);
    return true;
  }

  useEffect(() => {
    if (status !== 'draft') return;
    writeLocalQuoteDraft(quoteDraftStorageKey, {
      form,
      customerId,
      equipmentId,
      subscriberId,
      partnerId: reportContext.partnerId,
      contextMode,
    });
  }, [
    form,
    customerId,
    equipmentId,
    subscriberId,
    reportContext.partnerId,
    contextMode,
    status,
    quoteDraftStorageKey,
  ]);

  useRegisterDraftSaver(async () => {
    if (status !== 'draft') return;
    writeLocalQuoteDraft(quoteDraftStorageKey, {
      form,
      customerId,
      equipmentId,
      subscriberId,
      partnerId: reportContext.partnerId,
      contextMode,
    });
    if (customerId) await saveQuote('draft');
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await saveQuote(status === 'sent' ? 'sent' : 'draft');
  }

  function onReportOwnerChange(companyId: string) {
    setReportOwnerCompanyId(companyId);
    setCustomerId('');
    setEquipmentId('');
  }

  async function onCreateCustomer(draft: NewCustomerDraft): Promise<void> {
    if (!profile?.company_id || !draft.name.trim()) {
      setRegistryMessage('Asiakkaan nimi on pakollinen.');
      return;
    }

    const targetCompanyId =
      selectedCustomer?.owner_company_id ?? reportOwnerCompanyId ?? ownerCompanyId ?? profile.company_id;

    if (!reportOwnerTargets.some((target) => target.companyId === targetCompanyId)) {
      setRegistryMessage('Sinulla ei ole oikeutta luoda asiakasta valittuun rekisteriin.');
      return;
    }

    const { customer: created, error: insertError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: targetCompanyId,
      name: draft.name,
      address: draft.address,
      city: draft.city,
      phone: draft.phone,
      subscriberId: subscriberId || null,
    });

    if (insertError || !created) {
      setRegistryMessage(insertError ?? 'Asiakkaan luonti epäonnistui.');
      return;
    }

    setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setCustomerId(created.id);
    setReportOwnerCompanyId(created.owner_company_id);
    await loadOwnerCompany(created.owner_company_id);
    setRegistryMessage(`Asiakas “${created.name}” lisätty rekisteriin.`);
  }

  async function onCreateEquipment(draft: NewEquipmentDraft): Promise<void> {
    if (!customerId || !ownerCompanyId) return;
    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        owner_company_id: ownerCompanyId,
        customer_id: customerId,
        name: draft.name,
        tag: draft.tag || null,
        model: draft.model || null,
        serial_number: draft.serial_number || null,
        location: draft.location || null,
      })
      .select('id, name, tag, customer_id, owner_company_id, model, serial_number, location')
      .single();

    if (insertError || !data) {
      setRegistryMessage(insertError?.message ?? 'Laitteen luonti epäonnistui.');
      return;
    }

    const created = data as Equipment;
    setEquipment((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setEquipmentId(created.id);
    setRegistryMessage(`Laite “${created.name}” lisätty rekisteriin.`);
  }

  if (profileLoading || loadingQuote) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <NavigationBreadcrumb
        items={[
          { label: 'Etusivu', to: '/' },
          { label: 'Tarjouspyyntö', to: '/tarjouspyynnot' },
          { label: isNew ? 'Uusi tarjouspyyntö' : pageTitle },
        ]}
      />

      <div className="page-header">
        <div>
          <h1>{isNew ? 'Uusi tarjouspyyntö' : pageTitle}</h1>
          <p className="muted">
            {ownerCompany?.name ?? reportOwnerName ?? profile?.companies?.name ?? '—'}
            {' • '}
            {QUOTE_TYPE_LABELS[form.type]}
            {status ? ` • ${status === 'draft' ? 'Luonnos' : 'Lähetetty'}` : ''}
            {savedAt ? ` • Tallennettu ${savedAt}` : ''}
            {pumpSizingNeedKw != null
              ? form.type === 'ilma-ilma'
                ? ` • Mitoitus ${pumpSizingNeedKw} kW`
                : ` • Laskettu tehotarve ${pumpSizingNeedKw} kW`
              : ''}
          </p>
        </div>
        <div className="page-header-actions">
          {quoteId && (
            <Link to={`/tarjouspyynnot/${quoteId}/tuloste`} className="btn btn-secondary">
              Tulosta / PDF
            </Link>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {registryMessage && <p className="muted">{registryMessage}</p>}

      <section className="panel quote-type-grid">
        <h2>Tarjouksen tyyppi</h2>
        <div className="quote-type-buttons">
          {QUOTE_TYPE_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              className={form.type === type ? 'quote-type-btn active' : 'quote-type-btn'}
              disabled={!canEdit}
              onClick={() => changeQuoteType(type)}
            >
              {QUOTE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </section>

      <div className="toolbar">
        <div className="tabs">
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              className={activeSection === section ? 'tab active' : 'tab'}
              onClick={() => setActiveSection(section)}
            >
              {QUOTE_SECTION_LABELS[section]}
            </button>
          ))}
        </div>
      </div>

      <form className="panel form-grid quote-form" onSubmit={onSubmit}>
        {activeSection === 'asiakas' && (
          <section className="form-section">
            <h2>Asiakas</h2>
            {!customerId && form.legacyCustomerName?.trim() && (
              <p className="muted quote-legacy-customer-note">
                Tuodussa tiedossa asiakas: <strong>{form.legacyCustomerName.trim()}</strong>. Valitse tai luo
                vastaava asiakas rekisteristä.
              </p>
            )}
            {ownerCompanyId ? (
              <SubscriberPicker
                subscribers={subscribersForOwner}
                subscriberId={subscriberId}
                disabled={!canEdit || busy}
                onChange={setSubscriberId}
              />
            ) : null}

            {!customerId && reportOwnerTargets.length > 1 ? (
              <label>
                Tarjous laaditaan nimissä
                <select
                  value={reportOwnerCompanyId}
                  onChange={(event) => onReportOwnerChange(event.target.value)}
                  disabled={!canEdit || busy}
                >
                  {reportOwnerTargets.map((target) => (
                    <option key={target.companyId} value={target.companyId}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="muted">
                Tarjous laaditaan nimissä: <strong>{reportOwnerName}</strong>
              </p>
            )}

            <CustomerRegistryPicker
              customers={customersForPicker}
              customerId={customerId}
              myCompanyId={profile?.company_id ?? undefined}
              disabled={!canEdit}
              createRegistryName={reportOwnerName}
              brandingName={reportOwnerName}
              busy={busy}
              onSelect={(selectedId) => {
                setCustomerId(selectedId);
                setEquipmentId('');
                const customer = customers.find((entry) => entry.id === selectedId);
                if (customer) {
                  setReportOwnerCompanyId(customer.owner_company_id);
                  void loadOwnerCompany(customer.owner_company_id);
                  if (customer.subscriber_id) setSubscriberId(customer.subscriber_id);
                }
              }}
              onClear={() => {
                setCustomerId('');
                setEquipmentId('');
              }}
              onCreate={onCreateCustomer}
            />
            {customerId && (
              <>
                {form.type !== 'ilma-ilma' ? (
                  <EquipmentRegistryPicker
                    equipment={equipment}
                    equipmentId={equipmentId}
                    disabled={!canEdit}
                    busy={busy}
                    onSelect={setEquipmentId}
                    onClear={() => setEquipmentId('')}
                    onCreate={onCreateEquipment}
                  />
                ) : null}
                <div className="quote-field-grid">
                  <label>
                    Puhelin
                    <input
                      value={form.customerPhone}
                      onChange={(e) => patchForm({ customerPhone: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Sähköposti
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => patchForm({ customerEmail: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Yhteyshenkilö
                    <input
                      value={form.customerContactPerson}
                      onChange={(e) => patchForm({ customerContactPerson: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
              </>
            )}

            {form.type === 'ilma-ilma' && (
              <div className="quote-subsection panel-inset">
                <h3>Kohteen perustiedot</h3>
                <div className="quote-field-grid">
                  <label>
                    Kiinteistön tyyppi
                    <select
                      value={form.buildingType}
                      onChange={(e) => patchForm({ buildingType: e.target.value })}
                      disabled={!canEdit}
                    >
                      {BUILDING_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sijainti
                    <select
                      value={form.region}
                      onChange={(e) =>
                        patchForm({ region: e.target.value as QuoteRequestData['region'] })
                      }
                      disabled={!canEdit}
                    >
                      {(Object.keys(QUOTE_REGION_LABELS) as QuoteRequestData['region'][]).map((key) => (
                        <option key={key} value={key}>
                          {QUOTE_REGION_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <label>
              Brändi tulosteessa
              <select
                value={form.brandMode}
                onChange={(e) => patchForm({ brandMode: e.target.value as QuoteRequestData['brandMode'] })}
                disabled={!canEdit}
              >
                {brandOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {activeSection === 'kohde' && (
          <>
            {form.type === 'ilma-ilma' && (
              <QuoteIilpSiteSection form={form} canEdit={canEdit} onChange={patchForm} />
            )}
            {form.type === 'vesi-ilma' && (
              <QuoteVilpSiteSection form={form} canEdit={canEdit} onChange={patchForm} />
            )}
            {isRepairQuoteType(form.type) && (
              <section className="form-section">
                <h2>Kohde ja laite</h2>
                <div className="line-form-grid">
                  <label>
                    Laitteen merkki
                    <input
                      value={form.deviceBrand}
                      onChange={(e) => patchForm({ deviceBrand: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Laitteen malli
                    <input
                      value={form.deviceModel}
                      onChange={(e) => patchForm({ deviceModel: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
                <label>
                  Vikakuvaus / työnkuvaus
                  <textarea
                    rows={4}
                    value={form.faultDescription}
                    onChange={(e) => patchForm({ faultDescription: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={form.situationReportEnabled}
                    onChange={(e) => patchForm({ situationReportEnabled: e.target.checked })}
                    disabled={!canEdit}
                  />
                  Sisällytä tilanneraportti tulosteeseen
                </label>
                {form.situationReportEnabled && (
                  <>
                    <label>
                      Tilanneraportin otsikko
                      <input
                        value={form.situationReportTitle}
                        onChange={(e) => patchForm({ situationReportTitle: e.target.value })}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Tilanneraportin teksti
                      <textarea
                        rows={4}
                        value={form.situationReportText}
                        onChange={(e) => patchForm({ situationReportText: e.target.value })}
                        disabled={!canEdit}
                      />
                    </label>
                  </>
                )}
              </section>
            )}
            {!isPumpQuoteType(form.type) && !isRepairQuoteType(form.type) && (
              <section className="form-section">
                <p className="muted">Valitse tarjouksen tyyppi ylhäältä.</p>
              </section>
            )}
          </>
        )}

        {activeSection === 'tyot' && isRepairQuoteType(form.type) && (
          <QuoteRepairWorkItemsSection
            form={form}
            canEdit={canEdit}
            equipment={equipment}
            customerSelected={Boolean(customerId)}
            onChange={patchForm}
          />
        )}

        {activeSection === 'tyot' && !isRepairQuoteType(form.type) && (
          <>
            {form.type === 'ilma-ilma' && (
              <QuoteIilpDevicesSection
                form={form}
                canEdit={canEdit}
                feeMap={deliveryFeeMap}
                onChange={patchForm}
              />
            )}
          <section className="form-section">
            <h2>Työt ja tarvikkeet</h2>
            <div className="section-header-row">
              <h3>Työrivit</h3>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => patchForm({ workItems: [...form.workItems, createEmptyWorkItem()] })}
                >
                  + Lisää työ
                </button>
              )}
            </div>
            {form.workItems.map((item, index) => (
              <div key={item.id} className="quote-line-row panel-inset">
                <div className="quote-line-head">
                  <strong>Työ {index + 1}</strong>
                  {canEdit && form.workItems.length > 1 && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        patchForm({ workItems: form.workItems.filter((row) => row.id !== item.id) })
                      }
                    >
                      Poista
                    </button>
                  )}
                </div>
                <label>
                  Kuvaus
                  <input
                    value={item.description}
                    onChange={(e) =>
                      patchForm({
                        workItems: form.workItems.map((row) =>
                          row.id === item.id ? { ...row, description: e.target.value } : row,
                        ),
                      })
                    }
                    disabled={!canEdit}
                  />
                </label>
                <div className="line-form-grid">
                  <label>
                    Tunnit
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={item.hours}
                      onChange={(e) =>
                        patchForm({
                          workItems: form.workItems.map((row) =>
                            row.id === item.id ? { ...row, hours: Number(e.target.value) } : row,
                          ),
                        })
                      }
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Tuntihinta (€)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.pricePerHour}
                      onChange={(e) =>
                        patchForm({
                          workItems: form.workItems.map((row) =>
                            row.id === item.id ? { ...row, pricePerHour: Number(e.target.value) } : row,
                          ),
                        })
                      }
                      disabled={!canEdit}
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="section-header-row">
              <h3>Tarvikkeet</h3>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => patchForm({ materials: [...form.materials, createEmptyMaterial()] })}
                >
                  + Lisää tarvike
                </button>
              )}
            </div>
            {form.materials.length === 0 ? (
              <p className="muted">Ei tarvikkeita vielä.</p>
            ) : (
              form.materials.map((item, index) => (
                <div key={item.id} className="quote-line-row panel-inset">
                  <div className="quote-line-head">
                    <strong>Tarvike {index + 1}</strong>
                    {canEdit && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          patchForm({ materials: form.materials.filter((row) => row.id !== item.id) })
                        }
                      >
                        Poista
                      </button>
                    )}
                  </div>
                  <div className="line-form-grid">
                    <label>
                      Nimi
                      <input
                        value={item.name}
                        onChange={(e) =>
                          patchForm({
                            materials: form.materials.map((row) =>
                              row.id === item.id ? { ...row, name: e.target.value } : row,
                            ),
                          })
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Määrä
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={item.quantity}
                        onChange={(e) =>
                          patchForm({
                            materials: form.materials.map((row) =>
                              row.id === item.id ? { ...row, quantity: Number(e.target.value) } : row,
                            ),
                          })
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Hankintahinta (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.purchasePrice}
                        onChange={(e) => {
                          const purchasePrice = Number(e.target.value);
                          const sellPrice =
                            purchasePrice * (1 + (Number(item.marginPercent) || 0) / 100);
                          patchForm({
                            materials: form.materials.map((row) =>
                              row.id === item.id ? { ...row, purchasePrice, sellPrice } : row,
                            ),
                          });
                        }}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Kate (%)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={item.marginPercent}
                        onChange={(e) => {
                          const marginPercent = Number(e.target.value);
                          const sellPrice =
                            Number(item.purchasePrice) * (1 + marginPercent / 100);
                          patchForm({
                            materials: form.materials.map((row) =>
                              row.id === item.id ? { ...row, marginPercent, sellPrice } : row,
                            ),
                          });
                        }}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Myyntihinta (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.sellPrice}
                        onChange={(e) =>
                          patchForm({
                            materials: form.materials.map((row) =>
                              row.id === item.id ? { ...row, sellPrice: Number(e.target.value) } : row,
                            ),
                          })
                        }
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </div>
              ))
            )}
          </section>
          </>
        )}

        {activeSection === 'hinnoittelu' && (
          <>
            {form.type === 'vesi-ilma' && (
              <QuoteVilpConfigSection form={form} canEdit={canEdit} onChange={patchForm} />
            )}
            {form.type === 'vesi-ilma' && (
              <QuotePumpDevicesSection
                form={form}
                canEdit={canEdit}
                heatingNeedKw={pumpSizingNeedKw}
                feeMap={deliveryFeeMap}
                onChange={patchForm}
              />
            )}
            {form.type === 'ilma-ilma' && (
              <QuotePumpDevicesSection
                form={form}
                canEdit={canEdit}
                heatingNeedKw={pumpSizingNeedKw}
                feeMap={deliveryFeeMap}
                onChange={patchForm}
                variant="pricing"
              />
            )}
            {form.type === 'ilma-ilma' && (
              <QuoteOptionalItemsSection form={form} canEdit={canEdit} onChange={patchForm} />
            )}
            <section className="form-section">
            <h2>Hinnoittelu ja ehdot</h2>
            <div className="line-form-grid">
              <label>
                Voimassa asti
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => patchForm({ validUntil: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              {quoteUsesTravelCost(form.type) && (
                <label>
                  Matkakulut (€, alv 0)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.travelCost}
                    onChange={(e) => patchForm({ travelCost: Number(e.target.value) })}
                    disabled={!canEdit}
                  />
                </label>
              )}
              <div className="quote-vat-profile-field">
                <span className="field-label">ALV / asiakastyyppi</span>
                <div className="quote-vat-profile-options" role="radiogroup" aria-label="ALV / asiakastyyppi">
                  {(Object.keys(QUOTE_VAT_PROFILE_LABELS) as QuoteVatProfile[]).map((profile) => (
                    <label key={profile} className="quote-vat-profile-option">
                      <input
                        type="radio"
                        name="quoteVatProfile"
                        value={profile}
                        checked={(form.quoteVatProfile ?? 'business') === profile}
                        disabled={!canEdit}
                        onChange={() => changeVatProfile(profile)}
                      />
                      <span>{QUOTE_VAT_PROFILE_LABELS[profile]}</span>
                    </label>
                  ))}
                </div>
                <p className="muted quote-vat-profile-hint">{quoteVatPrintNotice(form.vatRate)}</p>
              </div>
              <label>
                Alennus (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.overallDiscountPercent}
                  onChange={(e) => patchForm({ overallDiscountPercent: Number(e.target.value) })}
                  disabled={!canEdit}
                />
              </label>
              {!isPumpQuoteType(form.type) && (
                <label>
                  Laite / urakka (€, alv 0)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.deviceSaleOverrideNet ?? ''}
                    onChange={(e) =>
                      patchForm({
                        deviceSaleOverrideNet: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    disabled={!canEdit}
                  />
                </label>
              )}
            </div>
            <label>
              Esittelyteksti
              <textarea
                rows={2}
                value={form.introText}
                onChange={(e) => patchForm({ introText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Maksuehdot
              <input
                value={form.paymentTermsText}
                onChange={(e) => patchForm({ paymentTermsText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Toimitusehdot
              <textarea
                rows={2}
                value={form.deliveryTermsText}
                onChange={(e) => patchForm({ deliveryTermsText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Huomautukset
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => patchForm({ notes: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <div className="quote-summary-box">
              <p className="quote-vat-notice">{quoteVatPrintNotice(form.vatRate)}</p>
              <div>Työt: {totals.workNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</div>
              <div>
                Tarvikkeet: {totals.materialsNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
              </div>
              {quoteUsesTravelCost(form.type) && (
                <div>Matkat: {totals.travelNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</div>
              )}
              <div>Laite/urakka: {totals.deviceNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</div>
              <div>
                Yhteensä (alv 0): {totals.discountedNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
              </div>
              {form.vatRate > 0 && (
                <div>
                  ALV {form.vatRate}%:{' '}
                  {totals.vatAmount.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
                </div>
              )}
              <strong>
                Tarjous yhteensä
                {form.vatRate > 0 ? ` (sis. ALV ${form.vatRate}%)` : ' (alv 0 %)'}:{' '}
                {(form.vatRate > 0 ? totals.grossTotal : totals.discountedNet).toLocaleString('fi-FI', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </strong>
              {(form.optionalItems ?? []).some((item) => item.enabled && item.description.trim()) && (
                <div className="quote-optional-summary">
                  <strong>Valinnaiset lisät (ei mukana yhteensä)</strong>
                  {(form.optionalItems ?? [])
                    .filter((item) => item.enabled && item.description.trim())
                    .map((item) => (
                      <div key={item.id}>
                        {item.description.trim()} — hinta +{' '}
                        {item.priceGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
                      </div>
                    ))}
                </div>
              )}
              {quoteShowsKotitalousDeduction(form.type) && kotitalous.laborOnlyGross > 0 && (
                <div>
                  {kotitalous.label}:{' '}
                  {kotitalous.onePerson.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
                  {kotitalous.withSpouse > kotitalous.onePerson
                    ? ` (kahdella ${kotitalous.withSpouse.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })})`
                    : ''}
                </div>
              )}
            </div>
          </section>
          </>
        )}

        <div className="form-actions">
          <Link to={quoteListTrail().backTo} className="btn btn-secondary">
            Takaisin
          </Link>
          {canEdit && status === 'draft' && (
            <>
              <button type="submit" className="btn btn-secondary" disabled={busy}>
                {busy ? 'Tallennetaan…' : 'Tallenna luonnos'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void saveQuote('sent')}
              >
                Merkitse lähetetyksi
              </button>
            </>
          )}
          {canEdit && status === 'sent' && (
            <>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Tallennetaan…' : 'Tallenna muutokset'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void saveQuote('draft')}
              >
                Palauta luonnokseksi
              </button>
            </>
          )}
        </div>
      </form>
    </AppLayout>
  );
}
