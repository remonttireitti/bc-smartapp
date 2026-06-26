import {
  billingPartnerState,
  billingPartnerStatusLabel,
  isIncomingPartnerBill,
  resolvePartnerBillingAmounts,
  type BillingListRow,
  type BillingPartnerState,
} from './workReportBillingCopy';
import {
  formatDate,
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
  } | null;
  billable?: {
    partner_total?: number | null;
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
          customer_invoice_status: 'none',
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
}): WorkReportStatusDisplay {
  const { context, viewerCompanyId, hasDailyLogs = false, dailyLogs = [], billingModuleEnabled = false } = input;
  const viewerRole = resolveWorkReportViewerRole(context, viewerCompanyId);
  const normalizedStatus = normalizeWorkflowStatus(context.status);
  const billingRow = toBillingListRow(context);
  const partnerTotal = Number(context.billable?.partner_total ?? 0);
  const partnerBillingState =
    billingModuleEnabled && partnerTotal > 0.005 ? billingPartnerState(billingRow) : null;
  const unbilledLogDates =
    partnerBillingState === 'partial'
      ? resolveUnbilledDailyLogDates(dailyLogs, context.billing?.partner_billed_at)
      : [];

  if (viewerRole === 'creator') {
    return {
      viewerRole,
      primaryLabel: getWorkStatusLabel(normalizedStatus),
      primaryBadgeClass: normalizedStatus,
      hint:
        normalizedStatus === 'completed'
          ? 'Työ on valmis. Kumppani näkee raportin omana tilamerkintänään.'
          : getWorkStatusLabel(normalizedStatus),
      showWorkflowBadge: true,
      partnerBillingState,
      unbilledLogDates: [],
    };
  }

  if (viewerRole === 'incoming_partner' && billingModuleEnabled) {
    if (partnerBillingState === 'billed') {
      return {
        viewerRole,
        primaryLabel: 'Laskutettu',
        primaryBadgeClass: 'completed',
        hint: 'Kumppanilaskutus on kuitattu kokonaan.',
        showWorkflowBadge: false,
        partnerBillingState,
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
        secondaryLabel: unbilledLabel ? `Laskuttamatta: ${unbilledLabel}` : undefined,
        secondaryBadgeClass: 'scheduled',
        hint: unbilledLabel
          ? `Laskutettu ${amounts.billed.toFixed(2).replace('.', ',')} €, avoinna ${amounts.open.toFixed(2).replace('.', ',')} €. Uudet päivät: ${unbilledLabel}.`
          : `Laskutettu ${amounts.billed.toFixed(2).replace('.', ',')} €, avoinna ${amounts.open.toFixed(2).replace('.', ',')} €.`,
        showWorkflowBadge: false,
        partnerBillingState,
        unbilledLogDates,
      };
    }

    if (hasDailyLogs || normalizedStatus === 'completed' || normalizedStatus === 'in_progress') {
      const hasBillable = partnerTotal > 0.005;
      return {
        viewerRole,
        primaryLabel: 'Raportoitu',
        primaryBadgeClass: 'in_progress',
        secondaryLabel: hasBillable ? 'Laskuttamatta' : undefined,
        secondaryBadgeClass: hasBillable ? 'scheduled' : undefined,
        hint: hasBillable
          ? 'Kumppani on raportoinut työtä. Laskutusta ei ole vielä kuitattu.'
          : 'Kumppani on raportoinut työtä.',
        showWorkflowBadge: false,
        partnerBillingState: partnerBillingState ?? 'open',
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
