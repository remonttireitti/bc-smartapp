import { Link } from 'react-router-dom';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { usesRefrigerantServiceExtras } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { PrintCheckField, PrintFieldRow, PrintInnerBox, PrintStatusBanner, PrintTextInput } from './print/MaintenancePrintLayout';

type DraftData = Pick<
  HuoltoReportData,
  | 'huoltoSuoritettu'
  | 'huoltoKylmaaineVuotoTarkastus'
  | 'huoltoLaiteessaVika'
  | 'huoltoPaivamaara'
>;

type Props = {
  form: HuoltoReportData;
  laiteTyyppi: string;
  profileTukesNumber?: string | null;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
};

function pickDraft(form: HuoltoReportData): DraftData {
  return {
    huoltoSuoritettu: form.huoltoSuoritettu,
    huoltoKylmaaineVuotoTarkastus: form.huoltoKylmaaineVuotoTarkastus,
    huoltoLaiteessaVika: form.huoltoLaiteessaVika,
    huoltoPaivamaara: form.huoltoPaivamaara,
  };
}

function huoltotiedotStatus(form: HuoltoReportData): 'ok' | null {
  return form.huoltoPaivamaara?.trim() ? 'ok' : null;
}

export function HuoltotiedotStatusDialog({
  form,
  laiteTyyppi,
  profileTukesNumber,
  onChange,
  documentModuleKey,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const showRefrigerantExtras = usesRefrigerantServiceExtras(laiteTyyppi);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: pickDraft(form),
    onChange: (next) => onChange(next),
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<DraftData>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!documentLayout || !documentModuleKey) return null;

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title="Huoltotiedot"
      titleId="huoltotiedot-status-dialog-title"
      onClose={closeDialog}
    >
      <PrintStatusBanner>
        <PrintCheckField
          label="Huolto suoritettu"
          checked={!!draft.huoltoSuoritettu}
          onChange={(checked) => patchDraft({ huoltoSuoritettu: checked })}
        />
        {showRefrigerantExtras ? (
          <PrintCheckField
            label="Kylmäaine / vuototarkastus"
            checked={!!draft.huoltoKylmaaineVuotoTarkastus}
            onChange={(checked) => patchDraft({ huoltoKylmaaineVuotoTarkastus: checked })}
          />
        ) : null}
        <PrintCheckField
          label="Laitteessa vika / puutteita"
          checked={!!draft.huoltoLaiteessaVika}
          onChange={(checked) => patchDraft({ huoltoLaiteessaVika: checked })}
        />
      </PrintStatusBanner>

      <PrintInnerBox title="ALATUNNISTE" accent="#64748b">
        <PrintFieldRow label="Suorittaja">
          <PrintTextInput value={form.huoltoSuorittajaNimi} readOnly disabled />
        </PrintFieldRow>
        <PrintFieldRow label="TUKES">
          <PrintTextInput
            value={form.huoltoSuorittajaTUKES}
            readOnly
            disabled
            placeholder={profileTukesNumber ? undefined : 'Lisää omissa tiedoissa'}
          />
        </PrintFieldRow>
        {!form.huoltoSuorittajaTUKES.trim() ? (
          <p className="muted huolto-span-all">
            TUKES-numero puuttuu profiilista. <Link to="/hallinta/omat">Täytä omat tiedot</Link>
          </p>
        ) : null}
        <PrintFieldRow label="Päivämäärä">
          <PrintTextInput
            type="date"
            value={draft.huoltoPaivamaara}
            onChange={(v) => patchDraft({ huoltoPaivamaara: v })}
          />
        </PrintFieldRow>
      </PrintInnerBox>
    </HuoltoInspectionDialogShell>
  );
}

export { huoltotiedotStatus };
