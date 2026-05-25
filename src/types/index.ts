export type WorkStatus =
  | 'draft'
  | 'delegated'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'billed_partner'
  | 'billed_customer';

export type InvoiceStatus = 'none' | 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled';

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  company_id: string | null;
  bill_hours_enabled?: boolean;
  bill_expenses_enabled?: boolean;
  is_global_admin?: boolean;
  companies: { id: string; name: string } | null;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
};

export type Customer = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  business_id: string | null;
  notes: string | null;
  owner_company_id: string;
  owner_company?: { name: string } | null;
  created_at?: string;
};

export type Equipment = {
  id: string;
  name: string;
  tag: string | null;
  customer_id: string;
  owner_company_id?: string;
  model?: string | null;
  serial_number?: string | null;
  location?: string | null;
  notes?: string | null;
  device_type?: string | null;
  huolto_technical_snapshot?: Record<string, unknown> | null;
};

export type CustomerDocument = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  created_at: string;
  equipment_id: string | null;
};

export type Partnership = {
  id: string;
  company_a_id: string;
  company_b_id: string;
  permissions_a_to_b: Record<string, unknown>;
  permissions_b_to_a: Record<string, unknown>;
  billing_rates_a_to_b?: Record<string, unknown>;
  billing_rates_b_to_a?: Record<string, unknown>;
  customer_access_restricted?: boolean;
  partner_company: Company;
};

export type DailyHourEntryType =
  | 'regular'
  | 'overtime'
  | 'regular_and_overtime'
  | 'on_call'
  | 'fixed_price';

export type DailyExpenseLine = {
  id: string;
  daily_log_id: string;
  expense_type: string;
  description: string;
  qty: number;
  unit_price: number;
  bill_to_customer?: boolean;
  customer_unit_price?: number | null;
  sort_order: number;
};

export type DailyLogImage = {
  id: string;
  daily_log_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
};

export type WorkReportAttachment = {
  id: string;
  work_report_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  created_at?: string;
};

export type WorkReportDailyLog = {
  id: string;
  work_report_id: string;
  log_date: string;
  log_start_time?: string | null;
  entry_type: DailyHourEntryType;
  hours_regular: number;
  hours_overtime: number;
  hours_on_call: number;
  fixed_price_amount: number | null;
  hourly_rate_override?: number | null;
  customer_hourly_rate_override?: number | null;
  commission_amount: number;
  commission_note: string | null;
  work_done: string;
  created_by: string | null;
  created_at: string;
  author_name_snapshot?: string | null;
  author_deleted?: boolean;
  author: { display_name: string | null } | null;
  expense_lines?: DailyExpenseLine[];
  refrigerant_lines?: import('./inventory').WorkReportRefrigerantLine[];
  images?: DailyLogImage[];
};

export const HOUR_ENTRY_LABELS: Record<DailyHourEntryType, string> = {
  regular: 'Asennustyö (normaalihinta)',
  overtime: 'Ylitötunnit',
  regular_and_overtime: 'Tunnit ja ylitötunnit',
  on_call: 'Päivystystunnit',
  fixed_price: 'Sovittu urakkahinta',
};

export const EXPENSE_TYPE_LABELS: Record<string, string> = {
  parking: 'Pysäköinti',
  km: 'KM-korvaus',
  part: 'Varaosa',
  material: 'Tarvike',
  other: 'Muu kulu',
};

export const EXPENSE_TYPE_OPTIONS = Object.entries(EXPENSE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export type WorkReport = {
  id: string;
  title: string;
  description: string | null;
  orderer_name: string | null;
  location_text: string | null;
  status: WorkStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  owner_company_id: string;
  created_by_company_id: string;
  created_by_user_id: string | null;
  branding_company_id: string;
  partnership_id: string | null;
  customer_id: string | null;
  equipment_id: string | null;
  assigned_user_id: string | null;
  created_by_user_name_snapshot?: string | null;
  created_by_user_deleted?: boolean;
  assigned_user_name_snapshot?: string | null;
  assigned_user_deleted?: boolean;
  delegate_company_id: string | null;
  delegated_at: string | null;
  created_at: string;
  customers: { name: string } | null;
  equipment: { name: string; tag: string | null } | null;
  owner_company: { name: string } | null;
  branding_company: { name: string } | null;
  assigned_user: { display_name: string | null } | null;
  delegate_company: { name: string } | null;
  created_by_user: { display_name: string | null; email: string | null } | null;
  created_by_company: { name: string } | null;
};

export type WorkReportLine = {
  id: string;
  work_report_id: string;
  line_type: string;
  description: string;
  qty: number;
  unit_price: number;
  bill_to: 'partner' | 'customer' | 'internal';
  sort_order: number;
};

export type WorkReportBilling = {
  work_report_id: string;
  partner_invoice_status: InvoiceStatus;
  partner_invoice_amount: number | null;
  partner_billed_amount: number | null;
  partner_billed_at: string | null;
  billed_to_company_id: string | null;
  customer_invoice_status: InvoiceStatus;
  customer_invoice_amount: number | null;
  customer_billed_at: string | null;
  use_custom_customer_rates?: boolean;
  customer_rates_override?: {
    hourly_regular?: number;
    hourly_overtime?: number;
    hourly_on_call?: number;
  } | null;
  external_invoice_ref: string | null;
  notes: string | null;
  partner_summary_shared: boolean;
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  draft: 'Luonnos',
  delegated: 'Odottaa toimeksiantoa',
  scheduled: 'Tulossa',
  in_progress: 'Työn alla',
  completed: 'Valmis',
  billed_partner: 'Laskutettu kumppanille',
  billed_customer: 'Laskutettu asiakkaalta',
};

export function getWorkStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? '').trim().toLowerCase() as WorkStatus;
  return WORK_STATUS_LABELS[key] ?? 'Valmis';
}

export const MAINTENANCE_REPORT_STATUS_LABELS: Record<string, string> = {
  draft: 'Luonnos',
  submitted: 'Toimitettu',
};

export function getMaintenanceReportStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? '').trim().toLowerCase();
  return MAINTENANCE_REPORT_STATUS_LABELS[key] ?? 'Toimitettu';
}

export const WORK_STATUS_ORDER: WorkStatus[] = [
  'draft',
  'delegated',
  'scheduled',
  'in_progress',
  'completed',
  'billed_partner',
  'billed_customer',
];

/** Workflow statuses shown in UI — billing is tracked separately in work_report_billing. */
export const WORKFLOW_STATUS_ORDER: WorkStatus[] = [
  'draft',
  'delegated',
  'scheduled',
  'in_progress',
  'completed',
];

export function normalizeWorkflowStatus(status: WorkStatus): WorkStatus {
  if (status === 'billed_partner' || status === 'billed_customer') return 'completed';
  return status;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  none: 'Laskuttamatta',
  draft: 'Laskuttamatta',
  sent: 'Laskuttamatta',
  partial: 'Osittain laskutettu',
  paid: 'Laskutettu',
  cancelled: 'Laskuttamatta',
};

export const SIMPLE_INVOICE_STATUS_OPTIONS = [
  { value: 'none' as const, label: 'Laskuttamatta' },
  { value: 'paid' as const, label: 'Laskutettu' },
];

export function invoiceStatusToSimple(status: InvoiceStatus | null | undefined): 'none' | 'paid' {
  return status === 'paid' ? 'paid' : 'none';
}

export function lineTotal(line: Pick<WorkReportLine, 'qty' | 'unit_price'>) {
  return Number(line.qty) * Number(line.unit_price);
}

export function sumLines(lines: WorkReportLine[], billTo: WorkReportLine['bill_to']) {
  return lines
    .filter((l) => l.bill_to === billTo)
    .reduce((sum, l) => sum + lineTotal(l), 0);
}

export function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fi-FI');
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export const OFFICE_HOUR_OPTIONS = (() => {
  const options: { value: string; label: string }[] = [];
  for (let hour = 7; hour <= 16; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 16 && minute === 30) continue;
      const value = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`;
      options.push({ value, label: value });
    }
  }
  return options;
})();

export function roundTimeToHalfHour(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return '08:00';
  const total = Number(match[1]) * 60 + Number(match[2]);
  const rounded = Math.round(total / 30) * 30;
  const clamped = Math.max(7 * 60, Math.min(16 * 60 + 30, rounded));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function defaultOfficeHour() {
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.round(total / 30) * 30;
  const clamped = Math.max(7 * 60, Math.min(16 * 60, rounded));
  return roundTimeToHalfHour(`${Math.floor(clamped / 60)}:${clamped % 60}`);
}

export function combineDateAndHour(date: string, hour: string) {
  if (!date || !hour) return null;
  const normalized = roundTimeToHalfHour(hour);
  return new Date(`${date}T${normalized}:00`).toISOString();
}

export function splitScheduledStart(iso: string | null) {
  if (!iso) return { date: todayIsoDate(), hour: defaultOfficeHour() };
  const d = new Date(iso);
  const date = toLocalYmd(d);
  const hour = roundTimeToHalfHour(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
  return { date, hour };
}

export type ResolvedUserLabel = {
  name: string;
  deleted: boolean;
};

export function resolveStoredUserLabel(
  live: { display_name: string | null; email?: string | null } | null | undefined,
  snapshot?: string | null,
  deleted?: boolean,
): ResolvedUserLabel {
  if (live?.display_name?.trim()) {
    return { name: live.display_name.trim(), deleted: false };
  }
  if (live?.email?.trim()) {
    return { name: live.email.trim(), deleted: false };
  }
  if (snapshot?.trim()) {
    return { name: snapshot.trim(), deleted: !!deleted };
  }
  return { name: '—', deleted: false };
}

export function reportHasAssignedPerformer(
  report: Pick<
    WorkReport,
    'assigned_user_id' | 'assigned_user' | 'assigned_user_name_snapshot' | 'assigned_user_deleted'
  >,
) {
  if (report.assigned_user_id || report.assigned_user?.display_name) return true;
  return !!(report.assigned_user_deleted && report.assigned_user_name_snapshot);
}

export function resolveDailyLogAuthorLabel(log: WorkReportDailyLog): ResolvedUserLabel {
  return resolveStoredUserLabel(log.author, log.author_name_snapshot, log.author_deleted);
}

export function isDelegatedWorkOrder(
  report: Pick<WorkReport, 'delegate_company_id' | 'created_by_company_id' | 'owner_company_id'>,
) {
  return !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
}

export function resolveWorkReportDisplayPeople(
  report: WorkReport,
  options?: { hideAssignee?: boolean },
) {
  const creator = resolveStoredUserLabel(
    report.created_by_user,
    report.created_by_user_name_snapshot,
    report.created_by_user_deleted,
  );
  const performer = resolveStoredUserLabel(
    report.assigned_user,
    report.assigned_user_name_snapshot,
    report.assigned_user_deleted,
  );
  const hasPerformer = reportHasAssignedPerformer(report);

  if (hasPerformer && performer.name !== '—' && !options?.hideAssignee) {
    return {
      authorName: performer.name,
      authorDeleted: performer.deleted,
      performerName: null as string | null,
      performerDeleted: false,
    };
  }

  return {
    authorName: creator.name,
    authorDeleted: creator.deleted,
    performerName: null as string | null,
    performerDeleted: false,
  };
}

export function resolveWorkReportAuthorCompany(
  report: WorkReport,
  options?: { hideAssignee?: boolean; fallbackCompanyName?: string },
) {
  const performer = resolveStoredUserLabel(
    report.assigned_user,
    report.assigned_user_name_snapshot,
    report.assigned_user_deleted,
  );
  const performerIsAuthor =
    reportHasAssignedPerformer(report) && performer.name !== '—' && !options?.hideAssignee;

  if (performerIsAuthor && isDelegatedWorkOrder(report)) {
    return report.delegate_company?.name ?? report.created_by_company?.name ?? options?.fallbackCompanyName ?? '—';
  }

  return report.created_by_company?.name ?? options?.fallbackCompanyName ?? '—';
}

export function reportPartyLabels(report: WorkReport) {
  const { authorName } = resolveWorkReportDisplayPeople(report);
  const reporterCompany = report.created_by_company?.name ?? '—';
  const onBehalfOf = report.branding_company?.name ?? report.owner_company?.name ?? '—';
  const isPartnerReport = report.created_by_company_id !== report.owner_company_id;
  return { reporterName: authorName, reporterCompany, onBehalfOf, isPartnerReport };
}

function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.5)) {
    return cut.slice(0, lastSpace).trimEnd();
  }

  return cut.trimEnd();
}

export function buildWorkReportTitle(customerName: string | undefined | null, description: string) {
  const base = customerName ?? 'Työraportti';
  const snippet = truncateAtWord(description, 48);
  return snippet ? `${base} – ${snippet}` : base;
}

export function buildMaintenanceReportTitle(
  customerName: string | undefined | null,
  snippet: string,
) {
  const base = customerName ?? 'Huoltoraportti';
  const part = truncateAtWord(snippet, 48);
  return part ? `${base} – ${part}` : base;
}

/** Full headline for print/PDF — uses complete task description, not the short list title. */
export function buildWorkReportPrintHeadline(
  report: Pick<WorkReport, 'title' | 'description'> & {
    customers?: { name: string } | null;
  },
): string {
  const customerName = report.customers?.name?.trim();
  const taskText = resolveWorkReportDescription(report);
  if (taskText && customerName) return `${customerName} – ${taskText}`;
  if (taskText) return taskText;
  return report.title?.trim() || 'Työraportti';
}

/** Full task description for display/edit — falls back to title when description column is empty. */
export function resolveWorkReportDescription(
  report: Pick<WorkReport, 'title' | 'description'> & {
    customers?: { name: string } | null;
  },
): string {
  const direct = report.description?.trim();
  if (direct) return direct;

  const title = report.title?.trim() ?? '';
  if (!title || title === 'Työraportti') return '';

  const customerName = report.customers?.name?.trim();
  if (customerName) {
    for (const separator of [' – ', ' - ']) {
      const prefix = `${customerName}${separator}`;
      if (title.startsWith(prefix)) {
        const fromTitle = title.slice(prefix.length).trim();
        if (fromTitle) return fromTitle;
      }
    }
    if (title !== customerName) return title;
    return '';
  }

  return title;
}

export const WORK_REPORT_NO_EQUIPMENT_LABEL = 'Ei kohdistettu mihinkään laitteeseen';

export function formatWorkReportEquipment(equipment: WorkReport['equipment']) {
  if (!equipment) return WORK_REPORT_NO_EQUIPMENT_LABEL;
  return equipment.tag ? `${equipment.tag} — ${equipment.name}` : equipment.name;
}

export function expenseLineTotal(line: Pick<DailyExpenseLine, 'qty' | 'unit_price'>) {
  return Number(line.qty) * Number(line.unit_price);
}

export function sumDailyHours(logs: WorkReportDailyLog[]) {
  return logs.reduce((sum, log) => {
    if (log.entry_type === 'fixed_price') return sum;
    if (log.entry_type === 'regular') return sum + Number(log.hours_regular);
    if (log.entry_type === 'overtime') return sum + Number(log.hours_overtime);
    if (log.entry_type === 'on_call') return sum + Number(log.hours_on_call);
    if (log.entry_type === 'regular_and_overtime') {
      return sum + Number(log.hours_regular) + Number(log.hours_overtime);
    }
    return sum;
  }, 0);
}

export function sumDailyExpenses(logs: WorkReportDailyLog[]) {
  return logs.reduce((sum, log) => {
    const lineSum = (log.expense_lines ?? []).reduce((s, line) => s + expenseLineTotal(line), 0);
    return sum + lineSum;
  }, 0);
}

export function sumDailyCommission(logs: WorkReportDailyLog[]) {
  return logs.reduce((sum, log) => sum + Number(log.commission_amount || 0), 0);
}

export function sumDailyFixedPrice(logs: WorkReportDailyLog[]) {
  return logs.reduce((sum, log) => {
    if (log.entry_type === 'fixed_price') return sum + Number(log.fixed_price_amount || 0);
    return sum;
  }, 0);
}

export function formatHourEntry(log: WorkReportDailyLog, options?: { showMoney?: boolean }) {
  const showMoney = options?.showMoney ?? true;
  const partnerRateHint =
    showMoney && log.hourly_rate_override != null && Number(log.hourly_rate_override) > 0
      ? ` × ${Number(log.hourly_rate_override).toFixed(2)} €/h`
      : '';
  const customerRateHint =
    showMoney && log.customer_hourly_rate_override != null && Number(log.customer_hourly_rate_override) > 0
      ? ` (asiakas ${Number(log.customer_hourly_rate_override).toFixed(2)} €/h)`
      : '';
  const rateHint = partnerRateHint || customerRateHint;
  switch (log.entry_type) {
    case 'regular':
      return `${Number(log.hours_regular).toFixed(2)} h${rateHint}`;
    case 'overtime':
      return `${Number(log.hours_overtime).toFixed(2)} ylityö h${rateHint}`;
    case 'regular_and_overtime':
      return `${Number(log.hours_regular).toFixed(2)} h + ${Number(log.hours_overtime).toFixed(2)} ylityö h${rateHint}`;
    case 'on_call':
      return `${Number(log.hours_on_call).toFixed(2)} päivystys h${rateHint}`;
    case 'fixed_price':
      return showMoney
        ? `Urakka ${Number(log.fixed_price_amount || 0).toFixed(2)} €`
        : 'Urakka';
    default:
      return '—';
  }
}

export function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfYear(date: Date): Date {
  const d = new Date(date.getFullYear(), 0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function monthGridDays(monthAnchor: Date): Date[] {
  const first = startOfMonth(monthAnchor);
  const last = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

export function daysBetweenInclusive(from: Date, to: Date): Date[] {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const days: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

export function padDaysToWeekRows(days: Date[]): Date[] {
  if (days.length === 0) return [];
  const start = startOfWeek(days[0]);
  const end = addDays(startOfWeek(days[days.length - 1]), 6);
  const padded: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    padded.push(new Date(cursor));
  }
  return padded;
}

const MONTH_NAMES = [
  'Tammikuu',
  'Helmikuu',
  'Maaliskuu',
  'Huhtikuu',
  'Toukokuu',
  'Kesäkuu',
  'Heinäkuu',
  'Elokuu',
  'Syyskuu',
  'Lokakuu',
  'Marraskuu',
  'Joulukuu',
];

export function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}
