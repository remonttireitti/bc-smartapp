import CustomerRegistryPicker, { type NewCustomerDraft } from '../CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../EquipmentRegistryPicker';
import SubscriberPicker from '../SubscriberPicker';
import SubscriberPortalVisibilityField from '../SubscriberPortalVisibilityField';
import type { ReportOwnerTarget } from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { reportHasSubscriberLink } from '../../lib/subscriberPortalVisibility';
import { isKonvektoritDevice } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { Customer, Equipment, SubscriberPortalVisibility } from '../../types';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { MaintenanceReportBasicsDialog } from './MaintenanceReportBasicsDialog';
import {
  PrintColumnRow,
  PrintFieldRow,
  PrintInnerBox,
} from './print/MaintenancePrintLayout';

type Props = {
  form: HuoltoReportData;
  fieldErrors: Record<string, string>;
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
  subscribersForOwner: Parameters<typeof SubscriberPicker>[0]['subscribers'];
  subscriberId: string;
  subscriberPortalVisibility: SubscriberPortalVisibility;
  busy: boolean;
  copySiblingMode: boolean;
  equipment: Equipment[];
  equipmentId: string;
  copySourceEquipmentId: string | null;
  onReportOwnerChange: (companyId: string) => void;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  onSelectCustomer: (id: string) => void;
  onClearCustomer: () => void;
  onCreateCustomer: (draft: NewCustomerDraft) => Promise<void>;
  onSelectEquipment: (id: string) => void;
  onClearEquipment: () => void;
  onCreateEquipment: (draft: NewEquipmentDraft) => Promise<void>;
  onSubscriberChange: (id: string) => void;
  onSubscriberPortalVisibilityChange: (value: SubscriberPortalVisibility) => void;
};

export function MaintenanceReportBasicsPanel({
  form,
  fieldErrors,
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
  onReportOwnerChange,
  onPatchForm,
  onSelectCustomer,
  onClearCustomer,
  onCreateCustomer,
  onSelectEquipment,
  onClearEquipment,
  onCreateEquipment,
  onSubscriberChange,
  onSubscriberPortalVisibilityChange,
}: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();
  const needsExplicitOwner = !customerId && reportOwnerTargets.length > 1;

  return (
    <section className="maintenance-report-basics-panel">
      {fieldErrors.profile ? <p className="error">{fieldErrors.profile}</p> : null}

      {!printLayout ? (
      <div className="info-grid">
        <div className="info-box">
          <span className="info-label">Yrityksen nimissä (brändi tulosteessa)</span>
          {canEditCustomerEquipment && needsExplicitOwner ? (
            <>
              <select
                className={`info-box-select${fieldErrors.reportOwnerCompanyId ? ' field-error-input' : ''}`}
                value={reportOwnerCompanyId ?? ''}
                onChange={(event) => onReportOwnerChange(event.target.value)}
                disabled={busy}
              >
                <option value="">— Valitse yritys —</option>
                {reportOwnerTargets.map((target) => (
                  <option key={target.companyId} value={target.companyId}>
                    {target.label}
                  </option>
                ))}
              </select>
              {fieldErrors.reportOwnerCompanyId ? (
                <span className="field-error-text">{fieldErrors.reportOwnerCompanyId}</span>
              ) : null}
            </>
          ) : (
            <strong>{brandingName}</strong>
          )}
        </div>
        <div className="info-box">
          <span className="info-label">Laatija</span>
          <strong>{creatorDisplayName}</strong>
          <span className="muted">{creatorCompanyName}</span>
          {creatorEmail ? <span className="muted">{creatorEmail}</span> : null}
        </div>
      </div>
      ) : null}

      {canEditCustomerEquipment && selectedCustomer && contextMode === 'partner' ? (
        <p className="muted">
          Valittu asiakas kuuluu kumppanin rekisteriin — raportti luodaan yrityksen{' '}
          <strong>{brandingName}</strong> nimissä.
        </p>
      ) : null}

      {canEditCustomerEquipment && needsExplicitOwner ? (
        <p className="muted">
          Valitse ensin yritys, jonka nimissä raportti laaditaan. Asiakasrekisteristä näytetään vain
          kumppanit, joilla on huoltoraportin luontioikeus.
        </p>
      ) : null}

      {profileCompanyId ? (
        <>
          {!printLayout ? (
            <p className="muted">
              Hae asiakasta kaikista rekistereistä joihin sinulla on pääsy. Raportti luodaan automaattisesti
              sen yrityksen nimissä, jonka rekisteriin asiakas kuuluu. Uusi asiakas tallennetaan aina omaan
              rekisteriisi ({creatorCompanyName}).
            </p>
          ) : null}

          {canEditCustomerEquipment ? (
            <>
              {ownerCompanyId ? (
                <SubscriberPicker
                  subscribers={subscribersForOwner}
                  subscriberId={subscriberId}
                  disabled={busy}
                  hint="Valinnainen. Moniasiakas-tilaaja näkee kaikki tähän linkitetyt kohteet ja raportit."
                  onChange={onSubscriberChange}
                />
              ) : null}

              {reportHasSubscriberLink({
                subscriber_id: subscriberId,
                customer_subscriber_id: selectedCustomer?.subscriber_id,
              }) ? (
                <SubscriberPortalVisibilityField
                  value={subscriberPortalVisibility}
                  reportKind="maintenance"
                  disabled={busy}
                  onChange={onSubscriberPortalVisibilityChange}
                />
              ) : null}

              <CustomerRegistryPicker
                customers={customers}
                customerId={customerId}
                myCompanyId={profileCompanyId}
                disabled={!profileCompanyId || (needsExplicitOwner && !reportOwnerCompanyId)}
                createRegistryName={creatorCompanyName}
                busy={busy}
                onSelect={onSelectCustomer}
                onClear={onClearCustomer}
                onCreate={onCreateCustomer}
              />
              {fieldErrors.customer ? <p className="error">{fieldErrors.customer}</p> : null}
              {needsExplicitOwner && !reportOwnerCompanyId ? (
                <p className="muted">Valitse ensin yritys ennen asiakkaan valintaa.</p>
              ) : null}

              {copySiblingMode ? (
                <p className="muted">
                  Täytä uuden laitteen tiedot ponnahdusikkunassa — laite ja huoltopöytäkirja luodaan kerralla.
                </p>
              ) : null}

              {customerId ? (
                <EquipmentRegistryPicker
                  equipment={equipment}
                  equipmentId={equipmentId}
                  busy={busy}
                  excludeEquipmentIds={copySourceEquipmentId ? [copySourceEquipmentId] : []}
                  autoOpenCreate={copySiblingMode}
                  placeholders={{
                    name: isKonvektoritDevice(form.laiteTyyppi)
                      ? form.laiteKayttotarkoitus || undefined
                      : form.laiteTunnus || form.laiteMalli || undefined,
                    tag: form.laiteTunnus || undefined,
                    model: form.laiteMalli || undefined,
                    serial_number: form.laiteSarjanumero || undefined,
                    location: form.laiteSijainti || undefined,
                  }}
                  onSelect={onSelectEquipment}
                  onClear={onClearEquipment}
                  onCreate={onCreateEquipment}
                />
              ) : null}
            </>
          ) : (
            <div className="info-grid">
              <div className="info-box">
                <span className="info-label">Asiakas</span>
                <strong>{form.asiakas || selectedCustomer?.name || '—'}</strong>
                <span className="muted">{form.osoite}</span>
              </div>
            </div>
          )}

          {printLayout ? (
            <>
              <MaintenanceReportBasicsDialog
                form={form}
                fieldErrors={fieldErrors}
                customerId={customerId}
                reportOwnerCompanyId={reportOwnerCompanyId}
                reportOwnerTargets={reportOwnerTargets}
                brandingName={brandingName}
                creatorDisplayName={creatorDisplayName}
                creatorEmail={creatorEmail}
                canEditCustomerEquipment={canEditCustomerEquipment}
                canEditCustomerPrintFields={canEditCustomerPrintFields}
                busy={busy}
                onReportOwnerChange={onReportOwnerChange}
                onPatchForm={onPatchForm}
                documentModuleKey={documentLayout ? 'raportointi' : undefined}
              />
              <PrintColumnRow>
                <PrintInnerBox title="YRITYSTIEDOT" accent="#9E9E9E">
                  <PrintFieldRow label="Brändi tulosteessa">
                    <strong>{brandingName}</strong>
                  </PrintFieldRow>
                  <PrintFieldRow label="Laatija">
                    <span>
                      {creatorDisplayName}
                      {creatorEmail ? ` · ${creatorEmail}` : ''}
                    </span>
                  </PrintFieldRow>
                </PrintInnerBox>
                <PrintInnerBox title="ASIAKASTIEDOT" accent="#1976D2">
                  <PrintFieldRow label="Asiakas">
                    <strong>{form.asiakas || selectedCustomer?.name || '—'}</strong>
                  </PrintFieldRow>
                  <PrintFieldRow label="Osoite">
                    <span>{form.osoite || '—'}</span>
                  </PrintFieldRow>
                  {form.asiakasYtunnus?.trim() ? (
                    <PrintFieldRow label="Y-tunnus">
                      <span>{form.asiakasYtunnus}</span>
                    </PrintFieldRow>
                  ) : null}
                  {form.asiakasYhteyshenkilo?.trim() ? (
                    <PrintFieldRow label="Yhteyshenkilö">
                      <span>{form.asiakasYhteyshenkilo}</span>
                    </PrintFieldRow>
                  ) : null}
                  {form.asiakasPuhelin?.trim() ? (
                    <PrintFieldRow label="Puhelin">
                      <span>{form.asiakasPuhelin}</span>
                    </PrintFieldRow>
                  ) : null}
                  {form.asiakasEmail?.trim() ? (
                    <PrintFieldRow label="Sähköposti">
                      <span>{form.asiakasEmail}</span>
                    </PrintFieldRow>
                  ) : null}
                </PrintInnerBox>
              </PrintColumnRow>
            </>
          ) : (
            <>
              <div className="line-form-grid">
                <label>
                  Asiakas (tuloste)
                  <input
                    className={fieldErrors.customer ? 'field-error-input' : undefined}
                    value={form.asiakas}
                    onChange={(e) => onPatchForm({ asiakas: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                  />
                </label>
                <label>
                  Osoite *
                  <input
                    className={fieldErrors.osoite ? 'field-error-input' : undefined}
                    value={form.osoite}
                    onChange={(e) => onPatchForm({ osoite: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                    required
                  />
                  {fieldErrors.osoite ? <span className="field-error-text">{fieldErrors.osoite}</span> : null}
                </label>
              </div>
              <div className="line-form-grid">
                <label>
                  Y-tunnus
                  <input
                    value={form.asiakasYtunnus ?? ''}
                    onChange={(e) => onPatchForm({ asiakasYtunnus: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                  />
                </label>
                <label>
                  Yhteyshenkilö
                  <input
                    value={form.asiakasYhteyshenkilo ?? ''}
                    onChange={(e) => onPatchForm({ asiakasYhteyshenkilo: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                  />
                </label>
                <label>
                  Puhelin
                  <input
                    value={form.asiakasPuhelin ?? ''}
                    onChange={(e) => onPatchForm({ asiakasPuhelin: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                  />
                </label>
                <label>
                  Sähköposti
                  <input
                    type="email"
                    value={form.asiakasEmail ?? ''}
                    onChange={(e) => onPatchForm({ asiakasEmail: e.target.value })}
                    disabled={!canEditCustomerPrintFields}
                  />
                </label>
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
