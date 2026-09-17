import { useState, type ReactNode } from 'react';
import WorkReportSectionDialog from './WorkReportSectionDialog';
import { IconGear } from './icons';

type Props = {
  children: ReactNode;
  quantitiesEnabled: boolean;
};

export default function CustomerPrintQuantitySettingsPopup({ children, quantitiesEnabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm customer-print-qty-popup-trigger"
        onClick={() => setOpen(true)}
      >
        <IconGear className="ui-icon" />
        <span>Asiakastulosteen määrät</span>
        <span className={`customer-print-qty-popup-badge${quantitiesEnabled ? '' : ' customer-print-qty-popup-badge--off'}`}>
          {quantitiesEnabled ? 'Päällä' : 'Pois'}
        </span>
      </button>
      <WorkReportSectionDialog
        open={open}
        title="Asiakastulosteen määrät"
        onClose={() => setOpen(false)}
        wide
      >
        {children}
      </WorkReportSectionDialog>
    </>
  );
}
