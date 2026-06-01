import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { huoltoPerformerFields } from '../lib/huoltoRaportti/performerFromProfile';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import LeaveDraftDialog from '../components/LeaveDraftDialog';
import { useMaintenanceReportNavigation } from '../hooks/useMaintenanceReportNavigation';
import { useDraftLeaveGuard } from '../hooks/useDraftLeaveGuard';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';
import SubscriberPicker from '../components/SubscriberPicker';
import CollapsibleSection from '../components/CollapsibleSection';
import ToggleSwitch from '../components/ToggleSwitch';
import { CondensersSection } from '../components/huoltoRaportti/CondensersSection';
import { EvaporatorCircuitsSync } from '../components/huoltoRaportti/EvaporatorCircuitsSync';
import { EvaporatorsSection } from '../components/huoltoRaportti/EvaporatorsSection';
import { JaahdytysvesiSection } from '../components/huoltoRaportti/JaahdytysvesiSection';
import { LauhdutuspiiriSection } from '../components/huoltoRaportti/LauhdutuspiiriSection';
import { HuomiotSection } from '../components/huoltoRaportti/HuomiotSection';
import { VapaajahdytysSection } from '../components/huoltoRaportti/VapaajahdytysSection';
import { VjLauhdutinSection } from '../components/huoltoRaportti/VjLauhdutinSection';
import { VjOhjausSection } from '../components/huoltoRaportti/VjOhjausSection';
import { KonvektoritSection } from '../components/huoltoRaportti/KonvektoritSection';
import { LampopumppuSection } from '../components/huoltoRaportti/LampopumppuSection';
import { MlpSection } from '../components/huoltoRaportti/MlpSection';
import { NestelauhduttimetSection } from '../components/huoltoRaportti/NestelauhduttimetSection';
import { RefrigerantChargeSection } from '../components/huoltoRaportti/RefrigerantChargeSection';
import { RefrigerantCircuitsSection } from '../components/huoltoRaportti/RefrigerantCircuitsSection';
import { TiiveyskoeSection } from '../components/huoltoRaportti/TiiveyskoeSection';
import { TyhjiointiSection } from '../components/huoltoRaportti/TyhjiointiSection';
import {
  applyDeviceTypeDefaults,
  buildMaintenanceReportTitleFromData,
  createEmptyHuoltoReportData,
  createEmptyMlpData,
  ensureChillerLiquidCondenserData,
  mergeHuoltoReportData,
  normalizeHuoltoReportData,
  resolveMaintenanceReportTitle,
} from '../lib/huoltoRaportti/defaults';
import { supabase } from '../lib/supabase';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import { partnershipModuleAccess, partnershipPermsActingOnOwner } from '../lib/management';
import { EQUIPMENT_SELECT } from '../lib/customers';
import {
  defaultReportContext,
  loadAccessibleReportCustomers,
  maintenanceReportOwnerTargets,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';
import {
  loadAccessibleSubscribers,
  resolveSubscriberIdForReport,
} from '../lib/subscribers';
import {
  deviceTypes,
  moduleSelectionOptions,
  refrigerantTypes,
  showHuoltoVsKayttoonottoSelector,
  type ModuleKey,
} from '../lib/huoltoRaportti/constants';
import {
  getActiveModuleLabels,
  getManualModuleOptions,
  isChillerLikeDevice,
  isLiquidCondenserType,
  lampopumppuSubmodules,
  resolveAutoModules,
  showCondenserModules,
  showEvaporatorModules,
  showLampopumppuModules,
  showMlpModules,
  showNestelauhduttimetModules,
  showVjLauhdutuspiiriModules,
  usesManualModuleMenu,
} from '../lib/huoltoRaportti/deviceModuleLogic';
import { getModuleTheme, moduleThemeKeyForOption } from '../lib/huoltoRaportti/moduleThemes';
import {
  applyEquipmentSnapshotToForm,
  buildHuoltoEquipmentTechnicalSnapshot,
  saveEquipmentFromReport,
  syncEquipmentFromReport,
} from '../lib/huoltoRaportti/equipmentSnapshot';
import type { EquipmentSnapshot, HuoltoReportData } from '../lib/huoltoRaportti/types';
import {
  clearLocalMaintenanceDraft,
  localDraftKey,
  writeLocalMaintenanceDraft,
} from '../lib/maintenanceReportDraftStorage';
import { openMaintenanceReportPrint } from '../lib/maintenanceReportPrintAction';
import { isPortalUser } from '../lib/portalWorkOrder';
import { useProfile } from '../hooks/useProfile';
import { useMaintenanceReportScrollRestore } from '../hooks/useMaintenanceReportScrollRestore';
import { useRegisterDraftSaver } from '../hooks/useRegisterDraftSaver';
import { canDeleteCompanyOwnedEntity } from '../lib/deletePermissions';
import type { Company, Customer, Equipment, Partnership, Subscriber } from '../types';

interface Props {
  session: Session;
}


import { huoltoTiedotSectionTitle } from '../lib/huoltoRaportti/sectionTitles';
import { HuoltoEditUiProvider } from '../components/huoltoRaportti/HuoltoEditUiContext';
import { cloneHuoltoReportForSiblingEquipment } from '../lib/huoltoRaportti/cloneReportForSiblingEquipment';
import {
  maintenanceReportViewKey,
  readFreshMaintenanceReportEditorSnapshot,
} from '../lib/maintenanceReportViewState';
import { isMaintenanceReportPublished } from '../lib/maintenanceReportStatus';
import { getMaintenanceReportStatusLabel } from '../types';

function moduleLabel(key: ModuleKey): string {
  return moduleSelectionOptions.find((o) => o.key === key)?.label ?? key;
}

export default function MaintenanceReportEditPage({ session }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;
  const { profile, loading: profileLoading } = useProfile(session);

  const [reportId, setReportId] = useState<string | null>(id ?? null);
  const [savedReportTitle, setSavedReportTitle] = useState<string | null>(null);
  const [reportOwnerCompanyId, setReportOwnerCompanyId] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [form, setForm] = useState<HuoltoReportData>(() => createEmptyHuoltoReportData());
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [ownerCompany, setOwnerCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [subscriberId, setSubscriberId] = useState('');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [loadingReport, setLoadingReport] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );
  const [registryMessage, setRegistryMessage] = useState<string | null>(null);
  const previousCustomerIdRef = useRef('');
  const skipAutoSaveRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const copyFromLoadedRef = useRef(false);

  const draftStorageKey = localDraftKey(reportId, session.user.id);
  const reportViewKey = maintenanceReportViewKey(reportId, session.user.id);

  useMaintenanceReportScrollRestore({
    reportId,
    userId: session.user.id,
    ready: !profileLoading && !loadingReport,
    status,
    form,
    customerId,
    equipmentId,
  });

  const portalMode = isPortalUser(profile);
  const isPublished = isMaintenanceReportPublished(status);
  const canEditCustomerEquipment = !portalMode && (isNew || status === 'draft');
  const canEditPublishedReport = !portalMode && isPublished;

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
    return maintenanceReportOwnerTargets(
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

  const reportTitle = useMemo(
    () =>
      resolveMaintenanceReportTitle(
        savedReportTitle,
        form,
        selectedCustomer?.name ?? (form.asiakas.trim() || null),
      ),
    [savedReportTitle, form, selectedCustomer?.name],
  );
  const navigation = useMaintenanceReportNavigation({
    isNew,
    reportId,
    customerId: customerId || null,
    customerName: selectedCustomer?.name ?? (form.asiakas.trim() || null),
    reportTitle,
  });
  const manualModuleOptions = getManualModuleOptions(form.laiteTyyppi);
  const activeModuleLabels = getActiveModuleLabels(form.selectedModules, form.laiteTyyppi);
  const implementedModules: ModuleKey[] = moduleSelectionOptions.map((o) => o.key);
  const pendingModuleKeys = (Object.keys(form.selectedModules) as ModuleKey[]).filter(
    (k) => form.selectedModules[k] && !implementedModules.includes(k),
  );
  const showEvaporatorSection = showEvaporatorModules(form.laiteTyyppi, form.selectedModules);
  const showCondenserSection = showCondenserModules(form.laiteTyyppi, form.selectedModules);
  const showMlpSection = showMlpModules(form.laiteTyyppi, form.selectedModules);
  const showKonvektoritSection = form.selectedModules.konvektorit;
  const showNestelauhduttimetSection = showNestelauhduttimetModules(form.selectedModules);
  const showLauhdutuspiiriSection = showVjLauhdutuspiiriModules(
    form.laiteTyyppi,
    form.lauhdutinTyyppiLaite,
    form.selectedModules,
  );
  const showJaahdytysvesiSection = form.selectedModules.vedenjajahdytyskone;
  const isVj = isChillerLikeDevice(form.laiteTyyppi);
  const showVapaajahdytysSection = form.selectedModules.vapaajahdytys;
  const lampopumppuParts = lampopumppuSubmodules(form.laiteTyyppi, form.selectedModules);
  const showLampopumppuSection = showLampopumppuModules(form.laiteTyyppi, form.selectedModules);

  const patchForm = useCallback((patch: Partial<HuoltoReportData>) => {
    setHasUnsavedChanges(true);
    setForm((prev) => mergeHuoltoReportData(prev, patch));
  }, []);

  const syncForm = useCallback((patch: Partial<HuoltoReportData>) => {
    setForm((prev) => mergeHuoltoReportData(prev, patch));
  }, []);

  useEffect(() => {
    if (showMlpSection && !form.mlpData) {
      syncForm({ mlpData: createEmptyMlpData() });
    }
  }, [showMlpSection, form.mlpData]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadPartnerships();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!isNew && id) void loadReport(id);
  }, [id, isNew]);

  useEffect(() => {
    if (profileLoading || loadingReport) return;
    setHasUnsavedChanges(false);
  }, [profileLoading, loadingReport, reportId]);

  useEffect(() => {
    if (profileLoading || loadingReport || status !== 'draft') return;
    const performer = huoltoPerformerFields(profile, session);
    setForm((prev) => {
      if (
        prev.huoltoSuorittajaNimi === performer.huoltoSuorittajaNimi &&
        prev.huoltoSuorittajaTUKES === performer.huoltoSuorittajaTUKES
      ) {
        return prev;
      }
      return mergeHuoltoReportData(prev, performer);
    });
  }, [
    profileLoading,
    loadingReport,
    status,
    profile?.display_name,
    profile?.tukes_number,
    profile?.email,
    session,
  ]);

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
    setHasUnsavedChanges(true);
  }

  useEffect(() => {
    if (!isNew || !ownerCompanyId) return;
    const cid = searchParams.get('customerId');
    const eid = searchParams.get('equipmentId');
    if (cid) setCustomerId(cid);
    if (eid) setEquipmentId(eid);
  }, [isNew, ownerCompanyId, searchParams]);

  useEffect(() => {
    const copyFromId = searchParams.get('copyFrom');
    if (!isNew || !copyFromId || copyFromLoadedRef.current || profileLoading) return;
    copyFromLoadedRef.current = true;

    void (async () => {
      const { data, error: copyError } = await supabase
        .from('maintenance_reports')
        .select('data, customer_id, owner_company_id, subscriber_id')
        .eq('id', copyFromId)
        .maybeSingle();

      if (copyError || !data) {
        setError(copyError?.message ?? 'Kopiointilähdettä ei löytynyt.');
        return;
      }

      const row = data as {
        data: HuoltoReportData;
        customer_id: string | null;
        owner_company_id: string;
        subscriber_id: string | null;
      };

      setForm(cloneHuoltoReportForSiblingEquipment(row.data));
      setEquipmentId('');
      if (row.customer_id) setCustomerId(row.customer_id);
      if (row.owner_company_id) setReportOwnerCompanyId(row.owner_company_id);
      if (row.subscriber_id) setSubscriberId(row.subscriber_id);
      setHasUnsavedChanges(true);
      setRegistryMessage(
        'Tiedot kopioitu edellisestä pöytäkirjasta — valitse toisen laitteen tunnus rekisteristä.',
      );
    })();
  }, [isNew, searchParams, profileLoading]);
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
    if (!isNew || loadingReport || profileLoading || !profile?.company_id || customerId) return;
    void loadOwnerCompany(profile.company_id);
  }, [isNew, loadingReport, profileLoading, profile?.company_id, customerId]);

  useEffect(() => {
    if (!isNew || !customerId) return;
    const c = customers.find((x) => x.id === customerId);
    if (c) {
      patchForm({
        customerId,
        asiakas: c.name,
        osoite: [c.address, c.city].filter(Boolean).join(', '),
      });
    }
  }, [customerId, customers, isNew]);

  useEffect(() => {
    if (!customerId) {
      setEquipment([]);
      if (!searchParams.get('equipmentId')) {
        setEquipmentId('');
      }
      previousCustomerIdRef.current = '';
      return;
    }

    if (
      previousCustomerIdRef.current &&
      previousCustomerIdRef.current !== customerId &&
      !searchParams.get('equipmentId')
    ) {
      setEquipmentId('');
    }
    previousCustomerIdRef.current = customerId;
    void loadEquipment(customerId);
  }, [customerId, searchParams]);

  useEffect(() => {
    if (!equipmentId) return;
    void loadEquipmentIntoForm(equipmentId);
  }, [equipmentId]);

  useEffect(() => {
    if (profileLoading) return;
    if (portalMode && isNew) {
      navigate('/huoltoraportit', { replace: true });
    }
  }, [profileLoading, portalMode, isNew, navigate]);

  async function loadReport(reportIdToLoad: string) {
    const viewKey = maintenanceReportViewKey(reportIdToLoad, session.user.id);
    const sessionEditor = readFreshMaintenanceReportEditorSnapshot(viewKey, reportIdToLoad);
    if (sessionEditor) {
      setForm(normalizeHuoltoReportData(sessionEditor.form));
      setCustomerId(sessionEditor.customerId);
      setEquipmentId(sessionEditor.equipmentId);
      setLoadingReport(false);
    } else {
      setLoadingReport(true);
    }

    const { data, error: loadError } = await supabase
      .from('maintenance_reports')
      .select(`
        id, status, title, data, owner_company_id, created_by_company_id,
        branding_company_id, partnership_id, customer_id, equipment_id, subscriber_id
      `)
      .eq('id', reportIdToLoad)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Raporttia ei löytynyt.');
      setLoadingReport(false);
      return;
    }

    const row = data as {
      id: string;
      status: string;
      title: string | null;
      data: HuoltoReportData;
      owner_company_id: string;
      created_by_company_id: string;
      partnership_id: string | null;
      customer_id: string | null;
      equipment_id: string | null;
      subscriber_id: string | null;
    };

    setReportId(row.id);
    setSavedReportTitle(row.title);
    setReportOwnerCompanyId(row.owner_company_id);
    setStatus(row.status);
    const normalized = normalizeHuoltoReportData({ ...createEmptyHuoltoReportData(), ...row.data });
    if (!sessionEditor || row.status !== 'draft') {
      setForm(normalized);
    }
    setCustomerId(row.customer_id ?? row.data.customerId ?? sessionEditor?.customerId ?? '');
    setSubscriberId(row.subscriber_id ?? '');
    setEquipmentId(row.equipment_id ?? sessionEditor?.equipmentId ?? '');

    await loadAccessibleCustomers();
    await loadOwnerCompany(row.owner_company_id);
    if (row.customer_id) await loadEquipment(row.customer_id);
    setHasUnsavedChanges(false);
    setLoadingReport(false);

    if (portalMode) {
      if (isMaintenanceReportPublished(row.status)) {
        navigate(`/huoltoraportit/${row.id}/tuloste`, { replace: true });
      } else {
        navigate('/huoltoraportit', { replace: true });
      }
    }
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
      const receiveField = partnershipPermsActingOnOwner(p, profile!.company_id!, partnerCompanyId);
      if (!partnershipModuleAccess(receiveField, 'maintenance_reports', 'write')) continue;

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
      .select(EQUIPMENT_SELECT)
      .eq('customer_id', selectedCustomerId)
      .order('name');
    setEquipment((data as Equipment[]) ?? []);
  }

  async function loadEquipmentIntoForm(selectedEquipmentId: string) {
    const { data } = await supabase
      .from('equipment')
      .select('id, name, tag, model, serial_number, location, device_type, huolto_technical_snapshot')
      .eq('id', selectedEquipmentId)
      .single();

    if (!data) return;
    const eq = data as Equipment & {
      model?: string;
      serial_number?: string;
      location?: string;
      device_type?: string | null;
      huolto_technical_snapshot?: Record<string, unknown> | null;
    };

    const deviceType = eq.device_type ?? form.laiteTyyppi;
    const basePatch: Partial<HuoltoReportData> = {
      laiteTunnus: String(eq.tag || eq.name || '').trim(),
      laiteMalli: String(eq.model || '').trim(),
      laiteSarjanumero:
        deviceType === 'lämpöpumppu' ? '' : String(eq.serial_number || '').trim(),
      laiteSijainti: String(eq.location || '').trim(),
    };
    if (eq.device_type) basePatch.laiteTyyppi = eq.device_type;

    const snapshotPatch = applyEquipmentSnapshotToForm(form, eq.huolto_technical_snapshot);
    const merged = mergeHuoltoReportData(form, { ...basePatch, ...snapshotPatch });
    setHasUnsavedChanges(true);
    setForm(eq.device_type ? applyDeviceTypeDefaults(merged, eq.device_type) : merged);
  }

  async function createCustomerAndSelect(draft: NewCustomerDraft) {
    if (!profile?.company_id || !draft.name.trim()) {
      setError('Asiakkaan nimi on pakollinen.');
      return;
    }
    const targetCompanyId = ownerCompanyId || profile.company_id;
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
    void loadOwnerCompany(created.owner_company_id);
    setBusy(false);
  }

  async function createEquipmentAndSelect(draft: NewEquipmentDraft) {
    if (!ownerCompanyId || !customerId) {
      setError('Valitse ensin asiakas.');
      return;
    }
    const name = draft.name.trim() || form.laiteTunnus.trim() || form.laiteMalli.trim();
    if (!name) {
      setError('Laitteen nimi, tunnus tai malli on pakollinen.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        owner_company_id: ownerCompanyId,
        customer_id: customerId,
        name,
        tag: draft.tag.trim() || form.laiteTunnus.trim() || null,
        model: draft.model.trim() || form.laiteMalli.trim() || null,
        serial_number: draft.serial_number.trim() || form.laiteSarjanumero.trim() || null,
        location: draft.location.trim() || form.laiteSijainti.trim() || null,
        device_type: form.laiteTyyppi || null,
      })
      .select('id, name, tag, model, serial_number, location, customer_id')
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Laitteen luonti epäonnistui.');
      setBusy(false);
      return;
    }

    const created = data as Equipment;
    setEquipment((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setEquipmentId(created.id);
    patchForm({
      laiteTunnus: created.tag || created.name || form.laiteTunnus,
      laiteMalli: created.model || form.laiteMalli,
      laiteSarjanumero: created.serial_number || form.laiteSarjanumero,
      laiteSijainti: created.location || form.laiteSijainti,
    });
    setRegistryMessage('Laite luotu rekisteriin ja valittu raportille.');
    setBusy(false);
  }

  async function saveEquipmentToRegistry() {
    if (!ownerCompanyId || !customerId) {
      setError('Valitse asiakas ennen laitteen tallennusta rekisteriin.');
      return;
    }
    if (!form.laiteTyyppi) {
      setError('Valitse laitetyyppi ennen rekisteriin tallennusta.');
      return;
    }
    setBusy(true);
    setError(null);
    setRegistryMessage(null);
    try {
      const savedEquipmentId = await saveEquipmentFromReport(
        form,
        customerId,
        ownerCompanyId,
        equipmentId || null,
        supabase,
      );
      setEquipmentId(savedEquipmentId);
      if (reportId) {
        await supabase
          .from('maintenance_reports')
          .update({ equipment_id: savedEquipmentId, customer_id: customerId })
          .eq('id', reportId);
      }
      await loadEquipment(customerId);
      setRegistryMessage(
        equipmentId ? 'Laite päivitetty rekisteriin.' : 'Laite tallennettu rekisteriin ja linkitetty raporttiin.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laitteen tallennus epäonnistui.');
    }
    setBusy(false);
  }

  function syncResolvedModules(next: Partial<HuoltoReportData>) {
    setHasUnsavedChanges(true);
    setForm((prev) => {
      const merged = mergeHuoltoReportData(prev, next);
      const condenserType = merged.lauhdutinTyyppiLaite ?? '';
      const liquidCondenserPatch =
        isChillerLikeDevice(merged.laiteTyyppi) && isLiquidCondenserType(condenserType)
          ? ensureChillerLiquidCondenserData(merged)
          : {};
      const selectedModules = resolveAutoModules({
        laiteTyyppi: merged.laiteTyyppi,
        lauhdutinTyyppiLaite: merged.lauhdutinTyyppiLaite,
        vapaajahdytysKaytossa: merged.vapaajahdytysKaytossa,
        manualModules: merged.selectedModules,
      });
      return {
        ...merged,
        ...liquidCondenserPatch,
        selectedModules,
        condenserData: merged.condenserData.map((c) => ({ ...c, tyyppi: condenserType || c.tyyppi })),
      };
    });
  }

  function onDeviceTypeChange(deviceType: string) {
    setHasUnsavedChanges(true);
    setForm((prev) => applyDeviceTypeDefaults(prev, deviceType));
  }

  function onCondenserTypeChange(condenserType: HuoltoReportData['lauhdutinTyyppiLaite']) {
    syncResolvedModules({
      lauhdutinTyyppiLaite: condenserType,
      condenserData: form.condenserData.map((c) => ({ ...c, tyyppi: condenserType || c.tyyppi })),
    });
  }

  function onFreeCoolingChange(enabled: boolean) {
    syncResolvedModules({ vapaajahdytysKaytossa: enabled });
  }

  function toggleModule(key: ModuleKey, checked: boolean) {
    if (usesManualModuleMenu(form.laiteTyyppi)) {
      syncResolvedModules({
        selectedModules: { ...form.selectedModules, [key]: checked },
      });
      return;
    }
    if (key === 'tiiveyskoe' || key === 'tyhjiointi') {
      patchForm({
        selectedModules: { ...form.selectedModules, [key]: checked },
      });
    }
  }

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
    if (profileLoading || loadingReport) {
      skipAutoSaveRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 800);
    return () => window.clearTimeout(timer);
  }, [profileLoading, loadingReport, reportId]);

  async function saveReport(nextStatus?: 'draft' | 'submitted', options?: { auto?: boolean }) {
    if (saveInFlightRef.current) {
      if (!options?.auto) setError('Tallennus on jo käynnissä — odota hetki.');
      return false;
    }
    if (!profile?.company_id || !ownerCompanyId) {
      if (!options?.auto) setError('Profiilista puuttuu yritys.');
      return false;
    }
    if (!form.laiteTyyppi) {
      if (!options?.auto) setError('Valitse laitetyyppi.');
      return false;
    }
    if (!customerId && !form.asiakas.trim()) {
      if (!options?.auto) setError('Valitse asiakas tai täytä asiakastiedot.');
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
    saveInFlightRef.current = true;

    try {
      const partnership = contextMode === 'partner' ? partnerships.find((p) => p.id === partnerId) : null;
      if (contextMode === 'partner') {
        if (!partnership) {
          if (!options?.auto) setError('Valitse kumppanuus, jonka nimissä raportti laaditaan.');
          if (options?.auto) setAutoSaveState('idle');
          return false;
        }
        const partnerPerms = partnershipPermsActingOnOwner(
          partnership,
          profile.company_id,
          ownerCompanyId,
        );
        if (!partnershipModuleAccess(partnerPerms, 'maintenance_reports', 'write')) {
          if (!options?.auto) {
            setError(
              'Kumppani ei ole myöntänyt huoltoraportin luontioikeutta. Pyydä kumppanin ylläpitäjää antamaan oikeus kohdassa Hallinta → Kumppanuudet.',
            );
          }
          if (options?.auto) setAutoSaveState('idle');
          return false;
        }
      }

      const dataPayload = buildReportDataPayload();

      const customerName = selectedCustomer?.name ?? (form.asiakas.trim() || null);
      const title = buildMaintenanceReportTitleFromData(customerName, dataPayload);

      const resolvedStatus = nextStatus ?? status;
      const rowPayload: Record<string, unknown> = {
        owner_company_id: ownerCompanyId,
        created_by_company_id: profile.company_id,
        branding_company_id: ownerCompanyId,
        partnership_id: partnership?.id ?? null,
        customer_id: customerId || null,
        subscriber_id: resolveSubscriberIdForReport(customerId, subscriberId, customers),
        equipment_id: equipmentId || null,
        assigned_user_id: session.user.id,
        title,
        data: dataPayload,
        status: resolvedStatus,
      };
      if (nextStatus === 'submitted') {
        rowPayload.completed_at = new Date().toISOString();
        rowPayload.status = 'submitted';
      } else if (nextStatus === 'draft') {
        rowPayload.completed_at = null;
        rowPayload.status = 'draft';
      }

      if (reportId) {
        const { error: updateError } = await supabase
          .from('maintenance_reports')
          .update(rowPayload)
          .eq('id', reportId);

        if (updateError) {
          if (!options?.auto) setError(updateError.message);
          if (options?.auto) setAutoSaveState('offline');
          return false;
        }
        setSavedReportTitle(title);
      } else {
        const { data, error: insertError } = await supabase
          .from('maintenance_reports')
          .insert(rowPayload)
          .select('id')
          .single();

        if (insertError || !data) {
          if (!options?.auto) setError(insertError?.message ?? 'Tallennus epäonnistui.');
          if (options?.auto) setAutoSaveState('offline');
          return false;
        }
        setReportId(data.id);
        setSavedReportTitle(title);
        clearLocalMaintenanceDraft(localDraftKey(null, session.user.id));
        navigate(`/huoltoraportit/${data.id}`, { replace: true, state: location.state });
      }

      if (nextStatus) setStatus(nextStatus);
      const timeLabel = new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
      setSavedAt(timeLabel);
      setHasUnsavedChanges(false);
      if (options?.auto) {
        setAutoSaveState('saved');
      }
      clearLocalMaintenanceDraft(draftStorageKey);
      clearLocalMaintenanceDraft(localDraftKey(reportId, session.user.id));

      if (equipmentId) {
        try {
          const snapshot = buildHuoltoEquipmentTechnicalSnapshot(dataPayload);
          await syncEquipmentFromReport(equipmentId, snapshot, supabase);
        } catch (syncErr) {
          console.error(syncErr);
        }
      }

      return true;
    } finally {
      saveInFlightRef.current = false;
      if (!options?.auto) setBusy(false);
    }
  }

  useEffect(() => {
    if (skipAutoSaveRef.current || status !== 'draft') return;
    writeLocalMaintenanceDraft(draftStorageKey, {
      form,
      customerId,
      equipmentId,
      contextMode,
      partnerId,
    });
  }, [form, customerId, equipmentId, contextMode, partnerId, status, draftStorageKey]);

  useEffect(() => {
    if (skipAutoSaveRef.current || status !== 'draft' || busy) return;
    if (!form.laiteTyyppi) return;
    if (!customerId && !form.asiakas.trim()) return;

    if (!isOnline) {
      setAutoSaveState('offline');
      return;
    }

    const timer = window.setTimeout(() => {
      void saveReport('draft', { auto: true });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [form, customerId, equipmentId, contextMode, partnerId, ownerCompanyId, status, isOnline, busy]);

  useRegisterDraftSaver(async () => {
    if (status !== 'draft') return;
    writeLocalMaintenanceDraft(draftStorageKey, {
      form,
      customerId,
      equipmentId,
      contextMode,
      partnerId,
    });
    if (!form.laiteTyyppi || (!customerId && !form.asiakas.trim())) return;
    if (isOnline) await saveReport('draft', { auto: true });
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPublished) {
      await saveReport();
    } else {
      await saveReport('draft');
    }
  }

  function buildReportDataPayload(): HuoltoReportData {
    return normalizeHuoltoReportData({
      ...form,
      ...huoltoPerformerFields(profile, session),
      customerId: customerId || form.customerId,
      asiakas: selectedCustomer?.name ?? form.asiakas,
      osoite:
        [selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || form.osoite,
      equipmentSnapshot: buildHuoltoEquipmentTechnicalSnapshot(form) as unknown as EquipmentSnapshot,
    });
  }

  async function openPrintPreview() {
    if (!reportId) return;
    setPrintBusy(true);
    setError(null);
    try {
      await openMaintenanceReportPrint(reportId, buildReportDataPayload());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tulosteen avaus epäonnistui.');
    } finally {
      setPrintBusy(false);
    }
  }

  async function deleteReport() {
    if (!reportId || !reportOwnerCompanyId) return;
    if (!window.confirm('Poistetaanko huoltoraportti pysyvästi? Tätä toimintoa ei voi perua.')) return;

    setDeleteBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from('maintenance_reports').delete().eq('id', reportId);
    setDeleteBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/huoltoraportit');
  }

  const leaveGuard = useDraftLeaveGuard({
    enabled: (status === 'draft' || canEditPublishedReport) && !profileLoading && !loadingReport,
    isDirty: hasUnsavedChanges,
    onSave: () => (isPublished ? saveReport() : saveReport('draft')),
  });

  if (profileLoading || loadingReport || (portalMode && isNew)) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  const brandingName = ownerCompany?.name ?? reportOwnerName;
  const canDeleteMaintenance = !isNew && reportOwnerCompanyId
    ? canDeleteCompanyOwnedEntity(
        reportOwnerCompanyId,
        profile?.company_id,
        profile?.role,
        profile?.is_global_admin,
      )
    : false;

  return (
    <AppLayout session={session}>
      <LeaveDraftDialog
        open={leaveGuard.showDialog}
        saveBusy={leaveGuard.saveAndLeaveBusy}
        onSaveAndLeave={() => void leaveGuard.confirmSaveAndLeave()}
        onLeaveWithoutSaving={leaveGuard.confirmLeaveWithoutSaving}
        onCancel={leaveGuard.cancelLeave}
      />
      <div className="page-header">
        <div>
          <NavigationBreadcrumb
            items={navigation.breadcrumb}
            onNavigate={leaveGuard.requestLeave}
          />
          <h1>{isNew ? 'Uusi huoltoraportti' : 'Huoltoraportti'}</h1>
          <p className="muted autosave-status">
            {autoSaveState === 'saving' && 'Tallennetaan automaattisesti…'}
            {autoSaveState === 'saved' && savedAt && `Tallennettu automaattisesti klo ${savedAt}`}
            {autoSaveState === 'offline' &&
              'Offline — muutokset tallennettu selaimeen. Synkronoidaan kun yhteys palaa.'}
            {autoSaveState === 'idle' && savedAt && `Viimeksi tallennettu klo ${savedAt}`}
            {status === 'draft' && autoSaveState === 'idle' && !savedAt && isOnline &&
              'Automaattinen tallennus käynnistyy kun laitetyyppi ja asiakas on valittu.'}
            {hasUnsavedChanges && (status === 'draft' || canEditPublishedReport) &&
              ' · Tallentamattomia muutoksia'}
            {canEditPublishedReport &&
              autoSaveState === 'idle' &&
              !hasUnsavedChanges &&
              ' · Valmis raportti — muutokset tallennetaan manuaalisesti.'}
          </p>
        </div>
        <div className="page-header-actions">
          {canDeleteMaintenance && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={deleteBusy || busy}
              onClick={() => void deleteReport()}
            >
              Poista raportti
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => leaveGuard.requestLeave(navigation.backTo)}
          >
            ← Takaisin
          </button>
          <span className={`badge badge-${status === 'draft' ? 'scheduled' : 'completed'}`}>
            {getMaintenanceReportStatusLabel(status)}
          </span>
          {reportId && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={printBusy || busy}
              onClick={() => void openPrintPreview()}
            >
              {printBusy ? 'Avataan…' : 'Tulosta / PDF'}
            </button>
          )}
        </div>
      </div>

      {!profile?.company_id && (
        <section className="panel">
          <p className="error">Yritys puuttuu profiilista. Aja npm run setup:dev ja kirjaudu uudelleen.</p>
        </section>
      )}

      <HuoltoEditUiProvider viewKey={reportViewKey}>
      <form className="panel form-grid maintenance-form" onSubmit={onSubmit}>
        <CollapsibleSection title="Raportointikonteksti" collapseKey="page:raportointi">
          <div className="info-grid">
            <div className="info-box">
              <span className="info-label">Yrityksen nimissä (brändi tulosteessa)</span>
              {!customerId && reportOwnerTargets.length > 1 ? (
                <select
                  className="info-box-select"
                  value={reportOwnerCompanyId ?? ''}
                  onChange={(event) => onReportOwnerChange(event.target.value)}
                  disabled={busy || !canEditCustomerEquipment}
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
              <span className="info-label">Laatija</span>
              <strong>{profile?.display_name ?? session.user.email}</strong>
              <span className="muted">{creatorCompanyName}</span>
            </div>
          </div>
          {canEditCustomerEquipment && selectedCustomer && contextMode === 'partner' && (
            <p className="muted">
              Valittu asiakas kuuluu kumppanin rekisteriin — raportti luodaan yrityksen{' '}
              <strong>{brandingName}</strong> nimissä.
            </p>
          )}
          {canEditCustomerEquipment && !customerId && reportOwnerTargets.length > 1 && (
            <p className="muted">
              Valitse ensin yritys, jonka nimissä raportti laaditaan. Asiakasrekisteristä näytetään
              vain kumppanit, joilla on huoltoraportin luontioikeus.
            </p>
          )}
        </CollapsibleSection>

        {profile?.company_id && (
          <CollapsibleSection title="Asiakas ja laite" collapseKey="page:asiakas-laite">
            <p className="muted">
              Hae asiakasta kaikista rekistereistä joihin sinulla on pääsy. Raportti luodaan automaattisesti
              sen yrityksen nimissä, jonka rekisteriin asiakas kuuluu. Uusi asiakas tallennetaan aina omaan
              rekisteriisi ({creatorCompanyName}).
            </p>

            {canEditCustomerEquipment ? (
              <>
                {ownerCompanyId ? (
                  <SubscriberPicker
                    subscribers={subscribersForOwner}
                    subscriberId={subscriberId}
                    disabled={busy}
                    hint="Valinnainen. Moniasiakas-tilaaja näkee kaikki tähän linkitetyt kohteet ja raportit."
                    onChange={setSubscriberId}
                  />
                ) : null}

                <CustomerRegistryPicker
                  customers={customers}
                  customerId={customerId}
                  myCompanyId={profile.company_id}
                  disabled={!profile?.company_id}
                  createRegistryName={creatorCompanyName}
                  busy={busy}
                  onSelect={(id) => {
                    setCustomerId(id);
                    setEquipmentId('');
                    const customer = customers.find((entry) => entry.id === id);
                    if (customer) {
                      void loadOwnerCompany(customer.owner_company_id);
                      if (customer.subscriber_id) setSubscriberId(customer.subscriber_id);
                    }
                  }}
                  onClear={() => {
                    setCustomerId('');
                    setEquipmentId('');
                    if (profile?.company_id) void loadOwnerCompany(profile.company_id);
                  }}
                  onCreate={createCustomerAndSelect}
                />

                {customerId && equipment.length >= 2 && reportId && status === 'draft' && (
                  <p className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        navigate(
                          `/huoltoraportit/uusi?customerId=${encodeURIComponent(customerId)}&copyFrom=${encodeURIComponent(reportId)}`,
                        )
                      }
                    >
                      Lisää pöytäkirja toiselle laitteelle (kopioi tiedot)
                    </button>
                  </p>
                )}

                {customerId && (
                  <EquipmentRegistryPicker
                    equipment={equipment}
                    equipmentId={equipmentId}
                    busy={busy}
                    placeholders={{
                      name: form.laiteTunnus || form.laiteMalli || undefined,
                      tag: form.laiteTunnus || undefined,
                      model: form.laiteMalli || undefined,
                      serial_number: form.laiteSarjanumero || undefined,
                      location: form.laiteSijainti || undefined,
                    }}
                    onSelect={setEquipmentId}
                    onClear={() => setEquipmentId('')}
                    onCreate={createEquipmentAndSelect}
                  />
                )}
              </>
            ) : (
              <div className="info-grid">
                <div className="info-box">
                  <span className="info-label">Asiakas</span>
                  <strong>{form.asiakas || selectedCustomer?.name || '—'}</strong>
                  <span className="muted">{form.osoite}</span>
                </div>
                {equipmentId && (
                  <div className="info-box">
                    <span className="info-label">Laite rekisterissä</span>
                    <strong>
                      {equipment.find((e) => e.id === equipmentId)?.tag ||
                        equipment.find((e) => e.id === equipmentId)?.name ||
                        form.laiteTunnus ||
                        '—'}
                    </strong>
                  </div>
                )}
              </div>
            )}

            <div className="line-form-grid">
              <label>
                Asiakas (tuloste)
                <input
                  value={form.asiakas}
                  onChange={(e) => patchForm({ asiakas: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
              <label>
                Osoite
                <input
                  value={form.osoite}
                  onChange={(e) => patchForm({ osoite: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
            </div>
            <div className="line-form-grid">
              <label>
                Y-tunnus
                <input
                  value={form.asiakasYtunnus ?? ''}
                  onChange={(e) => patchForm({ asiakasYtunnus: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
              <label>
                Yhteyshenkilö
                <input
                  value={form.asiakasYhteyshenkilo ?? ''}
                  onChange={(e) => patchForm({ asiakasYhteyshenkilo: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
              <label>
                Puhelin
                <input
                  value={form.asiakasPuhelin ?? ''}
                  onChange={(e) => patchForm({ asiakasPuhelin: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
              <label>
                Sähköposti
                <input
                  type="email"
                  value={form.asiakasEmail ?? ''}
                  onChange={(e) => patchForm({ asiakasEmail: e.target.value })}
                  disabled={!canEditCustomerEquipment}
                />
              </label>
            </div>
          </CollapsibleSection>
        )}

        <CollapsibleSection title="Laitetyyppi" collapseKey="page:laitetyyppi">
          <div className="chip-grid">
            {deviceTypes.map((dt) => (
              <label key={dt.value} className={`chip ${form.laiteTyyppi === dt.value ? 'chip-active' : ''}`}>
                <input
                  type="radio"
                  name="laiteTyyppi"
                  value={dt.value}
                  checked={form.laiteTyyppi === dt.value}
                  onChange={() => onDeviceTypeChange(dt.value)}
                />
                {dt.label}
              </label>
            ))}
          </div>
        </CollapsibleSection>

        {form.laiteTyyppi && (
          <>
            <CollapsibleSection
              title={isChillerLikeDevice(form.laiteTyyppi) ? 'Laite — perustiedot' : 'Laitetiedot'}
              collapseKey="page:laitetiedot"
            >
              {registryMessage && <p className="muted">{registryMessage}</p>}
              {customerId && (
                <div className="form-actions" style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void saveEquipmentToRegistry()}
                  >
                    {equipmentId ? 'Päivitä laite rekisteriin' : 'Tallenna laite rekisteriin'}
                  </button>
                  {equipmentId && selectedCustomer && (
                    <Link
                      to={`/asiakkaat/${selectedCustomer.id}`}
                      className="btn btn-secondary"
                    >
                      Avaa asiakkaan laiterekisteri
                    </Link>
                  )}
                </div>
              )}
              <div className="line-form-grid">
                <label>
                  Valmistaja
                  <input
                    value={form.laiteValmistaja}
                    onChange={(e) => patchForm({ laiteValmistaja: e.target.value })}
                  />
                </label>
                <label>
                  Malli
                  <input
                    value={form.laiteMalli}
                    onChange={(e) => patchForm({ laiteMalli: e.target.value })}
                  />
                </label>
                <label>
                  Laitetunnus
                  <input
                    value={form.laiteTunnus}
                    onChange={(e) => patchForm({ laiteTunnus: e.target.value })}
                  />
                </label>
                {form.laiteTyyppi !== 'lämpöpumppu' && (
                  <label>
                    Sarjanumero
                    <input
                      value={form.laiteSarjanumero}
                      onChange={(e) => patchForm({ laiteSarjanumero: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Sijainti
                  <input
                    value={form.laiteSijainti}
                    onChange={(e) => patchForm({ laiteSijainti: e.target.value })}
                  />
                </label>
                <label>
                  Käyttötarkoitus
                  <input
                    value={form.laiteKayttotarkoitus}
                    onChange={(e) => patchForm({ laiteKayttotarkoitus: e.target.value })}
                  />
                </label>
                {!isChillerLikeDevice(form.laiteTyyppi) && form.laiteTyyppi !== 'konvektorit' && form.laiteTyyppi !== 'lämpöpumppu' && (
                <>
                <label>
                  Kylmäaine
                  <select
                    value={form.kylmaaineTyyppi}
                    onChange={(e) => patchForm({ kylmaaineTyyppi: e.target.value })}
                  >
                    <option value="">— Valitse —</option>
                    {refrigerantTypes.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kylmäainepiirejä
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={form.kylmaainePiireja}
                    onChange={(e) => patchForm({ kylmaainePiireja: e.target.value })}
                  />
                </label>
                </>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Moduulit" collapseKey="page:moduulit">
              {usesManualModuleMenu(form.laiteTyyppi) ? (
                <>
                  <p className="muted">
                    Valitse raportin osiot. Jokainen moduuli avautuu värikoodattuna laatikona — klikkaa otsikkoa
                    avataksesi tai sulkeaksesi.
                  </p>
                  <div className="module-toggle-grid">
                    {manualModuleOptions.map((opt) => {
                      const theme = getModuleTheme(moduleThemeKeyForOption(opt.key));
                      const active = form.selectedModules[opt.key];
                      return (
                        <div
                          key={opt.key}
                          className={`module-toggle-card ${active ? 'module-toggle-card-active' : ''}`}
                          style={
                            {
                              '--module-accent': theme.header,
                              '--module-bg': theme.bg,
                              '--module-border': theme.border,
                            } as CSSProperties
                          }
                        >
                          <ToggleSwitch
                            label={opt.label}
                            checked={active}
                            onChange={(checked) => toggleModule(opt.key, checked)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">
                    Moduulit valitaan automaattisesti laitetyypin ja lauhdutinvalinnan mukaan. Tiiveyskoe ja
                    tyhjiöinti ovat aina valittavissa.
                  </p>
                  {activeModuleLabels.length > 0 && (
                    <div className="chip-grid">
                      {activeModuleLabels.map((label) => (
                        <span key={label} className="chip chip-active">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="module-toggle-grid">
                    {manualModuleOptions.map((opt) => (
                      <div key={opt.key} className="module-toggle-card">
                        <ToggleSwitch
                          label={opt.label}
                          checked={form.selectedModules[opt.key]}
                          onChange={(checked) => toggleModule(opt.key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CollapsibleSection>

            <div className="huolto-modules-stack">
            {form.selectedModules.kylmaainePiiri && (
              <>
                <RefrigerantChargeSection form={form} onChange={patchForm} />
                {isVj && (
                  <VjLauhdutinSection
                    form={form}
                    onChange={patchForm}
                    onCondenserTypeChange={onCondenserTypeChange}
                    onFreeCoolingChange={onFreeCoolingChange}
                  />
                )}
                <RefrigerantCircuitsSection form={form} onChange={patchForm} />
              </>
            )}

            {form.laiteTyyppi === 'lämpöpumppu' && (
              <RefrigerantChargeSection form={form} onChange={patchForm} />
            )}

            {showEvaporatorSection && <EvaporatorCircuitsSync form={form} onChange={syncForm} />}

            {showEvaporatorSection && !isChillerLikeDevice(form.laiteTyyppi) && (
              <EvaporatorsSection form={form} onChange={patchForm} />
            )}

            {showCondenserSection && <CondensersSection form={form} onChange={patchForm} />}

            {showLauhdutuspiiriSection && <LauhdutuspiiriSection form={form} onChange={patchForm} />}

            {showNestelauhduttimetSection && (
              <NestelauhduttimetSection
                units={form.nestelauhduttimetVj ?? []}
                shared={!!form.vjNestelauhdutusJaettu}
                laiteTyyppi={form.laiteTyyppi}
                onChange={(units) => patchForm({ nestelauhduttimetVj: units })}
              />
            )}

            {showJaahdytysvesiSection && <JaahdytysvesiSection form={form} onChange={patchForm} />}

            {isVj && <VjOhjausSection form={form} onChange={patchForm} />}

            {showVapaajahdytysSection && <VapaajahdytysSection form={form} onChange={patchForm} />}

            {showKonvektoritSection && (
              <KonvektoritSection
                rows={form.konvektoriRows ?? []}
                onChange={(rows) => patchForm({ konvektoriRows: rows })}
              />
            )}

            {showLampopumppuSection && (
              <LampopumppuSection
                form={form}
                onChange={patchForm}
                showUlkoyksikko={lampopumppuParts.ulkoyksikko}
                showSisayksikko={lampopumppuParts.sisayksikko}
                showMittaukset={lampopumppuParts.mittaukset}
              />
            )}

            {showMlpSection && form.mlpData && <MlpSection form={form} onChange={patchForm} />}

            {form.selectedModules.tiiveyskoe && (
              <TiiveyskoeSection
                form={form}
                onChange={patchForm}
                reportId={reportId}
                userId={session.user.id}
              />
            )}

            {form.selectedModules.tyhjiointi && (
              <TyhjiointiSection
                form={form}
                onChange={patchForm}
                reportId={reportId}
                userId={session.user.id}
              />
            )}

            {pendingModuleKeys.length > 0 && (
              <CollapsibleSection title="Valitut moduulit" defaultOpen={false}>
                {pendingModuleKeys.map((key) => (
                  <div key={key} className="expense-section module-placeholder">
                    <h3>{moduleLabel(key)}</h3>
                    <p className="muted">
                      Moduulin lomake tulossa — rakenne kopioitu BC HuoltoRaportti-esimerkistä (
                      {key}).
                    </p>
                  </div>
                ))}
              </CollapsibleSection>
            )}

            <HuomiotSection
              form={form}
              onChange={patchForm}
              reportId={reportId ?? undefined}
              userId={session.user.id}
            />
            </div>

            <CollapsibleSection
              title={huoltoTiedotSectionTitle(form.laiteTyyppi)}
              collapseKey="page:huoltotiedot"
            >
              {showHuoltoVsKayttoonottoSelector(form.laiteTyyppi) && (
                <label style={{ maxWidth: '280px' }}>
                  Raportin tyyppi
                  <select
                    value={
                      form.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto'
                    }
                    onChange={(e) =>
                      patchForm({
                        huoltoReportDocumentKind: e.target.value as HuoltoReportData['huoltoReportDocumentKind'],
                      })
                    }
                  >
                    <option value="huolto">Huolto</option>
                    <option value="kayttoonotto">Käyttöönotto</option>
                  </select>
                </label>
              )}
              <div className="toggle-grid">
                <ToggleSwitch
                  label="Huolto suoritettu"
                  checked={form.huoltoSuoritettu}
                  onChange={(checked) => patchForm({ huoltoSuoritettu: checked })}
                />
                <ToggleSwitch
                  label="Kylmäaine / vuototarkastus"
                  checked={form.huoltoKylmaaineVuotoTarkastus}
                  onChange={(checked) => patchForm({ huoltoKylmaaineVuotoTarkastus: checked })}
                />
                <ToggleSwitch
                  label="Laitteessa vika / puutteita"
                  checked={form.huoltoLaiteessaVika}
                  onChange={(checked) => patchForm({ huoltoLaiteessaVika: checked })}
                />
                <ToggleSwitch
                  label="Piilota varoitukset tulosteessa (HUOMIOITAVAA, COP-ohjeet)"
                  checked={form.piilotaVaroitukset ?? false}
                  onChange={(checked) => patchForm({ piilotaVaroitukset: checked })}
                />
              </div>
              <div className="line-form-grid">
                <label>
                  Suorittaja (raportin laatija)
                  <input
                    value={form.huoltoSuorittajaNimi}
                    readOnly
                    disabled
                    title="Haetaan omista tiedoista (Hallinta → Omat tiedot)"
                  />
                </label>
                <label>
                  TUKES-numero
                  <input
                    value={form.huoltoSuorittajaTUKES}
                    readOnly
                    disabled
                    placeholder={profile?.tukes_number ? undefined : 'Lisää omissa tiedoissa'}
                    title="Haetaan omista tiedoista (Hallinta → Omat tiedot)"
                  />
                </label>
                {!form.huoltoSuorittajaTUKES.trim() && (
                  <p className="muted huolto-span-all">
                    TUKES-numero puuttuu profiilista.{' '}
                    <Link to="/hallinta/omat">Täytä omat tiedot</Link>
                  </p>
                )}
                <label>
                  Päivämäärä
                  <input
                    type="date"
                    value={form.huoltoPaivamaara}
                    onChange={(e) => patchForm({ huoltoPaivamaara: e.target.value })}
                  />
                </label>
              </div>
            </CollapsibleSection>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => leaveGuard.requestLeave(navigation.backTo)}
          >
            Takaisin
          </button>
          {status === 'draft' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !form.laiteTyyppi}
                onClick={() => void saveReport('draft')}
              >
                {busy ? 'Tallennetaan…' : 'Tallenna luonnos'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !form.laiteTyyppi}
                onClick={() => void saveReport('submitted')}
              >
                Merkitse valmiiksi
              </button>
            </>
          )}
          {canEditPublishedReport && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !form.laiteTyyppi}
                onClick={() => void saveReport()}
              >
                {busy ? 'Tallennetaan…' : 'Tallenna muutokset'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !form.laiteTyyppi}
                onClick={() => void saveReport('draft')}
              >
                Palauta luonnokseksi
              </button>
            </>
          )}
        </div>
      </form>
      </HuoltoEditUiProvider>
    </AppLayout>
  );
}
