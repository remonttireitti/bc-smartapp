import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import ToggleSwitch from '../ToggleSwitch';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { MaintenanceReportSectionSettingsLink } from './MaintenanceReportSectionSettingsLink';
import { HuoltotiedotStatusDialog } from './HuoltotiedotStatusDialog';
import { CondensersSection } from './CondensersSection';
import { CustomModuleFormSection } from './CustomModuleFormSection';
import { EvaporatorCircuitsSync } from './EvaporatorCircuitsSync';
import { EvaporatorsSection } from './EvaporatorsSection';
import { HuomiotSection } from './HuomiotSection';
import { JaahdytysvesiSection } from './JaahdytysvesiSection';
import { KonvektoritSection } from './KonvektoritSection';
import { LampopumppuDocumentSection } from './LampopumppuDocumentSection';
import { LauhdutuspiiriSection } from './LauhdutuspiiriSection';
import { MlpDocumentSection } from './MlpDocumentSection';
import { RaportointiTabSection } from './RaportointiTabSection';
import { NestelauhduttimetSection } from './NestelauhduttimetSection';
import { RefrigerantCircuitsSection } from './RefrigerantCircuitsSection';
import { RefrigerantChargeSection } from './RefrigerantChargeSection';
import { TiiveyskoeSection } from './TiiveyskoeSection';
import { TyhjiointiSection } from './TyhjiointiSection';
import { VapaajahdytysSection } from './VapaajahdytysSection';
import { VjLauhdutinSection } from './VjLauhdutinSection';
import type { NewCustomerDraft } from '../CustomerRegistryPicker';
import type { NewEquipmentDraft } from '../EquipmentRegistryPicker';
import type { ReportOwnerTarget } from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import type { ModuleKey } from '../../lib/huoltoRaportti/constants';
import { isChillerLikeDevice, usesRefrigerantServiceExtras } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { MaintenanceReportTabId } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import { isCustomModuleTabId, parseCustomModuleTabId } from '../../lib/huoltoRaportti/customModuleTypes';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import type { Customer, Equipment, Subscriber } from '../../types';
import type { SubscriberPortalVisibility } from '../../lib/subscriberPortalVisibility';
import { PrintFieldRow, PrintInnerBox, PrintTextInput } from './print/MaintenancePrintLayout';

export type MaintenanceReportTabContentProps = {
  tabId: MaintenanceReportTabId;
  form: HuoltoReportData;
  session: Session;
  reportId?: string;
  profile: {
    company_id?: string | null;
    display_name?: string | null;
    tukes_number?: string | null;
  } | null;
  basicsFieldErrors: Record<string, string>;
  deviceFieldErrors: Record<string, string>;
  basicsComplete: boolean;
  showKylmaaineCharge: boolean;
  showEvaporatorSection: boolean;
  showCondenserSection: boolean;
  showLauhdutuspiiriSection: boolean;
  showNestelauhduttimetSection: boolean;
  showJaahdytysvesiSection: boolean;
  showVapaajahdytysSection: boolean;
  showKonvektoritSection: boolean;
  showLampopumppuSection: boolean;
  showMlpSection: boolean;
  showChillerKiinteistoTab: boolean;
  showChillerEnergyTab: boolean;
  isVj: boolean;
  lampopumppuParts: { ulkoyksikko: boolean; sisayksikko: boolean; mittaukset: boolean };
  pendingModuleKeys: ModuleKey[];
  optionalMaintenanceModules: { key: ModuleKey; label: string }[];
  moduleLabel: (key: ModuleKey) => string;
  printBusy: boolean;
  reportOwnerCompanyId: string | null;
  reportOwnerTargets: ReportOwnerTarget[];
  brandingName: string;
  creatorCompanyName: string;
  canEditCustomerEquipment: boolean;
  canEditCustomerPrintFields: boolean;
  customerId: string;
  customers: Customer[];
  selectedCustomer: Customer | null | undefined;
  contextMode: 'own' | 'partner';
  ownerCompanyId: string;
  subscribersForOwner: Subscriber[];
  subscriberId: string;
  subscriberPortalVisibility: SubscriberPortalVisibility;
  busy: boolean;
  copySiblingMode: boolean;
  equipment: Equipment[];
  equipmentId: string;
  copySourceEquipmentId: string | null;
  deviceButtonLabel: string;
  isOnline: boolean;
  onReportOwnerChange: (companyId: string) => void;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  onSyncForm: (patch: Partial<HuoltoReportData>) => void;
  onSelectCustomer: (id: string) => void;
  onClearCustomer: () => void;
  onCreateCustomer: (draft: NewCustomerDraft) => Promise<void>;
  onSelectEquipment: (id: string) => void;
  onClearEquipment: () => void;
  onCreateEquipment: (draft: NewEquipmentDraft) => Promise<void>;
  onSubscriberChange: (id: string) => void;
  onSubscriberPortalVisibilityChange: (value: SubscriberPortalVisibility) => void;
  onOpenDeviceDialog: () => void;
  onCondenserTypeChange: (condenserType: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
  onFreeCoolingChange: (enabled: boolean) => void;
  onPrintKonvektoriFaults?: () => void;
  patchCustomModuleValues: (moduleId: string, values: Record<string, string | boolean>) => void;
  toggleModule: (key: ModuleKey, checked: boolean) => void;
};

export function MaintenanceReportTabContent({
  tabId,
  form,
  session,
  reportId,
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
  customers,
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
  copySourceEquipmentId,
  deviceButtonLabel,
  onReportOwnerChange,
  onPatchForm,
  onSyncForm,
  onSelectCustomer,
  onClearCustomer,
  onCreateCustomer,
  onSelectEquipment,
  onClearEquipment,
  onCreateEquipment,
  onSubscriberChange,
  onSubscriberPortalVisibilityChange,
  onOpenDeviceDialog,
  onCondenserTypeChange,
  onFreeCoolingChange,
  onPrintKonvektoriFaults,
  patchCustomModuleValues,
  toggleModule,
}: MaintenanceReportTabContentProps) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();
  const customModuleId = isCustomModuleTabId(tabId) ? parseCustomModuleTabId(tabId) : null;
  const customModule =
    customModuleId != null
      ? (form.customModules ?? []).find((entry) => entry.id === customModuleId) ?? null
      : null;

  if (tabId === 'raportointi') {
    return (
      <section className="maintenance-report-tab-section">
        <RaportointiTabSection
          form={form}
          basicsFieldErrors={basicsFieldErrors}
          deviceFieldErrors={deviceFieldErrors}
          basicsComplete={basicsComplete}
          profileCompanyId={profile?.company_id}
          reportOwnerCompanyId={reportOwnerCompanyId}
          reportOwnerTargets={reportOwnerTargets}
          brandingName={brandingName}
          creatorCompanyName={creatorCompanyName}
          creatorDisplayName={profile?.display_name ?? session.user.email ?? '—'}
          creatorEmail={session.user.email}
          canEditCustomerEquipment={canEditCustomerEquipment}
          canEditCustomerPrintFields={canEditCustomerPrintFields}
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
          equipment={equipment}
          equipmentId={equipmentId}
          copySourceEquipmentId={copySourceEquipmentId}
          showKonvektoritSection={showKonvektoritSection}
          printBusy={printBusy}
          deviceButtonLabel={deviceButtonLabel}
          onPatchForm={onPatchForm}
          onOpenDeviceDialog={onOpenDeviceDialog}
          onReportOwnerChange={onReportOwnerChange}
          onSelectCustomer={onSelectCustomer}
          onClearCustomer={onClearCustomer}
          onCreateCustomer={onCreateCustomer}
          onSelectEquipment={onSelectEquipment}
          onClearEquipment={onClearEquipment}
          onCreateEquipment={onCreateEquipment}
          onSubscriberChange={onSubscriberChange}
          onSubscriberPortalVisibilityChange={onSubscriberPortalVisibilityChange}
          onPrintKonvektoriFaults={onPrintKonvektoriFaults}
        />
      </section>
    );
  }

  if (tabId === 'kylmaaine' && showKylmaaineCharge) {
    return (
      <section className="maintenance-report-tab-section">
        <RefrigerantChargeSection form={form} onChange={onPatchForm} defaultOpen />
      </section>
    );
  }

  if (tabId === 'kylmaainePiiri' && form.selectedModules.kylmaainePiiri) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <MaintenanceReportSectionSettingsLink
          tabId="kylmaainePiiri"
          label="Kylmäainepiiri — tulostusasetukset"
        />
        {isVj ? (
          <VjLauhdutinSection
            form={form}
            onChange={onPatchForm}
            onCondenserTypeChange={onCondenserTypeChange}
            onFreeCoolingChange={onFreeCoolingChange}
          />
        ) : null}
        <RefrigerantCircuitsSection form={form} onChange={onPatchForm} />
      </section>
    );
  }

  if (tabId === 'hoyrystin' && showEvaporatorSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <EvaporatorCircuitsSync form={form} onChange={onSyncForm} />
        {!isChillerLikeDevice(form.laiteTyyppi) ? (
          <EvaporatorsSection
            form={form}
            onChange={onPatchForm}
            documentModuleKey={documentLayout ? 'hoyrystin' : undefined}
          />
        ) : null}
      </section>
    );
  }

  if (tabId === 'lauhdutin' && showCondenserSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <CondensersSection
          form={form}
          onChange={onPatchForm}
          documentModuleKey={documentLayout ? 'lauhdutin' : undefined}
        />
      </section>
    );
  }

  if (tabId === 'lauhdutuspiiri' && showLauhdutuspiiriSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <LauhdutuspiiriSection form={form} onChange={onPatchForm} />
      </section>
    );
  }

  if (tabId === 'nestelauhduttimet' && showNestelauhduttimetSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <NestelauhduttimetSection
          units={form.nestelauhduttimetVj ?? []}
          shared={!!form.vjNestelauhdutusJaettu}
          laiteTyyppi={form.laiteTyyppi}
          onChange={(units) => onPatchForm({ nestelauhduttimetVj: units })}
        />
      </section>
    );
  }

  if (tabId === 'jaahdytysvesi' && showJaahdytysvesiSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <JaahdytysvesiSection form={form} onChange={onPatchForm} />
      </section>
    );
  }

  if (tabId === 'vapaajahdytys' && showVapaajahdytysSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <VapaajahdytysSection form={form} onChange={onPatchForm} />
      </section>
    );
  }

  if (tabId === 'konvektorit' && showKonvektoritSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <KonvektoritSection
          rows={form.konvektoriRows ?? []}
          onChange={(rows) => onPatchForm({ konvektoriRows: rows })}
          onPrintFaults={onPrintKonvektoriFaults}
          printFaultsBusy={printBusy}
        />
      </section>
    );
  }

  if (tabId === 'lampopumppu' && showLampopumppuSection) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <LampopumppuDocumentSection
          form={form}
          onChange={onPatchForm}
          showUlkoyksikko={lampopumppuParts.ulkoyksikko}
          showSisayksikko={lampopumppuParts.sisayksikko}
          showMittaukset={lampopumppuParts.mittaukset}
        />
      </section>
    );
  }

  if (tabId === 'mlp' && showMlpSection && form.mlpData) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <MlpDocumentSection form={form} onChange={onPatchForm} />
      </section>
    );
  }

  if (tabId === 'kiinteistoJahdytys' && showChillerKiinteistoTab && form.mlpData) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <MlpDocumentSection form={form} onChange={onPatchForm} part="kiinteisto" />
      </section>
    );
  }

  if (tabId === 'energia' && showChillerEnergyTab && form.mlpData) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <MlpDocumentSection form={form} onChange={onPatchForm} part="energia" />
      </section>
    );
  }

  if (customModule) {
    return (
      <section className="maintenance-report-tab-section">
        <CustomModuleFormSection
          module={customModule}
          onChange={(values) => patchCustomModuleValues(customModule.id, values)}
        />
      </section>
    );
  }

  if (tabId === 'tiiveyskoe' && usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tiiveyskoe) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <TiiveyskoeSection
          form={form}
          onChange={onPatchForm}
          reportId={reportId}
          userId={session.user.id}
        />
      </section>
    );
  }

  if (tabId === 'tyhjiointi' && usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tyhjiointi) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <TyhjiointiSection
          form={form}
          onChange={onPatchForm}
          reportId={reportId}
          userId={session.user.id}
        />
      </section>
    );
  }

  if (tabId === 'huomiot' && form.laiteTyyppi) {
    return (
      <section className="maintenance-report-tab-section huolto-modules-stack">
        <HuomiotSection
          form={form}
          onChange={onPatchForm}
          reportId={reportId}
          userId={session.user.id}
        />
        {pendingModuleKeys.length > 0 ? (
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
        ) : null}
      </section>
    );
  }

  if (tabId === 'huoltotiedot' && form.laiteTyyppi) {
    const footerReadOnly = printLayout ? (
      <PrintInnerBox title="ALATUNNISTE" accent="#64748b">
        <PrintFieldRow label="Suorittaja">
          <PrintTextInput value={form.huoltoSuorittajaNimi} readOnly disabled />
        </PrintFieldRow>
        <PrintFieldRow label="TUKES">
          <PrintTextInput
            value={form.huoltoSuorittajaTUKES}
            readOnly
            disabled
            placeholder={profile?.tukes_number ? undefined : 'Lisää omissa tiedoissa'}
          />
        </PrintFieldRow>
        <PrintFieldRow label="Päivämäärä">
          <PrintTextInput type="date" value={form.huoltoPaivamaara} readOnly disabled />
        </PrintFieldRow>
      </PrintInnerBox>
    ) : null;

    return (
      <section className="maintenance-report-tab-section">
        <MaintenanceReportSectionSettingsLink tabId="huoltotiedot" />
        {printLayout ? (
          <>
            <HuoltotiedotStatusDialog
              form={form}
              laiteTyyppi={form.laiteTyyppi}
              profileTukesNumber={profile?.tukes_number}
              onChange={onPatchForm}
              documentModuleKey={documentLayout ? 'huoltotiedot' : undefined}
            />
            {footerReadOnly}
          </>
        ) : (
          <>
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
              {!form.huoltoSuorittajaTUKES.trim() ? (
                <p className="muted huolto-span-all">
                  TUKES-numero puuttuu profiilista. <Link to="/hallinta/omat">Täytä omat tiedot</Link>
                </p>
              ) : null}
              <label>
                Päivämäärä
                <input
                  type="date"
                  value={form.huoltoPaivamaara}
                  onChange={(e) => onPatchForm({ huoltoPaivamaara: e.target.value })}
                />
              </label>
            </div>
          </>
        )}

        {optionalMaintenanceModules.length > 0 ? (
          <div className="maintenance-optional-modules">
            <p className="muted">
              Valinnaiset mittaukset — moduulit valitaan laitetyypin mukaan automaattisesti.
            </p>
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
        ) : null}

        {usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tiiveyskoe && !documentLayout ? (
          <div className="huolto-modules-stack maintenance-embedded-module">
            <TiiveyskoeSection
              form={form}
              onChange={onPatchForm}
              reportId={reportId}
              userId={session.user.id}
            />
          </div>
        ) : null}

        {usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tyhjiointi && !documentLayout ? (
          <div className="huolto-modules-stack maintenance-embedded-module">
            <TyhjiointiSection
              form={form}
              onChange={onPatchForm}
              reportId={reportId}
              userId={session.user.id}
            />
          </div>
        ) : null}
      </section>
    );
  }

  return null;
}
