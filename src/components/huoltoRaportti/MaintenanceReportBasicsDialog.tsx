import type { ReportOwnerTarget } from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { PrintColumnRow, PrintFieldRow, PrintInnerBox, PrintTextInput } from './print/MaintenancePrintLayout';

type DraftData = Pick<
  HuoltoReportData,
  | 'asiakas'
  | 'osoite'
  | 'asiakasYtunnus'
  | 'asiakasYhteyshenkilo'
  | 'asiakasPuhelin'
  | 'asiakasEmail'
>;

type Props = {
  form: HuoltoReportData;
  fieldErrors: Record<string, string>;
  customerId: string;
  reportOwnerCompanyId: string | null;
  reportOwnerTargets: ReportOwnerTarget[];
  brandingName: string;
  creatorDisplayName: string;
  creatorEmail: string | undefined;
  canEditCustomerEquipment: boolean;
  busy: boolean;
  onReportOwnerChange: (companyId: string) => void;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
};

function pickDraft(form: HuoltoReportData): DraftData {
  return {
    asiakas: form.asiakas,
    osoite: form.osoite,
    asiakasYtunnus: form.asiakasYtunnus,
    asiakasYhteyshenkilo: form.asiakasYhteyshenkilo,
    asiakasPuhelin: form.asiakasPuhelin,
    asiakasEmail: form.asiakasEmail,
  };
}

export function MaintenanceReportBasicsDialog({
  form,
  fieldErrors,
  customerId,
  reportOwnerCompanyId,
  reportOwnerTargets,
  brandingName,
  creatorDisplayName,
  creatorEmail,
  canEditCustomerEquipment,
  busy,
  onReportOwnerChange,
  onPatchForm,
  documentModuleKey,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const needsExplicitOwner = !customerId && reportOwnerTargets.length > 1;

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: pickDraft(form),
    onChange: (next) => onPatchForm(next),
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  if (!documentLayout || !documentModuleKey) return null;

  const patchDraft = (patch: Partial<DraftData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title="Raportointi — yritys ja asiakas"
      titleId="raportointi-basics-dialog-title"
      onClose={closeDialog}
    >
      <PrintColumnRow>
        <PrintInnerBox title="YRITYSTIEDOT" accent="#9E9E9E">
          <PrintFieldRow label="Brändi tulosteessa">
            {canEditCustomerEquipment && needsExplicitOwner ? (
              <select
                className={fieldErrors.reportOwnerCompanyId ? 'field-error-input' : undefined}
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
            ) : (
              <strong>{brandingName}</strong>
            )}
          </PrintFieldRow>
          <PrintFieldRow label="Laatija">
            <span>
              {creatorDisplayName}
              {creatorEmail ? ` · ${creatorEmail}` : ''}
            </span>
          </PrintFieldRow>
        </PrintInnerBox>
        <PrintInnerBox title="ASIAKASTIEDOT" accent="#1976D2">
          <PrintFieldRow label="Asiakas" error={fieldErrors.customer}>
            <PrintTextInput
              value={draft.asiakas}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ asiakas: v })}
              className={fieldErrors.customer ? 'field-error-input' : undefined}
            />
          </PrintFieldRow>
          <PrintFieldRow label="Osoite" error={fieldErrors.osoite}>
            <PrintTextInput
              value={draft.osoite}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ osoite: v })}
              className={fieldErrors.osoite ? 'field-error-input' : undefined}
            />
          </PrintFieldRow>
          <PrintFieldRow label="Y-tunnus">
            <PrintTextInput
              value={draft.asiakasYtunnus ?? ''}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ asiakasYtunnus: v })}
            />
          </PrintFieldRow>
          <PrintFieldRow label="Yhteyshenkilö">
            <PrintTextInput
              value={draft.asiakasYhteyshenkilo ?? ''}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ asiakasYhteyshenkilo: v })}
            />
          </PrintFieldRow>
          <PrintFieldRow label="Puhelin">
            <PrintTextInput
              value={draft.asiakasPuhelin ?? ''}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ asiakasPuhelin: v })}
            />
          </PrintFieldRow>
          <PrintFieldRow label="Sähköposti">
            <PrintTextInput
              type="email"
              value={draft.asiakasEmail ?? ''}
              disabled={!canEditCustomerEquipment}
              onChange={(v) => patchDraft({ asiakasEmail: v })}
            />
          </PrintFieldRow>
        </PrintInnerBox>
      </PrintColumnRow>
    </HuoltoInspectionDialogShell>
  );
}
