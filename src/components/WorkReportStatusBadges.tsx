import Tooltip from './Tooltip';
import { IconBilled, IconInvoiceOpen } from './icons';
import {
  billingPartnerStatusLabel,
  type BillingPartnerState,
} from '../lib/workReportBillingCopy';
import WorkStatusBadge from './WorkStatusBadge';
import { normalizeWorkflowStatus, type WorkStatus } from '../types';

type Props = {
  workflowStatus: WorkStatus;
  showPartnerBilling?: boolean;
  partnerBillingState?: BillingPartnerState | null;
  showCustomerBilling?: boolean;
  customerBilled?: boolean;
};

function BillingChip({
  label,
  hint,
  variant,
}: {
  label: string;
  hint: string;
  variant: 'open' | 'done';
}) {
  return (
    <Tooltip label={hint}>
      <span className={`status-badge status-badge-${variant === 'done' ? 'billed_partner' : 'scheduled'}`}>
        {variant === 'done' ? (
          <IconBilled className="ui-icon status-badge-icon" />
        ) : (
          <IconInvoiceOpen className="ui-icon status-badge-icon" />
        )}
        {label}
      </span>
    </Tooltip>
  );
}

export default function WorkReportStatusBadges({
  workflowStatus,
  showPartnerBilling = false,
  partnerBillingState = null,
  showCustomerBilling = false,
  customerBilled = false,
}: Props) {
  const normalizedStatus = normalizeWorkflowStatus(workflowStatus);

  return (
    <span className="action-toolbar work-report-status-badges">
      <WorkStatusBadge status={normalizedStatus} />
      {showPartnerBilling && partnerBillingState && partnerBillingState !== 'open' && (
        <BillingChip
          label={
            partnerBillingState === 'partial'
              ? 'Kumppani osittain laskutettu'
              : billingPartnerStatusLabel(partnerBillingState)
          }
          hint={
            partnerBillingState === 'partial'
              ? 'Osa kumppanilaskutuksesta on kuitattu, osa avoinna.'
              : 'Kumppanilaskutus kuitattu Laskutus-moduulissa.'
          }
          variant="done"
        />
      )}
      {showPartnerBilling && partnerBillingState === 'open' && (
        <BillingChip
          label="Kumppanilaskutus auki"
          hint="Kumppanilaskutusta ei ole vielä kuitattu."
          variant="open"
        />
      )}
      {showCustomerBilling && customerBilled && (
        <BillingChip
          label="Laskutettu asiakkaalta"
          hint="Asiakaslaskutus on merkitty tehdyksi."
          variant="done"
        />
      )}
      {showCustomerBilling && !customerBilled && (
        <BillingChip
          label="Asiakaslaskutus auki"
          hint="Asiakasta ei ole vielä merkitty laskutetuksi."
          variant="open"
        />
      )}
    </span>
  );
}
