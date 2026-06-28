import { useEffect, useRef, useState } from 'react';

import PartnerBillWorkflowDialog from './PartnerBillWorkflowDialog';
import {
  applyPartnerBillWorkflowChoice,
  billingCustomerState,
  billingPartnerState,
  billingPartnerStatusLabel,
  canManageIncomingPartnerBilling,
  markCustomerReportBilled,
  markPartnerReportBilled,
  shouldPromptPartnerBillWorkflow,
  unmarkCustomerReportBilled,
  unmarkPartnerReportBilled,
  type BillingListRow,
  type PartnerBillWorkflowChoice,
} from '../lib/workReportBillingCopy';
import { supabase } from '../lib/supabase';
import { type WorkReport, type WorkReportDailyLog } from '../types';

type Props = {
  report: WorkReport;
  viewerCompanyId: string;
  customerBillingEnabled: boolean;
  hasDailyLogs?: boolean;
  dailyLogs?: WorkReportDailyLog[];
  onChanged?: () => void;
  onError?: (message: string) => void;
};

function toBillingRow(report: WorkReport): BillingListRow {
  return {
    id: report.id,
    title: report.title,
    status: report.status,
    completed_at: report.completed_at,
    scheduled_start: report.scheduled_start,
    created_at: report.created_at,
    owner_company_id: report.owner_company_id,
    created_by_company_id: report.created_by_company_id,
    delegate_company_id: report.delegate_company_id,
    customers: report.customers,
    owner_company: report.owner_company,
    delegate_company: report.delegate_company,
    billing: report.billing
      ? {
          partner_invoice_status: report.billing.partner_invoice_status ?? 'none',
          partner_invoice_amount: null,
          partner_billed_amount: report.billing.partner_billed_amount ?? null,
          partner_billed_at: report.billing.partner_billed_at ?? null,
          customer_invoice_status: report.billing.customer_invoice_status ?? 'none',
          customer_invoice_amount: null,
          customer_billed_at: null,
        }
      : null,
    billable: report.billable
      ? {
          partner_total: Number(report.billable.partner_total ?? 0),
          customer_total: Number(report.billable.customer_total ?? 0),
        }
      : null,
  };
}

function partnerMenuLabel(state: ReturnType<typeof billingPartnerState>): string {
  return billingPartnerStatusLabel(state);
}

function customerMenuLabel(state: ReturnType<typeof billingCustomerState>): string {
  return state === 'billed' ? 'Laskutettu asiakkaalta' : 'Laskuttamatta asiakkaalta';
}

export default function WorkReportBillingStatusMenu({
  report,
  viewerCompanyId,
  customerBillingEnabled,
  hasDailyLogs = false,
  dailyLogs = [],
  onChanged,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const billingRow = toBillingRow(report);
  const canManagePartner = canManageIncomingPartnerBilling(billingRow, viewerCompanyId, hasDailyLogs);
  const canManageCustomer =
    customerBillingEnabled
    && viewerCompanyId === report.owner_company_id
    && report.status !== 'draft'
    && report.status !== 'delegated';
  const partnerState = canManagePartner ? billingPartnerState(billingRow, dailyLogs) : null;
  const customerState = canManageCustomer ? billingCustomerState(billingRow) : null;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!canManagePartner && !canManageCustomer) return null;

  const triggerLabel =
    canManagePartner && canManageCustomer
      ? `${partnerMenuLabel(partnerState ?? 'open')} • ${customerMenuLabel(customerState ?? 'open')}`
      : canManagePartner
        ? partnerMenuLabel(partnerState ?? 'open')
        : customerMenuLabel(customerState ?? 'open');

  async function finishPartnerBill(workflow: PartnerBillWorkflowChoice) {
    setBusy(true);
    try {
      await markPartnerReportBilled(supabase, report.id);
      await applyPartnerBillWorkflowChoice(supabase, report.id, workflow);
      setWorkflowOpen(false);
      setOpen(false);
      onChanged?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Kumppanilaskutuksen merkintä epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function markPartnerBilled() {
    if (shouldPromptPartnerBillWorkflow(report.status)) {
      setWorkflowOpen(true);
      setOpen(false);
      return;
    }
    await finishPartnerBill('keep_in_progress');
  }

  async function unmarkPartnerBilled() {
    if (
      !window.confirm(
        partnerState === 'partial'
          ? 'Poistetaanko kaikki kumppanilaskutuksen merkinnät?'
          : 'Palautetaanko kumppanilaskutus avoimeksi?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await unmarkPartnerReportBilled(supabase, report.id);
      setOpen(false);
      onChanged?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Kumppanilaskutuksen peruminen epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function markCustomerBilled() {
    setBusy(true);
    try {
      await markCustomerReportBilled(supabase, report.id);
      setOpen(false);
      onChanged?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Asiakaslaskutuksen merkintä epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function unmarkCustomerBilled() {
    if (!window.confirm('Palautetaanko asiakaslaskutus avoimeksi?')) return;
    setBusy(true);
    try {
      await unmarkCustomerReportBilled(supabase, report.id);
      setOpen(false);
      onChanged?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Asiakaslaskutuksen peruminen epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar-popover-anchor report-status-menu" ref={rootRef}>
        <button
          type="button"
          className="btn btn-secondary btn-sm report-status-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {triggerLabel}
          <span aria-hidden="true"> ▾</span>
        </button>
        {open && (
          <div className="toolbar-popover-panel report-status-menu-panel" role="menu">
            {canManagePartner && (
              <>
                <p className="report-status-menu-title">Kumppanilaskutus</p>
                {(partnerState === 'open' || partnerState === 'partial') && (
                  <button
                    type="button"
                    role="menuitem"
                    className="report-status-menu-item"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void markPartnerBilled();
                    }}
                  >
                    {partnerState === 'partial' ? 'Merkitse loput laskutetuksi' : 'Merkitse laskutetuksi'}
                  </button>
                )}
                {(partnerState === 'billed' || partnerState === 'partial') && (
                  <button
                    type="button"
                    role="menuitem"
                    className="report-status-menu-item"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void unmarkPartnerBilled();
                    }}
                  >
                    Palauta avoimeksi
                  </button>
                )}
              </>
            )}
            {canManageCustomer && (
              <>
                <p className="report-status-menu-title">Asiakaslaskutus</p>
                {customerState !== 'billed' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="report-status-menu-item"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void markCustomerBilled();
                    }}
                  >
                    Merkitse laskutetuksi asiakkaalta
                  </button>
                )}
                {customerState === 'billed' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="report-status-menu-item"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void unmarkCustomerBilled();
                    }}
                  >
                    Palauta avoimeksi
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <PartnerBillWorkflowDialog
        open={workflowOpen}
        busy={busy}
        reportTitle={report.title}
        currentStatus={report.status}
        onMarkCompleted={() => void finishPartnerBill('mark_completed')}
        onKeepInProgress={() => void finishPartnerBill('keep_in_progress')}
        onCancel={() => setWorkflowOpen(false)}
      />
    </>
  );
}
