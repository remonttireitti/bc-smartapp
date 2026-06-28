import {
  billingCustomerState,
  billingPartnerState,
  billingPartnerStatusLabel,
  billingRowAmount,
  canViewOutgoingPartnerBilling,
  hasPartnerBillingActivity,
  isBillablePartnerReport,
  isIncomingPartnerBill,
  resolvePartnerBillingAmounts,
  type BillingListRow,
  type BillingPartnerState,
} from './workReportBillingCopy';
import {
  formatDate,
  getPortalWorkStatusLabel,
  getWorkStatusLabel,
  normalizeWorkflowStatus,
  type InvoiceStatus,
  type WorkStatus,
} from '../types';

export type WorkReportViewerRole = 'creator' | 'incoming_partner' | 'default';

export type WorkReportStatusContext = {
  status: WorkStatus;
  owner_company_id: string;
  created_by_company_id: string;
  delegate_company_id: string | null;
  billing?: {
    partner_invoice_status?: InvoiceStatus | null;
    partner_billed_amount?: number | null;
    partner_billed_at?: string | null;
    customer_invoice_status?: InvoiceStatus | null;
  } | null;
  billable?: {
    partner_total?: number | null;
    customer_total?: number | null;
  } | null;
};

export type WorkReportStatusDisplay = {
  viewerRole: WorkReportViewerRole;
  primaryLabel: string;
  primaryBadgeClass: string;
  secondaryLabel?: string;
  secondaryBadgeClass?: string;
  hint: string;
  showWorkflowBadge: boolean;
  partnerBillingState: BillingPartnerState | null;
  customerBillingState: BillingPartnerState | null;
  showCustomerBilling: boolean;
  unbilledLogDates: string[];
};

export function resolveWorkReportViewerRole(
  report: Pick<WorkReportStatusContext, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
  viewerCompanyId: string | null | undefined,
): WorkReportViewerRole {
  if (!viewerCompanyId) return 'default';
  if (viewerCompanyId === report.created_by_company_id) return 'creator';
  if (isIncomingPartnerBill(report as BillingListRow, viewerCompanyId)) return 'incoming_partner';
  return 'default';
}

export function resolveUnbilledDailyLogDates(
  logs: Array<{ log_date: string; created_at: string }>,
  partnerBilledAt: string | null | undefined,
): string[] {
  if (!partnerBilledAt) return [];
  const billedAtMs = new Date(partnerBilledAt).getTime();
  if (!Number.isFinite(billedAtMs)) return [];

  const dates = new Set<string>();
  for (const log of logs) {
    const createdMs = new Date(log.created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs > billedAtMs) {
      dates.add(log.log_date.slice(0, 10));
    }
  }
  return [...dates].sort();
}

export function formatUnbilledLogDatesLabel(dates: string[]): string {
  if (dates.length === 0) return '';
  return dates.map((date) => formatDate(date)).join(', ');
}

function toBillingListRow(context: WorkReportStatusContext): BillingListRow {
  return {
    id: '',
    title: '',
    status: context.status,
    completed_at: null,
    scheduled_start: null,
    created_at: '',
    owner_company_id: context.owner_company_id,
    created_by_company_id: context.created_by_company_id,
    delegate_company_id: context.delegate_company_id,
    customers: null,
    owner_company: null,
    delegate_company: null,
    billing: context.billing
      ? {
          partner_invoice_status: context.billing.partner_invoice_status ?? 'none',
          partner_invoice_amount: null,
          partner_billed_amount: context.billing.partner_billed_amount ?? null,
          partner_billed_at: context.billing.partner_billed_at ?? null,
          customer_invoice_status: context.billing.customer_invoice_status ?? 'none',
          customer_invoice_amount: null,
          customer_billed_at: null,
        }
      : null,
    billable: context.billable
      ? {
          partner_total: Number(context.billable.partner_total ?? 0),
        }
      : null,
  };
}

export function resolveWorkReportStatusDisplay(input: {
  context: WorkReportStatusContext;
  viewerCompanyId: string | null | undefined;
  hasDailyLogs?: boolean;
  dailyLogs?: Array<{ log_date: string; created_at: string }>;
  billingModuleEnabled?: boolean;
  customerBillingEnabled?: boolean;
  portalView?: boolean;
}): WorkReportStatusDisplay {
  const {
    context,
    viewerCompanyId,
    hasDailyLogs = false,
    dailyLogs = [],
    customerBillingEnabled = false,
    portalView = false,
  } = input;
  const viewerRole = resolveWorkReportViewerRole(context, viewerCompanyId);
  const normalizedStatus = normalizeWorkflowStatus(context.status);
  const billingRow = toBillingListRow(context);
  const partnerTotal = billingRowAmount(billingRow, 'partner');
  const trackPartnerBilling =
    isBillablePartnerReport(billingRow)
    && (viewerRole === 'incoming_partner' || viewerRole === 'creator')
    && hasPartnerBillingActivity(billingRow, hasDailyLogs);
  const partnerBillingState = trackPartnerBilling ? billingPartnerState(billingRow) : null;
  const isOwnerViewer = viewerCompanyId === context.owner_company_id;
  const showCustomerBilling =
    !portalView
    && customerBillingEnabled
    && isOwnerViewer
    && viewerRole !== 'creator'
    && normalizedStatus !== 'draft'
    && normalizedStatus !== 'delegated';
  const customerBillingState = showCustomerBilling ? billingCustomerState(billingRow) : null;
  const unbilledLogDates =
    partnerBillingState === 'partial'
      ? resolveUnbilledDailyLogDates(dailyLogs, context.billing?.partner_billed_at)
      : [];

  if (portalView) {
    const portalLabel = getPortalWorkStatusLabel(context.status);
    return {
      viewerRole,
      primaryLabel: portalLabel,
      primaryBadgeClass: normalizedStatus,
      hint: portalLabel,
      showWorkflowBadge: true,
      partnerBillingState: null,
      customerBillingState: null,
      showCustomerBilling: false,
      unbilledLogDates: [],
    };
  }

  if (viewerRole === 'creator') {
    const partnerReceiptLabel =
      partnerBillingState && canViewOutgoingPartnerBilling(billingRow, viewerCompanyId, hasDailyLogs)
        ? billingPartnerStatusLabel(partnerBillingState)
        : undefined;
    return {
      viewerRole,
      primaryLabel: getWorkStatusLabel(normalizedStatus),
      primaryBadgeClass: normalizedStatus,
      secondaryLabel: partnerReceiptLabel,
      secondaryBadgeClass:
        partnerBillingState === 'billed'
          ? 'completed'
          : partnerBillingState === 'partial'
            ? 'in_progress'
            : 'scheduled',
      hint:
        partnerReceiptLabel
          ? `Omistaja on merkinnyt: ${partnerReceiptLabel.toLowerCase()}.`
          : normalizedStatus === 'completed'
            ? 'Työ on valmis. Kumppani näkee raportin omana tilamerkintänään.'
            : getWorkStatusLabel(normalizedStatus),
      showWorkflowBadge: true,
      partnerBillingState,
      customerBillingState: null,
      showCustomerBilling: false,
      unbilledLogDates: [],
    };
  }

  if (viewerRole === 'incoming_partner') {
    const customerLabel =
      customerBillingState === 'billed'
        ? 'Laskutettu asiakkaalta'
        : showCustomerBilling
          ? 'Asiakaslaskutus auki'
          : undefined;

    if (partnerBillingState === 'billed') {
      return {
        viewerRole,
        primaryLabel: 'Laskutettu',
        primaryBadgeClass: 'completed',
        secondaryLabel: customerLabel,
        secondaryBadgeClass: customerBillingState === 'billed' ? 'completed' : 'scheduled',
        hint: 'Kumppanilaskutus on kuitattu kokonaan.',
        showWorkflowBadge: false,
        partnerBillingState,
        customerBillingState,
        showCustomerBilling,
        unbilledLogDates: [],
      };
    }

    if (partnerBillingState === 'partial') {
      const amounts = resolvePartnerBillingAmounts(
        partnerTotal,
        context.billing?.partner_billed_amount,
        context.billing?.partner_invoice_status,
      );
      const unbilledLabel = formatUnbilledLogDatesLabel(unbilledLogDates);
      return {
        viewerRole,
        primaryLabel: 'Osittain laskutettu',
        primaryBadgeClass: 'in_progress',
        secondaryLabel: unbilledLabel ? `Laskuttamatta: ${unbilledLabel}` : customerLabel,
        secondaryBadgeClass: unbilledLabel ? 'scheduled' : customerBillingState === 'billed' ? 'completed' : 'scheduled',
        hint: unbilledLabel
          ? `Laskutettu ${amounts.billed.toFixed(2).replace('.', ',')} €, avoinna ${amounts.open.toFixed(2).replace('.', ',')} €. Uudet päivät: ${unbilledLabel}.`
          : `Laskutettu ${amounts.billed.toFixed(2).replace('.', ',')} €, avoinna ${amounts.open.toFixed(2).replace('.', ',')} €.`,
        showWorkflowBadge: false,
        partnerBillingState,
        customerBillingState,
        showCustomerBilling,
        unbilledLogDates,
      };
    }

    if (hasDailyLogs || normalizedStatus === 'completed' || normalizedStatus === 'in_progress') {
      const hasBillable = hasPartnerBillingActivity(billingRow, hasDailyLogs);
      return {
        viewerRole,
        primaryLabel: 'Raportoitu',
        primaryBadgeClass: 'in_progress',
        secondaryLabel: hasBillable ? 'Laskuttamatta' : customerLabel,
        secondaryBadgeClass: hasBillable ? 'scheduled' : customerBillingState === 'billed' ? 'completed' : 'scheduled',
        hint: hasBillable
          ? 'Kumppani on raportoinut työtä. Laskutusta ei ole vielä kuitattu.'
          : 'Kumppani on raportoinut työtä.',
        showWorkflowBadge: false,
        partnerBillingState: partnerBillingState ?? 'open',
        customerBillingState,
        showCustomerBilling,
        unbilledLogDates: [],
      };
    }

    return {
      viewerRole,
      primaryLabel: getWorkStatusLabel(normalizedStatus),
      primaryBadgeClass: normalizedStatus,
      hint: 'Työraportti odottaa vielä raportointia.',
      showWorkflowBadge: false,
      partnerBillingState,
      customerBillingState,
      showCustomerBilling,
      unbilledLogDates: [],
    };
  }

  if (isOwnerViewer && showCustomerBilling) {
    return {
      viewerRole,
      primaryLabel: getWorkStatusLabel(normalizedStatus),
      primaryBadgeClass: normalizedStatus,
      secondaryLabel:
        customerBillingState === 'billed' ? 'Laskutettu asiakkaalta' : 'Asiakaslaskutus auki',
      secondaryBadgeClass: customerBillingState === 'billed' ? 'completed' : 'scheduled',
      hint:
        customerBillingState === 'billed'
          ? 'Asiakaslaskutus on merkitty tehdyksi.'
          : 'Asiakasta ei ole vielä merkitty laskutetuksi.',
      showWorkflowBadge: true,
      partnerBillingState,
      customerBillingState,
      showCustomerBilling,
      unbilledLogDates: [],
    };
  }

  return {
    viewerRole,
    primaryLabel: getWorkStatusLabel(normalizedStatus),
    primaryBadgeClass: normalizedStatus,
    hint: getWorkStatusLabel(normalizedStatus),
    showWorkflowBadge: true,
    partnerBillingState,
    customerBillingState,
    showCustomerBilling: false,
    unbilledLogDates: [],
  };
}

export function isDailyLogUnbilledForPartner(
  log: { log_date: string; created_at: string },
  display: WorkReportStatusDisplay,
): boolean {
  if (display.viewerRole !== 'incoming_partner' || display.partnerBillingState !== 'partial') return false;
  return display.unbilledLogDates.includes(log.log_date.slice(0, 10));
}

export function partnerReceiptStatusLabel(state: BillingPartnerState | null): string {
  if (!state) return '—';
  return billingPartnerStatusLabel(state);
}
