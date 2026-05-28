import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Link, useNavigate, useParams } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';

import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';

import SubscriberPicker from '../components/SubscriberPicker';

import { supabase } from '../lib/supabase';

import { createRegistryCustomer } from '../lib/createRegistryCustomer';

import {
  customerCreateTargets,
  defaultReportContext,
  loadAccessibleReportCustomers,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';

import {
  loadAccessibleSubscribers,
  resolveSubscriberIdForReport,
} from '../lib/subscribers';

import { partnershipModuleAccess, partnershipPermsActingOnOwner } from '../lib/management';

import {

  clearLocalWorkDraft,

  localWorkDraftKey,

  writeLocalWorkDraft,

} from '../lib/workReportDraftStorage';

import { useProfile } from '../hooks/useProfile';
import { useRegisterDraftSaver } from '../hooks/useRegisterDraftSaver';
import { isPortalReadOnly, isSubscriberPortalWorkOrder } from '../lib/portalWorkOrder';

import {
  loadWorkReportAttachments,
  uploadWorkReportAttachments,
  WorkReportAttachmentsField,
} from '../lib/workReportAttachments';

import type { WorkReportAttachment } from '../types';

import {

  WORK_STATUS_LABELS,

  buildWorkReportTitle,
  resolveWorkReportDescription,

  combineDateAndHour,

  defaultOfficeHour,

  todayIsoDate,

  OFFICE_HOUR_OPTIONS,

  splitScheduledStart,
} from '../types';
import {
  buildScheduleCalendarCandidate,
  checkPerformerScheduleConflict,
  loadPerformerCalendarContext,
  validateFutureSchedule,
} from '../lib/workReportCalendar';

import type { Company, Customer, Equipment, Partnership, Subscriber } from '../types';



interface Props {

  session: Session;

}





export default function WorkReportNewPage({ session }: Props) {

  const { id: editId } = useParams<{ id: string }>();

  const navigate = useNavigate();

  const isNew = !editId;

  const { profile, loading: profileLoading } = useProfile(session);

  const [reportId, setReportId] = useState<string | null>(editId ?? null);

  const [status, setStatus] = useState<'draft' | 'scheduled'>('draft');

  const [partnerships, setPartnerships] = useState<Partnership[]>([]);

  const [ownerCompany, setOwnerCompany] = useState<Company | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [equipment, setEquipment] = useState<Equipment[]>([]);

  const [customerId, setCustomerId] = useState('');

  const [equipmentId, setEquipmentId] = useState('');

  const [description, setDescription] = useState('');
  const [heading, setHeading] = useState('');

  const [ordererName, setOrdererName] = useState('');

  const [subscriberId, setSubscriberId] = useState('');

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);

  const [scheduledDate, setScheduledDate] = useState(todayIsoDate);

  const [scheduledHour, setScheduledHour] = useState(defaultOfficeHour);

  const [reportOwnerCompanyId, setReportOwnerCompanyId] = useState('');

  const [loadingReport, setLoadingReport] = useState(!isNew);

  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');

  const [isOnline, setIsOnline] = useState(

    () => typeof navigator !== 'undefined' && navigator.onLine,

  );

  const skipAutoSaveRef = useRef(true);

  const [savedAttachments, setSavedAttachments] = useState<WorkReportAttachment[]>([]);

  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

  const [portalOrderCreatorUserId, setPortalOrderCreatorUserId] = useState<string | null>(null);

  const draftStorageKey = localWorkDraftKey(reportId, session.user.id);

  useEffect(() => {
    if (profileLoading) return;
    if (isPortalReadOnly(profile)) {
      navigate('/tyoraportit', { replace: true });
    }
  }, [profile, profileLoading, navigate]);

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

  const subscribersForOwner = useMemo(() => {
    if (!ownerCompanyId) return subscribers;
    return subscribers.filter((s) => s.owner_company_id === ownerCompanyId);
  }, [subscribers, ownerCompanyId]);

  const reportOwnerTargets = useMemo(() => {
    if (!profile?.company_id) return [];
    return customerCreateTargets(
      profile.company_id,
      profile.companies?.name ?? 'Oma rekisteri',
      partnerships,
    );
  }, [profile?.company_id, profile?.companies?.name, partnerships]);

  const creatorCompanyName = profile?.companies?.name ?? '—';

  const reportOwnerName =
    reportOwnerTargets.find((target) => target.companyId === reportOwnerCompanyId)?.label ??
    ownerCompany?.name ??
    creatorCompanyName;

  const createRegistryName = reportOwnerName;

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

  function onReportOwnerChange(companyId: string) {
    setReportOwnerCompanyId(companyId);
  }

  const canAutoSave = Boolean(description.trim() || customerId);



  useEffect(() => {

    if (!profile?.company_id) return;

    void loadPartnerships();

  }, [profile?.company_id]);



  useEffect(() => {

    if (isNew || !editId) return;

    void loadReport(editId);

  }, [editId, isNew]);



  useEffect(() => {

    if (profileLoading || loadingReport) {

      skipAutoSaveRef.current = true;

      return;

    }

    const timer = window.setTimeout(() => {

      skipAutoSaveRef.current = false;

    }, 800);

    return () => window.clearTimeout(timer);

  }, [profileLoading, loadingReport, reportId]);



  useEffect(() => {

    const goOnline = () => setIsOnline(true);

    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);

    window.addEventListener('offline', goOffline);

    return () => {

      window.removeEventListener('online', goOnline);

      window.removeEventListener('offline', goOffline);

    };

  }, []);



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



  useEffect(() => {

    if (!isNew || loadingReport || profileLoading || !profile?.company_id) return;

    if (customerId || reportOwnerCompanyId) return;

    void loadOwnerCompany(profile.company_id);

  }, [isNew, loadingReport, profileLoading, profile?.company_id, customerId, reportOwnerCompanyId]);



  useEffect(() => {

    if (!customerId) {

      if (!loadingReport) {

        setEquipment([]);

        setEquipmentId('');

      }

      return;

    }

    void loadEquipment(customerId);

  }, [customerId, loadingReport]);



  async function loadReport(id: string) {

    setLoadingReport(true);

    setError(null);



    const { data, error: loadError } = await supabase

      .from('work_reports')

      .select(
        'id, status, heading, description, orderer_name, subscriber_id, title, owner_company_id, created_by_company_id, created_by_user_id, assigned_user_id, partnership_id, customer_id, equipment_id, scheduled_start, customers(name)',
      )

      .eq('id', id)

      .single();



    if (loadError || !data) {

      setError(loadError?.message ?? 'Työraporttia ei löytynyt.');

      setLoadingReport(false);

      return;

    }



    if (data.status !== 'draft') {

      navigate(`/tyoraportit/${id}`, { replace: true });

      return;

    }

    if (
      !data.assigned_user_id &&
      data.created_by_company_id === data.owner_company_id &&
      !data.subscriber_id
    ) {
      navigate(`/tyoraportit/toimeksianto/${id}/muokkaa`, { replace: true });
      return;
    }

    setPortalOrderCreatorUserId(data.created_by_user_id ?? null);

    setReportId(data.id);

    setStatus('draft');

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

    setSubscriberId(String(data.subscriber_id ?? '').trim());

    setCustomerId(data.customer_id ?? '');

    setEquipmentId(data.equipment_id ?? '');



    const { date, hour } = splitScheduledStart(data.scheduled_start);

    setScheduledDate(date);

    setScheduledHour(hour);



    if (data.partnership_id) {

      /* context derived from selected customer */

    }



    if (data.owner_company_id) {

      setReportOwnerCompanyId(data.owner_company_id);

      await loadAccessibleCustomers();

      await loadOwnerCompany(data.owner_company_id);

      if (data.customer_id) await loadEquipment(data.customer_id);

    }

    try {
      setSavedAttachments(await loadWorkReportAttachments(id));
    } catch {
      setSavedAttachments([]);
    }

    setLoadingReport(false);

  }



  async function loadOwnerCompany(companyId: string) {

    const { data } = await supabase.from('companies').select('id, name, slug').eq('id', companyId).single();

    setOwnerCompany((data as Company) ?? null);

  }



  async function loadPartnerships() {

    const { data } = await supabase

      .from('company_partnerships')

      .select('id, company_a_id, company_b_id, permissions_a_to_b, permissions_b_to_a')

      .eq('status', 'active');



    const rows = (data ?? []) as Omit<Partnership, 'partner_company'>[];

    const mine = rows.filter(

      (p) => p.company_a_id === profile?.company_id || p.company_b_id === profile?.company_id,

    );



    const enriched: Partnership[] = [];

    for (const p of mine) {

      const partnerCompanyId =

        p.company_a_id === profile?.company_id ? p.company_b_id : p.company_a_id;

      const perms = partnershipPermsActingOnOwner(p, profile!.company_id!, partnerCompanyId);

      if (!partnershipModuleAccess(perms, 'work_reports', 'write')) continue;



      const { data: company } = await supabase

        .from('companies')

        .select('id, name, slug')

        .eq('id', partnerCompanyId)

        .single();



      if (company) enriched.push({ ...p, partner_company: company });

    }



    setPartnerships(enriched);

  }



  async function loadAccessibleCustomers() {

    if (!profile?.company_id) return;

    try {

      const rows = await loadAccessibleReportCustomers(supabase, profile.company_id, partnerships);

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

    if (!profile?.company_id || !draft.name.trim()) {

      setError('Asiakkaan nimi on pakollinen.');

      return;

    }

    const targetCompanyId =
      selectedCustomer?.owner_company_id ?? reportOwnerCompanyId ?? profile.company_id;

    if (!reportOwnerTargets.some((target) => target.companyId === targetCompanyId)) {

      setError('Sinulla ei ole oikeutta luoda asiakasta valittuun rekisteriin.');

      return;

    }

    setBusy(true);

    setError(null);

    const { customer: created, error: insertError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: targetCompanyId,
      name: draft.name,
      address: draft.address,
      city: draft.city,
      phone: draft.phone,
      subscriberId: subscriberId || null,
    });

    if (insertError || !created) {

      setError(insertError ?? 'Asiakkaan luonti epäonnistui.');

      setBusy(false);

      return;

    }

    setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));

    setCustomerId(created.id);

    setReportOwnerCompanyId(created.owner_company_id);

    void loadOwnerCompany(created.owner_company_id);

    setBusy(false);

  }



  async function createEquipmentAndSelect(draft: NewEquipmentDraft) {

    if (!ownerCompanyId || !customerId) {

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

        owner_company_id: ownerCompanyId,

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



  async function saveReport(nextStatus?: 'draft' | 'scheduled', options?: { auto?: boolean }) {

    if (!profile?.company_id || !ownerCompanyId) {

      if (!options?.auto) {

        setError(

          'Profiilista puuttuu yritys. Kirjaudu ulos, aja npm run setup:dev ja kirjaudu uudelleen admin@x.test -tunnuksella.',

        );

      }

      return false;

    }

    if (!canAutoSave) {

      if (!options?.auto) setError('Täytä tehtävän kuvaus tai valitse asiakas.');

      return false;

    }

    if (nextStatus === 'scheduled' && !description.trim()) {

      if (!options?.auto) setError('Tehtävän kuvaus on pakollinen ennen ajoittamista.');

      return false;

    }

    if (!isOnline && options?.auto) {

      setAutoSaveState('offline');

      return false;

    }



    if (options?.auto) {

      setAutoSaveState('saving');

    } else {

      setBusy(true);

    }

    if (!options?.auto) setError(null);



    const partnership = contextMode === 'partner' ? partnerships.find((p) => p.id === partnerId) : null;

    if (contextMode === 'partner') {

      if (!partnership) {

        if (!options?.auto) setError('Valitse kumppanuus, jonka nimissä raportti laaditaan.');

        if (options?.auto) setAutoSaveState('idle');

        else setBusy(false);

        return false;

      }

      const partnerPerms = partnershipPermsActingOnOwner(

        partnership,

        profile.company_id,

        ownerCompanyId,

      );

      if (!partnershipModuleAccess(partnerPerms, 'work_reports', 'write')) {

        if (!options?.auto) {

          setError(

            'Kumppani ei ole myöntänyt työraportin luontioikeutta. Pyydä kumppanin ylläpitäjää antamaan oikeus kohdassa Hallinta → Kumppanuudet.',

          );

        }

        if (options?.auto) setAutoSaveState('idle');

        else setBusy(false);

        return false;

      }

    }



    const locationText = [selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || null;

    const targetStatus = nextStatus ?? status;

    if (targetStatus === 'scheduled' && !options?.auto) {
      const futureError = validateFutureSchedule(scheduledDate, scheduledHour);
      if (futureError) {
        setError(futureError);
        setBusy(false);
        return false;
      }

      const { reports, logsByReportId } = await loadPerformerCalendarContext(supabase, session.user.id);
      const candidate = buildScheduleCalendarCandidate({
        reportId: reportId ?? 'new',
        dayYmd: scheduledDate,
        hour: scheduledHour,
        label: buildWorkReportTitle(selectedCustomer?.name, heading.trim() || description),
      });
      const conflict = checkPerformerScheduleConflict({
        performerUserId: session.user.id,
        reports,
        logsByReportId,
        candidate,
      });
      if (conflict) {
        setError(conflict);
        setBusy(false);
        return false;
      }
    }

    const preservePortalCreator =
      !!portalOrderCreatorUserId && portalOrderCreatorUserId !== session.user.id;

    const payload = {

      title: buildWorkReportTitle(selectedCustomer?.name, heading.trim() || description),
      heading: heading.trim() || null,

      description: description.trim() || null,

      orderer_name: ordererName.trim() || null,

      subscriber_id: resolveSubscriberIdForReport(customerId, subscriberId, customers),

      location_text: locationText,

      owner_company_id: ownerCompanyId,

      created_by_company_id: profile.company_id,

      ...(preservePortalCreator ? {} : { created_by_user_id: session.user.id }),

      branding_company_id: ownerCompanyId,

      partnership_id: partnership?.id ?? null,

      customer_id: customerId || null,

      equipment_id: equipmentId || null,

      assigned_user_id: session.user.id,

      scheduled_start: combineDateAndHour(scheduledDate, scheduledHour),

      scheduled_end: null,

      status: targetStatus,

    };



    if (reportId) {
      const { error: updateError } = await supabase.from('work_reports').update(payload).eq('id', reportId);

      if (updateError) {
        if (!options?.auto) setError(updateError.message);
        if (options?.auto) setAutoSaveState('offline');
        else setBusy(false);
        return false;
      }

      if (pendingAttachments.length > 0) {
        try {
          await uploadWorkReportAttachments(reportId, pendingAttachments, session.user.id);
          setPendingAttachments([]);
          setSavedAttachments(await loadWorkReportAttachments(reportId));
        } catch (uploadErr) {
          if (!options?.auto) {
            setError(uploadErr instanceof Error ? uploadErr.message : 'Liitteiden lataus epäonnistui.');
          }
          if (options?.auto) setAutoSaveState('offline');
          else setBusy(false);
          return false;
        }
      }

      if (targetStatus === 'scheduled') {
        navigate(`/tyoraportit/${reportId}`);
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('work_reports')
        .insert(payload)
        .select('id')
        .single();

      if (insertError || !data) {
        if (!options?.auto) setError(insertError?.message ?? 'Tallennus epäonnistui.');
        if (options?.auto) setAutoSaveState('offline');
        else setBusy(false);
        return false;
      }

      const newId = data.id;
      setReportId(newId);
      await supabase.from('work_report_billing').insert({ work_report_id: newId });
      clearLocalWorkDraft(localWorkDraftKey(null, session.user.id));

      if (pendingAttachments.length > 0) {
        try {
          await uploadWorkReportAttachments(newId, pendingAttachments, session.user.id);
          setPendingAttachments([]);
          setSavedAttachments(await loadWorkReportAttachments(newId));
        } catch (uploadErr) {
          if (!options?.auto) {
            setError(uploadErr instanceof Error ? uploadErr.message : 'Liitteiden lataus epäonnistui.');
          }
          if (options?.auto) setAutoSaveState('offline');
          else setBusy(false);
          return false;
        }
      }

      if (targetStatus === 'scheduled') {
        navigate(`/tyoraportit/${newId}`);
      } else {
        navigate(`/tyoraportit/${newId}/muokkaa`, { replace: true });
      }
    }



    if (nextStatus) setStatus(nextStatus);

    const timeLabel = new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });

    setSavedAt(timeLabel);

    if (options?.auto) {

      setAutoSaveState('saved');

    }

    clearLocalWorkDraft(draftStorageKey);

    clearLocalWorkDraft(localWorkDraftKey(reportId, session.user.id));



    if (!options?.auto) setBusy(false);

    return true;
  }



  useEffect(() => {

    if (skipAutoSaveRef.current || status !== 'draft') return;

    writeLocalWorkDraft(draftStorageKey, {
      heading,

      description,

      customerId,

      equipmentId,

      contextMode,

      partnerId,

      scheduledDate,

      scheduledHour,

    });

  }, [
    heading,

    description,

    customerId,

    equipmentId,

    contextMode,

    partnerId,

    scheduledDate,

    scheduledHour,

    status,

    draftStorageKey,

  ]);



  useEffect(() => {

    if (skipAutoSaveRef.current || status !== 'draft' || busy) return;

    if (!canAutoSave) return;



    if (!isOnline) {

      setAutoSaveState('offline');

      return;

    }



    const timer = window.setTimeout(() => {

      void saveReport('draft', { auto: true });

    }, 2500);



    return () => window.clearTimeout(timer);

  }, [
    heading,

    description,

    customerId,

    equipmentId,

    contextMode,

    partnerId,

    scheduledDate,

    scheduledHour,

    ownerCompanyId,

    status,

    isOnline,

    busy,

    canAutoSave,

  ]);



  useEffect(() => {

    if (!isOnline || skipAutoSaveRef.current || status !== 'draft' || busy) return;

    if (!canAutoSave) return;

    void saveReport('draft', { auto: true });

  }, [isOnline]);

  useRegisterDraftSaver(async () => {
    if (status !== 'draft') return;
    writeLocalWorkDraft(draftStorageKey, {
      heading,
      description,
      customerId,
      equipmentId,
      contextMode,
      partnerId,
      scheduledDate,
      scheduledHour,
    });
    if (canAutoSave && isOnline) {
      await saveReport('draft', { auto: true });
    }
  });

  async function onSubmit(e: FormEvent) {

    e.preventDefault();

    await saveReport('scheduled');

  }



  async function onSaveDraft(e: FormEvent) {

    e.preventDefault();

    await saveReport('draft');

  }



  if (profileLoading || loadingReport) {

    return (

      <AppLayout session={session}>

        <p className="muted">Ladataan…</p>

      </AppLayout>

    );

  }



  const brandingName = ownerCompany?.name ?? reportOwnerName;

  const isSubscriberPortalOrder =
    !!reportId
    && !!subscriberId
    && isSubscriberPortalWorkOrder(
      {
        status: 'draft',
        subscriber_id: subscriberId,
        assigned_user_id: null,
        created_by_company_id: profile?.company_id ?? null,
        owner_company_id: ownerCompanyId || (profile?.company_id ?? null),
        created_by_user_id: portalOrderCreatorUserId,
      },
      session.user.id,
    );

  return (

    <AppLayout session={session}>

      <div className="page-header">

        <div>

          <p className="breadcrumb">

            <Link to="/">Etusivu</Link> / <Link to="/tyoraportit">Työraportit</Link> /{' '}

            {isNew && !reportId ? 'Uusi' : 'Luonnos'}

          </p>

          <h1>
            {isSubscriberPortalOrder
              ? 'Tilaajan työtilaus'
              : isNew && !reportId
                ? 'Uusi työraportti'
                : 'Työraportin luonnos'}
          </h1>

          <p className="muted autosave-status">

            {autoSaveState === 'saving' && 'Tallennetaan automaattisesti…'}

            {autoSaveState === 'saved' && savedAt && `Tallennettu automaattisesti klo ${savedAt}`}

            {autoSaveState === 'offline' &&

              'Offline — muutokset tallennettu selaimeen. Synkronoidaan kun yhteys palaa.'}

            {autoSaveState === 'idle' && savedAt && `Viimeksi tallennettu klo ${savedAt}`}

            {status === 'draft' && autoSaveState === 'idle' && !savedAt && isOnline &&

              'Automaattinen tallennus käynnistyy kun kuvaus tai asiakas on täytetty.'}

          </p>

        </div>

        <span className="badge badge-draft">{WORK_STATUS_LABELS.draft}</span>

      </div>



      {!profile?.company_id && (

        <section className="panel">

          <p className="error">

            Yritys puuttuu profiilista. Kirjaudu ulos, aja terminaalissa <code>npm run setup:dev</code> ja

            kirjaudu tunnuksella <strong>admin@x.test</strong> / salasana <strong>test123456</strong>.

          </p>

        </section>

      )}



      {isSubscriberPortalOrder && (
        <section className="panel portal-order-handle-banner">
          <p className="muted" style={{ margin: 0 }}>
            Tilaaja on lähettänyt työtilauksen portaalista. Voit ottaa työn vastaan omaan kalenteriin tai siirtää sen
            kumppanille.
          </p>
        </section>
      )}

      <form className="panel form-grid work-report-form" onSubmit={onSubmit}>

        <section className="form-section">

          <h2>Perustiedot</h2>

          <div className="info-grid">

            <div className="info-box">

              <span className="info-label">Yrityksen nimissä</span>

              {!customerId && reportOwnerTargets.length > 1 ? (
                <select
                  className="info-box-select"
                  value={reportOwnerCompanyId}
                  onChange={(event) => onReportOwnerChange(event.target.value)}
                  disabled={busy}
                >
                  {reportOwnerTargets.map((target) => (
                    <option key={target.companyId} value={target.companyId}>
                      {target.label}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{brandingName}</strong>
              )}

            </div>

            <div className="info-box">

              <span className="info-label">Raportin laatija</span>

              <strong>{profile?.display_name ?? session.user.email}</strong>

              <span className="muted">{creatorCompanyName}</span>

            </div>

            <div className="info-box">

              <span className="info-label">Tila</span>

              <strong>{WORK_STATUS_LABELS.draft}</strong>

            </div>

          </div>



          {selectedCustomer && contextMode === 'partner' && (

            <p className="muted">

              Valittu asiakas kuuluu kumppanin rekisteriin — raportti luodaan yrityksen{' '}

              <strong>{brandingName}</strong> nimissä. Yritys määräytyy valitusta asiakkaasta.

            </p>

          )}

          {!customerId && reportOwnerTargets.length > 1 && (
            <p className="muted">
              Valitse ensin yritys, jonka nimissä raportti laaditaan. Uusi asiakas tallennetaan samaan
              rekisteriin.
            </p>
          )}

        </section>



        <section className="form-section">

          <h2>Asiakas ja tehtävä</h2>

          <details className="form-help-details">
            <summary>Ohje asiakkaan valintaan</summary>
            <p className="muted">
              Hae asiakasta kaikista rekistereistä joihin sinulla on pääsy. Raportin yritys määräytyy valitusta
              asiakkaasta tai yllä olevasta &quot;Yrityksen nimissä&quot; -valinnasta. Uuden asiakkaan voit tallentaa
              valittuun rekisteriin, jos sinulla on oikeus luoda työraportteja kyseiselle kumppanille.
            </p>
          </details>

          {ownerCompanyId ? (
            <SubscriberPicker
              subscribers={subscribersForOwner}
              subscriberId={subscriberId}
              disabled={busy}
              onChange={setSubscriberId}
            />
          ) : null}

          <CustomerRegistryPicker

            customers={customers}

            customerId={customerId}

            myCompanyId={profile?.company_id ?? undefined}

            disabled={!profile?.company_id}

            createRegistryName={createRegistryName}

            brandingName={createRegistryName}

            busy={busy}

            onSelect={(id) => {

              setCustomerId(id);

              setEquipmentId('');

              const customer = customers.find((entry) => entry.id === id);

              if (customer) {
                setReportOwnerCompanyId(customer.owner_company_id);
                void loadOwnerCompany(customer.owner_company_id);
                if (customer.subscriber_id) setSubscriberId(customer.subscriber_id);
              }

            }}

            onClear={() => {

              setCustomerId('');

              setEquipmentId('');

              if (profile?.company_id) {
                setReportOwnerCompanyId(profile.company_id);
                void loadOwnerCompany(profile.company_id);
              }

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

            Tilaajan yhteyshenkilö (vapaa teksti)

            <input

              type="text"

              value={ordererName}

              onChange={(e) => setOrdererName(e.target.value)}

              placeholder="Esim. kiinteistönhoitaja (valinnainen)"

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

              placeholder="Mitä työ sisältää?"

            />

          </label>

        </section>



        <section className="form-section">

          <WorkReportAttachmentsField

            reportId={reportId}

            userId={session.user.id}

            savedAttachments={savedAttachments}

            pendingFiles={pendingAttachments}

            disabled={busy || !profile?.company_id}

            onSavedAttachmentsChange={setSavedAttachments}

            onPendingFilesChange={setPendingAttachments}

          />

        </section>



        <section className="form-section">

          <h2>Kalenteri</h2>

          <div className="line-form-grid">

            <label>

              Päivä

              <input

                type="date"

                value={scheduledDate}

                onChange={(e) => setScheduledDate(e.target.value)}

              />

            </label>

            <label>

              Klo (virka-aika)

              <select value={scheduledHour} onChange={(e) => setScheduledHour(e.target.value)}>

                {OFFICE_HOUR_OPTIONS.map((opt) => (

                  <option key={opt.value} value={opt.value}>

                    {opt.label}

                  </option>

                ))}

              </select>

            </label>

          </div>

          <p className="muted">Valitse tuleva päivä ja klo 07:00–16:30 (puolen tunnin tarkkuudella).</p>

        </section>



        {error && <p className="error">{error}</p>}



        <div className="form-actions">

          <Link to="/tyoraportit" className="btn btn-secondary">Peruuta</Link>

          {isSubscriberPortalOrder && reportId && (
            <Link
              to={`/tyoraportit/toimeksianto/${reportId}/muokkaa`}
              className="btn btn-secondary"
            >
              Siirrä kumppanille
            </Link>
          )}

          <button

            type="button"

            className="btn btn-secondary"

            disabled={busy || !profile?.company_id}

            onClick={(e) => void onSaveDraft(e)}

          >

            {busy ? 'Tallennetaan…' : 'Tallenna luonnos'}

          </button>

          <button type="submit" className="btn btn-primary" disabled={busy || !profile?.company_id}>

            {busy
              ? 'Tallennetaan…'
              : isSubscriberPortalOrder
                ? 'Ota vastaan ja ajoita'
                : 'Merkitse ajoitetuksi'}

          </button>

        </div>

      </form>

    </AppLayout>

  );

}


