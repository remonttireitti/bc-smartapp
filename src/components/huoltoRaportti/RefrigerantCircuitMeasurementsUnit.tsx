import { useCallback } from 'react';
import type { RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import {
  circuitMeasurementsStatus,
  circuitMeasurementsSubtitle,
} from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { CircuitMeasurementsFields } from './RefrigerantCircuitMeasurementsDialog';

interface Props {
  circuitNumber: number;
  data: RefrigerantCircuitData;
  onChange: (data: RefrigerantCircuitData) => void;
  refrigerantType?: string;
  laiteTyyppi?: string;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

export function RefrigerantCircuitMeasurementsUnit({
  circuitNumber,
  data,
  onChange,
  refrigerantType = '',
  laiteTyyppi = '',
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const title = `Mittaukset — piiri ${circuitNumber}`;
  const status = circuitMeasurementsStatus(data);
  const subtitle = circuitMeasurementsSubtitle(data);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange,
  });

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  const handleClose = useCallback(() => {
    closeDialog();
  }, [closeDialog]);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow
          title={title}
          subtitle={subtitle || undefined}
          status={status}
          onInspect={openDialog}
        />
      ) : null}

      <HuoltoInspectionDialogShell
        open={open}
        title={title}
        titleId={`circuit-measurements-dialog-${circuitNumber}`}
        onClose={handleClose}
      >
        <CircuitMeasurementsFields
          data={draft}
          onChange={setDraft}
          refrigerantType={refrigerantType}
          laiteTyyppi={laiteTyyppi}
          printSettingsInPopup
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}
