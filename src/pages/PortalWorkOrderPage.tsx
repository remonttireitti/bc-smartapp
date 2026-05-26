import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import { useProfile } from '../hooks/useProfile';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import {
  isPortalUser,
  loadPortalOrderCustomers,
  loadPortalOrderEquipment,
  resolvePortalOwnerCompanyId,
  resolvePortalServiceCompanyId,
} from '../lib/portalWorkOrder';
import {
  loadWorkReportAttachments,
  uploadWorkReportAttachments,
  WorkReportAttachmentsField,
} from '../lib/workReportAttachments';
import { supabase } from '../lib/supabase';
import type { WorkReportAttachment } from '../types';
import {
  WORK_STATUS_LABELS,
  buildWorkReportTitle,
  combineDateAndHour,
  defaultOfficeHour,
  todayIsoDate,
  OFFICE_HOUR_OPTIONS,
  splitScheduledStart,
} from '../types';
import { validateFutureSchedule } from '../lib/workReportCalendar';
import type { Customer, Equipment } from '../types';

interface Props {
  session: Session;
}

export default function PortalWorkOrderPage({ session }: Props) {
  const { id: editId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !editId;
  const { profile, loading: profileLoading } = useProfile(session);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayIsoDate);
  const [scheduledHour, setScheduledHour] = useState(defaultOfficeHour);
  const [loadingReport, setLoadingReport] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serviceCompanyId, setServiceCompanyId] = useState<string | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [savedAttachments, setSavedAttachments] = useState<WorkReportAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

  const isSubscriber = profile?.role === 'subscriber';
  const isCustomer = profile?.role === 'customer';
  const portalOk = isPortalUser(profile);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const ownerCompanyId = useMemo(
    () => resolvePortalOwnerCompanyId(profile, selectedCustomer),
    [profile, selectedCustomer],
  );

  useEffect(() => {
    if (!profile || profileLoading || !portalOk) return;
    void (async () => {
      setLoadingCustomers(true);
      setError(null);
      try {
        const [rows, ownerId] = await Promise.all([
          loadPortalOrderCustomers(supabase, profile),
          resolvePortalServiceCompanyId(supabase, profile),
        ]);
        setCustomers(rows);
        setServiceCompanyId(ownerId);
        if (isCustomer && rows[0]) setCustomerId(rows[0].id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Kohteiden lataus epäonnistui.');
      } finally {
        setLoadingCustomers(false);
      }
    })();
  }, [profile?.id, profile?.role, profile?.subscriber_id, profile?.customer_id, profileLoading, portalOk, isCustomer]);

  async function createPortalCustomer(draft: NewCustomerDraft) {
    const ownerId = serviceCompanyId ?? (await resolvePortalServiceCompanyId(supabase, profile));
    if (!ownerId) {
      setError('Palveluyritystä ei voitu määrittää. Ota yhteys ylläpitoon.');
      return;
    }
    if (!draft.name.trim()) {
      setError('Kohteen nimi on pakollinen.');
      return;
    }

    setBusy(true);
    setError(null);
    const { customer, error: createError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: ownerId,
      name: draft.name,
      address: draft.address,
      city: draft.city,
      phone: draft.phone,
      subscriberId: isSubscriber ? profile?.subscriber_id ?? null : null,
    });
    setBusy(false);

    if (createError || !customer) {
      setError(createError ?? 'Kohteen luonti epäonnistui.');
      return;
    }

    setCustomers((prev) => {
      const next = [...prev.filter((c) => c.id !== customer.id), customer];
      return next.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
    });
    setCustomerId(customer.id);
    setEquipmentId('');
    setMessage(`Kohde "${customer.name}" luotu ja valittu. Palveluyritys näkee sen rekisterissään.`);
  }

  useEffect(() => {
    if (isNew || !editId) return;
    void loadReport(editId);
  }, [editId, isNew]);

  useEffect(() => {
    if (!editId) {
      setSavedAttachments([]);
      return;
    }
    void loadWorkReportAttachments(editId)
      .then(setSavedAttachments)
      .catch(() => setSavedAttachments([]));
  }, [editId]);

  useEffect(() => {
    if (!customerId) {
      setEquipment([]);
      setEquipmentId('');
      return;
    }
    void loadPortalOrderEquipment(supabase, customerId).then(setEquipment).catch(() => setEquipment([]));
  }, [customerId]);

  const pageTitle = useMemo(() => {
    if (isNew) return 'Uusi työtilaus';
    return 'Muokkaa työtilausta';
  }, [isNew]);

  async function loadReport(id: string) {
    setLoadingReport(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('work_reports')
      .select(
        'id, status, description, orderer_name, customer_id, equipment_id, scheduled_start, created_by_user_id, subscriber_id',
      )
      .eq('id', id)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Työtilausta ei löytynyt.');
      setLoadingReport(false);
      return;
    }

    const row = data as {
      id: string;
      status: string;
      description: string | null;
      orderer_name: string | null;
      customer_id: string | null;
      equipment_id: string | null;
      scheduled_start: string | null;
      created_by_user_id: string | null;
    };

    if (row.created_by_user_id !== session.user.id) {
      setError('Voit muokata vain omia luonnoksia.');
      setLoadingReport(false);
      return;
    }

    if (row.status !== 'draft') {
      navigate('/tyoraportit', { replace: true });
      return;
    }

    setDescription(row.description ?? '');
    setContactName(row.orderer_name ?? '');
    setCustomerId(row.customer_id ?? '');
    setEquipmentId(row.equipment_id ?? '');
    const { date, hour } = splitScheduledStart(row.scheduled_start);
    setScheduledDate(date);
    setScheduledHour(hour);
    setLoadingReport(false);
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!profile || !portalOk) return;
    if (!description.trim()) {
      setError('Kuvaile työ tai vika.');
      return;
    }
    if (!customerId) {
      setError(isSubscriber ? 'Valitse kohde (asiakas).' : 'Kohdetta ei löytynyt profiilista.');
      return;
    }
    const resolvedOwnerCompanyId = ownerCompanyId ?? serviceCompanyId;
    if (!resolvedOwnerCompanyId) {
      setError('Palveluyritystä ei voitu määrittää.');
      return;
    }

    const futureError = validateFutureSchedule(scheduledDate, scheduledHour);
    if (futureError) {
      setError(futureError);
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const locationText = [selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || null;
    const payload = {
      title: buildWorkReportTitle(selectedCustomer?.name, description),
      description: description.trim(),
      orderer_name: contactName.trim() || profile.display_name || profile.email || null,
      location_text: locationText,
      owner_company_id: resolvedOwnerCompanyId,
      created_by_company_id: resolvedOwnerCompanyId,
      created_by_user_id: session.user.id,
      branding_company_id: resolvedOwnerCompanyId,
      partnership_id: null,
      delegate_company_id: null,
      delegated_at: null,
      customer_id: customerId,
      equipment_id: equipmentId || null,
      subscriber_id: isSubscriber ? profile.subscriber_id ?? null : null,
      assigned_user_id: null,
      scheduled_start: combineDateAndHour(scheduledDate, scheduledHour),
      scheduled_end: null,
      status: 'draft' as const,
    };

    const uploadPending = async (reportId: string) => {
      if (pendingAttachments.length === 0) return;
      await uploadWorkReportAttachments(reportId, pendingAttachments, session.user.id);
      setPendingAttachments([]);
    };

    if (editId) {
      const { error: updateError } = await supabase.from('work_reports').update(payload).eq('id', editId);
      if (updateError) {
        setBusy(false);
        setError(updateError.message);
        return;
      }
      try {
        await uploadPending(editId);
      } catch (uploadErr) {
        setBusy(false);
        setError(uploadErr instanceof Error ? uploadErr.message : 'Kuvien lataus epäonnistui.');
        return;
      }
      setBusy(false);
      setMessage('Työtilaus päivitetty. Palveluyritys käsittelee sen pian.');
      navigate('/tyoraportit');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('work_reports')
      .insert(payload)
      .select('id')
      .single();

    if (insertError || !data) {
      setBusy(false);
      setError(insertError?.message ?? 'Lähetys epäonnistui.');
      return;
    }

    try {
      await uploadPending(data.id);
    } catch (uploadErr) {
      setBusy(false);
      setError(uploadErr instanceof Error ? uploadErr.message : 'Kuvien lataus epäonnistui.');
      return;
    }

    setBusy(false);
    setMessage('Työtilaus lähetetty palveluyritykselle. Saat ilmoituksen, kun työ on aikataulutettu tai valmis.');
    navigate('/tyoraportit');
  }

  if (profileLoading || loadingReport) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout session={session}>
        <p className="error">Käyttäjäprofiilia ei löytynyt. Kirjaudu uudelleen tai ota yhteys palveluyritykseen.</p>
        <Link to="/">Etusivu</Link>
      </AppLayout>
    );
  }

  if (!portalOk) {
    return (
      <AppLayout session={session}>
        <p className="error">Työtilaukset ovat vain tilaaja- ja asiakasportaalissa.</p>
        <Link to="/">Etusivu</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tyoraportit">Työraportit</Link> / {pageTitle}
          </p>
          <h1>{pageTitle}</h1>
          <p className="muted">
            Lähetä työtilaus yritykselle {profile?.companies?.name ?? '—'}. Tilaus näkyy palveluyritykselle
            käsiteltäväksi.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <form className="panel form-grid" onSubmit={(e) => void submitOrder(e)}>
        <section className="form-section">
          <h2>Kohde ja työ</h2>

          {isSubscriber ? (
            <>
              {loadingCustomers ? (
                <p className="muted">Ladataan kohteita…</p>
              ) : (
                <>
                  {customers.length === 0 ? (
                    <p className="muted">
                      Ei vielä linkitettyjä kohteita — voit hakea alla tai luoda uuden kohteen. Palveluyritys
                      tallentaa sen asiakasrekisteriin tilaajaksesi.
                    </p>
                  ) : null}
                  <CustomerRegistryPicker
                    label="Kohde (asiakas)"
                    customers={customers}
                    customerId={customerId}
                    disabled={busy || !serviceCompanyId}
                    brandingName={profile.companies?.name ?? undefined}
                    createRegistryName={profile.companies?.name ?? 'palveluyritys'}
                    busy={busy}
                    onSelect={(id) => {
                      setCustomerId(id);
                      setEquipmentId('');
                    }}
                    onClear={() => {
                      setCustomerId('');
                      setEquipmentId('');
                    }}
                    onCreate={createPortalCustomer}
                  />
                </>
              )}
            </>
          ) : (
            <div className="info-box">
              <span className="info-label">Kohde</span>
              <strong>{selectedCustomer?.name ?? '—'}</strong>
              <span className="muted">
                {[selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || '—'}
              </span>
            </div>
          )}

          {customerId && equipment.length > 0 ? (
            <label>
              Laite (valinnainen)
              <select
                value={equipmentId}
                disabled={busy}
                onChange={(e) => setEquipmentId(e.target.value)}
              >
                <option value="">— Ei valittua laitetta —</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                    {eq.tag ? ` (${eq.tag})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : customerId ? (
            <p className="muted">Kohteella ei ole laitteita rekisterissä — voit jättää tyhjäksi.</p>
          ) : null}

          <label>
            Yhteyshenkilö (valinnainen)
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nimi paikan päällä"
            />
          </label>

          <label>
            Työn kuvaus / vika *
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kuvaile tehtävä, vika tai toiveinen ajankohta"
              required
            />
          </label>
        </section>

        <section className="form-section">
          <WorkReportAttachmentsField
            reportId={editId ?? null}
            userId={session.user.id}
            savedAttachments={savedAttachments}
            pendingFiles={pendingAttachments}
            disabled={busy}
            onSavedAttachmentsChange={setSavedAttachments}
            onPendingFilesChange={setPendingAttachments}
          />
        </section>

        <section className="form-section">
          <h2>Toivottu ajankohta</h2>
          <div className="line-form-grid">
            <label>
              Päivä
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </label>
            <label>
              Kellonaika
              <select value={scheduledHour} onChange={(e) => setScheduledHour(e.target.value)}>
                {OFFICE_HOUR_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Lähetetty tilaus tallennetaan tilassa {WORK_STATUS_LABELS.draft} — palveluyritys vahvistaa ja
            aikatauluttaa työn.
          </p>
        </section>

        <div className="form-actions">
          <Link to="/tyoraportit" className="btn btn-secondary">
            Peruuta
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Lähetetään…' : isNew ? 'Lähetä työtilaus' : 'Tallenna muutokset'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
