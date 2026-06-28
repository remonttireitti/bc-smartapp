import Tooltip from './Tooltip';
import { IconBilled, IconInvoiceOpen } from './icons';
import {
  resolveWorkReportStatusDisplay,
  type WorkReportStatusContext,
  type WorkReportStatusDisplay,
} from '../lib/workReportViewerStatus';
import WorkStatusBadge from './WorkStatusBadge';
import { normalizeWorkflowStatus, type WorkStatus } from '../types';

type Props = {
  workflowStatus: WorkStatus;
  context: WorkReportStatusContext;
  viewerCompanyId?: string | null;
  hasDailyLogs?: boolean;
  dailyLogs?: Array<{ log_date: string; created_at: string }>;
  billingModuleEnabled?: boolean;
  customerBillingEnabled?: boolean;
  portalView?: boolean;
  compact?: boolean;
};

function BillingChip({
  label,
  hint,
  variant,
  compact,
}: {
  label: string;
  hint: string;
  variant: 'open' | 'done' | 'partial';
  compact?: boolean;
}) {
  const badgeClass =
    variant === 'done'
      ? 'billed_partner'
      : variant === 'partial'
        ? 'in_progress'
        : 'scheduled';

  return (
    <Tooltip label={hint}>
      <span
        className={
          compact
            ? `badge badge-${badgeClass}`
            : `status-badge status-badge-${badgeClass}`
        }
      >
        {!compact && (
          variant === 'done' ? (
            <IconBilled className="ui-icon status-badge-icon" />
          ) : (
            <IconInvoiceOpen className="ui-icon status-badge-icon" />
          )
        )}
        {label}
      </span>
    </Tooltip>
  );
}

function ReceiptBadge({
  display,
  compact,
}: {
  display: WorkReportStatusDisplay;
  compact?: boolean;
}) {
  const variant =
    display.primaryBadgeClass === 'completed'
      ? 'done'
      : display.primaryBadgeClass === 'in_progress'
        ? 'partial'
        : 'open';

  return (
    <span className={compact ? 'report-link-badges' : 'work-report-status-badges'}>
      <BillingChip label={display.primaryLabel} hint={display.hint} variant={variant} compact={compact} />
      {display.secondaryLabel && (
        <BillingChip
          label={display.secondaryLabel}
          hint={display.hint}
          variant={
            display.secondaryBadgeClass === 'completed'
              ? 'done'
              : display.secondaryLabel.includes('Osittain') || display.secondaryLabel.includes('Laskuttamatta:')
                ? 'partial'
                : 'open'
          }
          compact={compact}
        />
      )}
    </span>
  );
}

export default function WorkReportStatusBadges({
  workflowStatus,
  context,
  viewerCompanyId = null,
  hasDailyLogs = false,
  dailyLogs = [],
  billingModuleEnabled = false,
  customerBillingEnabled = false,
  portalView = false,
  compact = false,
}: Props) {
  const normalizedStatus = normalizeWorkflowStatus(workflowStatus);
  const display = resolveWorkReportStatusDisplay({
    context,
    viewerCompanyId,
    hasDailyLogs,
    dailyLogs,
    billingModuleEnabled,
    customerBillingEnabled,
    portalView,
  });

  const wrapperClass = compact ? 'report-link-badges' : 'action-toolbar work-report-status-badges';

  if (portalView) {
    return (
      <span className={wrapperClass}>
        <span className={`badge badge-${display.primaryBadgeClass}`}>{display.primaryLabel}</span>
      </span>
    );
  }

  return (
    <span className={wrapperClass}>
      {display.showWorkflowBadge && compact && (
        <span className={`badge badge-${display.primaryBadgeClass}`}>{display.primaryLabel}</span>
      )}
      {display.showWorkflowBadge && !compact && <WorkStatusBadge status={normalizedStatus} />}
      {!display.showWorkflowBadge && display.viewerRole === 'incoming_partner' && (
        <ReceiptBadge display={display} compact={compact} />
      )}
      {display.viewerRole === 'creator'
        && display.partnerBillingState
        && display.partnerBillingState !== 'open'
        && billingModuleEnabled && (
          <BillingChip
            label={
              display.partnerBillingState === 'partial'
                ? 'Osittain laskutettu kumppanille'
                : 'Laskutettu kumppanille'
            }
            hint="Kumppanilaskutuksen tila."
            variant={display.partnerBillingState === 'billed' ? 'done' : 'partial'}
            compact={compact}
          />
        )}
      {display.showCustomerBilling && display.secondaryLabel && display.showWorkflowBadge && (
        <BillingChip
          label={display.secondaryLabel}
          hint={display.hint}
          variant={display.customerBillingState === 'billed' ? 'done' : 'open'}
          compact={compact}
        />
      )}
    </span>
  );
}
