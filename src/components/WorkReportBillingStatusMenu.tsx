import { useEffect, useRef, useState } from 'react';

import PartnerBillWorkflowDialog from './PartnerBillWorkflowDialog';
import { IconBilled, IconInvoiceOpen } from './icons';
import {
  applyPartnerBillWorkflowChoice,
  billingCustomerState,
  billingPartnerState,
  billingPartnerStatusLabel,
  canManageCustomerBillingStatus,
  canManagePartnerBillingStatus,
  loadBillingCopyText,
  loadBillingPrintShareLink,
  markCustomerReportBilled,
  markPartnerReportBilled,
  shouldPromptPartnerBillWorkflow,
  unmarkCustomerReportBilled,
  unmarkPartnerReportBilled,
  recordBillingTextCopied,
  recordPrintLinkCopied,
  type BillingListRow,
  type PartnerBillWorkflowChoice,
} from '../lib/workReportBillingCopy';
import { supabase } from '../lib/supabase';
import { normalizeWorkflowStatus, type WorkReport, type WorkReportDailyLog } from '../types';

type Props = {
  report: WorkReport;
  viewerCompanyId: string;
  customerBillingEnabled: boolean;
  hasDailyLogs?: boolean;
  dailyLogs?: WorkReportDailyLog[];
  onChanged?: () => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
  /** 'pill' = raporttinäkymän otsikon tilapilleri (värillinen tilan mukaan). */
  variant?: 'pill' | 'compact';
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
  onNotice,
  variant = 'compact',
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const billingRow = toBillingRow(report);
  const canManagePartner = canManagePartnerBillingStatus(billingRow, viewerCompanyId, hasDailyLogs);
  const canManageCustomer = canManageCustomerBillingStatus(
    billingRow,
    viewerCompanyId,
    customerBillingEnabled,
  );
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

  const customerMarkAllowed = normalizeWorkflowStatus(report.status) === 'completed';
  const primaryState = canManagePartner ? partnerState : customerState;
  const pillStateClass =
    primaryState === 'billed' ? 'billed_partner' : primaryState === 'partial' ? 'in_progress' : 'scheduled';

  const triggerLabel =
    canManagePartner && canManageCustomer
      ? `${partnerMenuLabel(partnerState ?? 'open')} • ${customerMenuLabel(customerState ?? 'open')}`
      : canManagePartner
        ? partnerMenuLabel(partnerState ?? 'open')
        : customerMenuLabel(customerState ?? 'open');

  async function copyBillingText(mode: 'partner' | 'customer') {
    setBusy(true);
    try {
      const { text, partialUnbilledOnly } = await loadBillingCopyText(supabase, billingRow, mode);
      await navigator.clipboard.writeText(text);
      await recordBillingTextCopied(supabase, report.id);
      setOpen(false);
      onChanged?.();
      onNotice?.(
        partialUnbilledOnly
          ? 'Laskuttamatta oleva teksti kopioitu leikepöydälle.'
          : 'Laskutusteksti kopioitu leikepöydälle.',
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Kopiointi epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function copyPartnerPrintLink() {
    setBusy(true);
    try {
      const url = await loadBillingPrintShareLink(billingRow, viewerCompanyId);
      await navigator.clipboard.writeText(url);
      await recordPrintLinkCopied(supabase, report.id);
      setOpen(false);
      onChanged?.();
      onNotice?.('Tulostelinkki kopioitu leikepöydälle.');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Kopiointi epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function finishPartnerBill(workflow: PartnerBillWorkflowChoice) {
    setBusy(true);
    try {
      await markPartnerReportBilled(supabase, report.id);
      await applyPartnerBillWorkflowChoice(supabase, report.id, workflow);
      setWorkflowOpen(false);
      setOpen(false);
      onChanged?.();
      onNotice?.(
        partnerState === 'partial'
          ? 'Avoin summa merkitty laskutetuksi (kumppani).'
          : 'Merkitty laskutetuksi (kumppani).',
      );
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
      onNotice?.('Kumppanilaskutuksen merkintä peruttu — laskutus on taas avoin.');
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
      onNotice?.('Merkitty laskutetuksi asiakkaalta.');
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
      onNotice?.('Asiakaslaskutuksen merkintä peruttu.');
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
          className={
            variant === 'pill'
              ? `status-badge status-badge-${pillStateClass} report-status-pill-trigger`
              : 'btn btn-secondary btn-sm report-status-menu-trigger'
          }
          title="Laskutuksen tila — merkitse laskutetuksi tai peru merkintä"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {variant === 'pill' ? (
            pillStateClass === 'billed_partner' ? (
              <IconBilled className="ui-icon status-badge-icon" />
            ) : (
              <IconInvoiceOpen className="ui-icon status-badge-icon" />
            )
          ) : null}
          {busy ? 'Tallennetaan…' : triggerLabel}
          <span aria-hidden="true" className="report-status-caret">▾</span>
        </button>
        {open && (
          <div className="toolbar-popover-panel report-status-menu-panel" role="menu">
            {canManagePartner && (
              <>
                <p className="report-status-menu-title">Kumppanilaskutus</p>
                <button
                  type="button"
                  role="menuitem"
                  className="report-status-menu-item"
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyBillingText('partner');
                  }}
                >
                  Kopioi laskutusteksti
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="report-status-menu-item"
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyPartnerPrintLink();
                  }}
                >
                  Kopioi tulostelinkki
                </button>
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
                <button
                  type="button"
                  role="menuitem"
                  className="report-status-menu-item"
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyBillingText('customer');
                  }}
                >
                  Kopioi laskutusteksti
                </button>
                {customerState !== 'billed' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="report-status-menu-item"
                    disabled={busy || !customerMarkAllowed}
                    title={customerMarkAllowed ? undefined : 'Asiakaslaskutus voidaan merkitä, kun työn tila on Valmis.'}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void markCustomerBilled();
                    }}
                  >
                    {customerMarkAllowed
                      ? 'Merkitse laskutetuksi asiakkaalta'
                      : 'Merkitse laskutetuksi asiakkaalta (kun työ on Valmis)'}
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
