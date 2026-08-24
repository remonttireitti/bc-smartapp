import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../components/CustomerRegistryPicker';
import DeletedUserLabel from '../components/DeletedUserLabel';
import {
  buildDailyLogEntryTiles,
  DailyLogEntryTile,
  DailyLogEntryTileGrid,
} from '../components/DailyLogEntryTile';
import { WorkReportSectionTile, WorkReportSectionTileGrid } from '../components/WorkReportSectionTile';
import WorkReportSectionDialog from '../components/WorkReportSectionDialog';
import ActionStatusDialog from '../components/ActionStatusDialog';
import DailyLogDialog from '../components/DailyLogDialog';
import DailyLogFormSection from '../components/DailyLogFormSection';
import {
  dailyLogNoticeFromError,
  dailyLogNoticeFromWarning,
  dailyLogSavedNotice,
  dailyLogSavingNotice,
  type DailyLogActionNotice,
} from '../lib/dailyLogActionStatus';
import IconButton from '../components/IconButton';
import { IconPrint, IconTrash } from '../components/icons';
import PartnerBillingRatesFields from '../components/PartnerBillingRatesFields';
import Tooltip from '../components/Tooltip';
import WorkReportBillingBreakdown from '../components/WorkReportBillingBreakdown';
import WorkReportBillingQuotePanel from '../components/WorkReportBillingQuotePanel';
import WorkReportBillingStatusMenu from '../components/WorkReportBillingStatusMenu';
import WorkReportStatusBadges from '../components/WorkReportStatusBadges';
import { useCompanyCustomerBillingEnabled } from '../hooks/useCompanyCustomerBillingEnabled';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useProfile } from '../hooks/useProfile';
import { canDeleteWorkReport } from '../lib/deletePermissions';
import {
  companySubscriberOrderEditPath,
  isInternalCompanyOrderDraft,
  isPortalReadOnly,
  isSubscriberPortalWorkOrder,
  isWorkReportVisibleToPortalSubscriber,
} from '../lib/portalWorkOrder';
import SubscriberPortalVisibilityField from '../components/SubscriberPortalVisibilityField';
import {
  SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT,
  reportHasSubscriberLink,
  subscriberPortalVisibilityLabel,
  type SubscriberPortalVisibility,
} from '../lib/subscriberPortalVisibility';
import { buildWorkReportStatusPatch } from '../lib/workReportStatusUpdate';
import { canEditWorkReportDescription, canManageWorkReportDailyLogs, buildWorkReportPatchAfterDailyLogAdded } from '../lib/workReportDailyLogs';
import {
  canAcceptDelegatedWorkOrder,
  canAssignDelegatedWorkOrder,
} from '../lib/workReportDelegation';
import DailyLogRefrigerantFields from '../components/inventory/DailyLogRefrigerantFields';
import DailyLogTripLegFields from '../components/DailyLogTripLegFields';
import {
  BUCKET,
  DailyLogImageSection,
  uploadDailyLogImages,
} from '../lib/dailyLogImages';
import {
  loadWorkReportAttachments,
  WorkReportAttachmentGallery,
  WorkReportAttachmentsField,
} from '../lib/workReportAttachments';
import {
  loadRefrigerantCylindersForReport,
  refrigerantBillingReminder,
  refrigerantLinesToDrafts,
  restoreCylinderQuantities,
  saveRefrigerantLines,
  type RefrigerantLineDraft,
} from '../lib/refrigerantInventory';
import {
  BILLABLE_RATES_SOURCE_LABELS,
  hasPartnerBillingRates,
  loadCompanyBillingModuleEnabled,
  loadCompanyTracksCustomerInvoicing,
  parseCompanySettings,
  parseCustomerBillingRates,
  parsePartnerBillingRates,
  partnershipModuleAccess,
  partnershipPermsActingOnOwner,
  readPartnershipBillingRates,
  resolveBillingRates,
  resolveCustomerBillingRates,
  type PartnerBillingRates,
} from '../lib/management';
import { createRegistryCustomer } from '../lib/createRegistryCustomer';
import {
  customerCreateTargets,
  loadAccessibleReportCustomers,
  loadReportPartnerships,
  resolveReportContextFromCustomer,
  resolveReportContextFromOwner,
} from '../lib/reportCustomerRegistry';
import {
  billingPartnerState,
  canManageIncomingPartnerBilling,
  hasPartnerBillingActivity,
  isCustomerInvoicePaid,
  canPersistPartnerBillable,
  markCustomerReportBilled,
  resolvePartnerBillingAmounts,
  resolvePartnerBilledCompanyId,
  unmarkCustomerReportBilled,
} from '../lib/workReportBillingCopy';
import {
  buildLogCalendarCandidate,
  checkPerformerScheduleConflict,
  loadPerformerCalendarContext,
  resolveReportPerformerUserId,
} from '../lib/workReportCalendar';
import { supabase } from '../lib/supabase';
import {
  shouldCalculateCustomerBilling,
} from '../lib/workReportCustomerBilling';
import { refreshAndPersistCustomerBillable } from '../lib/workReportCustomerBillingPersist';
import {
  customerUsesFixedQuote,
  parseBillingQuoteSettings,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import {
  computePartnerUrakkaFromCustomer,
  DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
} from '../lib/workReportUrakkaBilling';
import { refreshAndPersistPartnerBillable, markPartnerBillableRecalcNeeded } from '../lib/workReportPartnerBillingPersist';
import {
  formatEuro,
  hasBillableUserFlags,
  hasZeroHourlyRates,
  billableHoursQty,
  shouldCalculatePartnerBilling,
  type BillableCalculation,
  type UserBillingProfile,
} from '../lib/workReportBilling';
import { loadTripDestinationOptions, type TripDestinationOption } from '../lib/tripDestinations';
import {
  fetchWorkReportDetailLogs,
  isMissingBillToPartnerColumn,
} from '../lib/workReportDailyLogSelect';
import {
  applyExpenseBillingMode,
  applyTripBillingToExpenses,
  expenseBillingSummaryLabel,
  resolveExpenseBillingMode,
  resolveTripBillingFromExpenses,
  tripLegsBillToCustomer,
  type ExpenseBillingMode,
} from '../lib/workReportExpenseBilling';
import {
  isAutoTripKmExpense,
  isLikelyAutoTripKmExpense,
  parseTripKmCustomerRate,
  parseTripKmRate,
  syncTripKmExpenseDrafts,
} from '../lib/tripKmExpense';
import {
  normalizeTripLegDrafts,
  resolveUserDepartureLabel,
  saveTripLegs,
  sumDailyTripKm,
  sumDailyExpensesWithTrips,
  dailyLogExpensesTotal,
  tripLegDeparture,
  tripLegsToDrafts,
  type TripLegDraft,
} from '../lib/workReportTripLegs';
import {
  formatUnbilledLogDatesLabel,
  resolveWorkReportStatusDisplay,
} from '../lib/workReportViewerStatus';
import {
  EXPENSE_TYPE_LABELS,
  EXPENSE_TYPE_OPTIONS,
  HOUR_ENTRY_LABELS,
  INVOICE_STATUS_LABELS,
  WORKFLOW_STATUS_ORDER,
  WORK_STATUS_LABELS,
  normalizeWorkflowStatus,
  formatDate,
  formatDateTime,
  formatWorkReportEquipment,
  buildWorkReportTitle,
  resolveWorkReportDescription,
  defaultOfficeHour,
  OFFICE_HOUR_OPTIONS,
  roundTimeToHalfHour,
  resolveWorkReportDisplayPeople,
  sumDailyHours,
  todayIsoDate,
  type DailyHourEntryType,
  type WorkReport,
  type WorkReportAttachment,
  type WorkReportBilling,
  type WorkReportDailyLog,
  type PendingDailyLogImage,
  type WorkStatus,
} from '../types';
import type { Customer, Partnership } from '../types';
import type { RefrigerantCylinder } from '../types/inventory';

interface Props {
  session: Session;
}

type ExpenseDraft = {
  key: string;
  expense_type: string;
  description: string;
  qty: string;
  unit_price: string;
  bill_to_partner: boolean;
  bill_to_customer: boolean;
  customer_unit_price: string;
};

const REPORT_SELECT = `
  id, title, heading, description, orderer_name, location_text, status,
  scheduled_start, scheduled_end, completed_at,
  owner_company_id, created_by_company_id, created_by_user_id, branding_company_id,
  partnership_id, customer_id, equipment_id, assigned_user_id,
  delegate_company_id, delegated_at, created_at, subscriber_id, subscriber_portal_visibility,
  created_by_user_name_snapshot, created_by_user_deleted,
  assigned_user_name_snapshot, assigned_user_deleted,
  customers(name, address, city, subscriber_id),
  equipment(name, tag),
  owner_company:companies!work_reports_owner_company_id_fkey(name),
  branding_company:companies!work_reports_branding_company_id_fkey(name),
  created_by_company:companies!work_reports_created_by_company_id_fkey(name),
  delegate_company:companies!work_reports_delegate_company_id_fkey(name),
  assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name),
  created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name, email)
`;

function emptyExpense(): ExpenseDraft {
  return {
    key: crypto.randomUUID(),
    expense_type: '',
    description: '',
    qty: '1',
    unit_price: '',
    bill_to_partner: true,
    bill_to_customer: true,
    customer_unit_price: '',
  };
}

function isNewExpenseRow(row: ExpenseDraft): boolean {
  return !row.description.trim() && !row.expense_type;
}

function initialLogForm() {
  return {
    log_date: todayIsoDate(),
    log_start_time: defaultOfficeHour(),
    entry_type: 'regular' as DailyHourEntryType,
    hours_regular: '',
    hours_overtime: '',
    hours_on_call: '',
    fixed_price_amount: '',
    customer_fixed_price_amount: '',
    partner_urakka_margin_percent: String(DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT),
    partner_urakka_manual: false,
    hourly_rate_override: '',
    customer_hourly_rate_override: '',
    commission_amount: '',
    commission_note: '',
    work_done: '',
  };
}

type DailyLogFormState = ReturnType<typeof initialLogForm>;

function hourFieldsForEntryType(entryType: DailyHourEntryType) {
  return {
    showRegular: ['regular', 'regular_and_overtime', 'fixed_price'].includes(entryType),
    showOvertime: ['overtime', 'regular_and_overtime'].includes(entryType),
    showOnCall: entryType === 'on_call',
    showFixed: entryType === 'fixed_price',
    calendarOnlyHours: entryType === 'fixed_price',
  };
}

function addHourValue(current: string, delta: number): string {
  const next = Math.max(0, Number(current || 0) + delta);
  if (!Number.isFinite(next)) return String(delta);
  return String(Math.round(next * 100) / 100);
}

function logToForm(log: WorkReportDailyLog): DailyLogFormState {
  return {
    log_date: log.log_date.slice(0, 10),
    log_start_time: log.log_start_time
      ? roundTimeToHalfHour(String(log.log_start_time).slice(0, 5))
      : defaultOfficeHour(),
    entry_type: log.entry_type,
    hours_regular: Number(log.hours_regular) > 0 ? String(log.hours_regular) : '',
    hours_overtime: Number(log.hours_overtime) > 0 ? String(log.hours_overtime) : '',
    hours_on_call: Number(log.hours_on_call) > 0 ? String(log.hours_on_call) : '',
    fixed_price_amount:
      log.fixed_price_amount != null && Number(log.fixed_price_amount) > 0
        ? String(log.fixed_price_amount)
        : '',
    customer_fixed_price_amount:
      log.customer_fixed_price_amount != null && Number(log.customer_fixed_price_amount) > 0
        ? String(log.customer_fixed_price_amount)
        : '',
    partner_urakka_margin_percent:
      log.partner_urakka_margin_percent != null
        ? String(log.partner_urakka_margin_percent)
        : String(DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT),
    partner_urakka_manual:
      Number(log.customer_fixed_price_amount) > 0
      && Number(log.fixed_price_amount) > 0
      && log.partner_urakka_margin_percent == null,
    hourly_rate_override:
      log.hourly_rate_override != null && Number(log.hourly_rate_override) > 0
        ? String(log.hourly_rate_override)
        : '',
    customer_hourly_rate_override:
      log.customer_hourly_rate_override != null && Number(log.customer_hourly_rate_override) > 0
        ? String(log.customer_hourly_rate_override)
        : '',
    commission_amount: Number(log.commission_amount) > 0 ? String(log.commission_amount) : '',
    commission_note: log.commission_note ?? '',
    work_done: log.work_done,
  };
}

function expensesToDrafts(lines: WorkReportDailyLog['expense_lines']): ExpenseDraft[] {
  return (lines ?? []).map((line) => ({
    key: line.id,
    expense_type: line.expense_type,
    description: line.description,
    qty: String(line.qty),
    unit_price: String(line.unit_price),
    bill_to_partner: line.bill_to_partner !== false,
    bill_to_customer: line.bill_to_customer !== false,
    customer_unit_price:
      line.customer_unit_price != null && Number(line.customer_unit_price) > 0
        ? String(line.customer_unit_price)
        : '',
  }));
}

function expenseSaveOptionsForReport(
  report: Pick<WorkReport, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
  customerInvoicingEnabled: boolean,
) {
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  const isPartnerReport =
    report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
  return {
    includePartnerFields: isPartnerReport,
    includeCustomerFields: customerInvoicingEnabled,
  };
}

function expenseRowSectionTitle(
  row: ExpenseDraft,
  showPartner: boolean,
  showCustomer: boolean,
): string {
  const type = row.expense_type
    ? (EXPENSE_TYPE_LABELS[row.expense_type] ?? row.expense_type)
    : 'Uusi kulu';
  const desc = row.description.trim() || 'Täytä tiedot';
  const parts = [type, desc];
  if (row.qty.trim()) parts.push(`${row.qty} kpl`);
  const billingLabel = expenseBillingSummaryLabel(row, {
    showPartner,
    showCustomer,
  });
  if (billingLabel) parts.push(billingLabel);
  return parts.join(' · ');
}

function buildLogPayload(form: DailyLogFormState) {
  const { showRegular, showOvertime, showOnCall, showFixed } = hourFieldsForEntryType(form.entry_type);
  const hourlyOverrideRaw = String(form.hourly_rate_override ?? '').trim();
  const hourlyOverride = !showFixed && hourlyOverrideRaw ? Number(hourlyOverrideRaw) : null;
  const customerHourlyRaw = String(form.customer_hourly_rate_override ?? '').trim();
  const customerHourlyOverride = !showFixed && customerHourlyRaw ? Number(customerHourlyRaw) : null;

  const customerFixedRaw = String(form.customer_fixed_price_amount ?? '').trim();
  const customerFixedAmount =
    showFixed && customerFixedRaw && Number(customerFixedRaw) > 0 ? Number(customerFixedRaw) : null;
  const marginRaw = String(form.partner_urakka_margin_percent ?? '').trim();
  const marginPercent =
    marginRaw && Number.isFinite(Number(marginRaw)) ? Number(marginRaw) : DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;

  let partnerFixedAmount: number | null = null;
  let storedMargin: number | null = null;
  if (showFixed) {
    if (customerFixedAmount != null && !form.partner_urakka_manual) {
      partnerFixedAmount = computePartnerUrakkaFromCustomer(customerFixedAmount, marginPercent);
      storedMargin = marginPercent;
    } else {
      const partnerRaw = String(form.fixed_price_amount ?? '').trim();
      partnerFixedAmount = partnerRaw && Number(partnerRaw) > 0 ? Number(partnerRaw) : null;
    }
  }

  return {
    log_date: form.log_date,
    log_start_time: roundTimeToHalfHour(form.log_start_time),
    entry_type: form.entry_type,
    hours_regular: showRegular ? Number(form.hours_regular || 0) : 0,
    hours_overtime: showOvertime ? Number(form.hours_overtime || 0) : 0,
    hours_on_call: showOnCall ? Number(form.hours_on_call || 0) : 0,
    fixed_price_amount: partnerFixedAmount,
    customer_fixed_price_amount: customerFixedAmount,
    partner_urakka_margin_percent: storedMargin,
    hourly_rate_override:
      hourlyOverride != null && Number.isFinite(hourlyOverride) && hourlyOverride > 0 ? hourlyOverride : null,
    customer_hourly_rate_override:
      customerHourlyOverride != null && Number.isFinite(customerHourlyOverride) && customerHourlyOverride > 0
        ? customerHourlyOverride
        : null,
    commission_amount: Number(form.commission_amount || 0),
    commission_note: form.commission_note.trim() || null,
    work_done: form.work_done.trim(),
  };
}

function previewPartnerUrakkaAmount(form: DailyLogFormState): number | null {
  if (form.partner_urakka_manual) {
    const manual = Number(form.fixed_price_amount);
    return manual > 0 ? manual : null;
  }
  const customer = Number(form.customer_fixed_price_amount);
  if (customer > 0) {
    const margin = Number(form.partner_urakka_margin_percent) || DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
    return computePartnerUrakkaFromCustomer(customer, margin);
  }
  const legacy = Number(form.fixed_price_amount);
  return legacy > 0 ? legacy : null;
}

function applyUrakkaCustomerPrice(form: DailyLogFormState, customerValue: string): DailyLogFormState {
  const next = { ...form, customer_fixed_price_amount: customerValue };
  if (!form.partner_urakka_manual) {
    const customer = Number(customerValue);
    if (customer > 0) {
      const margin = Number(form.partner_urakka_margin_percent) || DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
      next.fixed_price_amount = String(computePartnerUrakkaFromCustomer(customer, margin));
    }
  }
  return next;
}

function applyUrakkaMargin(form: DailyLogFormState, marginValue: string): DailyLogFormState {
  const next = { ...form, partner_urakka_margin_percent: marginValue };
  if (!form.partner_urakka_manual) {
    const customer = Number(form.customer_fixed_price_amount);
    if (customer > 0) {
      const margin = Number(marginValue) || DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
      next.fixed_price_amount = String(computePartnerUrakkaFromCustomer(customer, margin));
    }
  }
  return next;
}

function DailyLogFields({
  form,
  setForm,
  expenseDrafts,
  setExpenseDrafts,
  showHourlyRate,
  showCustomerHourlyRate,
  showPartnerExpenseFields,
  showCustomerExpenseFields,
  defaultHourlyRate,
  defaultCustomerHourlyRate,
}: {
  form: DailyLogFormState;
  setForm: (next: DailyLogFormState) => void;
  expenseDrafts: ExpenseDraft[];
  setExpenseDrafts: (next: ExpenseDraft[]) => void;
  showHourlyRate?: boolean;
  showCustomerHourlyRate?: boolean;
  showPartnerExpenseFields?: boolean;
  showCustomerExpenseFields?: boolean;
  defaultHourlyRate?: number | null;
  defaultCustomerHourlyRate?: number | null;
}) {
  const { showRegular, showOvertime, showOnCall, showFixed, calendarOnlyHours } =
    hourFieldsForEntryType(form.entry_type);
  const quickHourSteps = [0.5, 1, 2, 4];
  const showPartnerPrices = !!showPartnerExpenseFields;
  const showCustomerPrices = !!showCustomerExpenseFields;
  const manualExpenseDrafts = expenseDrafts.filter((row) => !isLikelyAutoTripKmExpense(row));
  const expenseSectionTitle =
    manualExpenseDrafts.length > 0
      ? `Kulut ja tarvikkeet (${manualExpenseDrafts.length})`
      : 'Kulut ja tarvikkeet';
  const partnerUrakkaPreview = previewPartnerUrakkaAmount(form);

  return (
    <>
      <DailyLogFormSection title="Päivä ja aika" defaultOpen collapseKey="daily-log:day">
        <div className="line-form-grid">
          <label>
            Päivä
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setForm({ ...form, log_date: e.target.value })}
              required
            />
          </label>
          <label>
            Aloitusaika
            <select
              value={form.log_start_time}
              onChange={(e) => setForm({ ...form, log_start_time: e.target.value })}
            >
              {OFFICE_HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tuntien tyyppi
            <select
              value={form.entry_type}
              onChange={(e) => setForm({ ...form, entry_type: e.target.value as DailyHourEntryType })}
            >
              {(Object.entries(HOUR_ENTRY_LABELS) as [DailyHourEntryType, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </DailyLogFormSection>

      <DailyLogFormSection title="Mitä tein" defaultOpen collapseKey="daily-log:work">
        <label>
          Kuvaus
          <textarea
            value={form.work_done}
            onChange={(e) => setForm({ ...form, work_done: e.target.value })}
            rows={4}
            placeholder="Kuvaa päivän työt…"
            required
          />
        </label>
      </DailyLogFormSection>

      <DailyLogFormSection
        title="Tunnit"
        collapseKey="daily-log:hours"
        defaultOpen={!!(showHourlyRate || showCustomerHourlyRate || showFixed)}
      >
        <div className="line-form-grid">
        {showRegular && (
          <label>
            {calendarOnlyHours
              ? 'Tunnit kalenteria varten'
              : form.entry_type === 'regular'
                ? 'Asennustyötunnit'
                : 'Tunnit'}
            <input
              type="number"
              step="0.25"
              min="0"
              value={form.hours_regular}
              onChange={(e) => setForm({ ...form, hours_regular: e.target.value })}
            />
            {calendarOnlyHours && (
              <span className="muted daily-log-calendar-hours-hint">
                Ei laskuteta — käytetään vain kalenterissa ja päällekkäisyystarkistuksessa.
              </span>
            )}
            <div className="mobile-hour-quickbar" role="group" aria-label="Lisää tunteja">
              {quickHourSteps.map((step) => (
                <button
                  key={`regular-${step}`}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setForm({ ...form, hours_regular: addHourValue(form.hours_regular, step) })}
                >
                  +{step} h
                </button>
              ))}
            </div>
          </label>
        )}
        {showOvertime && (
          <label>
            Ylitötunnit
            <input
              type="number"
              step="0.25"
              min="0"
              value={form.hours_overtime}
              onChange={(e) => setForm({ ...form, hours_overtime: e.target.value })}
            />
            <div className="mobile-hour-quickbar" role="group" aria-label="Lisää ylitunteja">
              {quickHourSteps.map((step) => (
                <button
                  key={`overtime-${step}`}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setForm({ ...form, hours_overtime: addHourValue(form.hours_overtime, step) })}
                >
                  +{step} h
                </button>
              ))}
            </div>
          </label>
        )}
        {showOnCall && (
          <label>
            Päivystystunnit
            <input
              type="number"
              step="0.25"
              min="0"
              value={form.hours_on_call}
              onChange={(e) => setForm({ ...form, hours_on_call: e.target.value })}
            />
            <div className="mobile-hour-quickbar" role="group" aria-label="Lisää päivystystunteja">
              {quickHourSteps.map((step) => (
                <button
                  key={`oncall-${step}`}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setForm({ ...form, hours_on_call: addHourValue(form.hours_on_call, step) })}
                >
                  +{step} h
                </button>
              ))}
            </div>
          </label>
        )}
        {showFixed && (
          <>
            <label>
              Urakkahinta asiakkaalle (€)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.customer_fixed_price_amount}
                onChange={(e) => setForm(applyUrakkaCustomerPrice(form, e.target.value))}
                placeholder="Hinta joka laskutetaan asiakkaalta"
              />
            </label>
            {!form.partner_urakka_manual ? (
              <label>
                Provisio / kate kumppanille (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.99"
                  value={form.partner_urakka_margin_percent}
                  onChange={(e) => setForm(applyUrakkaMargin(form, e.target.value))}
                />
              </label>
            ) : (
              <label>
                Urakkahinta kumppanille (€)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.fixed_price_amount}
                  onChange={(e) => setForm({ ...form, fixed_price_amount: e.target.value })}
                  placeholder="Sovittu kumppanihinta"
                />
              </label>
            )}
          </>
        )}
        {showHourlyRate && !showFixed && (
          <label>
            € / h kumppani (valinnainen)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.hourly_rate_override}
              onChange={(e) => setForm({ ...form, hourly_rate_override: e.target.value })}
              placeholder={
                defaultHourlyRate != null && defaultHourlyRate > 0
                  ? String(defaultHourlyRate)
                  : 'Oletus kumppanuudesta'
              }
            />
          </label>
        )}
        {showCustomerHourlyRate && !showFixed && (
          <label>
            € / h asiakas (valinnainen)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.customer_hourly_rate_override}
              onChange={(e) => setForm({ ...form, customer_hourly_rate_override: e.target.value })}
              placeholder={
                defaultCustomerHourlyRate != null && defaultCustomerHourlyRate > 0
                  ? String(defaultCustomerHourlyRate)
                  : 'Oletus yrityksen asiakashinnasta'
              }
            />
          </label>
        )}
      </div>
      {showHourlyRate && !showFixed && (
        <p className="muted" style={{ margin: '0 0 .65rem' }}>
          Tyhjä = käytetään raportin kumppanuus- tai yrityshintaa. Täytä vain jos tämän päivän tuntihinta poikkeaa.
        </p>
      )}
      {showCustomerHourlyRate && !showFixed && (
        <p className="muted" style={{ margin: '0 0 .65rem' }}>
          Tyhjä = käytetään yrityksen asiakashintaa tai raporttikohtaisia hintoja. Täytä vain jos tämän päivän
          asiakastuntihinta poikkeaa.
        </p>
      )}
      {showFixed && (
        <div className="urakka-billing-split">
          <label className="compact-option">
            <input
              type="checkbox"
              checked={form.partner_urakka_manual}
              onChange={(e) =>
                setForm({
                  ...form,
                  partner_urakka_manual: e.target.checked,
                  partner_urakka_margin_percent: e.target.checked
                    ? form.partner_urakka_margin_percent
                    : String(DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT),
                })
              }
            />
            Kumppanihinta sovittu erikseen (syötä suoraan)
          </label>
          {!form.partner_urakka_manual && partnerUrakkaPreview != null ? (
            <p className="muted" style={{ margin: '0 0 .65rem' }}>
              Kumppanille laskutettava: <strong>{formatEuro(partnerUrakkaPreview)}</strong>
              {Number(form.customer_fixed_price_amount) > 0 ? (
                <>
                  {' '}
                  (asiakas {formatEuro(Number(form.customer_fixed_price_amount))} − provisio{' '}
                  {form.partner_urakka_margin_percent || DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT} %)
                </>
              ) : null}
            </p>
          ) : null}
          {form.partner_urakka_manual ? (
            <p className="muted" style={{ margin: '0 0 .65rem' }}>
              Syötä kumppanin kanssa sovittu urakkahinta yllä. Asiakashinta on erillinen kenttä.
            </p>
          ) : (
            <p className="muted" style={{ margin: '0 0 .65rem' }}>
              Täytä asiakkaan urakkahinta ja provisio-% — kumppanihinta lasketaan automaattisesti.
            </p>
          )}
        </div>
      )}
      </DailyLogFormSection>

      <DailyLogFormSection title="Provisio" collapseKey="daily-log:commission">
        <div className="line-form-grid">
          <label>
            Myyntiprovisio (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.commission_amount}
              onChange={(e) => setForm({ ...form, commission_amount: e.target.value })}
              placeholder="0"
            />
          </label>
          <label>
            Provisio selitys
            <input
              value={form.commission_note}
              onChange={(e) => setForm({ ...form, commission_note: e.target.value })}
              placeholder="Esim. lisämyynti asiakkaalle"
            />
          </label>
        </div>
      </DailyLogFormSection>

      <DailyLogFormSection title={expenseSectionTitle} collapseKey="daily-log:expenses">
        <div className="expense-section expense-section-in-dialog">
          <p className="muted expense-section-hint">
            Lisää pysäköinti, varaosat ja muut kulut. Ajomatkan km-korvaus ja laskutus valitaan yllä olevassa
            ajomatka-osiossa.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setExpenseDrafts([...expenseDrafts, emptyExpense()])}
          >
            + Lisää kulu tai tarvike
          </button>
          {manualExpenseDrafts.length === 0 ? (
            <p className="muted">
              Esim. pysäköinti, varaosat, tarvikkeet…
            </p>
          ) : (
            expenseDrafts.map((row, index) => {
              if (isLikelyAutoTripKmExpense(row)) return null;
              const autoTripKm = isAutoTripKmExpense(row);
              const partnerUnitLabel = showPartnerPrices
                ? 'Kumppanihinta (€)'
                : showCustomerPrices
                  ? 'Ostohinta (€)'
                  : 'á hinta (€)';
              const billingMode = resolveExpenseBillingMode(row);
              return (
                <DailyLogFormSection
                  key={row.key}
                  title={expenseRowSectionTitle(row, showPartnerPrices, showCustomerPrices)}
                  collapseKey={`daily-log:expense:${row.key}`}
                  className="expense-line-section"
                  defaultOpen={isNewExpenseRow(row)}
                >
                  <div className={`expense-row-fields${autoTripKm ? ' expense-row-auto' : ''}`}>
                    <label>
                      Tyyppi
                      <select
                        value={row.expense_type}
                        disabled={autoTripKm}
                        onChange={(e) =>
                          setExpenseDrafts(
                            expenseDrafts.map((r, i) =>
                              i === index ? { ...r, expense_type: e.target.value } : r,
                            ),
                          )
                        }
                      >
                        <option value="">Valitse tyyppi…</option>
                        {EXPENSE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Kuvaus
                      <input
                        value={row.description}
                        readOnly={autoTripKm}
                        disabled={autoTripKm}
                        onChange={(e) =>
                          setExpenseDrafts(
                            expenseDrafts.map((r, i) =>
                              i === index ? { ...r, description: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Esim. Varaosa X"
                      />
                    </label>
                    <label>
                      Määrä
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={row.qty}
                        readOnly={autoTripKm}
                        disabled={autoTripKm}
                        onChange={(e) =>
                          setExpenseDrafts(
                            expenseDrafts.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)),
                          )
                        }
                      />
                    </label>
                    {showPartnerPrices || showCustomerPrices ? (
                      <div className="expense-price-pair">
                        <label>
                          {partnerUnitLabel}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.unit_price}
                            readOnly={autoTripKm}
                            disabled={autoTripKm}
                            onChange={(e) =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? { ...r, unit_price: e.target.value } : r,
                                ),
                              )
                            }
                            placeholder={showPartnerPrices ? '0 = ei kumppanilaskutusta' : undefined}
                          />
                        </label>
                        {showCustomerPrices && (
                          <label>
                            Asiakashinta (€)
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.customer_unit_price}
                              readOnly={autoTripKm}
                              disabled={autoTripKm}
                              onChange={(e) =>
                                setExpenseDrafts(
                                  expenseDrafts.map((r, i) =>
                                    i === index ? { ...r, customer_unit_price: e.target.value } : r,
                                  ),
                                )
                              }
                              placeholder={row.unit_price.trim() || 'Esim. laskutushinta'}
                            />
                          </label>
                        )}
                      </div>
                    ) : (
                      <label>
                        á hinta (€)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.unit_price}
                          readOnly={autoTripKm}
                          disabled={autoTripKm}
                          onChange={(e) =>
                            setExpenseDrafts(
                              expenseDrafts.map((r, i) =>
                                i === index ? { ...r, unit_price: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                    {autoTripKm && (
                      <p className="muted expense-auto-note">Päivittyy automaattisesti ajomatkoista</p>
                    )}
                    {showPartnerPrices && showCustomerPrices && (
                      <fieldset className="expense-billing-mode-fieldset">
                        <legend>Laskutus</legend>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={billingMode === 'partner_and_customer'}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'partner_and_customer') : r,
                                ),
                              )
                            }
                          />
                          Laatija laskuttaa kumppania — asiakas laskutetaan myös
                        </label>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={billingMode === 'customer_only'}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'customer_only') : r,
                                ),
                              )
                            }
                          />
                          Ei kumppanilaskutusta — kumppani laskuttaa asiakkaalta
                        </label>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={billingMode === 'included_in_contract'}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'included_in_contract') : r,
                                ),
                              )
                            }
                          />
                          Kuulu urakkaan — ei veloiteta
                        </label>
                      </fieldset>
                    )}
                    {showPartnerPrices && !showCustomerPrices && (
                      <fieldset className="expense-billing-mode-fieldset">
                        <legend>Laskutus</legend>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={row.bill_to_partner}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'partner_and_customer') : r,
                                ),
                              )
                            }
                          />
                          Laskutetaan kumppanilta
                        </label>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={!row.bill_to_partner}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'included_in_contract') : r,
                                ),
                              )
                            }
                          />
                          Kuulu urakkaan — ei veloiteta
                        </label>
                      </fieldset>
                    )}
                    {!showPartnerPrices && showCustomerPrices && (
                      <fieldset className="expense-billing-mode-fieldset">
                        <legend>Laskutus</legend>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={row.bill_to_customer}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'partner_and_customer') : r,
                                ),
                              )
                            }
                          />
                          Laskutetaan asiakkaalta
                        </label>
                        <label className="compact-option">
                          <input
                            type="radio"
                            name={`expense_billing_${row.key}`}
                            checked={!row.bill_to_customer}
                            onChange={() =>
                              setExpenseDrafts(
                                expenseDrafts.map((r, i) =>
                                  i === index ? applyExpenseBillingMode(r, 'included_in_contract') : r,
                                ),
                              )
                            }
                          />
                          Kuulu urakkaan — ei veloiteta
                        </label>
                      </fieldset>
                    )}
                    {!autoTripKm && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpenseDrafts(expenseDrafts.filter((_, i) => i !== index))}
                      >
                        Poista rivi
                      </button>
                    )}
                  </div>
                </DailyLogFormSection>
              );
            })
          )}
        </div>
      </DailyLogFormSection>
    </>
  );
}

async function saveExpenseLines(
  dailyLogId: string,
  expenseDrafts: ExpenseDraft[],
  options: { includeCustomerFields: boolean; includePartnerFields: boolean },
) {
  await supabase.from('work_report_daily_expense_lines').delete().eq('daily_log_id', dailyLogId);
  const validExpenses = expenseDrafts.filter(
    (row) => row.description.trim() && (row.expense_type || isAutoTripKmExpense(row)),
  );
  if (validExpenses.length === 0) return null;
  const buildRows = (includeBillToPartner: boolean) =>
    validExpenses.map((row, index) => {
      const customerPriceRaw = String(row.customer_unit_price ?? '').trim();
      const customerUnitPrice = customerPriceRaw ? Number(customerPriceRaw) : null;
      return {
        daily_log_id: dailyLogId,
        expense_type: row.expense_type || 'other',
        description: row.description.trim(),
        qty: Number(row.qty || 1),
        unit_price: Number(row.unit_price || 0),
        ...(includeBillToPartner ? { bill_to_partner: row.bill_to_partner } : {}),
        bill_to_customer: row.bill_to_customer,
        ...(options.includeCustomerFields
          ? {
              customer_unit_price:
                customerUnitPrice != null && Number.isFinite(customerUnitPrice) && customerUnitPrice > 0
                  ? customerUnitPrice
                  : null,
            }
          : {}),
        sort_order: index,
      };
    });

  let { error } = await supabase.from('work_report_daily_expense_lines').insert(buildRows(true));
  if (error && isMissingBillToPartnerColumn(error)) {
    ({ error } = await supabase.from('work_report_daily_expense_lines').insert(buildRows(false)));
  }
  return error;
}

export default function WorkReportDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile(session);
  const [report, setReport] = useState<WorkReport | null>(null);
  const [billing, setBilling] = useState<WorkReportBilling | null>(null);
  const [billableCalculation, setBillableCalculation] = useState<BillableCalculation | null>(null);
  const [customerBillableCalculation, setCustomerBillableCalculation] = useState<BillableCalculation | null>(null);
  const [billingQuoteSettings, setBillingQuoteSettings] = useState<BillingQuoteSettings>(() =>
    parseBillingQuoteSettings({}),
  );
  const [billableUsers, setBillableUsers] = useState<UserBillingProfile[]>([]);
  const [useCustomRates, setUseCustomRates] = useState(false);
  const [useCustomCustomerRates, setUseCustomCustomerRates] = useState(false);
  const [reportRatesDraft, setReportRatesDraft] = useState<PartnerBillingRates>({});
  const [customerReportRatesDraft, setCustomerReportRatesDraft] = useState<PartnerBillingRates>({});
  const [partnershipRatesPreview, setPartnershipRatesPreview] = useState<PartnerBillingRates>({});
  const [companyCustomerRatesPreview, setCompanyCustomerRatesPreview] = useState<PartnerBillingRates>({});
  const [ratesBusy, setRatesBusy] = useState(false);
  const [customerRatesBusy, setCustomerRatesBusy] = useState(false);
  const [dailyLogs, setDailyLogs] = useState<WorkReportDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState<
    null | 'basics' | 'partner-billing' | 'customer-billing' | 'partner-summary'
  >(null);
  const [logDialogBusy, setLogDialogBusy] = useState(false);
  const [dailyLogNotice, setDailyLogNotice] = useState<DailyLogActionNotice | null>(null);
  const [logForm, setLogForm] = useState(initialLogForm);
  const [expenseDrafts, setExpenseDrafts] = useState<ExpenseDraft[]>([]);
  const [tripDrafts, setTripDrafts] = useState<TripLegDraft[]>([]);
  const [tripDestinationOptions, setTripDestinationOptions] = useState<TripDestinationOption[]>([]);
  const [tripDepartureLabel, setTripDepartureLabel] = useState('');
  const [tripKmRate, setTripKmRate] = useState<number | null>(null);
  const [reportTripKmRate, setReportTripKmRate] = useState<number | null>(null);
  const [tripKmCustomerRate, setTripKmCustomerRate] = useState<number | null>(null);
  const [refrigerantDrafts, setRefrigerantDrafts] = useState<RefrigerantLineDraft[]>([]);
  const [refrigerantCylinders, setRefrigerantCylinders] = useState<RefrigerantCylinder[]>([]);
  const [refrigerantCompanyUsers, setRefrigerantCompanyUsers] = useState<
    { id: string; display_name: string | null; email: string | null; company_id?: string }[]
  >([]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<WorkReportDailyLog | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingDailyLogImage[]>([]);
  const [companyUsers, setCompanyUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [customerBillingBusy, setCustomerBillingBusy] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [headingDraft, setHeadingDraft] = useState('');
  const [ordererDraft, setOrdererDraft] = useState('');
  const [descriptionBusy, setDescriptionBusy] = useState(false);
  const [reportAttachments, setReportAttachments] = useState<WorkReportAttachment[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [ownerCompanyDraft, setOwnerCompanyDraft] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerIdDraft, setCustomerIdDraft] = useState('');

  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const ownerCustomerInvoicing = useCompanyCustomerBillingEnabled(report?.owner_company_id, session);
  const viewerBillingAllowed = billingModuleEnabled !== false;
  const customerInvoicingEnabled = ownerCustomerInvoicing === true;
  const customerBillingFieldsActive = (reportRow: WorkReport | null) =>
    customerInvoicingEnabled
    || (!!reportRow && profile?.company_id === reportRow.owner_company_id && viewerBillingAllowed);

  useEffect(() => {
    if (!logDialogOpen || !editingLogId) return;
    const fresh = dailyLogs.find((log) => log.id === editingLogId);
    if (fresh) setEditingLog(fresh);
  }, [dailyLogs, editingLogId, logDialogOpen]);

  useEffect(() => {
    if (!logDialogOpen) return;
    setExpenseDrafts((current) =>
      syncTripKmExpenseDrafts(current, tripDrafts, tripKmRate, tripKmCustomerRate),
    );
  }, [logDialogOpen, tripDrafts, tripKmRate, tripKmCustomerRate]);

  useEffect(() => {
    if (id && profile?.company_id) void load(id);
  }, [id, profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadReportPartnerships(supabase, profile.company_id, 'work_reports', 'write').then(setPartnerships);
  }, [profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void loadAccessibleReportCustomers(supabase, profile.company_id, partnerships)
      .then(setCustomers)
      .catch((loadError) => {
        console.error('Asiakkaiden lataus epäonnistui:', loadError);
        setCustomers([]);
      });
  }, [profile?.company_id, partnerships]);

  useEffect(() => {
    if (!report || !isPortalReadOnly(profile)) return;
    if (!isWorkReportVisibleToPortalSubscriber(report)) {
      navigate('/tyoraportit', { replace: true });
    }
  }, [report, profile, navigate]);

  async function load(reportId: string) {
    setLoading(true);
    setError(null);
    setBillableCalculation(null);
    setCustomerBillableCalculation(null);
    setBillableUsers([]);

    const [{ data: reportData, error: reportError }, { data: billingData }, logsResult, { data: billableQuoteRow }] =
      await Promise.all([
        supabase.from('work_reports').select(REPORT_SELECT).eq('id', reportId).single(),
        supabase.from('work_report_billing').select('*').eq('work_report_id', reportId).maybeSingle(),
        fetchWorkReportDetailLogs(supabase, reportId),
        supabase
          .from('work_report_billable')
          .select('billing_quote')
          .eq('work_report_id', reportId)
          .maybeSingle(),
      ]);

    if (reportError || !reportData) {
      setError(reportError?.message ?? 'Työraporttia ei löytynyt.');
      setLoading(false);
      return;
    }

    if (logsResult.error) {
      setError(`Päiväkirjausten lataus epäonnistui: ${logsResult.error.message}`);
      setLoading(false);
      return;
    }

    const reportRow = reportData as unknown as WorkReport;
    const logs = logsResult.logs;

    setReport(reportRow);
    setBilling((billingData as WorkReportBilling | null) ?? null);
    setBillingQuoteSettings(parseBillingQuoteSettings(billableQuoteRow?.billing_quote ?? {}));
    setDailyLogs(logs);
    setDescriptionDraft(resolveWorkReportDescription(reportRow));
    setHeadingDraft(reportRow.heading?.trim() ?? '');
    setOrdererDraft(reportRow.orderer_name?.trim() ?? '');
    setOwnerCompanyDraft(reportRow.owner_company_id ?? '');
    setCustomerIdDraft(reportRow.customer_id ?? '');
    setLoading(false);

    void loadTripKmRatesForReport(reportRow).then((rates) => {
      setReportTripKmRate(rates.kmRate);
    });

    try {
      setReportAttachments(await loadWorkReportAttachments(reportId));
    } catch {
      setReportAttachments([]);
    }

    const isDelegatedOrder =
      !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
    const isPartnerReport =
      reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;

    if (isPartnerReport && canPersistPartnerBillable(reportRow, profile?.company_id)) {
      await refreshBillable(reportRow, logs);
    } else {
      setBillableCalculation(null);
      setBillableUsers([]);
    }

    const tracksCustomer = await loadCompanyTracksCustomerInvoicing(supabase, reportRow.owner_company_id);
    const viewerBillingModule = profile?.company_id
      ? await loadCompanyBillingModuleEnabled(supabase, profile.company_id)
      : false;
    const loadCustomerBillable =
      tracksCustomer
      || (profile?.company_id === reportRow.owner_company_id && viewerBillingModule !== false);
    if (loadCustomerBillable) {
      await refreshCustomerBillable(reportRow, logs);
    } else {
      setCustomerBillableCalculation(null);
    }
  }

  async function refreshBillable(
    reportRow: WorkReport,
    logs: WorkReportDailyLog[],
    rateOptions?: {
      useCustomRates?: boolean;
      reportRates?: PartnerBillingRates;
      viewerCompanyId?: string | null;
    },
  ) {
    const userIds = [...new Set(logs.map((l) => l.created_by).filter(Boolean))] as string[];
    let users: UserBillingProfile[] = [];

    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, bill_hours_enabled, bill_expenses_enabled')
        .in('id', userIds);
      users = (profileRows as UserBillingProfile[]) ?? [];
    }
    setBillableUsers(users);

    const isDelegatedOrder =
      !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
    const isPartnerReport =
      reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;
    if (!isPartnerReport) {
      setBillableCalculation(null);
      return;
    }

    const billedCompanyId = resolvePartnerBilledCompanyId(reportRow);

    const [{ data: companyRow }, { data: billableRow }] = await Promise.all([
      supabase.from('companies').select('settings').eq('id', reportRow.created_by_company_id).single(),
      supabase
        .from('work_report_billable')
        .select('billing_rates_override, use_custom_rates')
        .eq('work_report_id', reportRow.id)
        .maybeSingle(),
    ]);

    const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);

    let partnershipRates: PartnerBillingRates = {};
    let partnershipRatesFallback: PartnerBillingRates = {};
    const partnershipQuery = reportRow.partnership_id
      ? supabase
          .from('company_partnerships')
          .select('company_a_id, company_b_id, billing_rates_a_to_b, billing_rates_b_to_a')
          .eq('id', reportRow.partnership_id)
          .maybeSingle()
      : supabase
          .from('company_partnerships')
          .select('company_a_id, company_b_id, billing_rates_a_to_b, billing_rates_b_to_a')
          .eq('status', 'active')
          .or(
            `and(company_a_id.eq.${reportRow.created_by_company_id},company_b_id.eq.${billedCompanyId}),and(company_a_id.eq.${billedCompanyId},company_b_id.eq.${reportRow.created_by_company_id})`,
          )
          .maybeSingle();

    const { data: partnership } = await partnershipQuery;

    if (partnership) {
      const rates = readPartnershipBillingRates(
        partnership,
        reportRow.created_by_company_id,
        billedCompanyId,
      );
      partnershipRates = rates.primary;
      partnershipRatesFallback = rates.fallback;
    }

    const storedUseCustom = rateOptions?.useCustomRates ?? billableRow?.use_custom_rates ?? false;
    const storedOverride = parsePartnerBillingRates(
      rateOptions?.reportRates ?? billableRow?.billing_rates_override,
    );

    const { rates } = resolveBillingRates({
      companyDefaults: settings.billing?.partner_rates ?? {},
      partnershipRates,
      partnershipRatesFallback,
      reportOverride: storedOverride,
      useReportRates: storedUseCustom,
    });

    const effectivePartnershipRates = hasPartnerBillingRates(partnershipRates)
      ? partnershipRates
      : partnershipRatesFallback;

    setPartnershipRatesPreview(effectivePartnershipRates);
    setUseCustomRates(storedUseCustom);
    setReportRatesDraft(
      storedUseCustom ? storedOverride : { ...effectivePartnershipRates, ...rates },
    );

    const calculation = await refreshAndPersistPartnerBillable(
      supabase,
      reportRow,
      logs,
      rateOptions,
    );
    setBillableCalculation(calculation);

    const billingApplies = shouldCalculatePartnerBilling(logs, users);
    if (!billingApplies) return;

    const { data: billingRow } = await supabase
      .from('work_report_billing')
      .select('*')
      .eq('work_report_id', reportRow.id)
      .maybeSingle();

    if (billingRow) {
      setBilling(billingRow as WorkReportBilling);
    }
  }

  async function refreshCustomerBillable(
    reportRow: WorkReport,
    logs: WorkReportDailyLog[],
    rateOptions?: {
      useCustomRates?: boolean;
      reportRates?: PartnerBillingRates;
      billingQuote?: BillingQuoteSettings;
    },
  ) {
    const billingQuote = parseBillingQuoteSettings(rateOptions?.billingQuote ?? billingQuoteSettings);
    const useFixedQuote = customerUsesFixedQuote(billingQuote);
    const billingApplies = useFixedQuote || shouldCalculateCustomerBilling(logs);
    if (!billingApplies) {
      setCustomerBillableCalculation(null);
      await refreshAndPersistCustomerBillable(supabase, reportRow, logs, rateOptions);
      return;
    }

    const [{ data: companyRow }, { data: billingRow }] = await Promise.all([
      supabase.from('companies').select('settings').eq('id', reportRow.owner_company_id).single(),
      supabase
        .from('work_report_billing')
        .select('customer_rates_override, use_custom_customer_rates, customer_invoice_status')
        .eq('work_report_id', reportRow.id)
        .maybeSingle(),
    ]);

    const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);
    const companyDefaults = settings.billing?.customer_rates ?? {};
    setCompanyCustomerRatesPreview(companyDefaults);

    const storedUseCustom = rateOptions?.useCustomRates ?? billingRow?.use_custom_customer_rates ?? false;
    const storedOverride = parseCustomerBillingRates(
      rateOptions?.reportRates ?? billingRow?.customer_rates_override,
    );

    const { rates } = resolveCustomerBillingRates({
      companyDefaults,
      reportOverride: storedOverride,
      useReportRates: storedUseCustom,
    });

    setUseCustomCustomerRates(storedUseCustom);
    setCustomerReportRatesDraft(storedUseCustom ? storedOverride : { ...companyDefaults, ...rates });

    const calculation = await refreshAndPersistCustomerBillable(supabase, reportRow, logs, {
      ...rateOptions,
      billingQuote: rateOptions?.billingQuote ?? billingQuoteSettings,
    });
    setCustomerBillableCalculation(calculation);

    const { data: billingRowUpdated } = await supabase
      .from('work_report_billing')
      .select('*')
      .eq('work_report_id', reportRow.id)
      .maybeSingle();

    if (billingRowUpdated) {
      setBilling((prev) => ({ ...(prev ?? {}), ...(billingRowUpdated as WorkReportBilling) }));
    }
  }

  async function handleBillingQuoteSaved(settings: BillingQuoteSettings) {
    setBillingQuoteSettings(settings);
    if (!report) return;
    await refreshCustomerBillable(report, dailyLogs, { billingQuote: settings });
  }

  async function saveCustomerReportRates() {
    if (!report) return;
    setCustomerRatesBusy(true);
    setError(null);
    await refreshCustomerBillable(report, dailyLogs, {
      useCustomRates: true,
      reportRates: customerReportRatesDraft,
    });
    setCustomerRatesBusy(false);
  }

  async function onCustomCustomerRatesToggle(enabled: boolean) {
    if (!report) return;
    if (!enabled) {
      await resetCustomerReportRatesToDefault();
      return;
    }
    setUseCustomCustomerRates(true);
    setCustomerReportRatesDraft((current) =>
      Object.keys(current).length > 0 ? current : { ...companyCustomerRatesPreview },
    );
  }

  async function resetCustomerReportRatesToDefault() {
    if (!report) return;
    setCustomerRatesBusy(true);
    setError(null);
    setUseCustomCustomerRates(false);
    setCustomerReportRatesDraft(companyCustomerRatesPreview);
    await refreshCustomerBillable(report, dailyLogs, { useCustomRates: false, reportRates: {} });
    setCustomerRatesBusy(false);
  }

  async function saveReportRates() {
    if (!report) return;
    setRatesBusy(true);
    setError(null);
    await refreshBillable(report, dailyLogs, {
      useCustomRates: true,
      reportRates: reportRatesDraft,
    });
    setRatesBusy(false);
  }

  async function onCustomRatesToggle(enabled: boolean) {
    if (!report) return;
    if (!enabled) {
      await resetReportRatesToPartnership();
      return;
    }
    setUseCustomRates(true);
    setReportRatesDraft((current) =>
      Object.keys(current).length > 0 ? current : { ...partnershipRatesPreview },
    );
  }

  async function resetReportRatesToPartnership() {
    if (!report) return;
    setRatesBusy(true);
    setError(null);
    setUseCustomRates(false);
    setReportRatesDraft(partnershipRatesPreview);
    await refreshBillable(report, dailyLogs, { useCustomRates: false, reportRates: {} });
    setRatesBusy(false);
  }

  async function sharePartnerSummary(shared: boolean) {
    if (!report) return;
    const isDelegatedOrder =
      !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
    const billedCompanyId = isDelegatedOrder ? report.delegate_company_id! : report.owner_company_id;
    const { error: upsertError } = await supabase.from('work_report_billing').upsert({
      work_report_id: report.id,
      partner_summary_shared: shared,
      partner_invoice_amount: billableCalculation?.grandTotal ?? billing?.partner_invoice_amount ?? null,
      billed_to_company_id: billedCompanyId,
    });
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    await load(report.id);
  }

  useEffect(() => {
    if (report?.status === 'draft' && id) {
      if (isSubscriberPortalWorkOrder(report, session.user.id)) {
        navigate(companySubscriberOrderEditPath(id), { replace: true });
        return;
      }
      navigate(
        isInternalCompanyOrderDraft(report)
          ? `/tyoraportit/toimeksianto/${id}/muokkaa`
          : `/tyoraportit/${id}/muokkaa`,
        { replace: true },
      );
    }
  }, [
    report?.status,
    report?.assigned_user_id,
    report?.created_by_company_id,
    report?.owner_company_id,
    report?.subscriber_id,
    report?.created_by_user_id,
    id,
    navigate,
    session.user.id,
  ]);

  useEffect(() => {
    if (
      !report ||
      !canAssignDelegatedWorkOrder({
        report,
        companyId: profile?.company_id,
        role: profile?.role,
      })
    ) {
      return;
    }

    async function loadCompanyUsers() {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('company_id', profile!.company_id!)
        .neq('role', 'customer')
        .order('display_name');
      const users = (data as { id: string; display_name: string | null; email: string | null }[]) ?? [];
      setCompanyUsers(users);
      if (users[0] && !assignUserId) setAssignUserId(users[0].id);
    }

    void loadCompanyUsers();
  }, [report?.status, report?.delegate_company_id, profile?.company_id, profile?.role]);

  const totalHours = useMemo(() => sumDailyHours(dailyLogs), [dailyLogs]);
  const totalExpenses = useMemo(
    () => sumDailyExpensesWithTrips(dailyLogs, reportTripKmRate),
    [dailyLogs, reportTripKmRate],
  );
  const totalTripKm = useMemo(() => sumDailyTripKm(dailyLogs), [dailyLogs]);
  const refrigerantPartnerReminders = useMemo(
    () =>
      Array.from(
        new Set(
          dailyLogs.flatMap((log) =>
            (log.refrigerant_lines ?? [])
              .map((line) => refrigerantBillingReminder(line))
              .filter((msg): msg is string => !!msg),
          ),
        ),
      ),
    [dailyLogs],
  );

  const reportOwnerTargets = useMemo(() => {
    if (!profile?.company_id) return [];
    return customerCreateTargets(
      profile.company_id,
      profile.companies?.name ?? 'Oma rekisteri',
      partnerships,
    );
  }, [profile?.company_id, profile?.companies?.name, partnerships]);

  const customersForPicker = useMemo(() => {
    const ownerId = ownerCompanyDraft || report?.owner_company_id || profile?.company_id;
    if (!ownerId || reportOwnerTargets.length <= 1) return customers;
    return customers.filter((customer) => customer.owner_company_id === ownerId);
  }, [customers, ownerCompanyDraft, report?.owner_company_id, profile?.company_id, reportOwnerTargets.length]);

  const ownerCompanyPickerName =
    reportOwnerTargets.find((target) => target.companyId === ownerCompanyDraft)?.label
    ?? report?.branding_company?.name
    ?? profile?.companies?.name
    ?? '—';

  async function updateStatus(nextStatus: WorkStatus) {
    if (!report) return;

    const patch = buildWorkReportStatusPatch(report.status, nextStatus);
    if (!patch) return;

    const { error: updateError } = await supabase.from('work_reports').update(patch).eq('id', report.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load(report.id);
  }

  async function saveSubscriberPortalVisibility(nextVisibility: SubscriberPortalVisibility) {
    if (!report) return;
    setError(null);
    const { error: updateError } = await supabase
      .from('work_reports')
      .update({ subscriber_portal_visibility: nextVisibility })
      .eq('id', report.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReport((current) =>
      current ? { ...current, subscriber_portal_visibility: nextVisibility } : current,
    );
  }

  async function saveDescription() {
    if (!report || !profile?.company_id) return;
    setDescriptionBusy(true);
    setError(null);

    const trimmed = descriptionDraft.trim();
    const trimmedHeading = headingDraft.trim();
    const trimmedOrderer = ordererDraft.trim();
    const savedCustomerId = report.customer_id ?? '';
    const customerChanged = customerIdDraft !== savedCustomerId;
    const ownerChanged = ownerCompanyDraft !== report.owner_company_id;
    const selectedCustomer = customerIdDraft
      ? customers.find((entry) => entry.id === customerIdDraft)
      : undefined;

    if (customerIdDraft && !selectedCustomer) {
      setDescriptionBusy(false);
      setError('Valittua asiakasta ei löytynyt rekisteristä.');
      return;
    }

    if (ownerChanged) {
      const targets = customerCreateTargets(
        profile.company_id,
        profile.companies?.name ?? 'Oma rekisteri',
        partnerships,
      );
      if (!targets.some((target) => target.companyId === ownerCompanyDraft)) {
        setDescriptionBusy(false);
        setError('Sinulla ei ole oikeutta luoda raporttia valitun yrityksen nimissä.');
        return;
      }

      const ownerContext = resolveReportContextFromOwner(
        ownerCompanyDraft,
        profile.company_id,
        partnerships,
      );
      if (ownerContext.contextMode === 'partner') {
        const partnership = partnerships.find((entry) => entry.id === ownerContext.partnerId);
        if (!partnership) {
          setDescriptionBusy(false);
          setError('Kumppanuutta ei löytynyt valitulle yritykselle.');
          return;
        }
        const partnerPerms = partnershipPermsActingOnOwner(
          partnership,
          profile.company_id,
          ownerContext.ownerCompanyId,
        );
        if (!partnershipModuleAccess(partnerPerms, 'work_reports', 'write')) {
          setDescriptionBusy(false);
          setError(
            'Kumppani ei ole myöntänyt työraportin luontioikeutta. Pyydä kumppanin ylläpitäjää antamaan oikeus kohdassa Hallinta → Kumppanuudet.',
          );
          return;
        }
      }
    }

    let finalOwnerId = ownerCompanyDraft || report.owner_company_id;
    let finalPartnershipId: string | null = report.partnership_id ?? null;
    let finalCustomerId: string | null = customerIdDraft || null;
    let finalEquipmentId: string | null = report.equipment_id ?? null;

    if (selectedCustomer) {
      const customerContext = resolveReportContextFromCustomer(
        selectedCustomer,
        profile.company_id,
        partnerships,
      );
      finalOwnerId = customerContext.ownerCompanyId;
      finalPartnershipId = customerContext.partnerId || null;
      if (customerChanged) {
        finalEquipmentId = null;
      }
    } else if (ownerChanged) {
      const ownerContext = resolveReportContextFromOwner(
        ownerCompanyDraft,
        profile.company_id,
        partnerships,
      );
      finalOwnerId = ownerContext.ownerCompanyId;
      finalPartnershipId = ownerContext.partnerId || null;
      if (report.customer_id) {
        finalCustomerId = null;
        finalEquipmentId = null;
      }
    } else if (customerChanged) {
      finalCustomerId = null;
      finalEquipmentId = null;
    }

    const titleCustomerName = selectedCustomer?.name ?? (customerChanged ? null : report.customers?.name ?? null);
    const needsRegistryPatch =
      ownerChanged
      || customerChanged
      || finalOwnerId !== report.owner_company_id
      || finalCustomerId !== (report.customer_id ?? null);

    const { error: updateError } = await supabase
      .from('work_reports')
      .update({
        heading: trimmedHeading || null,
        description: trimmed || null,
        orderer_name: trimmedOrderer || null,
        title: buildWorkReportTitle(titleCustomerName, trimmedHeading || trimmed),
        ...(needsRegistryPatch
          ? {
              owner_company_id: finalOwnerId,
              branding_company_id: finalOwnerId,
              partnership_id: finalPartnershipId,
              customer_id: finalCustomerId,
              equipment_id: finalEquipmentId,
            }
          : {}),
      })
      .eq('id', report.id);

    setDescriptionBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load(report.id);
  }

  async function createCustomerAndSelect(draft: NewCustomerDraft) {
    if (!report || !profile?.company_id || !draft.name.trim()) {
      setError('Asiakkaan nimi on pakollinen.');
      return;
    }

    const targetCompanyId = ownerCompanyDraft || report.owner_company_id;
    if (!reportOwnerTargets.some((target) => target.companyId === targetCompanyId)) {
      setError('Sinulla ei ole oikeutta luoda asiakasta valittuun rekisteriin.');
      return;
    }

    setDescriptionBusy(true);
    setError(null);

    const { customer: created, error: insertError } = await createRegistryCustomer(supabase, {
      ownerCompanyId: targetCompanyId,
      name: draft.name,
      address: draft.address,
      city: draft.city,
      phone: draft.phone,
      subscriberId: report.subscriber_id ?? null,
    });

    setDescriptionBusy(false);

    if (insertError || !created) {
      setError(insertError ?? 'Asiakkaan luonti epäonnistui.');
      return;
    }

    setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'fi')));
    setCustomerIdDraft(created.id);
    setOwnerCompanyDraft(created.owner_company_id);
  }

  async function assignDelegatedWork(userId: string) {
    if (!report || !userId) return;
    setAssignBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('work_reports')
      .update({ assigned_user_id: userId, status: 'scheduled' })
      .eq('id', report.id);
    setAssignBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load(report.id);
  }

  async function acceptDelegatedWork() {
    await assignDelegatedWork(session.user.id);
  }

  async function loadRefrigerantContext(selectedCylinderIds: string[] = []) {
    if (!report?.id || !profile?.company_id) {
      setRefrigerantCylinders([]);
      setRefrigerantCompanyUsers([]);
      return;
    }

    const companyIds = [
      report.owner_company_id,
      report.created_by_company_id,
      report.delegate_company_id,
    ].filter((id): id is string => !!id);
    const uniqueCompanyIds = [...new Set(companyIds)];

    try {
      const cylinders = await loadRefrigerantCylindersForReport(
        supabase,
        report.id,
        selectedCylinderIds,
      );
      setRefrigerantCylinders(cylinders);

      const { data: userRows } = await supabase
        .from('profiles')
        .select('id, display_name, email, company_id')
        .in('company_id', uniqueCompanyIds)
        .neq('role', 'customer')
        .order('display_name');

      setRefrigerantCompanyUsers(
        (userRows as { id: string; display_name: string | null; email: string | null; company_id: string }[]) ??
          [],
      );
    } catch (err) {
      setRefrigerantCylinders([]);
      setRefrigerantCompanyUsers([]);
      setError(err instanceof Error ? err.message : 'Kylmäainevaraston lataus epäonnistui.');
    }
  }

  async function saveDailyLogTripLegs(dailyLogId: string) {
    if (!report) return null;
    try {
      await saveTripLegs(supabase, dailyLogId, tripDrafts);
      return null;
    } catch (err) {
      return err instanceof Error ? err : new Error('Ajomatkojen tallennus epäonnistui.');
    }
  }

  async function saveDailyLogRefrigerant(
    dailyLogId: string,
    previousLines?: WorkReportDailyLog['refrigerant_lines'],
  ) {
    if (!report) return null;
    const isDelegatedOrder =
      !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
    const isPartnerReport =
      report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
    const requirePrices = !isPartnerReport && profile?.company_id === report.owner_company_id;

    try {
      await saveRefrigerantLines(supabase, {
        dailyLogId,
        workReportId: report.id,
        userId: session.user.id,
        drafts: refrigerantDrafts,
        previousLines,
        requirePrices,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err : new Error('Kylmäaineen tallennus epäonnistui.');
    }
  }

  async function persistBillingAfterLogChange(reportRow: WorkReport) {
    const isDelegatedOrder =
      !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
    const isPartnerReport =
      reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;
    if (!isPartnerReport) {
      return;
    }

    await markPartnerBillableRecalcNeeded(supabase, reportRow.id);

    const { logs, error } = await fetchWorkReportDetailLogs(supabase, reportRow.id);
    if (error) {
      console.error('Päiväkirjausten lataus laskentaa varten epäonnistui:', error.message);
      return;
    }

    if (canPersistPartnerBillable(reportRow, profile?.company_id)) {
      await refreshBillable(reportRow, logs, { viewerCompanyId: profile?.company_id });
    }
  }

  async function addDailyLog(e: FormEvent) {
    e.preventDefault();
    if (!report || !logForm.work_done.trim()) {
      setDailyLogNotice(dailyLogNoticeFromWarning('Kirjaa mitä teit.', 'Puuttuu tieto'));
      return;
    }

    setDailyLogNotice(dailyLogSavingNotice(false));
    setLogDialogBusy(true);
    const payload = buildLogPayload(logForm);

    const performerId = resolveReportPerformerUserId(report) ?? session.user.id;
    const { reports, logsByReportId } = await loadPerformerCalendarContext(supabase, performerId);
    const candidate = buildLogCalendarCandidate({
      reportId: report.id,
      dayYmd: payload.log_date,
      logStartTime: payload.log_start_time,
      entryType: payload.entry_type,
      hoursRegular: payload.hours_regular,
      hoursOvertime: payload.hours_overtime,
      hoursOnCall: payload.hours_on_call,
      label: report.title,
    });
    const conflict = checkPerformerScheduleConflict({
      performerUserId: performerId,
      reports,
      logsByReportId,
      candidate,
    });
    if (conflict) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromWarning(conflict, 'Kalenteriristiriita'));
      return;
    }

    const { data: logRow, error: insertError } = await supabase
      .from('work_report_daily_logs')
      .insert({
        work_report_id: report.id,
        ...payload,
        created_by: session.user.id,
      })
      .select('id')
      .single();

    if (insertError || !logRow) {
      setLogDialogBusy(false);
      setDailyLogNotice(
        dailyLogNoticeFromError(insertError?.message ?? 'Kirjauksen tallennus epäonnistui.'),
      );
      return;
    }

    const tripError = await saveDailyLogTripLegs(logRow.id);
    if (tripError) {
      setLogDialogBusy(false);
      setDailyLogNotice({
        variant: 'warning',
        title: 'Osittain tallennettu',
        message: `Työkirjaus tallennettiin, mutta ajomatkat jäivät tallentamatta: ${tripError.message} Korjaa rivit ja tallenna uudelleen (muokkaa työkirjausta).`,
      });
      await load(report.id);
      return;
    }

    const expensesToSave = syncTripKmExpenseDrafts(
      expenseDrafts,
      tripDrafts,
      tripKmRate,
      tripKmCustomerRate,
    );
    const expenseError = await saveExpenseLines(
      logRow.id,
      expensesToSave,
      expenseSaveOptionsForReport(report, customerBillingFieldsActive(report)),
    );
    if (expenseError) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromError(expenseError.message));
      return;
    }

    const refrigerantError = await saveDailyLogRefrigerant(logRow.id);
    if (refrigerantError) {
      setLogDialogBusy(false);
      setDailyLogNotice({
        variant: 'warning',
        title: 'Osittain tallennettu',
        message: `Työkirjaus tallennettiin, mutta kylmäaine jäi tallentamatta: ${refrigerantError.message} Korjaa rivit ja tallenna uudelleen (muokkaa työkirjausta).`,
      });
      await load(report.id);
      return;
    }

    if (pendingImages.length > 0) {
      try {
        await uploadDailyLogImages(report.id, logRow.id, pendingImages, session.user.id);
      } catch (uploadErr) {
        setLogDialogBusy(false);
        setDailyLogNotice(
          dailyLogNoticeFromError(
            uploadErr instanceof Error ? uploadErr.message : 'Kuvien lataus epäonnistui.',
            'Kuvien tallennus epäonnistui',
          ),
        );
        return;
      }
    }

    const statusPatch = buildWorkReportPatchAfterDailyLogAdded(report.status);
    if (statusPatch) {
      await supabase.from('work_reports').update(statusPatch).eq('id', report.id);
    }

    closeLogDialog();
    setLogDialogBusy(false);
    setDailyLogNotice(dailyLogSavedNotice(false));
    await persistBillingAfterLogChange(report);
    await load(report.id);
  }

  async function resolveTripDepartureLabel(ownerCompanyId: string) {
    const { data: companyRow } = await supabase
      .from('companies')
      .select('name, settings')
      .eq('id', ownerCompanyId)
      .maybeSingle();
    const companySettings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);
    return resolveUserDepartureLabel({
      trip_departure_source: profile?.trip_departure_source,
      workplace_address: profile?.workplace_address,
      home_address: profile?.home_address,
      companySettings,
      companyName: (companyRow as { name: string | null } | null)?.name,
    });
  }

  async function setupTripLegsForDialog(existingLegs?: TripLegDraft[]) {
    if (!report) return;

    const [departureLabel, kmRates] = await Promise.all([
      resolveTripDepartureLabel(report.owner_company_id),
      loadTripKmRatesForReport(report),
    ]);

    setTripDepartureLabel(departureLabel);
    setTripKmRate(kmRates.kmRate);
    setTripKmCustomerRate(kmRates.customerKmRate);
    await loadTripDestinationOptionsForDialog(report);

    const departure = tripLegDeparture(departureLabel, departureLabel);
    const legs = existingLegs ?? [];
    const drafts =
      legs.length > 0
        ? normalizeTripLegDrafts(legs, departure)
        : [];
    setTripDrafts(drafts);

    if (legs.length > 0) {
      setExpenseDrafts((current) =>
        syncTripKmExpenseDrafts(current, drafts, kmRates.kmRate, kmRates.customerKmRate),
      );
    }

    return drafts;
  }

  async function loadTripKmRatesForReport(activeReport: WorkReport) {
    const [{ data: creatorRow }, { data: ownerRow }] = await Promise.all([
      supabase
        .from('companies')
        .select('settings')
        .eq('id', activeReport.created_by_company_id)
        .maybeSingle(),
      supabase
        .from('companies')
        .select('settings')
        .eq('id', activeReport.owner_company_id)
        .maybeSingle(),
    ]);
    const creatorSettings = parseCompanySettings((creatorRow as { settings: unknown } | null)?.settings);
    const ownerSettings = parseCompanySettings((ownerRow as { settings: unknown } | null)?.settings);
    return {
      kmRate: parseTripKmRate(creatorSettings),
      customerKmRate: parseTripKmCustomerRate(ownerSettings),
    };
  }

  async function loadTripDestinationOptionsForDialog(activeReport: WorkReport) {
    if (!profile?.company_id) {
      setTripDestinationOptions([]);
      return;
    }

    try {
      const options = await loadTripDestinationOptions(
        supabase,
        profile.company_id,
        activeReport.customer_id && activeReport.customers
          ? {
              id: activeReport.customer_id,
              name: activeReport.customers.name,
              address: activeReport.customers.address,
              city: activeReport.customers.city,
            }
          : null,
        {
          workplaceAddress: profile.workplace_address,
          homeAddress: profile.home_address,
        },
      );
      setTripDestinationOptions(options);
    } catch {
      setTripDestinationOptions([]);
    }
  }

  function openAddLogDialog() {
    setEditingLogId(null);
    setEditingLog(null);
    setLogForm(initialLogForm());
    setExpenseDrafts([]);
    setRefrigerantDrafts([]);
    setPendingImages([]);
    setError(null);
    setDailyLogNotice(null);
    setLogDialogOpen(true);
    void loadRefrigerantContext();
    if (report) {
      void setupTripLegsForDialog();
    } else {
      setTripDrafts([]);
      setTripDestinationOptions([]);
      setTripDepartureLabel('');
      setTripKmRate(null);
      setTripKmCustomerRate(null);
    }
  }

  function openEditLogDialog(log: WorkReportDailyLog) {
    const drafts = refrigerantLinesToDrafts(log.refrigerant_lines ?? []);
    setEditingLogId(log.id);
    setEditingLog(log);
    setLogForm(logToForm(log));
    setExpenseDrafts(expensesToDrafts(log.expense_lines));
    setRefrigerantDrafts(drafts);
    setPendingImages([]);
    setError(null);
    setDailyLogNotice(null);
    setLogDialogOpen(true);
    if (report) {
      void setupTripLegsForDialog(tripLegsToDrafts(log.trip_legs));
    } else {
      setTripDepartureLabel('');
      setTripKmRate(null);
      setTripKmCustomerRate(null);
    }
    void loadRefrigerantContext(drafts.map((d) => d.cylinder_id).filter(Boolean));
  }

  function closeLogDialog() {
    setLogDialogOpen(false);
    setLogDialogBusy(false);
    setEditingLogId(null);
    setEditingLog(null);
    setLogForm(initialLogForm());
    setExpenseDrafts([]);
    setTripDrafts([]);
    setTripDestinationOptions([]);
    setTripDepartureLabel('');
    setTripKmRate(null);
    setTripKmCustomerRate(null);
    setRefrigerantDrafts([]);
    setPendingImages([]);
    setError(null);
    setDailyLogNotice(null);
  }

  async function saveDailyLogEdit(e: FormEvent) {
    e.preventDefault();
    if (!report || !editingLogId || !logForm.work_done.trim()) {
      setDailyLogNotice(dailyLogNoticeFromWarning('Kirjaa mitä teit.', 'Puuttuu tieto'));
      return;
    }

    setDailyLogNotice(dailyLogSavingNotice(true));
    setLogDialogBusy(true);
    const payload = buildLogPayload(logForm);

    const performerId = resolveReportPerformerUserId(report) ?? session.user.id;
    const { reports, logsByReportId } = await loadPerformerCalendarContext(supabase, performerId);
    const candidate = buildLogCalendarCandidate({
      reportId: report.id,
      logId: editingLogId,
      dayYmd: payload.log_date,
      logStartTime: payload.log_start_time,
      entryType: payload.entry_type,
      hoursRegular: payload.hours_regular,
      hoursOvertime: payload.hours_overtime,
      hoursOnCall: payload.hours_on_call,
      label: report.title,
    });
    const conflict = checkPerformerScheduleConflict({
      performerUserId: performerId,
      reports,
      logsByReportId,
      candidate,
    });
    if (conflict) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromWarning(conflict, 'Kalenteriristiriita'));
      return;
    }

    const { error: updateError } = await supabase
      .from('work_report_daily_logs')
      .update(payload)
      .eq('id', editingLogId);

    if (updateError) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromError(updateError.message));
      return;
    }

    const tripError = await saveDailyLogTripLegs(editingLogId);
    if (tripError) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromError(tripError.message, 'Ajomatkojen tallennus epäonnistui'));
      return;
    }

    const expensesToSave = syncTripKmExpenseDrafts(
      expenseDrafts,
      tripDrafts,
      tripKmRate,
      tripKmCustomerRate,
    );
    const expenseError = await saveExpenseLines(
      editingLogId,
      expensesToSave,
      expenseSaveOptionsForReport(report, customerBillingFieldsActive(report)),
    );
    if (expenseError) {
      setLogDialogBusy(false);
      setDailyLogNotice(dailyLogNoticeFromError(expenseError.message));
      return;
    }

    const refrigerantError = await saveDailyLogRefrigerant(
      editingLogId,
      editingLog?.refrigerant_lines,
    );
    if (refrigerantError) {
      setLogDialogBusy(false);
      setDailyLogNotice(
        dailyLogNoticeFromError(refrigerantError.message, 'Kylmäaineen tallennus epäonnistui'),
      );
      return;
    }

    if (pendingImages.length > 0) {
      try {
        await uploadDailyLogImages(report.id, editingLogId, pendingImages, session.user.id);
      } catch (uploadErr) {
        setLogDialogBusy(false);
        setDailyLogNotice(
          dailyLogNoticeFromError(
            uploadErr instanceof Error ? uploadErr.message : 'Kuvien lataus epäonnistui.',
            'Kuvien tallennus epäonnistui',
          ),
        );
        await load(report.id);
        return;
      }
    }

    closeLogDialog();
    setLogDialogBusy(false);
    setDailyLogNotice(dailyLogSavedNotice(true));
    await persistBillingAfterLogChange(report);
    await load(report.id);
  }

  async function deleteReport() {
    if (!report) return;
    if (!window.confirm('Poistetaanko työraportti pysyvästi? Tätä toimintoa ei voi perua.')) return;

    setDeleteBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from('work_reports').delete().eq('id', report.id);
    setDeleteBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/tyoraportit');
  }

  async function deleteDailyLog(logId: string) {
    if (!report) return;
    const log = dailyLogs.find((l) => l.id === logId);
    if (log?.refrigerant_lines?.length) {
      await restoreCylinderQuantities(supabase, log.refrigerant_lines, report.id);
    }
    if (log?.images?.length) {
      await supabase.storage.from(BUCKET).remove(log.images.map((img) => img.storage_path));
    }
    await supabase.from('work_report_daily_logs').delete().eq('id', logId);
    await persistBillingAfterLogChange(report);
    await load(report.id);
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!report) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Ei löytynyt'}</p>
        <Link to="/tyoraportit">← Takaisin</Link>
      </AppLayout>
    );
  }

  const currentIndex = WORKFLOW_STATUS_ORDER.indexOf(normalizeWorkflowStatus(report.status));
  const nextStatus =
    currentIndex >= 0 && currentIndex < WORKFLOW_STATUS_ORDER.length - 1
      ? WORKFLOW_STATUS_ORDER[currentIndex + 1]
      : null;

  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  const isPartnerReport = report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
  const isCreatorCompany = profile?.company_id === report.created_by_company_id;
  const isOwnerCompany = profile?.company_id === report.owner_company_id;
  const isDelegateCompany = profile?.company_id === report.delegate_company_id;
  const canAcceptDelegated = canAcceptDelegatedWorkOrder({
    report,
    companyId: profile?.company_id,
    role: profile?.role,
  });
  const canAssignDelegate = canAssignDelegatedWorkOrder({
    report,
    companyId: profile?.company_id,
    role: profile?.role,
  });
  const hideAssigneeFromViewer = isDelegatedOrder && isCreatorCompany;
  const canManageDailyLogs = canManageWorkReportDailyLogs({
    report,
    userId: session.user.id,
    companyId: profile?.company_id,
    role: profile?.role,
  });
  const canAddDailyLogs = canManageDailyLogs;
  const canEditDailyLogs = canManageDailyLogs;
  const hasPartnerRefrigerantCompanies = [
    report.owner_company_id,
    report.created_by_company_id,
    report.delegate_company_id,
  ].some((id) => !!id && id !== profile?.company_id);
  const canEditDescription = canEditWorkReportDescription({
    report,
    userId: session.user.id,
    companyId: profile?.company_id,
    role: profile?.role,
  });
  const canEditOwnerCompany =
    canEditDescription && !isDelegatedOrder && reportOwnerTargets.length > 1;
  const canEditCustomer = canEditDescription && !isDelegatedOrder;
  const savedDescription = resolveWorkReportDescription(report);
  const savedHeading = report.heading?.trim() ?? '';
  const savedOrderer = report.orderer_name?.trim() ?? '';
  const savedOwnerCompanyId = report.owner_company_id ?? '';
  const savedCustomerId = report.customer_id ?? '';
  const headingDirty = headingDraft.trim() !== savedHeading;
  const descriptionDirty = descriptionDraft.trim() !== savedDescription.trim();
  const ordererDirty = ordererDraft.trim() !== savedOrderer;
  const ownerDirty = ownerCompanyDraft !== savedOwnerCompanyId;
  const customerDirty = customerIdDraft !== savedCustomerId;
  const basicsDirty = headingDirty || descriptionDirty || ordererDirty || ownerDirty || customerDirty;
  const canSeeCreatorBilling = isCreatorCompany && viewerBillingAllowed;
  const canSeePartnerSummary =
    !!billing?.partner_summary_shared &&
    ((isOwnerCompany && report.created_by_company_id !== report.owner_company_id) ||
      (isDelegateCompany && isDelegatedOrder));
  const billedPartnerName = isDelegatedOrder
    ? (report.delegate_company?.name ?? '—')
    : (report.owner_company?.name ?? '—');
  const showCustomerBillingFeatures =
    isOwnerCompany && (customerInvoicingEnabled || viewerBillingAllowed);
  const showOutgoingPartnerBilling =
    isPartnerReport && canSeeCreatorBilling && !!billableCalculation;
  const showIncomingPartnerBilling =
    isPartnerReport
    && isOwnerCompany
    && !isCreatorCompany
    && viewerBillingAllowed
    && !!billableCalculation;
  const showPartnerBillableSection = showOutgoingPartnerBilling || showIncomingPartnerBilling;
  const showPartnerDailyLogHourlyRate = !!showOutgoingPartnerBilling;
  const showCustomerMoney = showCustomerBillingFeatures;
  const canManageCustomerBillingRates = isOwnerCompany && showCustomerBillingFeatures;
  const showCustomerMoneyBilling =
    showCustomerBillingFeatures
    && !!customerBillableCalculation
    && (isOwnerCompany || (isPartnerReport && canSeeCreatorBilling));
  const scrollToDailyLogEntries = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('work-report-entries')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };
  const dailyLogEntryTiles = useMemo(
    () =>
      dailyLogs.flatMap((log) =>
        buildDailyLogEntryTiles(log, {
          formatDate,
          logExpensesTotal: (entry) => dailyLogExpensesTotal(entry, reportTripKmRate),
          showMoney: showPartnerBillableSection || showCustomerMoney,
        }),
      ),
    [
      dailyLogs,
      reportTripKmRate,
      showPartnerBillableSection,
      showCustomerMoney,
    ],
  );
  const portalReadOnly = isPortalReadOnly(profile);
  const canDeleteReport =
    !portalReadOnly && canDeleteWorkReport(report, session.user.id, profile?.is_global_admin, profile?.role);
  const displayPeople = resolveWorkReportDisplayPeople(report, { hideAssignee: hideAssigneeFromViewer });
  const partnerBillingListRow = report
    ? {
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
        billing: billing
          ? {
              partner_invoice_status: billing.partner_invoice_status,
              partner_invoice_amount: billing.partner_invoice_amount,
              partner_billed_amount: billing.partner_billed_amount,
              partner_billed_at: billing.partner_billed_at,
              customer_invoice_status: billing.customer_invoice_status,
              customer_invoice_amount: billing.customer_invoice_amount,
              customer_billed_at: billing.customer_billed_at,
            }
          : null,
        billable: billableCalculation
          ? { partner_total: billableCalculation.grandTotal, calculation: billableCalculation }
          : null,
      }
    : null;
  const partnerBillingState = partnerBillingListRow
    ? billingPartnerState(partnerBillingListRow, dailyLogs)
    : null;
  const canManageIncomingPartnerBillingStatus =
    !portalReadOnly
    && !!partnerBillingListRow
    && !!profile?.company_id
    && canManageIncomingPartnerBilling(partnerBillingListRow, profile.company_id, dailyLogs.length > 0);
  const showCustomerBillingStatus = showCustomerBillingFeatures;
  const canManageCustomerBilling =
    !portalReadOnly
    && showCustomerBillingStatus
    && report.status !== 'draft'
    && report.status !== 'delegated';
  const customerBilled = isCustomerInvoicePaid(billing);
  const workReportStatusDisplay = resolveWorkReportStatusDisplay({
    context: {
      status: report.status,
      owner_company_id: report.owner_company_id,
      created_by_company_id: report.created_by_company_id,
      delegate_company_id: report.delegate_company_id,
      billing: billing
        ? {
            partner_invoice_status: billing.partner_invoice_status,
            partner_billed_amount: billing.partner_billed_amount,
            partner_billed_at: billing.partner_billed_at,
          }
        : null,
      billable: billableCalculation ? { partner_total: billableCalculation.grandTotal } : null,
    },
    viewerCompanyId: profile?.company_id,
    hasDailyLogs: dailyLogs.length > 0,
    dailyLogs,
  });

  const showPartnerBillingStatusInBasics =
    !!partnerBillingListRow
    && hasPartnerBillingActivity(partnerBillingListRow, dailyLogs.length > 0)
    && (workReportStatusDisplay.viewerRole === 'incoming_partner'
      || workReportStatusDisplay.viewerRole === 'creator');

  async function markCustomerBilled() {
    if (!report) return;
    setCustomerBillingBusy(true);
    setError(null);
    try {
      await markCustomerReportBilled(supabase, report.id);
      await load(report.id);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Merkitseminen epäonnistui.');
    } finally {
      setCustomerBillingBusy(false);
    }
  }

  async function unmarkCustomerBilled() {
    if (!report) return;
    if (!window.confirm('Palautetaanko asiakaslaskutus avoimeksi?')) return;
    setCustomerBillingBusy(true);
    setError(null);
    try {
      await unmarkCustomerReportBilled(supabase, report.id);
      await load(report.id);
    } catch (unmarkError) {
      setError(unmarkError instanceof Error ? unmarkError.message : 'Peruminen epäonnistui.');
    } finally {
      setCustomerBillingBusy(false);
    }
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tyoraportit">Työraportit</Link> / Raportti
          </p>
          <h1>{report.title}</h1>
        </div>
        <div className="page-header-actions action-toolbar">
          {canDeleteReport && (
            <IconButton
              label="Poista raportti"
              variant="danger"
              disabled={deleteBusy}
              onClick={() => void deleteReport()}
            >
              <IconTrash />
            </IconButton>
          )}
          <IconButton
            label="Tulosta asiakkaalle (ei hintoja)"
            href={`/tyoraportit/${report.id}/tuloste`}
          >
            <IconPrint />
          </IconButton>
          <span className="action-toolbar-sep" aria-hidden="true" />
          <WorkReportStatusBadges
            workflowStatus={report.status}
            context={{
              status: report.status,
              owner_company_id: report.owner_company_id,
              created_by_company_id: report.created_by_company_id,
              delegate_company_id: report.delegate_company_id,
              billing: billing
                ? {
                    partner_invoice_status: billing.partner_invoice_status,
                    partner_billed_amount: billing.partner_billed_amount,
                    partner_billed_at: billing.partner_billed_at,
                    customer_invoice_status: billing.customer_invoice_status,
                  }
                : null,
              billable: billableCalculation ? { partner_total: billableCalculation.grandTotal } : null,
            }}
            viewerCompanyId={profile?.company_id}
            hasDailyLogs={dailyLogs.length > 0}
            dailyLogs={dailyLogs}
            customerBillingEnabled={customerInvoicingEnabled}
            portalView={portalReadOnly}
          />
          {canManageIncomingPartnerBillingStatus && profile?.company_id && (
            <WorkReportBillingStatusMenu
              report={report}
              viewerCompanyId={profile.company_id}
              customerBillingEnabled={customerInvoicingEnabled}
              hasDailyLogs={dailyLogs.length > 0}
              dailyLogs={dailyLogs}
              onChanged={() => void load(report.id)}
              onError={setError}
              onNotice={setBillingNotice}
            />
          )}
        </div>
      </div>

      {error && !logDialogOpen && <p className="error">{error}</p>}
      {billingNotice && !logDialogOpen && <p className="muted">{billingNotice}</p>}

      <WorkReportSectionTileGrid>
        <WorkReportSectionTile
          title="Perustiedot"
          subtitle="Asiakas, tilaaja ja kuvaus"
          color="#1976D2"
          onClick={() => setSectionDialog('basics')}
        />
        <WorkReportSectionTile
          title="Työkirjaukset"
          subtitle={`${totalHours.toFixed(2)} h · kulut ${totalExpenses.toFixed(2)} €${totalTripKm > 0 ? ` · ${totalTripKm.toFixed(1)} km` : ''} · ${dailyLogs.length} kirjausta`}
          color="#388E3C"
          onClick={scrollToDailyLogEntries}
        />
        {showPartnerBillableSection && billableCalculation ? (
          <WorkReportSectionTile
            title={showOutgoingPartnerBilling ? 'Kumppanille laskutettava' : 'Kumppanilta laskutettava'}
            subtitle={formatEuro(billableCalculation.grandTotal)}
            color="#6366f1"
            onClick={() => setSectionDialog('partner-billing')}
          />
        ) : null}
        {showCustomerMoneyBilling && customerBillableCalculation ? (
          <WorkReportSectionTile
            title="Asiakkaalta laskutettava"
            subtitle={formatEuro(customerBillableCalculation.grandTotal)}
            color="#f59e0b"
            onClick={() => setSectionDialog('customer-billing')}
          />
        ) : null}
        {canSeePartnerSummary && !showIncomingPartnerBilling ? (
          <WorkReportSectionTile
            title="Kumppanilaskutuksen yhteenveto"
            subtitle={formatEuro(Number(billing?.partner_invoice_amount ?? 0))}
            color="#475569"
            onClick={() => setSectionDialog('partner-summary')}
          />
        ) : null}
      </WorkReportSectionTileGrid>
      <div className="work-report-add-log-bar">
        {canAddDailyLogs && (
          <button
            type="button"
            className="btn btn-primary work-report-add-log-btn"
            onClick={openAddLogDialog}
          >
            + Lisää työkirjaus
          </button>
        )}
        {report.status === 'delegated' && !canAddDailyLogs && (
          <p className="muted">
            {canAcceptDelegated
              ? 'Ota toimeksianto vastaan perustiedoissa aloittaaksesi työkirjaukset.'
              : 'Odottaa toimeksisaajan vastaanottoa ennen työkirjausta.'}
          </p>
        )}
      </div>

      {dailyLogs.length === 0 ? (
        <p className="muted work-report-entries-empty">Ei työkirjauksia vielä.</p>
      ) : (
        <>
          <div id="work-report-entries" className="work-report-entries-anchor" aria-hidden="true" />
          <DailyLogEntryTileGrid>
          {dailyLogEntryTiles.map((descriptor) => {
            const log = dailyLogs.find((entry) => entry.id === descriptor.logId);
            if (!log) return null;
            return (
              <DailyLogEntryTile
                key={descriptor.key}
                descriptor={descriptor}
                onClick={() => openEditLogDialog(log)}
                onDelete={
                  canEditDailyLogs && descriptor.kind === 'work'
                    ? () => void deleteDailyLog(log.id)
                    : undefined
                }
              />
            );
          })}
          </DailyLogEntryTileGrid>
        </>
      )}

      {(showOutgoingPartnerBilling || showCustomerMoneyBilling) && report && (
        <WorkReportBillingQuotePanel
          workReportId={report.id}
          customerId={report.customer_id}
          ownerCompanyId={report.owner_company_id}
          installationCostNet={billableCalculation?.grandTotal ?? null}
          initialSettings={billingQuoteSettings}
          showPartnerMargin={!!showOutgoingPartnerBilling}
          showCustomerQuoteMode={!!showCustomerMoneyBilling && !!canManageCustomerBillingRates}
          readOnly={!showOutgoingPartnerBilling && !canManageCustomerBillingRates}
          printHref={
            showOutgoingPartnerBilling ? `/tyoraportit/${report.id}/laskutus/tuloste` : undefined
          }
          onSaved={(settings) => void handleBillingQuoteSaved(settings)}
        />
      )}


      <WorkReportSectionDialog
        open={sectionDialog === 'basics'}
        title="Perustiedot"
        onClose={() => setSectionDialog(null)}
      >
        <dl className="detail-list compact-detail-list">
          <dt>Yrityksen nimissä</dt>
          <dd>
            {canEditOwnerCompany ? (
              <div className="detail-description-edit">
                <select
                  value={ownerCompanyDraft}
                  onChange={(event) => {
                    const nextOwner = event.target.value;
                    setOwnerCompanyDraft(nextOwner);
                    if (customerIdDraft) {
                      const customer = customers.find((entry) => entry.id === customerIdDraft);
                      if (customer && customer.owner_company_id !== nextOwner) {
                        setCustomerIdDraft('');
                      }
                    }
                  }}
                  disabled={descriptionBusy}
                >
                  {reportOwnerTargets.map((target) => (
                    <option key={target.companyId} value={target.companyId}>
                      {target.label}
                    </option>
                  ))}
                </select>
                {report.customer_id && ownerDirty && (
                  <p className="muted" style={{ margin: '.35rem 0 0' }}>
                    Jos valitset toisen yrityksen kuin asiakkaan rekisteri, nykyinen asiakas poistuu
                    valinnasta. Valitse asiakas uudesta rekisteristä ennen tallennusta.
                  </p>
                )}
              </div>
            ) : (
              report.branding_company?.name ?? '—'
            )}
          </dd>
          <dt>Raportin laatija</dt>
          <dd>
            <DeletedUserLabel name={displayPeople.authorName} deleted={displayPeople.authorDeleted} />
          </dd>
          <dt>Asiakas</dt>
          <dd>
            {canEditCustomer ? (
              <div className="detail-description-edit">
                <CustomerRegistryPicker
                  customers={customersForPicker}
                  customerId={customerIdDraft}
                  myCompanyId={profile?.company_id ?? undefined}
                  disabled={descriptionBusy || !ownerCompanyDraft}
                  createRegistryName={ownerCompanyPickerName}
                  brandingName={ownerCompanyPickerName}
                  busy={descriptionBusy}
                  onSelect={(id) => {
                    setCustomerIdDraft(id);
                    const customer = customers.find((entry) => entry.id === id);
                    if (customer) setOwnerCompanyDraft(customer.owner_company_id);
                  }}
                  onClear={() => setCustomerIdDraft('')}
                  onCreate={createCustomerAndSelect}
                />
                {!customerIdDraft && ownerCompanyDraft && (
                  <p className="muted" style={{ margin: '.35rem 0 0' }}>
                    Hae asiakasta valitun yrityksen rekisteristä ({ownerCompanyPickerName}).
                  </p>
                )}
              </div>
            ) : (
              report.customers?.name ?? '—'
            )}
          </dd>
          <dt>Tilaaja</dt>
          <dd>
            {canEditDescription ? (
              <div className="detail-description-edit">
                <input
                  type="text"
                  value={ordererDraft}
                  onChange={(e) => setOrdererDraft(e.target.value)}
                  placeholder="Tilaajan nimi tai taho"
                />
              </div>
            ) : (
              savedOrderer || '—'
            )}
          </dd>
          {reportHasSubscriberLink({
            subscriber_id: report.subscriber_id,
            customer_subscriber_id: report.customers?.subscriber_id,
          }) && (
            <>
              <dt>Tilaajan näkyvyys</dt>
              <dd>
                {canEditDescription ? (
                  <SubscriberPortalVisibilityField
                    value={report.subscriber_portal_visibility ?? SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT}
                    reportKind="work"
                    disabled={descriptionBusy}
                    onChange={(value) => void saveSubscriberPortalVisibility(value)}
                  />
                ) : (
                  subscriberPortalVisibilityLabel(report.subscriber_portal_visibility)
                )}
              </dd>
            </>
          )}
          <dt>Laite</dt>
          <dd className={report.equipment ? undefined : 'muted'}>{formatWorkReportEquipment(report.equipment)}</dd>
          <dt>Otsikko</dt>
          <dd>
            {canEditDescription ? (
              <div className="detail-description-edit">
                <input
                  type="text"
                  value={headingDraft}
                  onChange={(e) => setHeadingDraft(e.target.value)}
                  placeholder="Esim. ILK 22A korjaukset"
                />
                <p className="muted" style={{ margin: '.35rem 0 0' }}>
                  Käytetään tulosteen otsikossa ja PDF-tiedoston nimessä.
                </p>
              </div>
            ) : (
              savedHeading || '—'
            )}
          </dd>
          <dt>Tehtävän kuvaus</dt>
          <dd>
            {canEditDescription ? (
              <div className="detail-description-edit">
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  rows={4}
                  placeholder="Mitä työ sisältää?"
                />
                <div className="detail-description-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={descriptionBusy || !basicsDirty}
                    onClick={() => void saveDescription()}
                  >
                    {descriptionBusy ? 'Tallennetaan…' : 'Tallenna perustiedot'}
                  </button>
                  {basicsDirty && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={descriptionBusy}
                      onClick={() => {
                        setHeadingDraft(savedHeading);
                        setDescriptionDraft(savedDescription);
                        setOrdererDraft(savedOrderer);
                        setOwnerCompanyDraft(savedOwnerCompanyId);
                        setCustomerIdDraft(savedCustomerId);
                      }}
                    >
                      Peruuta
                    </button>
                  )}
                </div>
              </div>
            ) : (
              savedDescription || '—'
            )}
          </dd>
          {(reportAttachments.length > 0 || canEditDescription) && (
            <>
              <dt>Liitteet</dt>
              <dd>
                {canEditDescription ? (
                  <WorkReportAttachmentsField
                    reportId={report.id}
                    userId={session.user.id}
                    savedAttachments={reportAttachments}
                    pendingFiles={[]}
                    onSavedAttachmentsChange={setReportAttachments}
                    onPendingFilesChange={() => {}}
                  />
                ) : (
                  <WorkReportAttachmentGallery attachments={reportAttachments} />
                )}
              </dd>
            </>
          )}
          {isDelegatedOrder && (
            <>
              <dt>Toimeksisaaja</dt>
              <dd>{report.delegate_company?.name ?? '—'}</dd>
              {report.delegated_at && (
                <>
                  <dt>Lähetetty</dt>
                  <dd>{formatDateTime(report.delegated_at)}</dd>
                </>
              )}
            </>
          )}
          {!hideAssigneeFromViewer && displayPeople.performerName && (
            <>
              <dt>Tekijä</dt>
              <dd>{displayPeople.performerName}</dd>
            </>
          )}
          <dt>Toivottu aloitus</dt>
          <dd>{formatDateTime(report.scheduled_start)}</dd>
          {showPartnerBillingStatusInBasics && (
            <>
              <dt>Kumppanilaskutus</dt>
              <dd>
                <strong>{workReportStatusDisplay.primaryLabel}</strong>
                {workReportStatusDisplay.secondaryLabel && (
                  <>
                    {' · '}
                    <strong>{workReportStatusDisplay.secondaryLabel}</strong>
                  </>
                )}
                {partnerBillingState === 'partial' && billableCalculation && billing && (() => {
                  const amounts = resolvePartnerBillingAmounts(
                    billableCalculation.grandTotal,
                    billing.partner_billed_amount,
                    billing.partner_invoice_status,
                  );
                  return amounts.total > 0.005 ? (
                    <>
                      {' · '}
                      Laskutettu {formatEuro(amounts.billed)} · Avoin {formatEuro(amounts.open)}
                    </>
                  ) : null;
                })()}
                {workReportStatusDisplay.unbilledLogDates.length > 0 && (
                  <>
                    {' · '}
                    Laskuttamattomat päivät: {formatUnbilledLogDatesLabel(workReportStatusDisplay.unbilledLogDates)}
                  </>
                )}
                {viewerBillingAllowed && (
                  <>
                    {' · '}
                    <Link to="/laskutus?mode=partner">Laskutus-moduuli</Link>
                  </>
                )}
              </dd>
            </>
          )}
          {showCustomerBillingStatus && (
            <>
              <dt>Asiakaslaskutus</dt>
              <dd>
                <strong>{customerBilled ? INVOICE_STATUS_LABELS.paid : INVOICE_STATUS_LABELS.none}</strong>
                {customerBillableCalculation && (
                  <>
                    {' · '}
                    Laskutettava {formatEuro(customerBillableCalculation.grandTotal)}
                  </>
                )}
                {' · '}
                <Link to="/laskutus?mode=customer">Laskutus-moduuli</Link>
              </dd>
            </>
          )}
        </dl>
        <div className="status-actions">
          {canAcceptDelegated && (
            <div className="assign-delegate-panel">
              <p className="muted">
                Kumppani ({report.created_by_company?.name ?? '—'}) on lähettänyt toimeksiannon. Ota se vastaan
                aloittaaksesi työkirjaukset — lähettäjä ei näe henkilöstöluetteloasi.
              </p>
              {canAssignDelegate ? (
                <div className="line-form-grid">
                  <label>
                    Tekijä
                    <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                      {companyUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name ?? u.email ?? u.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={assignBusy || !assignUserId}
                    onClick={() => void assignDelegatedWork(assignUserId)}
                  >
                    {assignBusy ? 'Tallennetaan…' : 'Määritä tekijä'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={assignBusy}
                    onClick={() => void acceptDelegatedWork()}
                  >
                    {assignBusy ? 'Tallennetaan…' : 'Ota itse vastaan'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={assignBusy}
                  onClick={() => void acceptDelegatedWork()}
                >
                  {assignBusy ? 'Tallennetaan…' : 'Ota toimeksianto vastaan'}
                </button>
              )}
            </div>
          )}
          {nextStatus && report.status !== 'delegated' && !portalReadOnly && (
            <button type="button" className="btn btn-primary" onClick={() => void updateStatus(nextStatus)}>
              Merkitse: {WORK_STATUS_LABELS[nextStatus]}
            </button>
          )}
          {canManageCustomerBilling && (
            <div className="customer-billing-actions">
              {customerBilled ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={customerBillingBusy}
                  onClick={() => void unmarkCustomerBilled()}
                >
                  {customerBillingBusy ? 'Perutaan…' : 'Peru asiakaslaskutus'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={customerBillingBusy || report.status !== 'completed'}
                  onClick={() => void markCustomerBilled()}
                >
                  {customerBillingBusy ? 'Tallennetaan…' : 'Merkitse laskutetuksi asiakkaalta'}
                </button>
              )}
              {report.status !== 'completed' && !customerBilled && (
                <p className="muted customer-billing-hint">
                  Asiakaslaskutus voidaan merkitä, kun työn tila on Valmis.
                </p>
              )}
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/tyoraportit')}>
            Takaisin listaan
          </button>
        </div>
      </WorkReportSectionDialog>

      {showPartnerBillableSection && billableCalculation ? (
        <WorkReportSectionDialog
          open={sectionDialog === 'partner-billing'}
          title={showOutgoingPartnerBilling ? 'Kumppanille laskutettava' : 'Kumppanilta laskutettava'}
          onClose={() => setSectionDialog(null)}
          wide
        >
            <div className="billing-rates-bar">
              <p className="muted" style={{ margin: 0 }}>
                {showOutgoingPartnerBilling ? 'Laskutettava' : 'Kumppanin lasku'}:{' '}
                <strong>{billedPartnerName}</strong>
                {' · '}
                <Tooltip label="Hinta haetaan automaattisesti kumppanuudesta tai yrityksen oletuksista, ellei raporttikohtaisia hintoja ole päällä.">
                  <span>
                    {BILLABLE_RATES_SOURCE_LABELS[billableCalculation.ratesSource]} · tunti{' '}
                    {formatEuro(billableCalculation.ratesUsed.hourly_regular)}
                  </span>
                </Tooltip>
              </p>
              {showOutgoingPartnerBilling ? (
              <Tooltip label="Poikkea vain tämän raportin hinnasta (esim. suullinen sopimus työmaalla). Oletuksena kumppanuushinnat.">
                <label className="compact-option">
                  <input
                    type="checkbox"
                    checked={useCustomRates}
                    disabled={ratesBusy}
                    onChange={(e) => void onCustomRatesToggle(e.target.checked)}
                  />
                  Raporttihinnat
                </label>
              </Tooltip>
              ) : (
                <span className="muted">
                  Raportin laatija: {report.created_by_company?.name ?? '—'}
                </span>
              )}
            </div>

            {showOutgoingPartnerBilling && useCustomRates && (
              <div className="billing-rates-inline">
                <PartnerBillingRatesFields
                  rates={reportRatesDraft}
                  onChange={setReportRatesDraft}
                  disabled={ratesBusy}
                />
                <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: '.65rem' }}>
                  <Tooltip label="Tallentaa hinnat tälle raportille ja laskee summan uudelleen.">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={ratesBusy}
                      onClick={() => void saveReportRates()}
                    >
                      {ratesBusy ? 'Tallennetaan…' : 'Tallenna hinnat'}
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

            {hasZeroHourlyRates(billableCalculation) && billableHoursQty(billableCalculation) > 0 && (
              <p className="error">
                Tuntihinta on 0 € — {billableHoursQty(billableCalculation).toFixed(2)} h kirjattu.
                {useCustomRates
                  ? ' Aseta hinnat yllä tai Hallinta → Yritys.'
                  : ' Tarkista kumppanuushinnat, yrityksen oletushinnat tai ota Raporttihinnat käyttöön.'}
              </p>
            )}
            {billableCalculation && billing && (() => {
              const amounts = resolvePartnerBillingAmounts(
                billableCalculation.grandTotal,
                billing.partner_billed_amount,
                billing.partner_invoice_status,
              );
              if (amounts.state === 'open' && billing.partner_invoice_status === 'none') return null;
              return (
                <p className="muted">
                  Kumppanilaskutus:{' '}
                  <strong>
                    {amounts.state === 'partial'
                      ? INVOICE_STATUS_LABELS.partial
                      : amounts.state === 'billed'
                        ? INVOICE_STATUS_LABELS.paid
                        : INVOICE_STATUS_LABELS[billing.partner_invoice_status]}
                  </strong>
                  {amounts.state === 'partial' && (
                    <>
                      {' · '}
                      Laskutettu {formatEuro(amounts.billed)} · Avoin {formatEuro(amounts.open)}
                    </>
                  )}
                  {' · '}
                  <Link to="/laskutus?mode=partner">Laskutus-moduuli</Link>
                </p>
              );
            })()}
            {showOutgoingPartnerBilling && canSeeCreatorBilling
              && billing?.partner_invoice_status
              && billing.partner_invoice_status !== 'paid'
              && billing.partner_invoice_status !== 'partial'
              && billing.partner_invoice_status !== 'none' && (
                <p className="muted">
                  Kumppanilaskutuksen tila: {INVOICE_STATUS_LABELS[billing.partner_invoice_status]}
                  {' · '}
                  <Link to="/laskutus?mode=partner">Laskutus-moduuli</Link>
                </p>
              )}
            {billableCalculation.excludedTotal > 0 && (
              <p className="muted">
                Ei laskutukseen (käyttäjän asetus pois): {formatEuro(billableCalculation.excludedTotal)}
              </p>
            )}
            {!hasBillableUserFlags(billableUsers) && (
              <p className="muted">
                Käyttäjien laskutusasetukset olivat pois — lasketaan silti päiväkirjauksista (oletus päällä).
              </p>
            )}
            <WorkReportBillingBreakdown calculation={billableCalculation} billingSide="partner" />
            {showOutgoingPartnerBilling ? (
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <Tooltip label="Sisäinen tuloste: kumppanilaskutus, asiakkaalta laskutettava ja kaikki hinnat.">
                <Link
                  to={`/tyoraportit/${report.id}/tuloste?hinnat=1`}
                  className="btn btn-secondary"
                >
                  Tulosta sisäinen (hinnat)
                </Link>
              </Tooltip>
              <Tooltip
                label={
                  billing?.partner_summary_shared
                    ? 'Piilota laskutettava summa kumppaniyritykseltä.'
                    : 'Näytä kumppanille laskutettava summa raportin yhteenvedossa.'
                }
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void sharePartnerSummary(!(billing?.partner_summary_shared ?? false))}
                >
                  {billing?.partner_summary_shared
                    ? 'Piilota yhteenveto kumppanilta'
                    : 'Näytä yhteenveto kumppanille'}
                </button>
              </Tooltip>
            </div>
            ) : (
              <p className="muted">
                Kumppanilla ei ole laskutusmoduulia käytössä — tämä yhteenveto näkyy vain sinulle.
              </p>
            )}
        </WorkReportSectionDialog>
      ) : null}

      {showCustomerMoneyBilling && customerBillableCalculation ? (
        <WorkReportSectionDialog
          open={sectionDialog === 'customer-billing'}
          title="Asiakkaalta laskutettava"
          onClose={() => setSectionDialog(null)}
          wide
        >
          <div className="billing-rates-bar">
            <p className="muted" style={{ margin: 0 }}>
              Asiakas: <strong>{report.customers?.name ?? '—'}</strong>
              {customerBillableCalculation.billingMode === 'quote_fixed' ? (
                <>
                  {' · '}
                  <strong>Kiinteä tarjoushinta</strong>
                  {customerBillableCalculation.quoteTitle
                    ? ` · ${customerBillableCalculation.quoteTitle}`
                    : ''}
                </>
              ) : (
                <>
                  {' · '}
                  <Tooltip label="Hinta haetaan raportin omistavan yrityksen asiakashinnoista, ellei raporttikohtaisia hintoja ole päällä.">
                    <span>
                      {BILLABLE_RATES_SOURCE_LABELS[customerBillableCalculation.ratesSource]} · tunti{' '}
                      {formatEuro(customerBillableCalculation.ratesUsed.hourly_regular)}
                    </span>
                  </Tooltip>
                </>
              )}
            </p>
            {canManageCustomerBillingRates && customerBillableCalculation.billingMode !== 'quote_fixed' ? (
              <Tooltip label="Poikkea vain tämän raportin asiakashinnoista.">
                <label className="compact-option">
                  <input
                    type="checkbox"
                    checked={useCustomCustomerRates}
                    disabled={customerRatesBusy}
                    onChange={(e) => void onCustomCustomerRatesToggle(e.target.checked)}
                  />
                  Raporttihinnat
                </label>
              </Tooltip>
            ) : null}
          </div>

          {!canManageCustomerBillingRates && (
            <p className="muted">
              Asiakaslaskutuksen hinnat ja merkinnät hallitsee raportin omistava yritys (
              {report.owner_company?.name ?? '—'}).
            </p>
          )}

          {canManageCustomerBillingRates
            && customerBillableCalculation.billingMode !== 'quote_fixed'
            && useCustomCustomerRates && (
            <div className="billing-rates-inline">
              <PartnerBillingRatesFields
                rates={customerReportRatesDraft}
                onChange={setCustomerReportRatesDraft}
                disabled={customerRatesBusy}
              />
              <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: '.65rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={customerRatesBusy}
                  onClick={() => void saveCustomerReportRates()}
                >
                  {customerRatesBusy ? 'Tallennetaan…' : 'Tallenna hinnat'}
                </button>
              </div>
            </div>
          )}

          {customerBillableCalculation.billingMode !== 'quote_fixed'
            && hasZeroHourlyRates(customerBillableCalculation)
            && billableHoursQty(customerBillableCalculation) > 0 && (
            <p className="error">
              Asiakkaan tuntihinta on 0 € — {billableHoursQty(customerBillableCalculation).toFixed(2)} h kirjattu.
              {useCustomCustomerRates
                ? ' Aseta hinnat yllä tai Hallinta → Yritys.'
                : ' Tarkista yrityksen asiakashinnat tai ota Raporttihinnat käyttöön.'}
            </p>
          )}

          {refrigerantPartnerReminders.length > 0 && (
            <div className="refrigerant-billing-reminders">
              {refrigerantPartnerReminders.map((message) => (
                <p key={message} className="muted">
                  {message}
                </p>
              ))}
            </div>
          )}

          <WorkReportBillingBreakdown calculation={customerBillableCalculation} billingSide="customer" />
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Tooltip label="Työraportti asiakkaalle ilman yhtään hintaa.">
              <Link to={`/tyoraportit/${report.id}/tuloste`} className="btn btn-secondary">
                Tulosta asiakkaalle
              </Link>
            </Tooltip>
            <Tooltip label="Sisäinen tuloste: kumppanilaskutus, asiakkaalta laskutettava ja kaikki hinnat.">
              <Link to={`/tyoraportit/${report.id}/tuloste?hinnat=1`} className="btn btn-secondary">
                Tulosta sisäinen (hinnat)
              </Link>
            </Tooltip>
            {canManageCustomerBillingRates && (
              <Link to="/laskutus?mode=customer" className="btn btn-secondary">
                Laskutus-moduuli
              </Link>
            )}
          </div>
        </WorkReportSectionDialog>
      ) : null}

      {canSeePartnerSummary && !showIncomingPartnerBilling ? (
        <WorkReportSectionDialog
          open={sectionDialog === 'partner-summary'}
          title="Kumppanilaskutuksen yhteenveto"
          onClose={() => setSectionDialog(null)}
        >
          <p className="muted">
            Raportin laatija ({report.created_by_company?.name ?? '—'}) on jakanut laskutettavan summan.
          </p>
          <p>
            <strong>{formatEuro(Number(billing?.partner_invoice_amount ?? 0))}</strong>
          </p>
        </WorkReportSectionDialog>
      ) : null}

      <DailyLogDialog
        open={logDialogOpen}
        title={editingLogId ? 'Muokkaa työkirjausta' : 'Lisää työkirjaus'}
        submitLabel={editingLogId ? 'Tallenna muutokset' : 'Lisää työkirjaus'}
        busy={logDialogBusy}
        onClose={closeLogDialog}
        onSubmit={(event) => void (editingLogId ? saveDailyLogEdit(event) : addDailyLog(event))}
      >
        <DailyLogTripLegFields
          drafts={tripDrafts}
          setDrafts={setTripDrafts}
          tripDeparture={tripLegDeparture(tripDepartureLabel, tripDepartureLabel)}
          showPartnerBilling={isPartnerReport || showCustomerBillingFeatures || viewerBillingAllowed}
          showCustomerBilling={showCustomerBillingFeatures || isPartnerReport || viewerBillingAllowed}
          tripBillingMode={resolveTripBillingFromExpenses(expenseDrafts)}
          onTripBillingModeChange={(mode: ExpenseBillingMode) => {
            setExpenseDrafts((current) => applyTripBillingToExpenses(current, mode));
            setTripDrafts((current) =>
              current.map((leg) => ({ ...leg, bill_to_customer: tripLegsBillToCustomer(mode) })),
            );
          }}
          destinationOptions={tripDestinationOptions}
          tripKmRate={tripKmRate}
        />
        <DailyLogFields
          form={logForm}
          setForm={(next) => setLogForm(next)}
          expenseDrafts={expenseDrafts}
          setExpenseDrafts={setExpenseDrafts}
          showHourlyRate={showPartnerDailyLogHourlyRate}
          showCustomerHourlyRate={showCustomerBillingFeatures}
          showPartnerExpenseFields={isPartnerReport}
          showCustomerExpenseFields={showCustomerBillingFeatures}
          defaultHourlyRate={
            billableCalculation?.ratesUsed.hourly_regular
            ?? partnershipRatesPreview.hourly_regular
            ?? reportRatesDraft.hourly_regular
            ?? null
          }
          defaultCustomerHourlyRate={
            customerBillableCalculation?.ratesUsed.hourly_regular
            ?? companyCustomerRatesPreview.hourly_regular
            ?? customerReportRatesDraft.hourly_regular
            ?? null
          }
        />
        <DailyLogRefrigerantFields
          drafts={refrigerantDrafts}
          setDrafts={setRefrigerantDrafts}
          cylinders={refrigerantCylinders}
          companyUsers={refrigerantCompanyUsers}
          ownCompanyId={profile?.company_id ?? null}
          hasPartnerCompanies={hasPartnerRefrigerantCompanies}
          showCustomerBillingFields={showCustomerBillingFeatures}
        />
        {report && (
          <DailyLogFormSection
            title="Kuvat"
            collapseKey="daily-log:images"
            className="daily-log-images-section"
          >
          <DailyLogImageSection
            reportId={report.id}
            dailyLogId={editingLogId}
            userId={session.user.id}
            savedImages={editingLog?.images ?? []}
            pendingImages={pendingImages}
            onPendingImagesChange={setPendingImages}
            onSavedImagesChange={() => void load(report.id)}
            onNotice={(message) => setDailyLogNotice(dailyLogNoticeFromWarning(message))}
            onUploadFailed={(message) =>
              setDailyLogNotice(dailyLogNoticeFromError(message, 'Kuvien tallennus epäonnistui'))
            }
            onUploadSuccess={(count) =>
              setDailyLogNotice({
                variant: 'success',
                title: 'Kuvat tallennettu',
                message:
                  count === 1
                    ? 'Kuva tallennettiin työkirjaukseen.'
                    : `${count} kuvaa tallennettiin työkirjaukseen.`,
              })
            }
          />
          </DailyLogFormSection>
        )}
      </DailyLogDialog>

      <ActionStatusDialog
        open={!!dailyLogNotice}
        variant={dailyLogNotice?.variant ?? 'info'}
        title={dailyLogNotice?.title}
        message={dailyLogNotice?.message ?? ''}
        busy={logDialogBusy && dailyLogNotice?.variant === 'loading'}
        onClose={() => setDailyLogNotice(null)}
      />
    </AppLayout>
  );
}
