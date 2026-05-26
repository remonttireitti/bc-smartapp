import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import {
  isPortalUser,
  loadPortalOrderCustomers,
  loadPortalOrderEquipment,
  resolvePortalOwnerCompanyId,
} from '../lib/portalWorkOrder';
import { supabase } from '../lib/supabase';
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

  const isSubscriber = profile?.role === 'subscriber';
  const isCustomer = profile?.role === 'customer';
  const portalOk = isPortalUser(profile);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const ownerCompanyId = useMemo(
    () => resolvePortalOwnerCompanyId(profile, selectedCustomer),
    [profile, selectedCustomer],
  );

  const customerLocked = isCustomer && customers.length === 1;

  useEffect(() => {
    if (!profile || profileLoading || !portalOk) return;
    void (async () => {
      try {
        const rows = await loadPortalOrderCustomers(supabase, profile);
        setCustomers(rows);
        if (isCustomer && rows[0]) setCustomerId(rows[0].id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Kohteiden lataus epäonnistui.');
      }
    })();
  }, [profile?.id, profile?.role, profile?.subscriber_id, profile?.customer_id, profileLoading, portalOk, isCustomer]);

  useEffect(() => {
    if (isNew || !editId) return;
    void loadReport(editId);
  }, [editId, isNew]);

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
    if (!ownerCompanyId) {
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
      owner_company_id: ownerCompanyId,
      created_by_company_id: ownerCompanyId,
      created_by_user_id: session.user.id,
      branding_company_id: ownerCompanyId,
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

    if (editId) {
      const { error: updateError } = await supabase.from('work_reports').update(payload).eq('id', editId);
      setBusy(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setMessage('Työtilaus päivitetty. Palveluyritys käsittelee sen pian.');
      navigate('/tyoraportit');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('work_reports')
      .insert(payload)
      .select('id')
      .single();

    setBusy(false);
    if (insertError || !data) {
      setError(insertError?.message ?? 'Lähetys epäonnistui.');
      return;
    }

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

  if (isSubscriber && customers.length === 0) {
    return (
      <AppLayout session={session}>
        <p className="error">
          Tilaajalle ei ole vielä linkitettyjä kohteita. Pyydä palveluyritystä liittämään kohteet tilaajaasi.
        </p>
        <Link to="/asiakkaat">Näytä kohteet</Link>
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
            <label>
              Kohde (asiakas) *
              <select
                value={customerId}
                required
                disabled={busy || customerLocked}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setEquipmentId('');
                }}
              >
                <option value="">— Valitse kohde —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {[c.address, c.city].filter(Boolean).length
                      ? ` (${[c.address, c.city].filter(Boolean).join(', ')})`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
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
