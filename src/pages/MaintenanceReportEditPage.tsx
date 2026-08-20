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
import { type NewEquipmentDraft } from '../components/EquipmentRegistryPicker';
import MaintenanceReportTabNav from '../components/huoltoRaportti/MaintenanceReportTabNav';
import { MaintenanceReportTabDialog } from '../components/huoltoRaportti/MaintenanceReportTabDialog';
import { MaintenanceReportDocumentView } from '../components/huoltoRaportti/MaintenanceReportDocumentView';
import { MaintenanceReportTabContent } from '../components/huoltoRaportti/MaintenanceReportTabContent';
import { useMaintenanceDocumentLayout } from '../hooks/useMaintenanceDocumentLayout';
import { MaintenanceDeviceDialog } from '../components/huoltoRaportti/MaintenanceDeviceDialog';
import { MaintenanceDeviceSummary } from '../components/huoltoRaportti/MaintenanceDeviceSummary';
import { HuoltoModulePresentationProvider } from '../components/huoltoRaportti/HuoltoModulePresentationContext';
import { SiblingEquipmentCopyDialog } from '../components/huoltoRaportti/SiblingEquipmentCopyDialog';
import {
  applyDeviceTypeDefaults,
  buildMaintenanceReportTitleFromData,
  createEmptyHuoltoReportData,
  createEmptyMlpData,
  createEmptyKonvektoriRow,
  ensureChillerLiquidCondenserData,
  konvektoriRowsHaveMaintenanceData,
  konvektoriRowsMaintenanceScore,
  mergeHuoltoReportData,
  normalizeHuoltoReportData,
  pickBestKonvektoriRows,
  resolveMaintenanceReportTitle,
} from '../lib/huoltoRaportti/defaults';
import {
  applyDeviceTypeSelection,
  buildDeviceDialogApplyResult,
} from '../lib/huoltoRaportti/maintenanceDeviceDraft';
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
  moduleSelectionOptions,
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
import { openMaintenanceReportKonvektoriFaultPrint } from '../lib/maintenanceReportPrintAction';
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
  fillMissingDeviceBasics,
  showRefrigerantBasics,
  validateMaintenanceCustomerBasics,
  validateMaintenanceDeviceBasics,
  validateMaintenanceRefrigerantBasics,
} from '../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import { buildMaintenanceReportTabCompletion } from '../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { MaintenanceModuleStructureDialog } from '../components/huoltoRaportti/MaintenanceModuleStructureDialog';
import { getHiddenMaintenanceTabs } from '../lib/huoltoRaportti/maintenanceReportTabCustomization';
import { HuoltoEditUiProvider } from '../components/huoltoRaportti/HuoltoEditUiContext';
import { MaintenanceReportSectionSettingsProvider } from '../components/huoltoRaportti/MaintenanceReportSectionSettingsProvider';
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
  const [equipment, setEquipment] = useState<Equipment[]>([]);
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
  const hydratedNewReportCustomerIdRef = useRef('');
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
  const canEditCustomerPrintFields = canEditCustomerEquipment || canEditPublishedReport;
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

  const customersForPicker = useMemo(() => {
    const ownerId = ownerCompanyId || reportOwnerCompanyId || profile?.company_id;
    if (!ownerId || reportOwnerTargets.length <= 1) return customers;
    return customers.filter((customer) => customer.owner_company_id === ownerId);
  }, [customers, ownerCompanyId, reportOwnerCompanyId, profile?.company_id, reportOwnerTargets.length]);

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
  const showNestelauhduttimetSection = showNestelauhduttimetModules(
    form.selectedModules,
    form.lauhdutinTyyppiLaite,
  );
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

  const showKylmaaineCharge = useMemo(
    () => showRefrigerantBasics(deviceBasicsInput),
    [deviceBasicsInput],
  );

  const basicsComplete = useMemo(
    () => isMaintenanceBasicsComplete(customerBasicsInput, deviceBasicsInput),
    [customerBasicsInput, deviceBasicsInput],
  );

  const canSaveDraft = useMemo(
    () =>
      Boolean(form.laiteTyyppi.trim())
      && Boolean(form.osoite.trim())
      && Boolean(customerId || form.asiakas.trim()),
    [form.laiteTyyppi, form.osoite, customerId, form.asiakas],
  );

  const maintenanceTabBuildInput = useMemo(
    () => ({
      laiteTyyppi: form.laiteTyyppi,
      selectedModules: form.selectedModules,
      customModules: form.customModules ?? [],
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
    }),
    [
      form.laiteTyyppi,
      form.selectedModules,
      form.customModules,
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
    ],
  );

  const defaultMaintenanceTabs = useMemo(
    () =>
      buildMaintenanceReportTabs({
        ...maintenanceTabBuildInput,
        hiddenTabIds: [],
        moduleTabOrder: [],
      }),
    [maintenanceTabBuildInput],
  );

  const allMaintenanceTabs = useMemo(
    () =>
      buildMaintenanceReportTabs({
        ...maintenanceTabBuildInput,
        hiddenTabIds: form.hiddenTabIds,
        moduleTabOrder: form.moduleTabOrder,
      }),
    [maintenanceTabBuildInput, form.hiddenTabIds, form.moduleTabOrder],
  );

  const hiddenMaintenanceTabCount = useMemo(
    () => getHiddenMaintenanceTabs(defaultMaintenanceTabs, allMaintenanceTabs).length,
    [defaultMaintenanceTabs, allMaintenanceTabs],
  );

  const maintenanceTabs = allMaintenanceTabs;

  const tabCompletion = useMemo(
    () =>
      buildMaintenanceReportTabCompletion(form, customerBasicsInput, deviceBasicsInput, {
        ...maintenanceTabBuildInput,
        hiddenTabIds: form.hiddenTabIds,
        moduleTabOrder: form.moduleTabOrder,
      }),
    [form, customerBasicsInput, deviceBasicsInput, maintenanceTabBuildInput],
  );

  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const documentLayout = useMaintenanceDocumentLayout();
  const [activeDocumentTabId, setActiveDocumentTabId] = useState<MaintenanceReportTabId>('raportointi');
  const [documentNavTarget, setDocumentNavTarget] = useState<MaintenanceReportTabId | null>(null);
  const newReportRaportointiOpenedRef = useRef(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [basicsFieldErrors, setBasicsFieldErrors] = useState<Record<string, string>>({});
  const [deviceFieldErrors, setDeviceFieldErrors] = useState<Record<string, string>>({});
  const [moduleStructureDialogOpen, setModuleStructureDialogOpen] = useState(false);

  useEffect(() => {
    if (!isNew || profileLoading || basicsComplete || newReportRaportointiOpenedRef.current) return;
    newReportRaportointiOpenedRef.current = true;
    setDocumentNavTarget('raportointi');
  }, [isNew, profileLoading, basicsComplete]);

  useEffect(() => {
    if (documentLayout) {
      if (openTabId) {
        setActiveDocumentTabId(openTabId as MaintenanceReportTabId);
        setDocumentNavTarget(openTabId as MaintenanceReportTabId);
        setOpenTabId(null);
      }
      return;
    }
    setDocumentNavTarget(null);
  }, [documentLayout, openTabId]);

  useEffect(() => {
    if (!documentLayout) return;
    if (!maintenanceTabs.some((tab) => tab.id === activeDocumentTabId)) {
      setActiveDocumentTabId(maintenanceTabs[0]?.id ?? 'raportointi');
    }
  }, [documentLayout, maintenanceTabs, activeDocumentTabId]);

  useEffect(() => {
    if (documentLayout) return;
    if (!openTabId) return;
    if (!maintenanceTabs.some((tab) => tab.id === openTabId)) {
      setOpenTabId(null);
    }
  }, [documentLayout, maintenanceTabs, openTabId]);

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

  const patchCustomModuleValues = useCallback(
    (moduleId: string, values: Record<string, string | boolean>) => {
      patchForm({
        customModules: (form.customModules ?? []).map((entry) =>
          entry.id === moduleId ? { ...entry, values } : entry,
        ),
      });
    },
    [form.customModules, patchForm],
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
    setCustomerId('');
    setEquipmentId('');
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
    if (!customerId) {
      hydratedNewReportCustomerIdRef.current = '';
      return;
    }
    const c = customers.find((x) => x.id === customerId);
    if (!c) return;
    const registryAddress = [c.address, c.city].filter(Boolean).join(', ');
    const current = formStateRef.current.form;
    const shouldHydrateNew = isNew && hydratedNewReportCustomerIdRef.current !== customerId;
    const shouldHydrateExisting = !isNew && !current.osoite.trim() && Boolean(registryAddress);
    if (!shouldHydrateNew && !shouldHydrateExisting) return;
    if (isNew) hydratedNewReportCustomerIdRef.current = customerId;
    patchForm({
      customerId,
      asiakas: current.asiakas.trim() || c.name,
      osoite: current.osoite.trim() || registryAddress,
    });
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

    const deviceBasicsPatch = fillMissingDeviceBasics(formToUse);
    if (Object.keys(deviceBasicsPatch).length > 0) {
      formToUse = mergeHuoltoReportData(formToUse, deviceBasicsPatch);
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

    const customerRows = await loadAccessibleCustomers();
    if (nextCustomerId && !formToUse.osoite.trim()) {
      const linkedCustomer = customerRows.find((entry) => entry.id === nextCustomerId);
      const registryAddress = [linkedCustomer?.address, linkedCustomer?.city]
        .filter(Boolean)
        .join(', ');
      if (registryAddress) {
        formToUse = mergeHuoltoReportData(formToUse, { osoite: registryAddress });
        formStateRef.current = {
          form: formToUse,
          customerId: nextCustomerId,
          equipmentId: nextEquipmentId,
        };
        setForm(formToUse);
      }
    }
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

  async function loadAccessibleCustomers(): Promise<Customer[]> {
    if (!profile?.company_id) return [];
    try {
      const rows = await loadAccessibleReportCustomers(supabase, profile.company_id, partnerships);
      setCustomers(rows);
      return rows;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Asiakkaiden lataus epäonnistui.');
      setCustomers([]);
      return [];
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
    const basePatch: Partial<HuoltoReportData> = isKonvektoritDevice(deviceType)
      ? {
          laiteKayttotarkoitus: String(eq.name || '').trim(),
          laiteTunnus: String(eq.tag || '').trim(),
          laiteSijainti: String(eq.location || '').trim(),
        }
      : {
          laiteTunnus: String(eq.tag || eq.name || '').trim(),
          laiteMalli: String(eq.model || eq.name || '').trim(),
          laiteValmistaja: String(currentForm.laiteValmistaja || '').trim(),
          laiteSarjanumero:
            deviceType === 'lämpöpumppu' ? '' : String(eq.serial_number || '').trim(),
          laiteSijainti: String(eq.location || '').trim(),
        };
    if (eq.device_type) basePatch.laiteTyyppi = eq.device_type;

    const snapshotPatch = applyEquipmentSnapshotToForm(currentForm, eq.huolto_technical_snapshot);
    if (konvektoriRowsHaveMaintenanceData(currentForm.konvektoriRows)) {
      delete snapshotPatch.konvektoriRows;
    }
    const merged = mergeHuoltoReportData(currentForm, { ...basePatch, ...snapshotPatch });
    const withDefaults = eq.device_type ? applyDeviceTypeDefaults(merged, eq.device_type) : merged;
    const finalForm = mergeHuoltoReportData(withDefaults, fillMissingDeviceBasics(withDefaults));
    formStateRef.current = { ...formStateRef.current, form: finalForm };
    setHasUnsavedChanges(true);
    setForm(finalForm);
  }

  async function createEquipmentAndSelect(draft: NewEquipmentDraft) {
    if (!ownerCompanyId || !customerId) {
      setError('Valitse ensin asiakas.');
      return;
    }
    const name =
      draft.name.trim()
      || (isKonvektoritDevice(form.laiteTyyppi) ? form.laiteKayttotarkoitus.trim() : '')
      || form.laiteTunnus.trim()
      || form.laiteMalli.trim();
    if (!name) {
      setError(
        isKonvektoritDevice(form.laiteTyyppi)
          ? 'Laitteen nimi tai verkoston kuvaus on pakollinen.'
          : 'Laitteen nimi, tunnus tai malli on pakollinen.',
      );
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
      .select('id, name, tag, model, serial_number, location, customer_id, device_type')
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Laitteen luonti epäonnistui.');
      setBusy(false);
      return;
    }

    const created = data as Equipment;
    setEquipment((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setEquipmentId(created.id);
    if (isKonvektoritDevice(form.laiteTyyppi)) {
      patchForm({
        laiteKayttotarkoitus: created.name || form.laiteKayttotarkoitus,
        laiteTunnus: created.tag || form.laiteTunnus,
        laiteSijainti: created.location || form.laiteSijainti,
      });
    } else {
      patchForm({
        laiteTunnus: created.tag || created.name || form.laiteTunnus,
        laiteMalli: created.model || form.laiteMalli,
        laiteSarjanumero: created.serial_number || form.laiteSarjanumero,
        laiteSijainti: created.location || form.laiteSijainti,
      });
    }
    if (copySiblingMode) {
      setCopySiblingMode(false);
      setCopySourceEquipmentId(null);
    }
    setRegistryMessage('Laite luotu rekisteriin ja valittu raportille.');
    setBusy(false);
  }

  function selectCustomerFromRegistry(id: string) {
    setCustomerId(id);
    setEquipmentId('');
    const customer = customers.find((entry) => entry.id === id);
    if (customer) {
      void loadOwnerCompany(customer.owner_company_id);
      if (customer.subscriber_id) setSubscriberId(customer.subscriber_id);
      const registryAddress = [customer.address, customer.city].filter(Boolean).join(', ');
      patchForm({
        customerId: id,
        asiakas: formStateRef.current.form.asiakas.trim() || customer.name,
        osoite: formStateRef.current.form.osoite.trim() || registryAddress,
      });
    }
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
    patchForm({
      customerId: created.id,
      asiakas: created.name,
      osoite: [created.address, created.city].filter(Boolean).join(', '),
    });
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
    let currentForm = formStateRef.current.form;
    if (!currentForm.laiteTyyppi) {
      if (!options?.auto) {
        setError('Valitse laitetyyppi.');
        setDocumentNavTarget('raportointi');
      }
      return false;
    }
    if (!customerId && !currentForm.asiakas.trim()) {
      if (!options?.auto) setError('Valitse asiakas tai täytä asiakastiedot.');
      return false;
    }
    const registryAddress = [selectedCustomer?.address, selectedCustomer?.city]
      .filter(Boolean)
      .join(', ');
    if (!currentForm.osoite.trim() && registryAddress) {
      patchForm({ osoite: registryAddress });
      currentForm = { ...currentForm, osoite: registryAddress };
    }
    if (!currentForm.osoite.trim()) {
      if (!options?.auto) {
        setError('Asiakkaan kohteen osoite on pakollinen.');
        setBasicsFieldErrors({ osoite: 'Asiakkaan kohteen osoite on pakollinen.' });
        setDocumentNavTarget('raportointi');
      }
      return false;
    }

    const isSubmitting = nextStatus === 'submitted';
    const isDraftSave = nextStatus === 'draft' || (nextStatus === undefined && status === 'draft');

    if (isDraftSave || options?.auto) {
      const devicePatch = fillMissingDeviceBasics(currentForm);
      if (Object.keys(devicePatch).length > 0) {
        currentForm = mergeHuoltoReportData(currentForm, devicePatch);
        patchForm(devicePatch);
      }
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
    const deviceBasicsInputForSave = {
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
    };
    const deviceBasics = validateMaintenanceDeviceBasics(deviceBasicsInputForSave);
    if (!customerBasics.ok || !deviceBasics.ok) {
      if (!options?.auto) {
        setBasicsFieldErrors(customerBasics.fieldErrors);
        setDeviceFieldErrors(deviceBasics.fieldErrors);
        setDocumentNavTarget('raportointi');
        setError([...customerBasics.errors, ...deviceBasics.errors][0] ?? 'Täytä raportoinnin pakolliset tiedot.');
      }
      return false;
    }
    if (isSubmitting) {
      const refrigerantBasics = validateMaintenanceRefrigerantBasics(deviceBasicsInputForSave);
      if (!refrigerantBasics.ok) {
        if (!options?.auto) {
          setDocumentNavTarget('kylmaaine');
          setError(refrigerantBasics.errors[0] ?? 'Täytä kylmäaineen pakolliset tiedot.');
        }
        return false;
      }
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

      const customerName =
        formStateRef.current.form.asiakas.trim() || selectedCustomer?.name || null;
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
    const registryAddress = [selectedCustomer?.address, selectedCustomer?.city]
      .filter(Boolean)
      .join(', ');
    return normalizeHuoltoReportData({
      ...currentForm,
      ...huoltoPerformerFields(profile, session),
      customerId: customerId || currentForm.customerId,
      asiakas: currentForm.asiakas.trim() || selectedCustomer?.name || '',
      osoite: currentForm.osoite.trim() || registryAddress || '',
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
      if (hasUnsavedChanges) {
        const ok = await saveReport(status === 'draft' ? 'draft' : undefined);
        if (!ok) return;
      }
      navigate(`/huoltoraportit/${reportId}/tuloste?print=1`);
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
    if (documentLayout) {
      setActiveDocumentTabId(id as MaintenanceReportTabId);
      setDocumentNavTarget(id as MaintenanceReportTabId);
    } else {
      setOpenTabId(id);
    }
    if (id === 'raportointi') {
      setBasicsFieldErrors(validateMaintenanceCustomerBasics(customerBasicsInput).fieldErrors);
    }
  }

  function applyDeviceTypeFromDialog(deviceType: string) {
    if (!deviceType.trim()) return;
    setHasUnsavedChanges(true);
    const next = applyDeviceTypeSelection(formStateRef.current.form, deviceType);
    if (next === formStateRef.current.form) return;
    formStateRef.current = { ...formStateRef.current, form: next };
    persistDraftLocally(next);
    setForm(next);
    setDeviceFieldErrors((prev) => {
      if (!prev.laiteTyyppi) return prev;
      const { laiteTyyppi: _removed, ...rest } = prev;
      return rest;
    });
  }

  function applyDeviceDialogClose(deviceDraft: HuoltoReportData): boolean {
    const result = buildDeviceDialogApplyResult(formStateRef.current.form, deviceDraft);
    if (!result.ok) {
      setDeviceFieldErrors(result.fieldErrors);
      return false;
    }

    setDeviceFieldErrors({});
    setHasUnsavedChanges(true);
    formStateRef.current = { ...formStateRef.current, form: result.next };
    persistDraftLocally(result.next);
    setForm(result.next);
    return true;
  }

  function openDeviceDialog() {
    const customerResult = validateMaintenanceCustomerBasics(customerBasicsInput);
    setBasicsFieldErrors(customerResult.fieldErrors);
    if (!customerResult.ok) return;
    setDeviceFieldErrors({});
    setDeviceDialogOpen(true);
  }

  const canDeleteMaintenance = !isNew && reportOwnerCompanyId
    ? canDeleteCompanyOwnedEntity(
        reportOwnerCompanyId,
        profile?.company_id,
        profile?.role,
        profile?.is_global_admin,
      )
    : false;

  const deviceButtonLabel = form.laiteTyyppi ? 'Muokkaa laitetietoja' : 'Laitetiedot';

  const maintenanceTabContentProps = {
    form,
    session,
    reportId: reportId ?? undefined,
    profile,
    basicsFieldErrors,
    deviceFieldErrors,
    basicsComplete,
    showKylmaaineCharge,
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
    isVj,
    lampopumppuParts,
    pendingModuleKeys,
    optionalMaintenanceModules,
    moduleLabel,
    printBusy,
    reportOwnerCompanyId,
    reportOwnerTargets,
    brandingName,
    creatorCompanyName,
    canEditCustomerEquipment,
    canEditCustomerPrintFields,
    customerId,
    customers: customersForPicker,
    selectedCustomer,
    contextMode,
    ownerCompanyId,
    subscribersForOwner,
    subscriberId,
    subscriberPortalVisibility,
    busy,
    copySiblingMode,
    equipment,
    equipmentId,
    copySourceEquipmentId: copySourceEquipmentId,
    deviceButtonLabel,
    isOnline,
    onReportOwnerChange,
    onPatchForm: patchForm,
    onSyncForm: syncForm,
    onSelectCustomer: selectCustomerFromRegistry,
    onClearCustomer: () => {
      setCustomerId('');
      setEquipmentId('');
      if (profile?.company_id) void loadOwnerCompany(profile.company_id);
    },
    onCreateCustomer: createCustomerAndSelect,
    onSelectEquipment: setEquipmentId,
    onClearEquipment: () => setEquipmentId(''),
    onCreateEquipment: createEquipmentAndSelect,
    onSubscriberChange: setSubscriberId,
    onSubscriberPortalVisibilityChange: setSubscriberPortalVisibility,
    onOpenDeviceDialog: openDeviceDialog,
    onCondenserTypeChange,
    onFreeCoolingChange,
    onPrintKonvektoriFaults: hasFaultyKonvektorit ? () => void openKonvektoriFaultPrint() : undefined,
    patchCustomModuleValues,
    toggleModule,
  };

  const hasSecondaryMaintenanceActions =
    canDeleteMaintenance
    || !!reportId
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

  function renderPrintActions(className?: string) {
    if (!reportId) return null;
    return (
      <div className={['maintenance-print-actions', className].filter(Boolean).join(' ')}>
        <button
          type="button"
          className="btn btn-secondary maintenance-actions-print"
          disabled={printBusy || busy}
          onClick={() => void openPrintPreview()}
        >
          {printBusy ? 'Avataan…' : 'Tulosta / PDF'}
        </button>
        {hasFaultyKonvektorit ? (
          <button
            type="button"
            className="btn btn-secondary maintenance-actions-print-faults"
            disabled={printBusy || busy}
            onClick={() => void openKonvektoriFaultPrint()}
          >
            {printBusy ? 'Avataan…' : 'Tulosta vialliset'}
          </button>
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
        onApply={applyDeviceDialogClose}
        onDeviceTypeSelect={applyDeviceTypeFromDialog}
        onClose={() => {
          setDeviceDialogOpen(false);
          setHasUnsavedChanges(true);
        }}
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
      <MaintenanceReportSectionSettingsProvider
        form={form}
        onChange={patchForm}
        onPersist={() => {
          if (reportId && isOnline) void saveReport('draft', { auto: true });
        }}
      >
      <form
        className={`panel form-grid maintenance-form${documentLayout ? ' maintenance-form--document' : ''}${!documentLayout && openTabId ? ' maintenance-tab-dialog-open' : ''}`}
        onSubmit={onSubmit}
      >
        <>
            <div
              className={`maintenance-report-module-toolbar${documentLayout ? ' maintenance-report-module-toolbar--document' : ''}`}
            >
              {!documentLayout ? (
                <MaintenanceReportTabNav
                  tabs={maintenanceTabs}
                  activeId={openTabId ?? ''}
                  tabCompletion={tabCompletion}
                  onChange={handleMaintenanceTabChange}
                  variant="modal"
                />
              ) : null}
              <button
                type="button"
                className="btn btn-secondary maintenance-module-structure-btn"
                onClick={() => setModuleStructureDialogOpen(true)}
              >
                Moduulirakenne
                {hiddenMaintenanceTabCount > 0 ? ` (+${hiddenMaintenanceTabCount} piilotettu)` : ''}
              </button>
            </div>

            {!documentLayout ? (
              <MaintenanceDeviceSummary
                form={form}
                deviceFieldErrors={deviceFieldErrors}
                complete={basicsComplete}
                onEdit={openDeviceDialog}
                editButtonLabel={deviceButtonLabel}
              />
            ) : null}

            {renderEquipmentRegistryActions('maintenance-equipment-registry-actions--prominent')}

            {renderPrintActions('maintenance-equipment-registry-actions--prominent')}

            <MaintenanceModuleStructureDialog
              open={moduleStructureDialogOpen}
              form={form}
              tabBuildInput={maintenanceTabBuildInput}
              onSave={(patch) => {
                patchForm(patch);
                setHasUnsavedChanges(true);
              }}
              onClose={() => setModuleStructureDialogOpen(false)}
            />

            {documentLayout ? (
              <MaintenanceReportDocumentView
                tabs={maintenanceTabs}
                tabCompletion={tabCompletion}
                navTargetTabId={documentNavTarget}
                onNavTargetHandled={() => setDocumentNavTarget(null)}
                {...maintenanceTabContentProps}
              />
            ) : (
              <MaintenanceReportTabDialog
                open={openTabId !== null}
                title={maintenanceTabs.find((tab) => tab.id === openTabId)?.label ?? ''}
                onClose={() => setOpenTabId(null)}
                footer={
                  openTabId === 'raportointi' ? (
                    <button type="button" className="btn btn-secondary" onClick={openDeviceDialog}>
                      {deviceButtonLabel}
                    </button>
                  ) : undefined
                }
              >
                <HuoltoModulePresentationProvider value="flat">
                  <div className="maintenance-report-tab-panel">
                    {openTabId ? (
                      <MaintenanceReportTabContent
                        tabId={openTabId as MaintenanceReportTabId}
                        {...maintenanceTabContentProps}
                      />
                    ) : null}
                  </div>
                </HuoltoModulePresentationProvider>
              </MaintenanceReportTabDialog>
            )}
        </>

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
                  disabled={busy || !canSaveDraft}
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
      </MaintenanceReportSectionSettingsProvider>
      </HuoltoEditUiProvider>
    </AppLayout>
  );
}
