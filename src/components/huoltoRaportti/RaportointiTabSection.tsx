import type { NewCustomerDraft } from '../CustomerRegistryPicker';
import type { NewEquipmentDraft } from '../EquipmentRegistryPicker';
import type { ReportOwnerTarget } from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import { raportointiLaitetiedotTabTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { raportointiSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import type { Customer, Equipment } from '../../types';
import type { SubscriberPortalVisibility } from '../../lib/subscriberPortalVisibility';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { KonvektoritSection } from './KonvektoritSection';
import { MaintenanceDeviceSummary } from './MaintenanceDeviceSummary';
import { MaintenanceReportBasicsPanel } from './MaintenanceReportBasicsPanel';

type Props = {
  form: HuoltoReportData;
  basicsFieldErrors: Record<string, string>;
  deviceFieldErrors: Record<string, string>;
  basicsComplete: boolean;
  profileCompanyId: string | null | undefined;
  reportOwnerCompanyId: string | null;
  reportOwnerTargets: ReportOwnerTarget[];
  brandingName: string;
  creatorCompanyName: string;
  creatorDisplayName: string;
  creatorEmail: string | undefined;
  canEditCustomerEquipment: boolean;
  canEditCustomerPrintFields: boolean;
  customerId: string;
  customers: Customer[];
  selectedCustomer: Customer | null | undefined;
  contextMode: string;
  ownerCompanyId: string | null | undefined;
  subscribersForOwner: Parameters<typeof MaintenanceReportBasicsPanel>[0]['subscribersForOwner'];
  subscriberId: string;
  subscriberPortalVisibility: SubscriberPortalVisibility;
  busy: boolean;
  copySiblingMode: boolean;
  equipment: Equipment[];
  equipmentId: string;
  copySourceEquipmentId: string | null;
  showKonvektoritSection: boolean;
  printBusy: boolean;
  deviceButtonLabel: string;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  onOpenDeviceDialog: () => void;
  onReportOwnerChange: (companyId: string) => void;
  onSelectCustomer: (id: string) => void;
  onClearCustomer: () => void;
  onCreateCustomer: (draft: NewCustomerDraft) => Promise<void>;
  onSelectEquipment: (id: string) => void;
  onClearEquipment: () => void;
  onCreateEquipment: (draft: NewEquipmentDraft) => Promise<void>;
  onSubscriberChange: (id: string) => void;
  onSubscriberPortalVisibilityChange: (value: SubscriberPortalVisibility) => void;
  onPrintKonvektoriFaults?: () => void;
};

export function RaportointiTabSection({
  form,
  basicsFieldErrors,
  deviceFieldErrors,
  basicsComplete,
  profileCompanyId,
  reportOwnerCompanyId,
  reportOwnerTargets,
  brandingName,
  creatorCompanyName,
  creatorDisplayName,
  creatorEmail,
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
  showKonvektoritSection,
  printBusy,
  deviceButtonLabel,
  onPatchForm,
  onOpenDeviceDialog,
  onReportOwnerChange,
  onSelectCustomer,
  onClearCustomer,
  onCreateCustomer,
  onSelectEquipment,
  onClearEquipment,
  onCreateEquipment,
  onSubscriberChange,
  onSubscriberPortalVisibilityChange,
  onPrintKonvektoriFaults,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const title = raportointiLaitetiedotTabTitle(form.laiteTyyppi, false);

  const editor = (draft: HuoltoReportData, patchDraft: (patch: Partial<HuoltoReportData>) => void) => (
    <>
      <MaintenanceReportBasicsPanel
        form={draft}
        fieldErrors={basicsFieldErrors}
        profileCompanyId={profileCompanyId}
        reportOwnerCompanyId={reportOwnerCompanyId}
        reportOwnerTargets={reportOwnerTargets}
        brandingName={brandingName}
        creatorCompanyName={creatorCompanyName}
        creatorDisplayName={creatorDisplayName}
        creatorEmail={creatorEmail}
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
        embeddedInParentDialog
        onReportOwnerChange={onReportOwnerChange}
        onPatchForm={patchDraft}
        onSelectCustomer={onSelectCustomer}
        onClearCustomer={onClearCustomer}
        onCreateCustomer={onCreateCustomer}
        onSelectEquipment={onSelectEquipment}
        onClearEquipment={onClearEquipment}
        onCreateEquipment={onCreateEquipment}
        onSubscriberChange={onSubscriberChange}
        onSubscriberPortalVisibilityChange={onSubscriberPortalVisibilityChange}
      />
      <MaintenanceDeviceSummary
        form={draft}
        deviceFieldErrors={deviceFieldErrors}
        complete={basicsComplete}
        onEdit={onOpenDeviceDialog}
        editButtonLabel={deviceButtonLabel}
      />
      {showKonvektoritSection ? (
        <KonvektoritSection
          rows={draft.konvektoriRows ?? []}
          onChange={(rows) => patchDraft({ konvektoriRows: rows })}
          onPrintFaults={onPrintKonvektoriFaults}
          printFaultsBusy={printBusy}
        />
      ) : null}
    </>
  );

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onPatchForm(next)}
      documentModuleKey={documentLayout ? 'raportointi' : undefined}
      title={title}
      titleId="raportointi-dialog-title"
      summaryRows={raportointiSummaryRows(form)}
      complete={basicsComplete}
      editLabel="Muokkaa raportointia"
      emptyHint="Täytä asiakas-, laite- ja muut raportoinnin tiedot painamalla Muokkaa."
    >
      {editor}
    </DocumentModuleInspection>
  );
}
