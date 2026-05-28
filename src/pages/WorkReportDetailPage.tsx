import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import DeletedUserLabel from '../components/DeletedUserLabel';
import CollapsibleSection from '../components/CollapsibleSection';
import DailyLogDialog from '../components/DailyLogDialog';
import IconButton from '../components/IconButton';
import { IconPrint, IconTrash } from '../components/icons';
import PartnerBillingRatesFields from '../components/PartnerBillingRatesFields';
import Tooltip from '../components/Tooltip';
import WorkReportStatusBadges from '../components/WorkReportStatusBadges';
import { useCompanyCustomerBillingEnabled } from '../hooks/useCompanyCustomerBillingEnabled';
import { useCompanyBillingEnabled } from '../hooks/useCompanyBillingEnabled';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useProfile } from '../hooks/useProfile';
import { canDeleteWorkReport } from '../lib/deletePermissions';
import {
  companySubscriberOrderEditPath,
  isInternalCompanyOrderDraft,
  isPortalReadOnly,
  isSubscriberPortalWorkOrder,
  isWorkReportVisibleToPortal,
} from '../lib/portalWorkOrder';
import { canEditWorkReportDescription, canManageWorkReportDailyLogs } from '../lib/workReportDailyLogs';
import {
  canAcceptDelegatedWorkOrder,
  canAssignDelegatedWorkOrder,
} from '../lib/workReportDelegation';
import DailyLogRefrigerantFields from '../components/inventory/DailyLogRefrigerantFields';
import { AddDailyLogImages, BUCKET, DailyLogImageGallery, uploadDailyLogImages } from '../lib/dailyLogImages';
import {
  loadWorkReportAttachments,
  WorkReportAttachmentGallery,
  WorkReportAttachmentsField,
} from '../lib/workReportAttachments';
import {
  formatRefrigerantLineLabel,
  loadRefrigerantCylindersForReport,
  refrigerantBillingReminder,
  refrigerantCustomerUnitPrice,
  refrigerantLineTotal,
  refrigerantLinesToDrafts,
  restoreCylinderQuantities,
  saveRefrigerantLines,
  type RefrigerantLineDraft,
} from '../lib/refrigerantInventory';
import {
  BILLABLE_RATES_SOURCE_LABELS,
  hasPartnerBillingRates,
  parseCompanySettings,
  parseCustomerBillingRates,
  parsePartnerBillingRates,
  readPartnershipBillingRates,
  resolveBillingRates,
  resolveCustomerBillingRates,
  type PartnerBillingRates,
} from '../lib/management';
import {
  billingPartnerState,
  billingPartnerStatusLabel,
  isCustomerInvoicePaid,
  markCustomerReportBilled,
  resolvePartnerBillingAmounts,
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
  calculateWorkReportBillable,
  formatEuro,
  hasBillableUserFlags,
  hasZeroHourlyRates,
  billableHoursQty,
  shouldCalculatePartnerBilling,
  type BillableCalculation,
  type UserBillingProfile,
} from '../lib/workReportBilling';
import {
  EXPENSE_TYPE_LABELS,
  EXPENSE_TYPE_OPTIONS,
  HOUR_ENTRY_LABELS,
  INVOICE_STATUS_LABELS,
  WORKFLOW_STATUS_ORDER,
  WORK_STATUS_LABELS,
  normalizeWorkflowStatus,
  expenseLineTotal,
  formatDate,
  formatDateTime,
  formatHourEntry,
  formatWorkReportEquipment,
  buildWorkReportTitle,
  resolveWorkReportDescription,
  defaultOfficeHour,
  OFFICE_HOUR_OPTIONS,
  roundTimeToHalfHour,
  resolveWorkReportDisplayPeople,
  sumDailyExpenses,
  sumDailyHours,
  todayIsoDate,
  type DailyHourEntryType,
  type WorkReport,
  type WorkReportAttachment,
  type WorkReportBilling,
  type WorkReportDailyLog,
  type WorkStatus,
} from '../types';
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
  bill_to_customer: boolean;
  customer_unit_price: string;
};

const REPORT_SELECT = `
  id, title, heading, description, orderer_name, location_text, status,
  scheduled_start, scheduled_end, completed_at,
  owner_company_id, created_by_company_id, created_by_user_id, branding_company_id,
  partnership_id, customer_id, equipment_id, assigned_user_id,
  delegate_company_id, delegated_at, created_at, subscriber_id,
  created_by_user_name_snapshot, created_by_user_deleted,
  assigned_user_name_snapshot, assigned_user_deleted,
  customers(name),
  equipment(name, tag),
  owner_company:companies!work_reports_owner_company_id_fkey(name),
  branding_company:companies!work_reports_branding_company_id_fkey(name),
  created_by_company:companies!work_reports_created_by_company_id_fkey(name),
  delegate_company:companies!work_reports_delegate_company_id_fkey(name),
  assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name),
  created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name, email)
`;

const LOG_SELECT = `
  id, work_report_id, log_date, log_start_time, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount, hourly_rate_override,
  customer_hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  author:profiles!work_report_daily_logs_created_by_fkey(display_name),
  expense_lines:work_report_daily_expense_lines(id, daily_log_id, expense_type, description, qty, unit_price, bill_to_customer, customer_unit_price, sort_order),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer,
    refrigerant_type, qty_kg, notes, cylinder_disposition, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type, bottle_size, notes),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type)
`;

function emptyExpense(): ExpenseDraft {
  return {
    key: crypto.randomUUID(),
    expense_type: 'parking',
    description: '',
    qty: '1',
    unit_price: '',
    bill_to_customer: true,
    customer_unit_price: '',
  };
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
    showRegular: ['regular', 'regular_and_overtime'].includes(entryType),
    showOvertime: ['overtime', 'regular_and_overtime'].includes(entryType),
    showOnCall: entryType === 'on_call',
    showFixed: entryType === 'fixed_price',
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
    bill_to_customer: line.bill_to_customer !== false,
    customer_unit_price:
      line.customer_unit_price != null && Number(line.customer_unit_price) > 0
        ? String(line.customer_unit_price)
        : '',
  }));
}

function buildLogPayload(form: DailyLogFormState) {
  const { showRegular, showOvertime, showOnCall, showFixed } = hourFieldsForEntryType(form.entry_type);
  const hourlyOverrideRaw = String(form.hourly_rate_override ?? '').trim();
  const hourlyOverride = !showFixed && hourlyOverrideRaw ? Number(hourlyOverrideRaw) : null;
  const customerHourlyRaw = String(form.customer_hourly_rate_override ?? '').trim();
  const customerHourlyOverride = !showFixed && customerHourlyRaw ? Number(customerHourlyRaw) : null;
  return {
    log_date: form.log_date,
    log_start_time: roundTimeToHalfHour(form.log_start_time),
    entry_type: form.entry_type,
    hours_regular: showRegular ? Number(form.hours_regular || 0) : 0,
    hours_overtime: showOvertime ? Number(form.hours_overtime || 0) : 0,
    hours_on_call: showOnCall ? Number(form.hours_on_call || 0) : 0,
    fixed_price_amount: showFixed ? Number(form.fixed_price_amount || 0) : null,
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

function DailyLogFields({
  form,
  setForm,
  expenseDrafts,
  setExpenseDrafts,
  showHourlyRate,
  showCustomerHourlyRate,
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
  showCustomerExpenseFields?: boolean;
  defaultHourlyRate?: number | null;
  defaultCustomerHourlyRate?: number | null;
}) {
  const { showRegular, showOvertime, showOnCall, showFixed } = hourFieldsForEntryType(form.entry_type);
  const quickHourSteps = [0.5, 1, 2, 4];

  return (
    <>
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
      </div>

      <div className="line-form-grid">
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

      <div className="line-form-grid">
        {showRegular && (
          <label>
            {form.entry_type === 'regular' ? 'Asennustyötunnit' : 'Tunnit'}
            <input
              type="number"
              step="0.25"
              min="0"
              value={form.hours_regular}
              onChange={(e) => setForm({ ...form, hours_regular: e.target.value })}
            />
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
          <label>
            Urakkahinta (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.fixed_price_amount}
              onChange={(e) => setForm({ ...form, fixed_price_amount: e.target.value })}
            />
          </label>
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

      <label>
        Mitä tein
        <textarea
          value={form.work_done}
          onChange={(e) => setForm({ ...form, work_done: e.target.value })}
          rows={4}
          placeholder="Kuvaa päivän työt…"
          required
        />
      </label>

      <div className="expense-section">
        <div className="section-head">
          <h3>Kulut ja tarvikkeet</h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setExpenseDrafts([...expenseDrafts, emptyExpense()])}
          >
            + Lisää rivi
          </button>
        </div>
        {expenseDrafts.length === 0 ? (
          <p className="muted">Esim. pysäköinti, km-korvaus, varaosat…</p>
        ) : (
          expenseDrafts.map((row, index) => (
            <div key={row.key} className="expense-row">
              <label>
                Tyyppi
                <select
                  value={row.expense_type}
                  onChange={(e) =>
                    setExpenseDrafts(
                      expenseDrafts.map((r, i) =>
                        i === index ? { ...r, expense_type: e.target.value } : r,
                      ),
                    )
                  }
                >
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
                  onChange={(e) =>
                    setExpenseDrafts(
                      expenseDrafts.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label>
                {showCustomerExpenseFields ? 'Ostohinta (€)' : 'á hinta (€)'}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  onChange={(e) =>
                    setExpenseDrafts(
                      expenseDrafts.map((r, i) =>
                        i === index ? { ...r, unit_price: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              {showCustomerExpenseFields && (
                <>
                  <label>
                    Asiakashinta (€)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.customer_unit_price}
                      onChange={(e) =>
                        setExpenseDrafts(
                          expenseDrafts.map((r, i) =>
                            i === index ? { ...r, customer_unit_price: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder={row.unit_price.trim() || 'Sama kuin ostohinta'}
                    />
                  </label>
                  <label className="compact-option">
                    <input
                      type="checkbox"
                      checked={row.bill_to_customer}
                      onChange={(e) =>
                        setExpenseDrafts(
                          expenseDrafts.map((r, i) =>
                            i === index ? { ...r, bill_to_customer: e.target.checked } : r,
                          ),
                        )
                      }
                    />
                    Laskutetaan asiakkaalta
                  </label>
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExpenseDrafts(expenseDrafts.filter((_, i) => i !== index))}
              >
                Poista rivi
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

async function saveExpenseLines(
  dailyLogId: string,
  expenseDrafts: ExpenseDraft[],
  includeCustomerFields: boolean,
) {
  await supabase.from('work_report_daily_expense_lines').delete().eq('daily_log_id', dailyLogId);
  const validExpenses = expenseDrafts.filter((row) => row.description.trim());
  if (validExpenses.length === 0) return null;
  const { error } = await supabase.from('work_report_daily_expense_lines').insert(
    validExpenses.map((row, index) => {
      const customerPriceRaw = String(row.customer_unit_price ?? '').trim();
      const customerUnitPrice = customerPriceRaw ? Number(customerPriceRaw) : null;
      return {
        daily_log_id: dailyLogId,
        expense_type: row.expense_type,
        description: row.description.trim(),
        qty: Number(row.qty || 1),
        unit_price: Number(row.unit_price || 0),
        ...(includeCustomerFields
          ? {
              bill_to_customer: row.bill_to_customer,
              customer_unit_price:
                customerUnitPrice != null && Number.isFinite(customerUnitPrice) && customerUnitPrice > 0
                  ? customerUnitPrice
                  : null,
            }
          : {}),
        sort_order: index,
      };
    }),
  );
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
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logDialogBusy, setLogDialogBusy] = useState(false);
  const [logForm, setLogForm] = useState(initialLogForm);
  const [expenseDrafts, setExpenseDrafts] = useState<ExpenseDraft[]>([]);
  const [refrigerantDrafts, setRefrigerantDrafts] = useState<RefrigerantLineDraft[]>([]);
  const [refrigerantCylinders, setRefrigerantCylinders] = useState<RefrigerantCylinder[]>([]);
  const [refrigerantCompanyUsers, setRefrigerantCompanyUsers] = useState<
    { id: string; display_name: string | null; email: string | null; company_id?: string }[]
  >([]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<WorkReportDailyLog | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
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

  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const creatorPartnerBilling = useCompanyBillingEnabled(report?.created_by_company_id, session);
  const ownerCustomerInvoicing = useCompanyCustomerBillingEnabled(report?.owner_company_id, session);
  const partnerBillingEnabled = billingModuleEnabled !== false && creatorPartnerBilling;
  const customerInvoicingEnabled = billingModuleEnabled !== false && ownerCustomerInvoicing;

  useEffect(() => {
    const urls = pendingImages.map((file) => URL.createObjectURL(file));
    setImagePreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingImages]);

  useEffect(() => {
    if (id && profile?.company_id) void load(id);
  }, [id, profile?.company_id]);

  useEffect(() => {
    if (!report || !isPortalReadOnly(profile)) return;
    if (!isWorkReportVisibleToPortal(report.status)) {
      navigate('/tyoraportit', { replace: true });
    }
  }, [report, profile, navigate]);

  async function load(reportId: string) {
    setLoading(true);
    setError(null);
    setBillableCalculation(null);
    setCustomerBillableCalculation(null);
    setBillableUsers([]);

    const [{ data: reportData, error: reportError }, { data: billingData }, { data: logsData }] =
      await Promise.all([
        supabase.from('work_reports').select(REPORT_SELECT).eq('id', reportId).single(),
        supabase.from('work_report_billing').select('*').eq('work_report_id', reportId).maybeSingle(),
        supabase
          .from('work_report_daily_logs')
          .select(LOG_SELECT)
          .eq('work_report_id', reportId)
          .order('log_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

    if (reportError || !reportData) {
      setError(reportError?.message ?? 'Työraporttia ei löytynyt.');
      setLoading(false);
      return;
    }

    const reportRow = reportData as unknown as WorkReport;
    const logs = (logsData as unknown as WorkReportDailyLog[]) ?? [];

    setReport(reportRow);
    setBilling((billingData as WorkReportBilling | null) ?? null);
    setDailyLogs(logs);
    setDescriptionDraft(resolveWorkReportDescription(reportRow));
    setHeadingDraft(reportRow.heading?.trim() ?? '');
    setOrdererDraft(reportRow.orderer_name?.trim() ?? '');
    setLoading(false);

    try {
      setReportAttachments(await loadWorkReportAttachments(reportId));
    } catch {
      setReportAttachments([]);
    }

    const isDelegatedOrder =
      !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
    const isPartnerReport =
      reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;

    if (isPartnerReport && profile?.company_id === reportRow.created_by_company_id) {
      await refreshBillable(reportRow, logs);
    } else if (!isPartnerReport && profile?.company_id === reportRow.owner_company_id) {
      await refreshCustomerBillable(reportRow, logs);
    } else {
      setBillableCalculation(null);
      setCustomerBillableCalculation(null);
      setBillableUsers([]);
    }
  }

  async function refreshBillable(
    reportRow: WorkReport,
    logs: WorkReportDailyLog[],
    rateOptions?: { useCustomRates?: boolean; reportRates?: PartnerBillingRates },
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

    const billingApplies = shouldCalculatePartnerBilling(logs, users);
    if (!billingApplies) {
      setBillableCalculation(null);
      return;
    }

    const [{ data: companyRow }, { data: billableRow }] = await Promise.all([
      supabase.from('companies').select('settings').eq('id', reportRow.created_by_company_id).single(),
      supabase
        .from('work_report_billable')
        .select('billing_rates_override, use_custom_rates')
        .eq('work_report_id', reportRow.id)
        .maybeSingle(),
    ]);

    const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);
    const isDelegatedOrder =
      !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
    const isPartnerReport =
      reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;
    const billedCompanyId = isDelegatedOrder
      ? reportRow.delegate_company_id!
      : reportRow.owner_company_id;

    let partnershipRates: PartnerBillingRates = {};
    let partnershipRatesFallback: PartnerBillingRates = {};
    if (isPartnerReport) {
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
    }

    const storedUseCustom = rateOptions?.useCustomRates ?? billableRow?.use_custom_rates ?? false;
    const storedOverride = parsePartnerBillingRates(
      rateOptions?.reportRates ?? billableRow?.billing_rates_override,
    );

    const { rates, source } = resolveBillingRates({
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

    const calculation = calculateWorkReportBillable({
      logs,
      users,
      rates,
      ratesSource: source,
      billToCompanyId: isPartnerReport ? billedCompanyId : null,
      billToCompanyName: isPartnerReport
        ? isDelegatedOrder
          ? (reportRow.delegate_company?.name ?? null)
          : (reportRow.owner_company?.name ?? null)
        : null,
    });

    setBillableCalculation(calculation);

    await supabase.from('work_report_billable').upsert({
      work_report_id: reportRow.id,
      partner_total: calculation.grandTotal,
      calculation,
      calculated_at: new Date().toISOString(),
      use_custom_rates: storedUseCustom,
      billing_rates_override: storedUseCustom ? storedOverride : null,
    });

    if (isPartnerReport) {
      const { data: existingBilling } = await supabase
        .from('work_report_billing')
        .select('partner_billed_amount, partner_invoice_status')
        .eq('work_report_id', reportRow.id)
        .maybeSingle();

      const billedAmount = Number(existingBilling?.partner_billed_amount ?? 0);
      const grandTotal = calculation.grandTotal;
      let invoiceStatus = (existingBilling?.partner_invoice_status ?? 'none') as WorkReportBilling['partner_invoice_status'];

      if (billedAmount > 0.005) {
        invoiceStatus = grandTotal > billedAmount + 0.005 ? 'partial' : 'paid';
      } else if (invoiceStatus === 'paid' || invoiceStatus === 'partial') {
        invoiceStatus = 'none';
      }

      const { data: billingRow } = await supabase
        .from('work_report_billing')
        .upsert({
          work_report_id: reportRow.id,
          partner_invoice_amount: grandTotal,
          billed_to_company_id: billedCompanyId,
          partner_invoice_status: invoiceStatus,
          ...(billedAmount > 0.005 ? { partner_billed_amount: billedAmount } : {}),
        })
        .select('*')
        .single();

      if (billingRow) {
        setBilling(billingRow as WorkReportBilling);
      }
    }
  }

  async function refreshCustomerBillable(
    reportRow: WorkReport,
    logs: WorkReportDailyLog[],
    rateOptions?: { useCustomRates?: boolean; reportRates?: PartnerBillingRates },
  ) {
    const billingApplies = shouldCalculateCustomerBilling(logs);
    if (!billingApplies) {
      setCustomerBillableCalculation(null);
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

    const calculation = await refreshAndPersistCustomerBillable(supabase, reportRow, logs, rateOptions);
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
  const totalExpenses = useMemo(() => sumDailyExpenses(dailyLogs), [dailyLogs]);
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

  async function updateStatus(nextStatus: WorkStatus) {
    if (!report) return;
    if (nextStatus === 'billed_partner' || nextStatus === 'billed_customer') return;

    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'completed') patch.completed_at = new Date().toISOString();

    const { error: updateError } = await supabase.from('work_reports').update(patch).eq('id', report.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load(report.id);
  }

  async function saveDescription() {
    if (!report) return;
    setDescriptionBusy(true);
    setError(null);

    const trimmed = descriptionDraft.trim();
    const trimmedHeading = headingDraft.trim();
    const trimmedOrderer = ordererDraft.trim();
    const { error: updateError } = await supabase
      .from('work_reports')
      .update({
        heading: trimmedHeading || null,
        description: trimmed || null,
        orderer_name: trimmedOrderer || null,
        title: buildWorkReportTitle(report.customers?.name, trimmedHeading || trimmed),
      })
      .eq('id', report.id);

    setDescriptionBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load(report.id);
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

  async function addDailyLog(e: FormEvent) {
    e.preventDefault();
    if (!report || !logForm.work_done.trim()) {
      setError('Kirjaa mitä teit.');
      return;
    }

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
      setError(conflict);
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
      setError(insertError?.message ?? 'Kirjauksen tallennus epäonnistui.');
      return;
    }

    const expenseError = await saveExpenseLines(
      logRow.id,
      expenseDrafts,
      report.created_by_company_id === report.owner_company_id &&
        !(!!report.delegate_company_id && report.created_by_company_id === report.owner_company_id),
    );
    if (expenseError) {
      setLogDialogBusy(false);
      setError(expenseError.message);
      return;
    }

    const refrigerantError = await saveDailyLogRefrigerant(logRow.id);
    if (refrigerantError) {
      setLogDialogBusy(false);
      setError(refrigerantError.message);
      return;
    }

    if (pendingImages.length > 0) {
      try {
        await uploadDailyLogImages(report.id, logRow.id, pendingImages, session.user.id);
      } catch (uploadErr) {
        setLogDialogBusy(false);
        setError(uploadErr instanceof Error ? uploadErr.message : 'Kuvien lataus epäonnistui.');
        return;
      }
    }

    if (report.status === 'scheduled') {
      await supabase.from('work_reports').update({ status: 'in_progress' }).eq('id', report.id);
    }

    closeLogDialog();
    setError(null);
    setLogDialogBusy(false);
    await load(report.id);
  }

  function openAddLogDialog() {
    setEditingLogId(null);
    setEditingLog(null);
    setLogForm(initialLogForm());
    setExpenseDrafts([]);
    setRefrigerantDrafts([]);
    setPendingImages([]);
    setError(null);
    setLogDialogOpen(true);
    void loadRefrigerantContext();
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
    setLogDialogOpen(true);
    void loadRefrigerantContext(drafts.map((d) => d.cylinder_id).filter(Boolean));
  }

  function closeLogDialog() {
    setLogDialogOpen(false);
    setLogDialogBusy(false);
    setEditingLogId(null);
    setEditingLog(null);
    setLogForm(initialLogForm());
    setExpenseDrafts([]);
    setRefrigerantDrafts([]);
    setPendingImages([]);
    setError(null);
  }

  async function saveDailyLogEdit(e: FormEvent) {
    e.preventDefault();
    if (!report || !editingLogId || !logForm.work_done.trim()) {
      setError('Kirjaa mitä teit.');
      return;
    }

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
      setError(conflict);
      return;
    }

    const { error: updateError } = await supabase
      .from('work_report_daily_logs')
      .update(payload)
      .eq('id', editingLogId);

    if (updateError) {
      setLogDialogBusy(false);
      setError(updateError.message);
      return;
    }

    const expenseError = await saveExpenseLines(
      editingLogId,
      expenseDrafts,
      report.created_by_company_id === report.owner_company_id &&
        !(!!report.delegate_company_id && report.created_by_company_id === report.owner_company_id),
    );
    if (expenseError) {
      setLogDialogBusy(false);
      setError(expenseError.message);
      return;
    }

    const refrigerantError = await saveDailyLogRefrigerant(
      editingLogId,
      editingLog?.refrigerant_lines,
    );
    if (refrigerantError) {
      setLogDialogBusy(false);
      setError(refrigerantError.message);
      return;
    }

    closeLogDialog();
    setError(null);
    setLogDialogBusy(false);
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
  const savedDescription = resolveWorkReportDescription(report);
  const savedHeading = report.heading?.trim() ?? '';
  const savedOrderer = report.orderer_name?.trim() ?? '';
  const headingDirty = headingDraft.trim() !== savedHeading;
  const descriptionDirty = descriptionDraft.trim() !== savedDescription.trim();
  const ordererDirty = ordererDraft.trim() !== savedOrderer;
  const basicsDirty = headingDirty || descriptionDirty || ordererDirty;
  const canSeeCreatorBilling = isCreatorCompany;
  const canSeePartnerSummary =
    !!billing?.partner_summary_shared &&
    ((isOwnerCompany && report.created_by_company_id !== report.owner_company_id) ||
      (isDelegateCompany && isDelegatedOrder));
  const canManageBilling = canSeeCreatorBilling || canSeePartnerSummary;
  const billedPartnerName = isDelegatedOrder
    ? (report.delegate_company?.name ?? '—')
    : (report.owner_company?.name ?? '—');
  const showMoneyBilling =
    isPartnerReport && canSeeCreatorBilling && !!billableCalculation;
  const showCustomerMoney =
    !isPartnerReport && isOwnerCompany;
  const showCustomerMoneyBilling =
    showCustomerMoney && !!customerBillableCalculation;
  const portalReadOnly = isPortalReadOnly(profile);
  const canDeleteReport =
    !portalReadOnly && canDeleteWorkReport(report, session.user.id, profile?.is_global_admin, profile?.role);
  const displayPeople = resolveWorkReportDisplayPeople(report, { hideAssignee: hideAssigneeFromViewer });
  const partnerBillingListRow = report && billing
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
        billing: {
          partner_invoice_status: billing.partner_invoice_status,
          partner_invoice_amount: billing.partner_invoice_amount,
          partner_billed_amount: billing.partner_billed_amount,
          customer_invoice_status: billing.customer_invoice_status,
          customer_invoice_amount: billing.customer_invoice_amount,
          customer_billed_at: billing.customer_billed_at,
        },
        billable: billableCalculation
          ? { partner_total: billableCalculation.grandTotal, calculation: billableCalculation }
          : null,
      }
    : null;
  const partnerBillingState = partnerBillingListRow ? billingPartnerState(partnerBillingListRow) : null;
  const showPartnerBillingStatus =
    !!isPartnerReport && partnerBillingEnabled === true && !!canSeeCreatorBilling;
  const showCustomerBillingStatus =
    customerInvoicingEnabled === true && isOwnerCompany;
  const canManageCustomerBilling =
    !portalReadOnly
    && showCustomerBillingStatus
    && report.status !== 'draft'
    && report.status !== 'delegated';
  const customerBilled = isCustomerInvoicePaid(billing);

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
          <IconButton label="Tulosta raportti" href={`/tyoraportit/${report.id}/tuloste`}>
            <IconPrint />
          </IconButton>
          <span className="action-toolbar-sep" aria-hidden="true" />
          <WorkReportStatusBadges
            workflowStatus={report.status}
            showPartnerBilling={showPartnerBillingStatus}
            partnerBillingState={partnerBillingState}
            showCustomerBilling={showCustomerBillingStatus}
            customerBilled={customerBilled}
          />
        </div>
      </div>

      {error && !logDialogOpen && <p className="error">{error}</p>}

      <CollapsibleSection title="Perustiedot" defaultOpen variant="plain" className="panel work-report-section">
        <dl className="detail-list compact-detail-list">
          <dt>Yrityksen nimissä</dt>
          <dd>{report.branding_company?.name ?? '—'}</dd>
          <dt>Raportin laatija</dt>
          <dd>
            <DeletedUserLabel name={displayPeople.authorName} deleted={displayPeople.authorDeleted} />
          </dd>
          <dt>Asiakas</dt>
          <dd>{report.customers?.name ?? '—'}</dd>
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
          {showPartnerBillingStatus && (
            <>
              <dt>Kumppanilaskutus</dt>
              <dd>
                <strong>{billingPartnerStatusLabel(partnerBillingState ?? 'open')}</strong>
                {partnerBillingState === 'partial' && billableCalculation && billing && (() => {
                  const amounts = resolvePartnerBillingAmounts(
                    billableCalculation.grandTotal,
                    billing.partner_billed_amount,
                    billing.partner_invoice_status,
                  );
                  return (
                    <>
                      {' · '}
                      Laskutettu {formatEuro(amounts.billed)} · Avoin {formatEuro(amounts.open)}
                    </>
                  );
                })()}
                {' · '}
                <Link to="/laskutus?mode=partner">Laskutus-moduuli</Link>
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
      </CollapsibleSection>

      <CollapsibleSection
        title={`Työkirjaukset · ${totalHours.toFixed(2)} h · kulut ${totalExpenses.toFixed(2)} €`}
        defaultOpen
        variant="plain"
        className="panel work-report-section"
      >
        <div className="section-head compact-section-head">
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
          <p className="muted">Ei työkirjauksia vielä.</p>
        ) : (
          <ul className="daily-log-list compact-daily-log-list">
            {dailyLogs.map((log) => {
              const expenseLines = log.expense_lines ?? [];
              const refrigerantLines = log.refrigerant_lines ?? [];
              return (
                <li key={log.id}>
                  <div className="daily-log-head">
                    <div className="daily-log-head-meta">
                      <strong>{formatDate(log.log_date)}</strong>
                      <span>{HOUR_ENTRY_LABELS[log.entry_type]}</span>
                      <span>{formatHourEntry(log, { showMoney: showMoneyBilling || showCustomerMoney })}</span>
                      {expenseLines.length > 0 && (
                        <span>
                          Kulut {expenseLines.reduce((s, line) => s + expenseLineTotal(line), 0).toFixed(2)} €
                        </span>
                      )}
                      {refrigerantLines.length > 0 && (
                        <span>
                          Kylmäaine{' '}
                          {refrigerantLines
                            .reduce((s, line) => s + Number(line.qty_kg), 0)
                            .toFixed(3)}{' '}
                          kg
                        </span>
                      )}
                    </div>
                    {canEditDailyLogs && (
                      <div className="daily-log-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditLogDialog(log)}
                        >
                          Muokkaa
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void deleteDailyLog(log.id)}
                        >
                          Poista
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="daily-log-summary">{log.work_done}</p>
                  {(log.expense_lines ?? []).length > 0 && (
                    <ul className="expense-line-list compact-expense-line-list">
                      {(log.expense_lines ?? []).map((line) => {
                        const billedToCustomer = line.bill_to_customer !== false;
                        const customerUnit =
                          line.customer_unit_price != null && Number(line.customer_unit_price) > 0
                            ? Number(line.customer_unit_price)
                            : Number(line.unit_price);
                        const customerTotal = expenseLineTotal({
                          ...line,
                          unit_price: customerUnit,
                        });
                        return (
                          <li key={line.id}>
                            {EXPENSE_TYPE_LABELS[line.expense_type] ?? line.expense_type}: {line.description}{' '}
                            {showCustomerMoney ? (
                              billedToCustomer ? (
                                <>
                                  (asiakas {Number(line.qty)} × {customerUnit.toFixed(2)} € ={' '}
                                  {customerTotal.toFixed(2)} €)
                                </>
                              ) : (
                                <span className="muted">(ei laskuteta asiakkaalta)</span>
                              )
                            ) : (
                              <>
                                ({Number(line.qty)} × {Number(line.unit_price).toFixed(2)} € ={' '}
                                {expenseLineTotal(line).toFixed(2)} €)
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {refrigerantLines.length > 0 && (
                    <ul className="expense-line-list compact-expense-line-list">
                      {refrigerantLines.map((line) => {
                        const reminder = refrigerantBillingReminder(line);
                        return (
                          <li key={line.id}>
                            {formatRefrigerantLineLabel(line)}
                            {line.bill_to_customer && showCustomerMoney ? (
                              <>
                                {' '}
                                (asiakas {Number(line.qty_kg).toFixed(3)} kg ×{' '}
                                {refrigerantCustomerUnitPrice(line).toFixed(2)} €/kg ={' '}
                                {refrigerantLineTotal(line).toFixed(2)} €)
                              </>
                            ) : null}
                            {reminder ? <span className="muted"> · {reminder}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {(log.images ?? []).length > 0 && <DailyLogImageGallery images={log.images ?? []} />}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleSection>

      {showMoneyBilling && billableCalculation && (
        <CollapsibleSection
          title={`Kumppanille laskutettava · ${formatEuro(billableCalculation.grandTotal)}`}
          defaultOpen={false}
          variant="plain"
          className="panel work-report-section"
        >
            <div className="billing-rates-bar">
              <p className="muted" style={{ margin: 0 }}>
                Laskutettava: <strong>{billedPartnerName}</strong>
                {' · '}
                <Tooltip label="Hinta haetaan automaattisesti kumppanuudesta tai yrityksen oletuksista, ellei raporttikohtaisia hintoja ole päällä.">
                  <span>
                    {BILLABLE_RATES_SOURCE_LABELS[billableCalculation.ratesSource]} · tunti{' '}
                    {formatEuro(billableCalculation.ratesUsed.hourly_regular)}
                  </span>
                </Tooltip>
              </p>
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
            </div>

            {useCustomRates && (
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
            {canSeeCreatorBilling
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
            <div className="table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Henkilö</th>
                    <th className="num">Työtunnit</th>
                    <th className="num">Työt (€)</th>
                    <th className="num">Kulut / urakat</th>
                    <th className="num">Yhteensä</th>
                  </tr>
                </thead>
                <tbody>
                  {billableCalculation.byUser.map((u) => (
                    <tr key={u.userId}>
                      <td>
                        {u.userName}
                        {!u.effectiveBillHoursEnabled && !u.effectiveBillExpensesEnabled && (
                          <span className="muted"> (ei laskutukseen)</span>
                        )}
                      </td>
                      <td className="num">{u.hoursQty.toFixed(2)} h</td>
                      <td className="num">{formatEuro(u.hoursTotal)}</td>
                      <td className="num">{formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
                      <td className="num">{formatEuro(u.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <Tooltip label="Avaa tulosteen kumppanille hintoineen.">
                <Link
                  to={`/tyoraportit/${report.id}/tuloste?hinnat=1`}
                  className="btn btn-secondary"
                >
                  Tulosta kumppanille
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
        </CollapsibleSection>
      )}

      {showCustomerMoneyBilling && customerBillableCalculation && (
        <CollapsibleSection
          title={`Asiakkaalle laskutettava · ${formatEuro(customerBillableCalculation.grandTotal)}`}
          defaultOpen={false}
          variant="plain"
          className="panel work-report-section"
        >
          <div className="billing-rates-bar">
            <p className="muted" style={{ margin: 0 }}>
              Laskutettava: <strong>{report.customers?.name ?? 'Asiakas'}</strong>
              {' · '}
              <Tooltip label="Hinta haetaan yrityksen asiakashinnoista, ellei raporttikohtaisia hintoja ole päällä.">
                <span>
                  {BILLABLE_RATES_SOURCE_LABELS[customerBillableCalculation.ratesSource]} · tunti{' '}
                  {formatEuro(customerBillableCalculation.ratesUsed.hourly_regular)}
                </span>
              </Tooltip>
            </p>
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
          </div>

          {useCustomCustomerRates && (
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

          {hasZeroHourlyRates(customerBillableCalculation) && billableHoursQty(customerBillableCalculation) > 0 && (
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

          <div className="table-wrap">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Henkilö</th>
                  <th className="num">Työtunnit</th>
                  <th className="num">Työt (€)</th>
                  <th className="num">Kulut / urakat</th>
                  <th className="num">Yhteensä</th>
                </tr>
              </thead>
              <tbody>
                {customerBillableCalculation.byUser.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.userName}</td>
                    <td className="num">{u.hoursQty.toFixed(2)} h</td>
                    <td className="num">{formatEuro(u.hoursTotal)}</td>
                    <td className="num">{formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
                    <td className="num">{formatEuro(u.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Link to="/laskutus?mode=customer" className="btn btn-secondary">
              Laskutus-moduuli
            </Link>
          </div>
        </CollapsibleSection>
      )}

      {canSeePartnerSummary && !canSeeCreatorBilling && (
        <CollapsibleSection title="Kumppanilaskutuksen yhteenveto" defaultOpen={false} variant="plain" className="panel work-report-section">
          <p className="muted">
            Raportin laatija ({report.created_by_company?.name ?? '—'}) on jakanut laskutettavan summan.
          </p>
          <p>
            <strong>{formatEuro(Number(billing?.partner_invoice_amount ?? 0))}</strong>
          </p>
        </CollapsibleSection>
      )}

      {!canManageBilling && isOwnerCompany && isPartnerReport && (
        <p className="muted">
          Kumppanin laskutettava summa ei ole jaettu. Raportin laatija voi tulostaa laskutusyhteenvedon.
        </p>
      )}

      <DailyLogDialog
        open={logDialogOpen}
        title={editingLogId ? 'Muokkaa työkirjausta' : 'Lisää työkirjaus'}
        submitLabel={editingLogId ? 'Tallenna muutokset' : 'Lisää työkirjaus'}
        busy={logDialogBusy}
        error={logDialogOpen ? error : null}
        onClose={closeLogDialog}
        onSubmit={(event) => void (editingLogId ? saveDailyLogEdit(event) : addDailyLog(event))}
      >
        <DailyLogFields
          form={logForm}
          setForm={(next) => setLogForm(next)}
          expenseDrafts={expenseDrafts}
          setExpenseDrafts={setExpenseDrafts}
          showHourlyRate={showMoneyBilling}
          showCustomerHourlyRate={showCustomerMoney}
          showCustomerExpenseFields={showCustomerMoney}
          defaultHourlyRate={billableCalculation?.ratesUsed.hourly_regular ?? null}
          defaultCustomerHourlyRate={customerBillableCalculation?.ratesUsed.hourly_regular ?? null}
        />
        <DailyLogRefrigerantFields
          drafts={refrigerantDrafts}
          setDrafts={setRefrigerantDrafts}
          cylinders={refrigerantCylinders}
          companyUsers={refrigerantCompanyUsers}
          ownCompanyId={profile?.company_id ?? null}
          hasPartnerCompanies={hasPartnerRefrigerantCompanies}
          showCustomerBillingFields={showCustomerMoney}
        />
        <div className="image-section">
          <div className="section-head">
            <h3>Kuvat</h3>
            <label className="btn btn-secondary image-upload-btn">
              + Valitse kuvia
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) {
                    setPendingImages((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {editingLog && (editingLog.images ?? []).length > 0 && (
            <DailyLogImageGallery images={editingLog.images ?? []} />
          )}
          {editingLogId && report && (
            <AddDailyLogImages
              reportId={report.id}
              dailyLogId={editingLogId}
              userId={session.user.id}
              onUploaded={() => void load(report.id)}
            />
          )}
          {pendingImages.length === 0 && !editingLogId ? (
            <p className="muted">Voit liittää kuvia työstä (max 10 MB / kuva).</p>
          ) : pendingImages.length > 0 ? (
            <div className="image-gallery">
              {pendingImages.map((file, index) => (
                <div key={`${file.name}-${index}`} className="image-thumb pending">
                  <img src={imagePreviewUrls[index]} alt={file.name} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Poista
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </DailyLogDialog>
    </AppLayout>
  );
}
