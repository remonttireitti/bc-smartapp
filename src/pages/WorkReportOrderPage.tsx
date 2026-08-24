import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';
import { loadAccessibleReportCustomers, loadReportPartnerships } from '../lib/reportCustomerRegistry';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import { useProfile } from '../hooks/useProfile';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import {
  companySubscriberOrderEditPath,
  isSubscriberPortalWorkOrder,
} from '../lib/portalWorkOrder';
import { supabase } from '../lib/supabase';
import {
  WORK_STATUS_LABELS,
  combineDateAndHour,
  OFFICE_HOUR_OPTIONS,
  buildWorkReportTitle,
  resolveWorkReportDescription,
  splitScheduledStart,
} from '../types';
import type { Customer, Equipment, Partnership } from '../types';

interface Props {
  session: Session;
}

function buildTitle(customerName: string | undefined, description: string) {
  return buildWorkReportTitle(customerName, description);
}

export default function WorkReportOrderPage({ session }: Props) {
  const { id: editId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !editId;
  const { profile, loading: profileLoading } = useProfile(session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);

  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [description, setDescription] = useState('');
  const [heading, setHeading] = useState('');
  const [ordererName, setOrdererName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledHour, setScheduledHour] = useState('');
  const [loadingReport, setLoadingReport] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [portalOrderCreatorUserId, setPortalOrderCreatorUserId] = useState<string | null>(null);

  const companyId = profile?.company_id ?? '';

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedPartner = partnerships.find((p) => p.id === partnerId);

  useEffect(() => {
    if (companyId) {
      void loadPartnerships();
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      void loadAccessibleCustomers();
    }
  }, [companyId, partnerships]);

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
    void loadEquipment(customerId);
  }, [customerId]);

  async function loadReport(id: string) {
    setLoadingReport(true);
    const { data, error: loadError } = await supabase
      .from('work_reports')
      .select(
        'id, status, heading, description, orderer_name, title, partnership_id, delegate_company_id, customer_id, equipment_id, scheduled_start, assigned_user_id, subscriber_id, created_by_user_id, created_by_company_id, owner_company_id, customers(name)',
      )
      .eq('id', id)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Toimeksiantoa ei löytynyt.');
      setLoadingReport(false);
      return;
    }

    if (data.status !== 'draft') {
      navigate(`/tyoraportit/${id}`, { replace: true });
      return;
    }

    if (data.assigned_user_id) {
      navigate(`/tyoraportit/${id}/muokkaa`, { replace: true });
      return;
    }

    const customerJoin = data.customers as unknown;
    const customerRecord = Array.isArray(customerJoin)
      ? (customerJoin[0] as { name: string } | undefined)
      : (customerJoin as { name: string } | null);

    setHeading(String(data.heading ?? '').trim());
    setDescription(
      resolveWorkReportDescription({
        title: String(data.title ?? ''),
        description: data.description,
        customers: customerRecord ?? null,
      }),
    );
    setOrdererName(String(data.orderer_name ?? '').trim());
    setSubscriberId(data.subscriber_id ?? null);
    setPortalOrderCreatorUserId(data.created_by_user_id ?? null);
    setCustomerId(data.customer_id ?? '');
    setEquipmentId(data.equipment_id ?? '');
    if (data.partnership_id) setPartnerId(data.partnership_id);

    const { date, hour } = splitScheduledStart(data.scheduled_start);
    setScheduledDate(date);
    setScheduledHour(hour);
    setLoadingReport(false);
  }

  async function loadPartnerships() {
    const { data } = await supabase
      .from('company_partnerships')
      .select('id, company_a_id, company_b_id, permissions_a_to_b, permissions_b_to_a')
      .eq('status', 'active');

    const rows = (data ?? []) as Omit<Partnership, 'partner_company'>[];
    const mine = rows.filter(
      (p) => p.company_a_id === companyId || p.company_b_id === companyId,
    );

    const enriched: Partnership[] = [];
    for (const p of mine) {
      const partnerCompanyId = p.company_a_id === companyId ? p.company_b_id : p.company_a_id;
      const { data: company } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('id', partnerCompanyId)
        .single();
      if (company) enriched.push({ ...p, partner_company: company });
    }

    setPartnerships(enriched);
    setPartnerId((current) => {
      if (current && enriched.some((p) => p.id === current)) return current;
      return enriched[0]?.id ?? '';
    });
  }

  async function loadAccessibleCustomers() {
    if (!companyId) return;
    try {
      const reportPartnerships = await loadReportPartnerships(supabase, companyId, 'work_reports');
      const rows = await loadAccessibleReportCustomers(supabase, companyId, reportPartnerships);
      setCustomers(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Asiakkaiden lataus epäonnistui.');
      setCustomers([]);
    }
  }

  async function loadEquipment(selectedCustomerId: string) {
    const { data } = await supabase
      .from('equipment')
      .select('id, name, tag, customer_id')
      .eq('customer_id', selectedCustomerId)
      .order('name');
    setEquipment((data as Equipment[]) ?? []);
  }

  async function createCustomerAndSelect(draft: NewCustomerDraft) {
    if (!companyId || !draft.name.trim()) {
      setError('Asiakkaan nimi on pakollinen.');
      return;
    }
    setBusy(true);
    setError(null);
    const { customer: created, error: insertError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: companyId,
      name: draft.name,
      address: draft.address,
      city: draft.city,
      phone: draft.phone,
    });

    if (insertError || !created) {
      setError(insertError ?? 'Asiakkaan luonti epäonnistui.');
      setBusy(false);
      return;
    }
    setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setCustomerId(created.id);
    setBusy(false);
  }

  async function createEquipmentAndSelect(draft: NewEquipmentDraft) {
    const customer = customers.find((entry) => entry.id === customerId);
    const equipmentOwnerCompanyId = customer?.owner_company_id ?? companyId;
    if (!equipmentOwnerCompanyId || !customerId) {
      setError('Valitse ensin asiakas.');
      return;
    }
    if (!draft.name.trim()) {
      setError('Laitteen nimi on pakollinen.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        owner_company_id: equipmentOwnerCompanyId,
        customer_id: customerId,
        name: draft.name.trim(),
        tag: draft.tag.trim() || null,
        model: draft.model.trim() || null,
        serial_number: draft.serial_number.trim() || null,
        location: draft.location.trim() || null,
      })
      .select('id, name, tag, customer_id')
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Laitteen luonti epäonnistui.');
      setBusy(false);
      return;
    }

    const created = data as Equipment;
    setEquipment((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setEquipmentId(created.id);
    setBusy(false);
  }

  async function saveOrder(sendToPartner: boolean) {
    if (!companyId) {
      setError('Profiilista puuttuu yritys.');
      return false;
    }
    if (!description.trim()) {
      setError('Tehtävän kuvaus on pakollinen.');
      return false;
    }
    const partnership =
      partnerships.find((p) => p.id === partnerId)
      ?? (partnerships.length === 1 ? partnerships[0] : undefined);

    if (sendToPartner && !partnership) {
      setError('Valitse kumppani, jolle toimeksianto lähetetään.');
      return false;
    }

    setBusy(true);
    setError(null);

    const delegateCompanyId = partnership
      ? partnership.company_a_id === companyId
        ? partnership.company_b_id
        : partnership.company_a_id
      : null;

    const locationText = [selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || null;

    const payload = {
      title: buildTitle(selectedCustomer?.name, heading.trim() || description),
      heading: heading.trim() || null,
      description: description.trim(),
      orderer_name: ordererName.trim() || null,
      location_text: locationText,
      owner_company_id: companyId,
      created_by_company_id: companyId,
      created_by_user_id: session.user.id,
      branding_company_id: companyId,
      partnership_id: partnership?.id ?? null,
      delegate_company_id: sendToPartner ? delegateCompanyId : null,
      delegated_at: sendToPartner ? new Date().toISOString() : null,
      customer_id: customerId || null,
      equipment_id: equipmentId || null,
      assigned_user_id: null,
      scheduled_start: combineDateAndHour(scheduledDate, scheduledHour),
      scheduled_end: null,
      status: sendToPartner ? ('delegated' as const) : ('draft' as const),
    };

    if (editId) {
      const { error: updateError } = await supabase.from('work_reports').update(payload).eq('id', editId);
      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return false;
      }
      await supabase.from('work_report_billing').upsert({ work_report_id: editId });
      navigate(sendToPartner ? `/tyoraportit/${editId}` : `/tyoraportit/toimeksianto/${editId}/muokkaa`);
    } else {
      const { data, error: insertError } = await supabase
        .from('work_reports')
        .insert(payload)
        .select('id')
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? 'Tallennus epäonnistui.');
        setBusy(false);
        return false;
      }

      await supabase.from('work_report_billing').insert({ work_report_id: data.id });
      navigate(sendToPartner ? `/tyoraportit/${data.id}` : `/tyoraportit/toimeksianto/${data.id}/muokkaa`, {
        replace: true,
      });
    }

    setBusy(false);
    return true;
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    await saveOrder(false);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    await saveOrder(true);
  }

  const isSubscriberPortalOrder =
    !!editId
    && isSubscriberPortalWorkOrder(
      {
        status: 'draft',
        subscriber_id: subscriberId,
        assigned_user_id: null,
        created_by_company_id: companyId,
        owner_company_id: companyId,
        created_by_user_id: portalOrderCreatorUserId,
      },
      session.user.id,
    );

  if (profileLoading || loadingReport || partnershipsEnabled === null) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (partnershipsEnabled === false) {
    if (editId) {
      return <Navigate to={`/tyoraportit/${editId}/muokkaa`} replace />;
    }
    return <Navigate to="/tyoraportit" replace />;
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tyoraportit">Työraportit</Link> / Toimeksianto
          </p>
          <h1>
            {isSubscriberPortalOrder
              ? 'Siirrä tilaajan työtilaus kumppanille'
              : isNew
                ? 'Uusi toimeksianto kumppanille'
                : 'Muokkaa toimeksiantoa'}
          </h1>
          <p className="muted">
            {isSubscriberPortalOrder
              ? 'Lähetä tilaajan portaalista tulleen työtilauksen kumppanille. Voit myös ottaa työn vastaan itse.'
              : 'Lähetä työtehtävä kumppaniyritykselle. Kumppani määrittää oman tekijänsä — et näe heidän henkilöstölistaa.'}
          </p>
        </div>
        <span className="badge badge-draft">{WORK_STATUS_LABELS.draft}</span>
      </div>

      {isSubscriberPortalOrder && editId && (
        <section className="panel portal-order-handle-banner">
          <p className="muted" style={{ margin: 0 }}>
            Haluatko hoitaa työn itse?{' '}
            <Link to={companySubscriberOrderEditPath(editId)}>Ota tilaus vastaan omaan kalenteriin</Link>
          </p>
        </section>
      )}

      <form className="panel form-grid work-report-form" onSubmit={onSend}>
        <section className="form-section">
          <h2>Kumppani</h2>
          {partnerships.length === 0 ? (
            <p className="muted">
              Ei aktiivisia kumppanuuksia. Luo kumppanuus kohdassa{' '}
              <Link to="/hallinta/kumppanuudet">Hallinta → Kumppanuudet</Link>.
            </p>
          ) : (
            <label>
              Lähetä toimeksianto yritykselle
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required>
                {partnerships.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partner_company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedPartner && (
            <p className="muted">
              {selectedPartner.partner_company.name} saa ilmoituksen ja valitsee tekijän omasta
              organisaatiostaan.
            </p>
          )}
        </section>

        <section className="form-section">
          <h2>Asiakas ja tehtävä</h2>
          <details className="form-help-details">
            <summary>Ohje asiakkaan valintaan</summary>
            <p className="muted">
              Hae asiakasta kaikista rekistereistä. Uusi asiakas tallennetaan aina omaan rekisteriisi (
              {profile?.companies?.name ?? '—'}).
            </p>
          </details>
          <CustomerRegistryPicker
            customers={customers}
            customerId={customerId}
            myCompanyId={companyId}
            createRegistryName={profile?.companies?.name ?? undefined}
            busy={busy}
            onSelect={(id) => {
              setCustomerId(id);
              setEquipmentId('');
            }}
            onClear={() => {
              setCustomerId('');
              setEquipmentId('');
            }}
            onCreate={createCustomerAndSelect}
          />
          {customerId && (
            <EquipmentRegistryPicker
              equipment={equipment}
              equipmentId={equipmentId}
              busy={busy}
              onSelect={setEquipmentId}
              onClear={() => setEquipmentId('')}
              onCreate={createEquipmentAndSelect}
            />
          )}
          <label>
            Tilaaja
            <input
              type="text"
              value={ordererName}
              onChange={(e) => setOrdererName(e.target.value)}
              placeholder="Tilaajan nimi tai taho (valinnainen)"
            />
          </label>
          <label>
            Otsikko (tuloste / tiedostonimi)
            <input
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Esim. ILK 22A korjaukset"
            />
          </label>
          <label>
            Tehtävän kuvaus *
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Mitä kumppanin tekijän tulee tehdä?"
              required
            />
          </label>
        </section>

        <section className="form-section">
          <h2>Toive työn aloituksen ajankohdasta (valinnainen)</h2>
          <div className="line-form-grid">
            <label>
              Päivä (valinnainen)
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </label>
            <label>
              Klo (valinnainen)
              <select value={scheduledHour} onChange={(e) => setScheduledHour(e.target.value)}>
                <option value="">— Ei valittu —</option>
                {OFFICE_HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <Link to="/tyoraportit" className="btn btn-secondary">
            Peruuta
          </Link>
          {isSubscriberPortalOrder && editId && (
            <Link to={companySubscriberOrderEditPath(editId)} className="btn btn-secondary">
              Ota vastaan itse
            </Link>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || partnerships.length === 0}
            onClick={(e) => void onSaveDraft(e)}
          >
            Tallenna luonnos
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || partnerships.length === 0}>
            {busy ? 'Lähetetään…' : 'Lähetä kumppanille'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
