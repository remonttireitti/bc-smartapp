import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import InstallationPlanSectionsEditor from '../components/installationPlan/InstallationPlanSectionsEditor';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import {
  defaultReportContext,
  loadAccessibleReportCustomers,
  loadReportPartnerships,
  quoteReportOwnerTargets,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { parseCompanySettings } from '../lib/management';
import {
  createEmptyInstallationPlanData,
  installationPlanStoredTitle,
  normalizeInstallationPlanData,
  prepareInstallationPlanDataForSave,
  resetInstallationPlanTemplate,
  resolveInstallationPlanDisplayTitle,
} from '../lib/installationPlan/defaults';
import { generateInstallationPlanPrintHtml } from '../lib/installationPlan/printHtml';
import type { InstallationPlanAttachment, InstallationPlanData } from '../lib/installationPlan/types';
import {
  InstallationPlanAttachmentsField,
  loadInstallationPlanAttachments,
  resolveInstallationPlanAttachmentsForPrint,
  embedPrintImageUrl,
  uploadInstallationPlanAttachments,
} from '../lib/installationPlanAttachments';
import { openPrintWindow } from '../lib/quoteRequest/printWindowUtils';
import { supabase } from '../lib/supabase';
import { useProfile } from '../hooks/useProfile';
import type { Customer, Partnership } from '../types';

interface Props {
  session: Session;
}

type EditSection = 'asiakas' | 'suunnitelma' | 'liitteet';
const SECTIONS: EditSection[] = ['asiakas', 'suunnitelma', 'liitteet'];

export default function InstallationPlanEditPage({ session }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { profile } = useProfile(session);

  const [planId, setPlanId] = useState<string | null>(id ?? null);
  const [status, setStatus] = useState<'draft' | 'sent'>('draft');
  const [form, setForm] = useState<InstallationPlanData>(() => createEmptyInstallationPlanData());
  const [activeSection, setActiveSection] = useState<EditSection>('asiakas');
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [reportOwnerCompanyId, setReportOwnerCompanyId] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<InstallationPlanAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<ReturnType<typeof parseCompanySettings> | null>(
    null,
  );

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
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
  const { ownerCompanyId, partnerId } = reportContext;

  const reportOwnerTargets = useMemo(() => {
    if (!profile?.company_id) return [];
    return quoteReportOwnerTargets(
      profile.company_id,
      profile.companies?.name ?? 'Oma rekisteri',
      partnerships,
    );
  }, [profile?.company_id, profile?.companies?.name, partnerships]);

  const customersForPicker = useMemo(() => {
    const ownerId = ownerCompanyId || reportOwnerCompanyId || profile?.company_id;
    if (!ownerId) return customers;
    return customers.filter((customer) => customer.owner_company_id === ownerId);
  }, [customers, ownerCompanyId, reportOwnerCompanyId, profile?.company_id]);

  const displayTitle = resolveInstallationPlanDisplayTitle(form, selectedCustomer?.name);

  useEffect(() => {
    if (!profile?.company_id || planId) return;
    setCompanyName(profile.companies?.name ?? '');
    void supabase
      .from('companies')
      .select('name, settings, logo_url')
      .eq('id', profile.company_id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        const row = data as { name?: string | null; settings?: unknown; logo_url?: string | null };
        setCompanyName(row.name ?? profile.companies?.name ?? '');
        setCompanySettings(parseCompanySettings(row.settings));
        setLogoUrl(await resolveCompanyLogoUrl(row.logo_url ?? null));
      });
  }, [profile?.company_id, profile?.companies?.name, planId]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadReportPartnerships(supabase, profile.company_id, 'quotes').then(async (partnershipRows) => {
      setPartnerships(partnershipRows);
      const customerRows = await loadAccessibleReportCustomers(
        supabase,
        profile.company_id!,
        partnershipRows,
      );
      setCustomers(customerRows);
    });
  }, [profile?.company_id]);

  useEffect(() => {
    if (!planId) return;
    void loadPlan(planId);
  }, [planId]);

  async function loadPlan(planIdToLoad: string) {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('installation_plans')
      .select(`
        id, title, status, data, updated_at, customer_id, owner_company_id, created_by_company_id,
        branding_company_id, partnership_id,
        customers(name, address, city),
        branding_company:companies!installation_plans_branding_company_id_fkey(name, settings, logo_url)
      `)
      .eq('id', planIdToLoad)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Suunnitelmaa ei löytynyt.');
      setLoading(false);
      return;
    }

    const row = data as {
      status: 'draft' | 'sent';
      data: InstallationPlanData;
      customer_id: string | null;
      owner_company_id: string;
      updated_at: string;
      branding_company?: { name?: string | null; settings?: unknown; logo_url?: string | null } | null;
    };

    setStatus(row.status);
    setForm(normalizeInstallationPlanData(row.data));
    setCustomerId(row.customer_id ?? '');
    setReportOwnerCompanyId(row.owner_company_id);
    setSavedAt(row.updated_at);
    setCompanyName(row.branding_company?.name ?? profile?.companies?.name ?? '');
    setCompanySettings(parseCompanySettings(row.branding_company?.settings));
    setLogoUrl(await resolveCompanyLogoUrl(row.branding_company?.logo_url ?? null));
    setAttachments(await loadInstallationPlanAttachments(planIdToLoad));
    setLoading(false);
  }

  async function createCustomerAndSelect(draft: NewCustomerDraft) {
    if (!profile?.company_id) return;
    const ownerId = ownerCompanyId || reportOwnerCompanyId || profile.company_id;
    const { customer: created, error: createError } = await createRegistryCustomer(supabase, {
      ...draft,
      ownerCompanyId: ownerId,
    });
    if (createError || !created) {
      setError(createError ?? 'Asiakkaan luonti epäonnistui.');
      return;
    }
    const customerRows = await loadAccessibleReportCustomers(supabase, profile.company_id, partnerships);
    setCustomers(customerRows);
    setCustomerId(created.id);
    if (!form.propertyName.trim()) {
      setForm((prev) => ({ ...prev, propertyName: created.name }));
    }
  }

  async function savePlan(nextStatus?: 'draft' | 'sent') {
    if (!profile?.company_id || !ownerCompanyId) {
      setError('Profiilista puuttuu yritys.');
      return false;
    }
    if (!customerId) {
      setError('Valitse asiakas.');
      setActiveSection('asiakas');
      return false;
    }

    setBusy(true);
    setError(null);
    const dataToSave = prepareInstallationPlanDataForSave(form);
    const storedTitle = installationPlanStoredTitle(dataToSave, selectedCustomer?.name);
    const partnership = partnerships.find((entry) => entry.id === partnerId) ?? null;

    const rowPayload = {
      owner_company_id: ownerCompanyId,
      created_by_company_id: profile.company_id,
      branding_company_id: ownerCompanyId,
      partnership_id: partnership?.id ?? null,
      customer_id: customerId,
      title: storedTitle,
      status: nextStatus ?? status,
      data: dataToSave,
    };

    try {
      if (planId) {
        const { error: updateError } = await supabase
          .from('installation_plans')
          .update(rowPayload)
          .eq('id', planId);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { data, error: insertError } = await supabase
          .from('installation_plans')
          .insert(rowPayload)
          .select('id, updated_at')
          .maybeSingle();
        if (insertError || !data) throw new Error(insertError?.message ?? 'Tallennus epäonnistui.');
        const inserted = data as { id: string; updated_at: string };
        setPlanId(inserted.id);
        setSavedAt(inserted.updated_at);
        if (pendingFiles.length > 0) {
          await uploadInstallationPlanAttachments(inserted.id, pendingFiles, session.user.id);
          setPendingFiles([]);
          setAttachments(await loadInstallationPlanAttachments(inserted.id));
        }
        navigate(`/asennus-suunnittelu/${inserted.id}`, { replace: true });
      }

      if (planId && pendingFiles.length > 0) {
        await uploadInstallationPlanAttachments(planId, pendingFiles, session.user.id);
        setPendingFiles([]);
        setAttachments(await loadInstallationPlanAttachments(planId));
      }

      setForm(dataToSave);
      setStatus(nextStatus ?? status);
      setSavedAt(new Date().toISOString());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await savePlan();
  }

  async function handlePrintPreview() {
    if (!selectedCustomer) {
      setError('Valitse asiakas ennen esikatselua.');
      setActiveSection('asiakas');
      return;
    }
    const printAttachments = await resolveInstallationPlanAttachmentsForPrint(attachments);
    const embeddedLogo = await embedPrintImageUrl(logoUrl);
    const html = generateInstallationPlanPrintHtml({
      data: form,
      customer: {
        name: selectedCustomer.name,
        address: selectedCustomer.address,
        city: selectedCustomer.city,
      },
      meta: {
        companyName: companyName || profile?.companies?.name || '—',
        logoUrl: embeddedLogo,
        settings: companySettings,
        documentDate: savedAt,
      },
      attachments: printAttachments,
    });
    await openPrintWindow(html);
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> /{' '}
            <Link to="/asennus-suunnittelu">Asennus suunnittelu</Link> / {isNew ? 'Uusi' : 'Muokkaa'}
          </p>
          <h1>{displayTitle}</h1>
          <p className="muted">
            {profile?.companies?.name ?? '—'}
            {savedAt ? ` • tallennettu ${new Date(savedAt).toLocaleString('fi-FI')}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          {planId ? (
            <Link to={`/asennus-suunnittelu/${planId}/tuloste`} className="btn btn-secondary">
              Tuloste
            </Link>
          ) : null}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void handlePrintPreview()}>
            Esikatsele
          </button>
        </div>
      </div>

      <div className="tab-bar">
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            className={activeSection === section ? 'active' : undefined}
            onClick={() => setActiveSection(section)}
          >
            {section === 'asiakas' ? 'Asiakas' : section === 'suunnitelma' ? 'Suunnitelma' : 'Liitteet'}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <form className="form-grid installation-plan-form" onSubmit={(event) => void handleSubmit(event)}>
        {activeSection === 'asiakas' ? (
          <>
            {reportOwnerTargets.length > 1 ? (
              <label className="form-field span-2">
                <span>Rekisteri / omistaja</span>
                <select
                  value={reportOwnerCompanyId || ownerCompanyId}
                  disabled={busy}
                  onChange={(event) => setReportOwnerCompanyId(event.target.value)}
                >
                  {reportOwnerTargets.map((target) => (
                    <option key={target.companyId} value={target.companyId}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="span-2">
              <CustomerRegistryPicker
                customers={customersForPicker}
                customerId={customerId}
                myCompanyId={profile?.company_id ?? undefined}
                disabled={busy}
                createRegistryName={profile?.companies?.name ?? undefined}
                brandingName={profile?.companies?.name ?? undefined}
                busy={busy}
                onSelect={(selectedId) => {
                  setCustomerId(selectedId);
                  const customer = customersForPicker.find((row) => row.id === selectedId);
                  if (customer && !form.propertyName.trim()) {
                    setForm((prev) => ({
                      ...prev,
                      propertyName: customer.name,
                    }));
                  }
                }}
                onClear={() => setCustomerId('')}
                onCreate={createCustomerAndSelect}
              />
            </div>
          </>
        ) : null}

        {activeSection === 'suunnitelma' ? (
          <>
            <label className="form-field span-2">
              <span>Kiinteistö / Taloyhtiö</span>
              <input
                value={form.propertyName}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, propertyName: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Asunnot / Huoneistot</span>
              <input
                value={form.units}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, units: event.target.value }))}
                placeholder="Esim. B15 ja B10"
              />
            </label>
            <label className="form-field">
              <span>Asennuksen tyyppi</span>
              <input
                value={form.installationType}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, installationType: event.target.value }))}
                placeholder="Esim. Jäähdyttävä ilmalämpöpumppu…"
              />
            </label>
            <label className="form-field span-2">
              <span>Asennuksen kuvaus — johdanto</span>
              <textarea
                rows={3}
                value={form.descriptionIntro}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, descriptionIntro: event.target.value }))}
              />
            </label>
            <div className="span-2">
              <div className="section-toolbar">
                <h2>Suunnitelman osiot</h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => setForm((prev) => resetInstallationPlanTemplate(prev))}
                >
                  Palauta oletuspohja
                </button>
              </div>
              <InstallationPlanSectionsEditor
                sections={form.sections}
                disabled={busy}
                onChange={(sections) => setForm((prev) => ({ ...prev, sections }))}
              />
            </div>
            <label className="form-field span-2">
              <span>Liitteet (teksti tulosteessa)</span>
              <textarea
                rows={4}
                value={form.attachmentsNote}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, attachmentsNote: event.target.value }))}
              />
            </label>
            <label className="form-field span-2">
              <span>Päätösteksti taloyhtiölle</span>
              <textarea
                rows={5}
                value={form.closingText}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, closingText: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Yhteystiedot</span>
              <input
                value={form.contactInfo}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, contactInfo: event.target.value }))}
                placeholder="Nimi ja puhelin"
              />
            </label>
            <label className="form-field">
              <span>Huomautukset (sisäiset)</span>
              <input
                value={form.notes}
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </>
        ) : null}

        {activeSection === 'liitteet' ? (
          <div className="span-2">
            <p className="muted">
              Lisää esimerkiksi pohjapiirustus merkinnöin, valokuvat nykytilanteesta tai muut liitteet.
            </p>
            <InstallationPlanAttachmentsField
              planId={planId}
              userId={session.user.id}
              savedAttachments={attachments}
              pendingFiles={pendingFiles}
              disabled={busy}
              onSavedAttachmentsChange={setAttachments}
              onPendingFilesChange={setPendingFiles}
            />
          </div>
        ) : null}

        <div className="form-actions span-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Tallennetaan…' : 'Tallenna'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void savePlan('sent')}
          >
            Merkitse valmiiksi
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
