import { useState, type ReactNode } from 'react';
import WorkReportSectionDialog from './WorkReportSectionDialog';
import { IconGear } from './icons';

type Props = {
  children: ReactNode;
  quantitiesEnabled: boolean;
  triggerLabel?: string;
  dialogTitle?: string;
};

export default function CustomerPrintQuantitySettingsPopup({
  children,
  quantitiesEnabled,
  triggerLabel = 'Asiakastulosteen määrät',
  dialogTitle = 'Asiakastulosteen määrät',
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm customer-print-qty-popup-trigger"
        onClick={() => setOpen(true)}
      >
        <IconGear className="ui-icon" />
        <span>{triggerLabel}</span>
        <span className={`customer-print-qty-popup-badge${quantitiesEnabled ? '' : ' customer-print-qty-popup-badge--off'}`}>
          {quantitiesEnabled ? 'Päällä' : 'Pois'}
        </span>
      </button>
      <WorkReportSectionDialog
        open={open}
        title={dialogTitle}
        onClose={() => setOpen(false)}
        wide
      >
        {children}
      </WorkReportSectionDialog>
    </>
  );
}
