import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { huoltoPerformerFields } from '../lib/huoltoRaportti/performerFromProfile';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import LeaveDraftDialog from '../components/LeaveDraftDialog';
import { useMaintenanceReportNavigation } from '../hooks/useMaintenanceReportNavigation';
import { useDraftLeaveGuard } from '../hooks/useDraftLeaveGuard';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import MaintenanceReportTabNav from '../components/huoltoRaportti/MaintenanceReportTabNav';
import { MaintenanceReportTabDialog } from '../components/huoltoRaportti/MaintenanceReportTabDialog';
import { MaintenanceReportBasicsPanel } from '../components/huoltoRaportti/MaintenanceReportBasicsPanel';
import { MaintenanceDeviceDialog } from '../components/huoltoRaportti/MaintenanceDeviceDialog';
import { HuoltoModulePresentationProvider } from '../components/huoltoRaportti/HuoltoModulePresentationContext';
import ToggleSwitch from '../components/ToggleSwitch';
import { CondensersSection } from '../components/huoltoRaportti/CondensersSection';
import { EvaporatorCircuitsSync } from '../components/huoltoRaportti/EvaporatorCircuitsSync';
import { EvaporatorsSection } from '../components/huoltoRaportti/EvaporatorsSection';
import { JaahdytysvesiSection } from '../components/huoltoRaportti/JaahdytysvesiSection';
import { LauhdutuspiiriSection } from '../components/huoltoRaportti/LauhdutuspiiriSection';
import { HuomiotSection } from '../components/huoltoRaportti/HuomiotSection';
import { VapaajahdytysSection } from '../components/huoltoRaportti/VapaajahdytysSection';
import { VjLauhdutinSection } from '../components/huoltoRaportti/VjLauhdutinSection';
import { KonvektoritSection } from '../components/huoltoRaportti/KonvektoritSection';
import { SiblingEquipmentCopyDialog } from '../components/huoltoRaportti/SiblingEquipmentCopyDialog';
import { LampopumppuSection } from '../components/huoltoRaportti/LampopumppuSection';
import { MlpSection } from '../components/huoltoRaportti/MlpSection';
import { NestelauhduttimetSection } from '../components/huoltoRaportti/NestelauhduttimetSection';
import { RefrigerantCircuitsSection } from '../components/huoltoRaportti/RefrigerantCircuitsSection';
import { TiiveyskoeSection } from '../components/huoltoRaportti/TiiveyskoeSection';
import { TyhjiointiSection } from '../components/huoltoRaportti/TyhjiointiSection';
import {
  applyDeviceTypeDefaults,
  buildMaintenanceReportTitleFromData,
  hideMaintenancePrintWarnings,
  createEmptyHuoltoReportData,
  createEmptyMlpData,
  createEmptyKonvektoriRow,
  ensureChillerLiquidCondenserData,
  konvektoriRowsMaintenanceScore,
  mergeHuoltoReportData,
  normalizeHuoltoReportData,
  pickBestKonvektoriRows,
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
  SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT,
  type SubscriberPortalVisibility,
} from '../lib/subscriberPortalVisibility';
import {
  deviceTypes,
  moduleSelectionOptions,
  showHuoltoVsKayttoonottoSelector,
  type ModuleKey,
} from '../lib/huoltoRaportti/constants';
import {
  getManualModuleOptions,
  isChillerLikeDevice,
  isKonvektoritDevice,
  isLiquidCondenserType,
  lampopumppuSubmodules,
  resolveAutoModules,
  showCondenserModules,
  showEvaporatorModules,
  showLampopumppuModules,
  showMlpModules,
  showChillerKiinteistoSection,
  showChillerEnergySection,
  showNestelauhduttimetModules,
  showVjLauhdutuspiiriModules,
  usesManualModuleMenu,
  usesRefrigerantServiceExtras,
} from '../lib/huoltoRaportti/deviceModuleLogic';
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
  readLocalMaintenanceDraft,
  writeLocalMaintenanceDraft,
} from '../lib/maintenanceReportDraftStorage';
import { openMaintenanceReportKonvektoriFaultPrint, openMaintenanceReportPrint } from '../lib/maintenanceReportPrintAction';
import { filterFaultyKonvektoriRows } from '../lib/huoltoRaportti/konvektoriTarkastus';
import { syncMaintenanceReportPhotosFromDb } from '../lib/maintenanceReportPhotoSync';
import { isPortalUser } from '../lib/portalWorkOrder';
import { useProfile } from '../hooks/useProfile';
import { useMaintenanceReportScrollRestore } from '../hooks/useMaintenanceReportScrollRestore';
import { useRegisterDraftSaver } from '../hooks/useRegisterDraftSaver';
import { canDeleteCompanyOwnedEntity } from '../lib/deletePermissions';
import type { Company, Customer, Equipment, Partnership, Subscriber } from '../types';

interface Props {
  session: Session;
}


import {
  buildMaintenanceReportTabs,
  type MaintenanceReportTabId,
} from '../lib/huoltoRaportti/maintenanceReportTabs';
import {
  isMaintenanceBasicsComplete,
  validateMaintenanceCustomerBasics,
  validateMaintenanceDeviceBasics,
} from '../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import { HuoltoEditUiProvider } from '../components/huoltoRaportti/HuoltoEditUiContext';
import { cloneHuoltoReportForSiblingEquipment } from '../lib/huoltoRaportti/cloneReportForSiblingEquipment';
import {
  createSiblingMaintenanceReport,
  type SiblingEquipmentCopyInput,
} from '../lib/huoltoRaportti/siblingEquipmentCopy';
import {
  maintenanceReportViewKey,
  maintenanceReportEditorAheadOfDb,
  persistMaintenanceReportEditorSnapshot,
  readFreshMaintenanceReportEditorSnapshot,
  readMaintenanceReportEditorSnapshot,
  syncMaintenanceReportEditorAfterSave,
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
  const [, setEquipment] = useState<Equipment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [subscriberId, setSubscriberId] = useState('');
  const [subscriberPortalVisibility, setSubscriberPortalVisibility] =
    useState<SubscriberPortalVisibility>(SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [loadingReport, setLoadingReport] = useState(!isNew);
  const [reportReady, setReportReady] = useState(isNew);
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
  /** Estää raportin avauksessa rekisterin snapshotin ylikirjoittamasta tallennettua dataa. */
  const skipEquipmentRegistryHydrateRef = useRef<string | null>(null);
  const equipmentHydrateGenRef = useRef(0);
  const skipAutoSaveRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const formStateRef = useRef({ form, customerId, equipmentId });
  formStateRef.current = { form, customerId, equipmentId };
  const lastSavedKonvektoriScoreRef = useRef(0);
  const loadedReportIdRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const copyFromLoadedRef = useRef(false);
  const siblingCopyDefaultsRef = useRef<{
    malli?: string;
    valmistaja?: string;
    sourceLabel?: string;
  }>({});
  const moreActionsRef = useRef<HTMLDetailsElement>(null);
  const [copySiblingMode, setCopySiblingMode] = useState(false);
  const [siblingCopyDialogOpen, setSiblingCopyDialogOpen] = useState(false);
  const [siblingCopyBusy, setSiblingCopyBusy] = useState(false);
  const [copySourceEquipmentId, setCopySourceEquipmentId] = useState<string | null>(null);

  const draftStorageKey = localDraftKey(reportId, session.user.id);
  const reportViewKey = maintenanceReportViewKey(reportId, session.user.id);

  useMaintenanceReportScrollRestore({
    reportId,
    userId: session.user.id,
    ready: !profileLoading && !loadingReport,
    status,
    formStateRef,
  });

  const portalMode = isPortalUser(profile);
  const isPublished = isMaintenanceReportPublished(status);
  const canEditCustomerEquipment = !portalMode && (isNew || status === 'draft');
  const canEditPublishedReport = !portalMode && isPublished;
  const showEquipmentRegistryActions =
    !portalMode
    && Boolean(customerId && form.laiteTyyppi)
    && (canEditCustomerEquipment || canEditPublishedReport || copySiblingMode);
  const showCopyToSiblingAction =
    showEquipmentRegistryActions
    && !isKonvektoritDevice(form.laiteTyyppi)
    && Boolean(reportId && !copySiblingMode)
    && (status === 'draft' || canEditPublishedReport);

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
  const showEvaporatorSection = showEvaporatorModules(form.laiteTyyppi, form.selectedModules);
  const showCondenserSection = showCondenserModules(form.laiteTyyppi, form.selectedModules);
  const showMlpSection = showMlpModules(form.laiteTyyppi, form.selectedModules);
  const showChillerKiinteistoTab = showChillerKiinteistoSection(form.laiteTyyppi);
  const showChillerEnergyTab = showChillerEnergySection(form.laiteTyyppi);
  const showKonvektoritSection = form.selectedModules.konvektorit;
  const hasFaultyKonvektorit = useMemo(
    () =>
      isKonvektoritDevice(form.laiteTyyppi)
      && filterFaultyKonvektoriRows(form.konvektoriRows).length > 0,
    [form.laiteTyyppi, form.konvektoriRows],
  );
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
  const implementedModules: ModuleKey[] = moduleSelectionOptions.map((o) => o.key);
  const pendingModuleKeys = (Object.keys(form.selectedModules) as ModuleKey[]).filter(
    (k) => form.selectedModules[k] && !implementedModules.includes(k),
  );

  const customerBasicsInput = useMemo(
    () => ({
      profileCompanyId: profile?.company_id,
      reportOwnerCompanyId,
      reportOwnerTargets,
      customerId,
      asiakas: form.asiakas,
      osoite: form.osoite,
      canEditCustomerEquipment,
    }),
    [
      profile?.company_id,
      reportOwnerCompanyId,
      reportOwnerTargets,
      customerId,
      form.asiakas,
      form.osoite,
      canEditCustomerEquipment,
    ],
  );

  const deviceBasicsInput = useMemo(
    () => ({
      laiteTyyppi: form.laiteTyyppi,
      laiteValmistaja: form.laiteValmistaja,
      laiteMalli: form.laiteMalli,
      laiteTunnus: form.laiteTunnus,
      laiteSarjanumero: form.laiteSarjanumero,
      laiteSijainti: form.laiteSijainti,
      laiteKayttotarkoitus: form.laiteKayttotarkoitus,
      kylmaaineTyyppi: form.kylmaaineTyyppi,
      kylmaainePiireja: form.kylmaainePiireja,
      selectedModules: form.selectedModules,
    }),
    [
      form.laiteTyyppi,
      form.laiteValmistaja,
      form.laiteMalli,
      form.laiteTunnus,
      form.laiteSarjanumero,
      form.laiteSijainti,
      form.laiteKayttotarkoitus,
      form.kylmaaineTyyppi,
      form.kylmaainePiireja,
      form.selectedModules,
    ],
  );

  const basicsComplete = useMemo(
    () => isMaintenanceBasicsComplete(customerBasicsInput, deviceBasicsInput),
    [customerBasicsInput, deviceBasicsInput],
  );

  const maintenanceTabs = useMemo(() => {
    const tabs = buildMaintenanceReportTabs({
      laiteTyyppi: form.laiteTyyppi,
      selectedModules: form.selectedModules,
      showEvaporatorSection,
      showCondenserSection,
      showLauhdutuspiiriSection,
      showNestelauhduttimetSection,
      showJaahdytysvesiSection,
      showVapaajahdytysSection,
      showKonvektoritSection,
      showLampopumppuSection,
      showMlpSection,
      showChillerKiinteistoSection: showChillerKiinteistoTab,
      showChillerEnergySection: showChillerEnergyTab,
    });
    if (basicsComplete) return tabs;
    return tabs.filter((tab) => tab.id === 'raportointi');
  }, [
    basicsComplete,
    form.laiteTyyppi,
    form.selectedModules,
    showEvaporatorSection,
    showCondenserSection,
    showLauhdutuspiiriSection,
    showNestelauhduttimetSection,
    showJaahdytysvesiSection,
    showVapaajahdytysSection,
    showKonvektoritSection,
    showLampopumppuSection,
    showMlpSection,
    showChillerKiinteistoTab,
    showChillerEnergyTab,
  ]);

  const [openTabId, setOpenTabId] = useState<MaintenanceReportTabId | null>(null);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [basicsFieldErrors, setBasicsFieldErrors] = useState<Record<string, string>>({});
  const [deviceFieldErrors, setDeviceFieldErrors] = useState<Record<string, string>>({});
  const [basicsGateMessage, setBasicsGateMessage] = useState<string | null>(null);
  const basicsPromptedRef = useRef(false);

  useEffect(() => {
    if (!openTabId) return;
    if (!maintenanceTabs.some((tab) => tab.id === openTabId)) {
      setOpenTabId(basicsComplete ? null : 'raportointi');
    }
  }, [maintenanceTabs, openTabId, basicsComplete]);

  useEffect(() => {
    if (openTabId && openTabId !== 'raportointi' && !basicsComplete) {
      setOpenTabId('raportointi');
    }
  }, [openTabId, basicsComplete]);

  useEffect(() => {
    if (profileLoading || loadingReport || basicsComplete || basicsPromptedRef.current) return;
    basicsPromptedRef.current = true;
    setOpenTabId('raportointi');
  }, [profileLoading, loadingReport, basicsComplete]);

  useEffect(() => {
    if (basicsComplete) setBasicsGateMessage(null);
  }, [basicsComplete]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    const syncMoreActions = () => {
      if (moreActionsRef.current) moreActionsRef.current.open = media.matches;
    };
    syncMoreActions();
    media.addEventListener('change', syncMoreActions);
    return () => media.removeEventListener('change', syncMoreActions);
  }, []);

  const optionalMaintenanceModules = useMemo(
    () => getManualModuleOptions(form.laiteTyyppi).filter((opt) => opt.key === 'tiiveyskoe' || opt.key === 'tyhjiointi'),
    [form.laiteTyyppi],
  );

  const persistDraftLocally = useCallback(
    (nextForm: HuoltoReportData) => {
      formStateRef.current = {
        ...formStateRef.current,
        form: nextForm,
      };
      if (status !== 'draft' || !reportId) return;
      persistMaintenanceReportEditorSnapshot(reportViewKey, {
        reportId,
        form: nextForm,
        customerId: formStateRef.current.customerId,
        equipmentId: formStateRef.current.equipmentId,
      });
      writeLocalMaintenanceDraft(draftStorageKey, {
        form: nextForm,
        customerId: formStateRef.current.customerId,
        equipmentId: formStateRef.current.equipmentId,
        contextMode,
        partnerId,
      });
    },
    [status, reportId, reportViewKey, draftStorageKey, contextMode, partnerId],
  );

  const applyFormPatch = useCallback(
    (patch: Partial<HuoltoReportData>, options?: { markDirty?: boolean }) => {
      const next = mergeHuoltoReportData(formStateRef.current.form, patch);
      persistDraftLocally(next);
      if (options?.markDirty !== false) setHasUnsavedChanges(true);
      setForm(next);
    },
    [persistDraftLocally],
  );

  const patchForm = useCallback(
    (patch: Partial<HuoltoReportData>) => applyFormPatch(patch, { markDirty: true }),
    [applyFormPatch],
  );

  const syncForm = useCallback(
    (patch: Partial<HuoltoReportData>) => applyFormPatch(patch, { markDirty: false }),
    [applyFormPatch],
  );

  useEffect(() => {
    if (!showKonvektoritSection) return;
    if ((form.konvektoriRows?.length ?? 0) > 0) return;
    syncForm({ konvektoriRows: [createEmptyKonvektoriRow()] });
  }, [showKonvektoritSection, form.konvektoriRows?.length, syncForm]);

  useEffect(() => {
    if (status !== 'draft' || !reportId || profileLoading || loadingReport) return;

    const restoreIfWiped = () => {
      if (document.visibilityState !== 'visible') return;

      const sessionSnap = readMaintenanceReportEditorSnapshot(reportViewKey, reportId);
      const localDraft = readLocalMaintenanceDraft<{
        form: HuoltoReportData;
        customerId: string;
        equipmentId: string;
      }>(draftStorageKey);

      const sessionForm = sessionSnap ? normalizeHuoltoReportData(sessionSnap.form) : null;
      const localForm = localDraft ? normalizeHuoltoReportData(localDraft.payload.form) : null;
      const current = formStateRef.current.form;
      const currentScore = konvektoriRowsMaintenanceScore(current.konvektoriRows);
      const sessionScore = konvektoriRowsMaintenanceScore(sessionForm?.konvektoriRows);
      const localScore = konvektoriRowsMaintenanceScore(localForm?.konvektoriRows);
      const bestScore = Math.max(sessionScore, localScore);

      if (bestScore <= currentScore) return;

      const konvektoriRows = pickBestKonvektoriRows(
        sessionForm?.konvektoriRows,
        localForm?.konvektoriRows,
        current.konvektoriRows,
      );
      const source =
        sessionScore >= localScore && sessionForm
          ? sessionForm
          : localForm ?? sessionForm ?? current;

      applyFormPatch({ ...source, konvektoriRows }, { markDirty: maintenanceReportEditorAheadOfDb(reportViewKey) });
    };

    document.addEventListener('visibilitychange', restoreIfWiped);
    window.addEventListener('pageshow', restoreIfWiped);
    return () => {
      document.removeEventListener('visibilitychange', restoreIfWiped);
      window.removeEventListener('pageshow', restoreIfWiped);
    };
  }, [
    status,
    reportId,
    reportViewKey,
    draftStorageKey,
    profileLoading,
    loadingReport,
    applyFormPatch,
  ]);

  useEffect(() => {
    if ((showMlpSection || showChillerKiinteistoTab || showChillerEnergyTab) && !form.mlpData) {
      syncForm({ mlpData: createEmptyMlpData() });
    }
  }, [showMlpSection, showChillerKiinteistoTab, showChillerEnergyTab, form.mlpData]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadPartnerships();
  }, [profile?.company_id]);

  useEffect(() => {
    if (isNew || !id) return;
    if (loadedReportIdRef.current === id) return;
    void loadReport(id);
  }, [id, isNew]);

  useEffect(() => {
    if (!reportReady || loadingReport) return;
    setHasUnsavedChanges(false);
  }, [reportReady, loadingReport, reportId]);

  useEffect(() => {
    formStateRef.current = { ...formStateRef.current, customerId, equipmentId };
  }, [customerId, equipmentId]);

  useEffect(() => {
    if (profileLoading || loadingReport || status !== 'draft') return;
    const performer = huoltoPerformerFields(profile, session);
    const prev = formStateRef.current.form;
    if (
      prev.huoltoSuorittajaNimi === performer.huoltoSuorittajaNimi &&
      prev.huoltoSuorittajaTUKES === performer.huoltoSuorittajaTUKES
    ) {
      return;
    }
    syncForm(performer);
  }, [
    profileLoading,
    loadingReport,
    status,
    profile?.display_name,
    profile?.tukes_number,
    profile?.email,
    session,
    syncForm,
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
    if (profile?.company_id && reportOwnerTargets.length <= 1) {
      setReportOwnerCompanyId(profile.company_id);
    }
  }, [selectedCustomer, profile?.company_id, reportOwnerCompanyId, reportOwnerTargets.length]);

  function onReportOwnerChange(companyId: string) {
    setReportOwnerCompanyId(companyId);
    setHasUnsavedChanges(true);
  }

  useEffect(() => {
    if (!isKonvektoritDevice(form.laiteTyyppi) || !copySiblingMode) return;
    setCopySiblingMode(false);
    setCopySourceEquipmentId(null);
  }, [form.laiteTyyppi, copySiblingMode]);

  useEffect(() => {
    if (!isNew || !ownerCompanyId) return;
    if (searchParams.get('copyFrom')) return;
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
        .select('data, customer_id, owner_company_id, subscriber_id, equipment_id')
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
        equipment_id: string | null;
      };

      if (isKonvektoritDevice(row.data?.laiteTyyppi ?? '')) {
        setError('Konvektoriverkoston pöytäkirjaa ei voi kopioida uudelle laitteelle.');
        return;
      }

      siblingCopyDefaultsRef.current = {
        malli: row.data.laiteMalli?.trim() || undefined,
        valmistaja: row.data.laiteValmistaja?.trim() || undefined,
        sourceLabel: [row.data.laiteTunnus, row.data.laiteMalli].filter((v) => String(v ?? '').trim()).join(' · ') || undefined,
      };

      setForm(cloneHuoltoReportForSiblingEquipment(row.data));
      setCopySourceEquipmentId(row.equipment_id);
      setCopySiblingMode(true);
      setEquipmentId('');
      if (row.customer_id) setCustomerId(row.customer_id);
      if (row.owner_company_id) setReportOwnerCompanyId(row.owner_company_id);
      if (row.subscriber_id) setSubscriberId(row.subscriber_id);
      setHasUnsavedChanges(true);
      setSiblingCopyDialogOpen(true);
      setRegistryMessage(null);
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
    if (skipEquipmentRegistryHydrateRef.current === equipmentId) {
      skipEquipmentRegistryHydrateRef.current = null;
      return;
    }
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
    setLoadingReport(true);

    const { data, error: loadError } = await supabase
      .from('maintenance_reports')
      .select(`
        id, status, title, data, owner_company_id, created_by_company_id,
        branding_company_id, partnership_id, customer_id, equipment_id, subscriber_id, subscriber_portal_visibility
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
      subscriber_portal_visibility: SubscriberPortalVisibility | null;
    };

    const normalized = normalizeHuoltoReportData({ ...createEmptyHuoltoReportData(), ...row.data });
    const sessionEditor =
      readFreshMaintenanceReportEditorSnapshot(viewKey, reportIdToLoad)
      ?? readMaintenanceReportEditorSnapshot(viewKey, reportIdToLoad);
    const localDraft = readLocalMaintenanceDraft<{
      form: HuoltoReportData;
      customerId: string;
      equipmentId: string;
    }>(localDraftKey(reportIdToLoad, session.user.id));

    let formToUse = normalized;
    if (row.status === 'draft') {
      const sessionForm = sessionEditor ? normalizeHuoltoReportData(sessionEditor.form) : null;
      const localForm = localDraft ? normalizeHuoltoReportData(localDraft.payload.form) : null;
      const baseForm = sessionForm ?? localForm ?? normalized;
      const konvektoriRows = pickBestKonvektoriRows(
        sessionForm?.konvektoriRows,
        localForm?.konvektoriRows,
        normalized.konvektoriRows,
      );
      formToUse = mergeHuoltoReportData(normalized, { ...baseForm, konvektoriRows });
    }

    const photoSync = await syncMaintenanceReportPhotosFromDb(reportIdToLoad, formToUse);
    formToUse = photoSync.data;
    if (photoSync.changed) {
      await supabase
        .from('maintenance_reports')
        .update({ data: formToUse, updated_at: new Date().toISOString() })
        .eq('id', reportIdToLoad);
    }

    const nextCustomerId = row.customer_id ?? row.data.customerId ?? sessionEditor?.customerId ?? '';
    const nextEquipmentId = row.equipment_id ?? sessionEditor?.equipmentId ?? '';
    formStateRef.current = {
      form: formToUse,
      customerId: nextCustomerId,
      equipmentId: nextEquipmentId,
    };
    lastSavedKonvektoriScoreRef.current = konvektoriRowsMaintenanceScore(normalized.konvektoriRows);
    loadedReportIdRef.current = reportIdToLoad;

    setReportId(row.id);
    setSavedReportTitle(row.title);
    setReportOwnerCompanyId(row.owner_company_id);
    setStatus(row.status);
    setForm(formToUse);
    setCustomerId(nextCustomerId);
    setSubscriberId(row.subscriber_id ?? '');
    setSubscriberPortalVisibility(
      row.subscriber_portal_visibility ?? SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT,
    );
    if (nextEquipmentId) {
      skipEquipmentRegistryHydrateRef.current = nextEquipmentId;
    }
    setEquipmentId(nextEquipmentId);

    await loadAccessibleCustomers();
    await loadOwnerCompany(row.owner_company_id);
    if (row.customer_id) await loadEquipment(row.customer_id);
    setReportReady(true);
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
    const hydrateGen = ++equipmentHydrateGenRef.current;
    const { data } = await supabase
      .from('equipment')
      .select('id, name, tag, model, serial_number, location, device_type, huolto_technical_snapshot')
      .eq('id', selectedEquipmentId)
      .single();

    if (!data || hydrateGen !== equipmentHydrateGenRef.current) return;
    const eq = data as Equipment & {
      model?: string;
      serial_number?: string;
      location?: string;
      device_type?: string | null;
      huolto_technical_snapshot?: Record<string, unknown> | null;
    };

    const currentForm = formStateRef.current.form;
    const deviceType = eq.device_type ?? currentForm.laiteTyyppi;
    const basePatch: Partial<HuoltoReportData> = {
      laiteTunnus: String(eq.tag || eq.name || '').trim(),
      laiteMalli: String(eq.model || '').trim(),
      laiteSarjanumero:
        deviceType === 'lämpöpumppu' ? '' : String(eq.serial_number || '').trim(),
      laiteSijainti: String(eq.location || '').trim(),
    };
    if (eq.device_type) basePatch.laiteTyyppi = eq.device_type;

    const snapshotPatch = applyEquipmentSnapshotToForm(currentForm, eq.huolto_technical_snapshot);
    delete snapshotPatch.konvektoriRows;
    const merged = mergeHuoltoReportData(currentForm, { ...basePatch, ...snapshotPatch });
    const finalForm = eq.device_type ? applyDeviceTypeDefaults(merged, eq.device_type) : merged;
    formStateRef.current = { ...formStateRef.current, form: finalForm };
    setHasUnsavedChanges(true);
    setForm(finalForm);
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

  async function saveEquipmentToRegistry() {
    if (!ownerCompanyId || !customerId) {
      setError('Valitse asiakas ennen laitteen tallennusta rekisteriin.');
      return;
    }
    if (!form.laiteTyyppi) {
      setError('Valitse laitetyyppi ennen rekisteriin tallennusta.');
      return;
    }
    if (!form.laiteTunnus.trim() && copySiblingMode) {
      setSiblingCopyDialogOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    setRegistryMessage(null);
    try {
      const creatingSiblingCopy =
        copySiblingMode && (!equipmentId || equipmentId === copySourceEquipmentId);
      const targetEquipmentId = creatingSiblingCopy ? null : equipmentId || null;
      const savedEquipmentId = await saveEquipmentFromReport(
        form,
        customerId,
        ownerCompanyId,
        targetEquipmentId,
        supabase,
      );
      setEquipmentId(savedEquipmentId);
      setCopySiblingMode(false);
      setCopySourceEquipmentId(null);
      if (reportId) {
        await supabase
          .from('maintenance_reports')
          .update({ equipment_id: savedEquipmentId, customer_id: customerId })
          .eq('id', reportId);
      }
      await loadEquipment(customerId);
      setRegistryMessage(
        targetEquipmentId
          ? 'Laite päivitetty rekisteriin.'
          : creatingSiblingCopy
            ? 'Uusi laite tallennettu rekisteriin ja linkitetty kopioon.'
            : 'Laite tallennettu rekisteriin ja linkitetty raporttiin.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laitteen tallennus epäonnistui.');
    }
    setBusy(false);
  }

  async function confirmSiblingEquipmentCopy(input: SiblingEquipmentCopyInput) {
    if (!ownerCompanyId || !customerId) {
      setError('Valitse asiakas ennen uuden laitteen luontia.');
      return;
    }
    if (!profile?.company_id) {
      setError('Profiilista puuttuu yritys.');
      return;
    }

    setSiblingCopyBusy(true);
    setError(null);
    setRegistryMessage(null);
    try {
      if (reportId && !copySiblingMode && hasUnsavedChanges) {
        const ok = await saveReport(status === 'draft' ? 'draft' : undefined);
        if (!ok) {
          setError('Nykyisen pöytäkirjan tallennus epäonnistui. Tarkista pakolliset tiedot ja yritä uudelleen.');
          return;
        }
      }

      const partnership = contextMode === 'partner' ? partnerships.find((p) => p.id === partnerId) : null;
      const sourceForm = formStateRef.current.form;
      const { reportId: newReportId, equipmentId: newEquipmentId } = await createSiblingMaintenanceReport({
        sourceForm,
        input,
        customerId,
        ownerCompanyId,
        createdByCompanyId: profile.company_id,
        assignedUserId: session.user.id,
        customerName: selectedCustomer?.name ?? sourceForm.asiakas,
        subscriberId: resolveSubscriberIdForReport(customerId, subscriberId, customers),
        subscriberPortalVisibility,
        partnershipId: partnership?.id ?? null,
        brandingCompanyId: ownerCompanyId,
        profile,
        session,
        supabase,
      });

      setSiblingCopyDialogOpen(false);
      setCopySiblingMode(false);
      setCopySourceEquipmentId(null);
      siblingCopyDefaultsRef.current = {};
      setEquipmentId(newEquipmentId);
      await loadEquipment(customerId);
      clearLocalMaintenanceDraft(draftStorageKey);
      navigate(`/huoltoraportit/${newReportId}`, { replace: true, state: location.state });
      setRegistryMessage(`Laite "${input.tunnus}" ja uusi huoltopöytäkirja luotu.`);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uuden laitteen ja pöytäkirjan luonti epäonnistui.');
    } finally {
      setSiblingCopyBusy(false);
    }
  }

  function cancelSiblingEquipmentCopy() {
    setSiblingCopyDialogOpen(false);
    const copyFromId = searchParams.get('copyFrom');
    if (isNew && copyFromId) {
      navigate(`/huoltoraportit/${copyFromId}`, { replace: true, state: location.state });
    }
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
    if (!usesRefrigerantServiceExtras(form.laiteTyyppi) && (key === 'tiiveyskoe' || key === 'tyhjiointi')) {
      return;
    }
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
    const currentForm = formStateRef.current.form;
    if (!currentForm.laiteTyyppi) {
      if (!options?.auto) setError('Valitse laitetyyppi.');
      return false;
    }
    if (!customerId && !currentForm.asiakas.trim()) {
      if (!options?.auto) setError('Valitse asiakas tai täytä asiakastiedot.');
      return false;
    }
    if (!currentForm.osoite.trim()) {
      if (!options?.auto) setError('Asiakkaan kohteen osoite on pakollinen.');
      return false;
    }
    const customerBasics = validateMaintenanceCustomerBasics({
      profileCompanyId: profile?.company_id,
      reportOwnerCompanyId,
      reportOwnerTargets,
      customerId,
      asiakas: currentForm.asiakas,
      osoite: currentForm.osoite,
      canEditCustomerEquipment,
    });
    const deviceBasics = validateMaintenanceDeviceBasics({
      laiteTyyppi: currentForm.laiteTyyppi,
      laiteValmistaja: currentForm.laiteValmistaja,
      laiteMalli: currentForm.laiteMalli,
      laiteTunnus: currentForm.laiteTunnus,
      laiteSarjanumero: currentForm.laiteSarjanumero,
      laiteSijainti: currentForm.laiteSijainti,
      laiteKayttotarkoitus: currentForm.laiteKayttotarkoitus,
      kylmaaineTyyppi: currentForm.kylmaaineTyyppi,
      kylmaainePiireja: currentForm.kylmaainePiireja,
      selectedModules: currentForm.selectedModules,
    });
    if (!customerBasics.ok || !deviceBasics.ok) {
      if (!options?.auto) {
        setBasicsFieldErrors(customerBasics.fieldErrors);
        setDeviceFieldErrors(deviceBasics.fieldErrors);
        setOpenTabId('raportointi');
        setError([...customerBasics.errors, ...deviceBasics.errors][0] ?? 'Täytä raportoinnin pakolliset tiedot.');
      }
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

      let dataPayload = buildReportDataPayload();
      const payloadKonScore = konvektoriRowsMaintenanceScore(dataPayload.konvektoriRows);
      if (payloadKonScore < lastSavedKonvektoriScoreRef.current && reportId) {
        const sessionSnap = readMaintenanceReportEditorSnapshot(reportViewKey, reportId);
        const localDraft = readLocalMaintenanceDraft<{
          form: HuoltoReportData;
          customerId: string;
          equipmentId: string;
        }>(draftStorageKey);
        const bestRows = pickBestKonvektoriRows(
          dataPayload.konvektoriRows,
          sessionSnap ? normalizeHuoltoReportData(sessionSnap.form).konvektoriRows : null,
          localDraft ? normalizeHuoltoReportData(localDraft.payload.form).konvektoriRows : null,
        );
        if (konvektoriRowsMaintenanceScore(bestRows) > payloadKonScore) {
          dataPayload = { ...dataPayload, konvektoriRows: bestRows };
          formStateRef.current = {
            ...formStateRef.current,
            form: mergeHuoltoReportData(formStateRef.current.form, { konvektoriRows: bestRows }),
          };
        }
      }

      const customerName = selectedCustomer?.name ?? (formStateRef.current.form.asiakas.trim() || null);
      const title = buildMaintenanceReportTitleFromData(customerName, dataPayload);

      const resolvedStatus = nextStatus ?? status;
      const rowPayload: Record<string, unknown> = {
        owner_company_id: ownerCompanyId,
        created_by_company_id: profile.company_id,
        branding_company_id: ownerCompanyId,
        partnership_id: partnership?.id ?? null,
        customer_id: customerId || null,
        subscriber_id: resolveSubscriberIdForReport(customerId, subscriberId, customers),
        subscriber_portal_visibility: subscriberPortalVisibility,
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

      let savedReportId = reportId;
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
        savedReportId = (data as { id: string }).id;
        setReportId(savedReportId);
        setSavedReportTitle(title);
        clearLocalMaintenanceDraft(localDraftKey(null, session.user.id));
        navigate(`/huoltoraportit/${savedReportId}`, { replace: true, state: location.state });
      }

      if (nextStatus) setStatus(nextStatus);
      const timeLabel = new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
      setSavedAt(timeLabel);
      setHasUnsavedChanges(false);
      if (options?.auto) {
        setAutoSaveState('saved');
      }
      clearLocalMaintenanceDraft(draftStorageKey);
      clearLocalMaintenanceDraft(localDraftKey(savedReportId, session.user.id));

      if (savedReportId) {
        syncMaintenanceReportEditorAfterSave(maintenanceReportViewKey(savedReportId, session.user.id), {
          reportId: savedReportId,
          form: dataPayload,
          customerId: customerId || '',
          equipmentId: equipmentId || '',
        });
      }
      lastSavedKonvektoriScoreRef.current = konvektoriRowsMaintenanceScore(dataPayload.konvektoriRows);

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
    if (skipAutoSaveRef.current || busy) return;
    if (status !== 'draft' && !canEditPublishedReport) return;
    if (!form.laiteTyyppi) return;
    if (!customerId && !form.asiakas.trim()) return;

    if (!isOnline) {
      setAutoSaveState('offline');
      return;
    }

    const timer = window.setTimeout(() => {
      void saveReport(status === 'draft' ? 'draft' : undefined, { auto: true });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [form, customerId, equipmentId, contextMode, partnerId, ownerCompanyId, status, isOnline, busy, canEditPublishedReport]);

  useRegisterDraftSaver(async () => {
    if (status !== 'draft') return;
    const { form: currentForm, customerId: cid, equipmentId: eid } = formStateRef.current;
    writeLocalMaintenanceDraft(draftStorageKey, {
      form: currentForm,
      customerId: cid,
      equipmentId: eid,
      contextMode,
      partnerId,
    });
    if (!currentForm.laiteTyyppi || (!customerId && !currentForm.asiakas.trim())) return;
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
    const currentForm = formStateRef.current.form;
    return normalizeHuoltoReportData({
      ...currentForm,
      ...huoltoPerformerFields(profile, session),
      customerId: customerId || currentForm.customerId,
      asiakas: selectedCustomer?.name ?? currentForm.asiakas,
      osoite:
        [selectedCustomer?.address, selectedCustomer?.city].filter(Boolean).join(', ') || currentForm.osoite,
      equipmentSnapshot: buildHuoltoEquipmentTechnicalSnapshot(currentForm) as unknown as EquipmentSnapshot,
    });
  }

  async function openKonvektoriFaultPrint() {
    if (!reportId) return;
    setPrintBusy(true);
    setError(null);
    try {
      await openMaintenanceReportKonvektoriFaultPrint(reportId, buildReportDataPayload());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Viallisten tulosteen avaus epäonnistui.');
    } finally {
      setPrintBusy(false);
    }
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

  if ((profileLoading && !profile) || (loadingReport && !reportReady) || (portalMode && isNew)) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  const brandingName = ownerCompany?.name ?? reportOwnerName;

  function handleMaintenanceTabChange(id: string) {
    const tabId = id as MaintenanceReportTabId;
    if (openTabId === tabId) {
      if (tabId === 'raportointi' && !basicsComplete) {
        const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
        const deviceResult = validateMaintenanceDeviceBasics(deviceBasicsInput);
        setBasicsFieldErrors(customerResult.fieldErrors);
        setDeviceFieldErrors(deviceResult.fieldErrors);
        setBasicsGateMessage('Täytä kaikki pakolliset raportointi- ja laitetiedot ennen muihin osioihin siirtymistä.');
        return;
      }
      setOpenTabId(null);
      setBasicsGateMessage(null);
      return;
    }

    if (tabId !== 'raportointi' && !basicsComplete) {
      const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
      const deviceResult = validateMaintenanceDeviceBasics(deviceBasicsInput);
      setBasicsFieldErrors(customerResult.fieldErrors);
      setDeviceFieldErrors(deviceResult.fieldErrors);
      setBasicsGateMessage('Täytä kaikki pakolliset raportointi- ja laitetiedot ennen muihin osioihin siirtymistä.');
      setOpenTabId('raportointi');
      if (customerResult.ok && !deviceResult.ok) {
        setDeviceDialogOpen(true);
      }
      return;
    }

    if (tabId === 'raportointi') {
      const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
      setBasicsFieldErrors(customerResult.fieldErrors);
    }

    setBasicsGateMessage(null);
    setOpenTabId(tabId);
  }

  function openDeviceDialog() {
    const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
    setBasicsFieldErrors(customerResult.fieldErrors);
    if (!customerResult.ok) return;
    setDeviceFieldErrors({});
    setDeviceDialogOpen(true);
  }

  function saveDeviceDialog() {
    const deviceResult = validateMaintenanceDeviceBasics(deviceBasicsInput);
    setDeviceFieldErrors(deviceResult.fieldErrors);
    if (!deviceResult.ok) return;
    setDeviceDialogOpen(false);
    setHasUnsavedChanges(true);
  }

  function completeRaportointiTab() {
    const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
    const deviceResult = validateMaintenanceDeviceBasics(deviceBasicsInput);
    setBasicsFieldErrors(customerResult.fieldErrors);
    setDeviceFieldErrors(deviceResult.fieldErrors);
    if (!customerResult.ok || !deviceResult.ok) {
      setBasicsGateMessage('Täytä kaikki pakolliset raportointi- ja laitetiedot ennen muihin osioihin siirtymistä.');
      if (customerResult.ok && !deviceResult.ok) {
        setDeviceDialogOpen(true);
      }
      return;
    }
    setBasicsGateMessage(null);
    setOpenTabId(null);
  }

  const canDeleteMaintenance = !isNew && reportOwnerCompanyId
    ? canDeleteCompanyOwnedEntity(
        reportOwnerCompanyId,
        profile?.company_id,
        profile?.role,
        profile?.is_global_admin,
      )
    : false;

  const hasSecondaryMaintenanceActions =
    canDeleteMaintenance
    || !!reportId
    || showEquipmentRegistryActions
    || canEditPublishedReport;

  function renderEquipmentRegistryActions(className?: string) {
    if (!showEquipmentRegistryActions) return null;
    return (
      <div
        className={['maintenance-equipment-registry-actions', className].filter(Boolean).join(' ')}
      >
        {showCopyToSiblingAction ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || siblingCopyBusy}
            onClick={() => setSiblingCopyDialogOpen(true)}
          >
            Tallenna kopio uudelle laitteelle
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || siblingCopyBusy}
          onClick={() => (copySiblingMode ? setSiblingCopyDialogOpen(true) : void saveEquipmentToRegistry())}
        >
          {copySiblingMode && !isKonvektoritDevice(form.laiteTyyppi)
            ? 'Luo laite ja pöytäkirja'
            : equipmentId
              ? 'Päivitä laite rekisteriin'
              : 'Tallenna laite rekisteriin'}
        </button>
        {equipmentId && selectedCustomer ? (
          <Link to={`/asiakkaat/${selectedCustomer.id}`} className="btn btn-secondary">
            Avaa laiterekisteri
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <AppLayout session={session}>
      <LeaveDraftDialog
        open={leaveGuard.showDialog}
        saveBusy={leaveGuard.saveAndLeaveBusy}
        onSaveAndLeave={() => void leaveGuard.confirmSaveAndLeave()}
        onLeaveWithoutSaving={leaveGuard.confirmLeaveWithoutSaving}
        onCancel={leaveGuard.cancelLeave}
      />
      <SiblingEquipmentCopyDialog
        open={siblingCopyDialogOpen}
        busy={siblingCopyBusy}
        sourceLabel={
          copySiblingMode
            ? siblingCopyDefaultsRef.current.sourceLabel
            : [form.laiteTunnus, form.laiteMalli].filter((v) => String(v ?? '').trim()).join(' · ') || undefined
        }
        defaults={{
          malli: copySiblingMode ? siblingCopyDefaultsRef.current.malli : form.laiteMalli,
          valmistaja: copySiblingMode ? siblingCopyDefaultsRef.current.valmistaja : form.laiteValmistaja,
        }}
        onConfirm={(input) => void confirmSiblingEquipmentCopy(input)}
        onCancel={cancelSiblingEquipmentCopy}
      />
      <MaintenanceDeviceDialog
        open={deviceDialogOpen}
        form={form}
        fieldErrors={deviceFieldErrors}
        registryMessage={registryMessage}
        copySiblingMode={copySiblingMode}
        onChange={patchForm}
        onDeviceTypeChange={onDeviceTypeChange}
        onSave={saveDeviceDialog}
        onCancel={() => setDeviceDialogOpen(false)}
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
      </div>

      {!profile?.company_id && (
        <section className="panel">
          <p className="error">Yritys puuttuu profiilista. Aja npm run setup:dev ja kirjaudu uudelleen.</p>
        </section>
      )}

      <HuoltoEditUiProvider viewKey={reportViewKey}>
      <form className={`panel form-grid maintenance-form${openTabId ? ' maintenance-tab-dialog-open' : ''}`} onSubmit={onSubmit}>
        <MaintenanceReportTabNav
          tabs={maintenanceTabs}
          activeId={openTabId ?? ''}
          onChange={handleMaintenanceTabChange}
        />

        <div className="maintenance-report-tab-launcher">
          {!basicsComplete ? (
            <p className="error maintenance-report-basics-gate">
              Täytä raportoinnin pakolliset tiedot (yritys, asiakas, osoite ja laitetiedot) — muut osiot avautuvat
              vasta sen jälkeen.
            </p>
          ) : (
            <p className="muted">
              Avaa osio ylävalikon painikkeesta. Tarkastukset ja mittaukset avautuvat ponnahdusikkunoihin osion sisällä.
            </p>
          )}
          {basicsGateMessage ? <p className="error">{basicsGateMessage}</p> : null}
        </div>

        <MaintenanceReportTabDialog
          open={openTabId !== null}
          title={maintenanceTabs.find((tab) => tab.id === openTabId)?.label ?? ''}
          onClose={() => {
            if (openTabId === 'raportointi' && !basicsComplete) return;
            setOpenTabId(null);
          }}
          footer={
            openTabId === 'raportointi' ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!basicsComplete}
                  onClick={() => setOpenTabId(null)}
                >
                  Sulje
                </button>
                <button type="button" className="btn btn-secondary" onClick={openDeviceDialog}>
                  {form.laiteTyyppi ? 'Muokkaa laitetietoja' : 'Laitetiedot'}
                </button>
                <button type="button" className="btn btn-primary" onClick={completeRaportointiTab}>
                  Valmis
                </button>
              </>
            ) : undefined
          }
        >
        <HuoltoModulePresentationProvider value="flat">
        <div className="maintenance-report-tab-panel">
        {openTabId === 'raportointi' && (
        <section className="maintenance-report-tab-section">
          <MaintenanceReportBasicsPanel
            form={form}
            fieldErrors={basicsFieldErrors}
            profileCompanyId={profile?.company_id}
            reportOwnerCompanyId={reportOwnerCompanyId}
            reportOwnerTargets={reportOwnerTargets}
            brandingName={brandingName}
            creatorCompanyName={creatorCompanyName}
            creatorDisplayName={profile?.display_name ?? session.user.email ?? '—'}
            creatorEmail={session.user.email}
            canEditCustomerEquipment={canEditCustomerEquipment}
            customerId={customerId}
            customers={customers}
            selectedCustomer={selectedCustomer}
            contextMode={contextMode}
            ownerCompanyId={ownerCompanyId}
            subscribersForOwner={subscribersForOwner}
            subscriberId={subscriberId}
            subscriberPortalVisibility={subscriberPortalVisibility}
            busy={busy}
            copySiblingMode={copySiblingMode}
            onReportOwnerChange={onReportOwnerChange}
            onPatchForm={patchForm}
            onSelectCustomer={(id) => {
              setCustomerId(id);
              setEquipmentId('');
              const customer = customers.find((entry) => entry.id === id);
              if (customer) {
                void loadOwnerCompany(customer.owner_company_id);
                if (customer.subscriber_id) setSubscriberId(customer.subscriber_id);
              }
            }}
            onClearCustomer={() => {
              setCustomerId('');
              setEquipmentId('');
              if (profile?.company_id) void loadOwnerCompany(profile.company_id);
            }}
            onCreateCustomer={createCustomerAndSelect}
            onSubscriberChange={setSubscriberId}
            onSubscriberPortalVisibilityChange={setSubscriberPortalVisibility}
          />

          <div className="maintenance-device-summary">
            <div className="maintenance-device-summary-head">
              <h3>Laitetiedot</h3>
              {basicsComplete ? (
                <span className="badge badge-completed">Valmis</span>
              ) : (
                <span className="badge badge-scheduled">Puuttuu</span>
              )}
            </div>
            {form.laiteTyyppi ? (
              <div className="info-grid">
                <div className="info-box">
                  <span className="info-label">Laitetyyppi</span>
                  <strong>{deviceTypes.find((dt) => dt.value === form.laiteTyyppi)?.label ?? form.laiteTyyppi}</strong>
                </div>
                {isKonvektoritDevice(form.laiteTyyppi) ? (
                  <>
                    <div className="info-box">
                      <span className="info-label">Verkoston kuvaus</span>
                      <strong>{form.laiteKayttotarkoitus || '—'}</strong>
                    </div>
                    <div className="info-box">
                      <span className="info-label">Alue</span>
                      <strong>{form.laiteSijainti || '—'}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="info-box">
                      <span className="info-label">Laite</span>
                      <strong>
                        {[form.laiteValmistaja, form.laiteMalli].filter(Boolean).join(' ') || '—'}
                      </strong>
                      <span className="muted">
                        {[form.laiteTunnus, form.laiteSarjanumero].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="info-box">
                      <span className="info-label">Sijainti</span>
                      <strong>{form.laiteSijainti || '—'}</strong>
                    </div>
                    {(form.selectedModules.kylmaainePiiri || form.laiteTyyppi === 'lämpöpumppu') && (
                      <div className="info-box">
                        <span className="info-label">Kylmäaine</span>
                        <strong>{form.kylmaaineTyyppi || '—'}</strong>
                        {form.kylmaainePiireja ? (
                          <span className="muted">{form.kylmaainePiireja} piiriä</span>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="muted">
                Täytä laitteen perustiedot (tyyppi, valmistaja, malli, tunnus, sarjanumero, sijainti ja kylmäaine)
                ennen muiden osioiden avaamista.
              </p>
            )}
            {Object.keys(deviceFieldErrors).length > 0 ? (
              <div className="maintenance-device-summary-errors">
                {Object.values(deviceFieldErrors).map((message) => (
                  <p key={message} className="error">
                    {message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        )}

        {openTabId === 'kylmaainePiiri' && form.selectedModules.kylmaainePiiri && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
                {isVj && (
                  <VjLauhdutinSection
                    form={form}
                    onChange={patchForm}
                    onCondenserTypeChange={onCondenserTypeChange}
                    onFreeCoolingChange={onFreeCoolingChange}
                  />
                )}
                <RefrigerantCircuitsSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'hoyrystin' && showEvaporatorSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            {showEvaporatorSection && <EvaporatorCircuitsSync form={form} onChange={syncForm} />}
            {showEvaporatorSection && !isChillerLikeDevice(form.laiteTyyppi) && (
              <EvaporatorsSection form={form} onChange={patchForm} />
            )}
        </section>
        )}

        {openTabId === 'lauhdutin' && showCondenserSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <CondensersSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'lauhdutuspiiri' && showLauhdutuspiiriSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <LauhdutuspiiriSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'nestelauhduttimet' && showNestelauhduttimetSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
              <NestelauhduttimetSection
                units={form.nestelauhduttimetVj ?? []}
                shared={!!form.vjNestelauhdutusJaettu}
                laiteTyyppi={form.laiteTyyppi}
                onChange={(units) => patchForm({ nestelauhduttimetVj: units })}
              />
        </section>
        )}

        {openTabId === 'jaahdytysvesi' && showJaahdytysvesiSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <JaahdytysvesiSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'vapaajahdytys' && showVapaajahdytysSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <VapaajahdytysSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'konvektorit' && showKonvektoritSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
              <KonvektoritSection
                rows={form.konvektoriRows ?? []}
                onChange={(rows) => patchForm({ konvektoriRows: rows })}
                onPrintFaults={hasFaultyKonvektorit ? () => void openKonvektoriFaultPrint() : undefined}
                printFaultsBusy={printBusy}
              />
        </section>
        )}

        {openTabId === 'lampopumppu' && showLampopumppuSection && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
              <LampopumppuSection
                form={form}
                onChange={patchForm}
                showUlkoyksikko={lampopumppuParts.ulkoyksikko}
                showSisayksikko={lampopumppuParts.sisayksikko}
                showMittaukset={lampopumppuParts.mittaukset}
              />
        </section>
        )}

        {openTabId === 'mlp' && showMlpSection && form.mlpData && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <MlpSection form={form} onChange={patchForm} />
        </section>
        )}

        {openTabId === 'kiinteistoJahdytys' && showChillerKiinteistoTab && form.mlpData && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <MlpSection form={form} onChange={patchForm} part="kiinteisto" />
        </section>
        )}

        {openTabId === 'energia' && showChillerEnergyTab && form.mlpData && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <MlpSection form={form} onChange={patchForm} part="energia" />
        </section>
        )}

        {openTabId === 'huomiot' && form.laiteTyyppi && (
        <section className="maintenance-report-tab-section huolto-modules-stack">
            <HuomiotSection
              form={form}
              onChange={patchForm}
              reportId={reportId ?? undefined}
              userId={session.user.id}
            />
            {pendingModuleKeys.length > 0 && (
              <div className="expense-section module-placeholder">
                {pendingModuleKeys.map((key) => (
                  <div key={key}>
                    <h3>{moduleLabel(key)}</h3>
                    <p className="muted">
                      Moduulin lomake tulossa — rakenne kopioitu BC HuoltoRaportti-esimerkistä ({key}).
                    </p>
                  </div>
                ))}
              </div>
            )}
        </section>
        )}

        {openTabId === 'huoltotiedot' && form.laiteTyyppi && (
        <section className="maintenance-report-tab-section">
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
                {usesRefrigerantServiceExtras(form.laiteTyyppi) ? (
                  <>
                    <ToggleSwitch
                      label="Kylmäaine / vuototarkastus"
                      checked={form.huoltoKylmaaineVuotoTarkastus}
                      onChange={(checked) => patchForm({ huoltoKylmaaineVuotoTarkastus: checked })}
                    />
                    <ToggleSwitch
                      label="Piilota varoitukset tulosteessa (HUOMIOITAVAA, COP-ohjeet)"
                      checked={hideMaintenancePrintWarnings(form)}
                      onChange={(checked) => {
                        patchForm({ piilotaVaroitukset: checked });
                        if (reportId && isOnline) void saveReport('draft', { auto: true });
                      }}
                    />
                  </>
                ) : null}
                <ToggleSwitch
                  label="Laitteessa vika / puutteita"
                  checked={form.huoltoLaiteessaVika}
                  onChange={(checked) => patchForm({ huoltoLaiteessaVika: checked })}
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

              {optionalMaintenanceModules.length > 0 && (
              <div className="maintenance-optional-modules">
                <p className="muted">Valinnaiset mittaukset — moduulit valitaan laitetyypin mukaan automaattisesti.</p>
                <div className="module-toggle-grid">
                  {optionalMaintenanceModules.map((opt) => (
                    <div key={opt.key} className="module-toggle-card">
                      <ToggleSwitch
                        label={opt.label}
                        checked={form.selectedModules[opt.key]}
                        onChange={(checked) => toggleModule(opt.key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              )}

              {usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tiiveyskoe && (
                <div className="huolto-modules-stack maintenance-embedded-module">
                  <TiiveyskoeSection
                    form={form}
                    onChange={patchForm}
                    reportId={reportId}
                    userId={session.user.id}
                  />
                </div>
              )}

              {usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tyhjiointi && (
                <div className="huolto-modules-stack maintenance-embedded-module">
                  <TyhjiointiSection
                    form={form}
                    onChange={patchForm}
                    reportId={reportId}
                    userId={session.user.id}
                  />
                </div>
              )}
        </section>
        )}

        </div>
        </HuoltoModulePresentationProvider>
        </MaintenanceReportTabDialog>

        {error && <p className="error">{error}</p>}

        <div className="form-actions maintenance-form-actions">
          <div className="maintenance-actions-primary">
            <button
              type="button"
              className="btn btn-secondary maintenance-actions-back"
              onClick={() => leaveGuard.requestLeave(navigation.backTo)}
            >
              <span className="maintenance-actions-back-short" aria-hidden="true">←</span>
              <span className="maintenance-actions-back-label">Takaisin</span>
            </button>
            <span className={`badge badge-${status === 'draft' ? 'scheduled' : 'completed'} maintenance-actions-status`}>
              {getMaintenanceReportStatusLabel(status)}
            </span>
            {status === 'draft' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary maintenance-actions-save"
                  disabled={busy || !basicsComplete}
                  onClick={() => void saveReport('draft')}
                >
                  {busy ? 'Tallennetaan…' : 'Tallenna luonnos'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary maintenance-actions-submit"
                  disabled={busy || !basicsComplete}
                  onClick={() => void saveReport('submitted')}
                >
                  Merkitse valmiiksi
                </button>
              </>
            )}
            {canEditPublishedReport && (
              <button
                type="button"
                className="btn btn-primary maintenance-actions-save"
                disabled={busy || !basicsComplete}
                onClick={() => void saveReport()}
              >
                {busy ? 'Tallennetaan…' : 'Tallenna muutokset'}
              </button>
            )}
          </div>

          {hasSecondaryMaintenanceActions ? (
            <details ref={moreActionsRef} className="maintenance-actions-more">
              <summary className="maintenance-actions-more-toggle">Muut toiminnot</summary>
              <div className="maintenance-actions-more-panel">
                {canDeleteMaintenance && (
                  <button
                    type="button"
                    className="btn btn-danger maintenance-actions-delete"
                    disabled={deleteBusy || busy}
                    onClick={() => void deleteReport()}
                  >
                    Poista raportti
                  </button>
                )}
                {reportId && (
                  <button
                    type="button"
                    className="btn btn-secondary maintenance-actions-print"
                    disabled={printBusy || busy}
                    onClick={() => void openPrintPreview()}
                  >
                    {printBusy ? 'Avataan…' : 'Tulosta / PDF'}
                  </button>
                )}
                {reportId && hasFaultyKonvektorit && (
                  <button
                    type="button"
                    className="btn btn-secondary maintenance-actions-print-faults"
                    disabled={printBusy || busy}
                    onClick={() => void openKonvektoriFaultPrint()}
                  >
                    {printBusy ? 'Avataan…' : 'Tulosta vialliset'}
                  </button>
                )}
                {renderEquipmentRegistryActions('maintenance-form-actions-equipment')}
                {canEditPublishedReport ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || !form.laiteTyyppi}
                    onClick={() => void saveReport('draft')}
                  >
                    Palauta luonnokseksi
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </form>
      </HuoltoEditUiProvider>
    </AppLayout>
  );
}
