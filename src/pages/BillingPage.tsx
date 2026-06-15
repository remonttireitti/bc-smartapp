import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { formatEuro } from '../lib/workReportBilling';
import {
  billingPartnerStatusLabel,
  billToPartnerId,
  billToPartnerName,
  billToCustomerKey,
  billToCustomerName,
  billingRowBreakdown,
  billingRowAmount,
  billingRowBilledAmount,
  billingRowOpenAmount,
  billingRowState,
  billingPartnerState,
  resolvePartnerBillingAmounts,
  BILLING_LIST_STATUSES,
  billingRowDate,
  companyHasBillableBilling,
  companyHasCustomerBillableBilling,
  companyPartnerBillingAvailable,
  effectiveBillingRowMode,
  isBillablePartnerReport,
  isBillableCustomerReport,
  canViewerRecalcPartnerBill,
  billingRowHasStoredCalculation,
  billingRowNeedsPartnerRecalc,
  billingRowVisibleInList,
  loadBillingCopyText,
  markPartnerReportBilled,
  markCustomerReportBilled,
  unmarkPartnerReportBilled,
  unmarkCustomerReportBilled,
  type BillingListRow,
  type BillingModuleMode,
} from '../lib/workReportBillingCopy';
import { ensurePartnerBillableCalculated } from '../lib/workReportPartnerBillingPersist';
import { findStaleBillableReportIds, runWithConcurrency } from '../lib/workReportBillableStale';
import {
  addDays,
  addMonths,
  addYears,
  daysBetweenInclusive,
  formatDate,
  formatDateTime,
  formatMonthYear,
  getWorkStatusLabel,
  monthGridDays,
  padDaysToWeekRows,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfMonth,
  toLocalYmd,
} from '../types';

interface Props {
  session: Session;
}

type Tab = 'list' | 'calendar';
type StatusFilter = 'all' | 'unbilled' | 'billed';
type CalendarPeriod = 'this_week' | 'this_month' | 'this_year' | 'custom';
type CalendarLayout = 'week' | 'month';

const WEEKDAY_LABELS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];
const MONTH_SHORT = ['Tammi', 'Helmi', 'Maalis', 'Huhti', 'Touko', 'Kesä', 'Heinä', 'Elo', 'Syys', 'Loka', 'Marras', 'Joulu'];

const REPORT_SELECT = `
  id, title, status, completed_at, scheduled_start, created_at,
  owner_company_id, created_by_company_id, delegate_company_id, customer_id,
  customers(name),
  owner_company:companies!work_reports_owner_company_id_fkey(name),
  creator_company:companies!work_reports_created_by_company_id_fkey(name),
  delegate_company:companies!work_reports_delegate_company_id_fkey(name),
  billing:work_report_billing(
    partner_invoice_status, partner_invoice_amount, partner_billed_amount,
    customer_invoice_status, customer_invoice_amount, customer_billed_at
  ),
  billable:work_report_billable(partner_total, calculation, customer_total, customer_calculation, calculated_at, partner_recalc_needed)
`;

export default function BillingPage({ session }: Props) {
  const { profile } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');
  const initialMode: BillingModuleMode =
    urlMode === 'customer'
      ? 'customer'
      : urlMode === 'partner'
        ? 'partner'
        : urlMode === 'total'
          ? 'total'
          : partnershipsEnabled !== false
            ? 'total'
            : 'customer';
  const [tab, setTab] = useState<Tab>('list');
  const [billingMode, setBillingMode] = useState<BillingModuleMode>(initialMode);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unbilled');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<BillingListRow[]>([]);
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [customerBillingEnabled, setCustomerBillingEnabled] = useState<boolean | null>(null);
  const [partnerBillingAvailable, setPartnerBillingAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState(() => startOfWeek(new Date()));
  const [calendarPeriod, setCalendarPeriod] = useState<CalendarPeriod>('this_week');
  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recalcState, setRecalcState] = useState<{ total: number; done: number } | null>(null);
  const [recalculatingIds, setRecalculatingIds] = useState<Set<string>>(() => new Set());
  const [partnerOptions, setPartnerOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (searchParams.get('mode') === 'customer') {
      setBillingMode('customer');
    } else if (searchParams.get('mode') === 'partner') {
      setBillingMode(partnershipsEnabled === false ? 'customer' : 'partner');
    } else if (searchParams.get('mode') === 'total' || !searchParams.get('mode')) {
      setBillingMode(partnershipsEnabled === false ? 'customer' : 'total');
    }
  }, [searchParams, partnershipsEnabled]);

  useEffect(() => {
    if (partnershipsEnabled === false && billingMode !== 'customer') {
      setBillingMode('customer');
    }
  }, [partnershipsEnabled, billingMode]);

  useEffect(() => {
    if (profile?.company_id) void load(billingMode);
  }, [profile?.company_id, billingMode]);

  function rowBillingMode(row: BillingListRow): 'partner' | 'customer' {
    return effectiveBillingRowMode(billingMode, row);
  }

  async function loadPartnershipPartners(companyId: string) {
    const { data } = await supabase
      .from('company_partnerships')
      .select('company_a_id, company_b_id')
      .eq('status', 'active');

    const partnerIds = [
      ...new Set(
        (data ?? [])
          .filter(
            (row) => row.company_a_id === companyId || row.company_b_id === companyId,
          )
          .map((row) => (row.company_a_id === companyId ? row.company_b_id : row.company_a_id)),
      ),
    ];

    if (partnerIds.length === 0) {
      setPartnerOptions([]);
      return;
    }

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', partnerIds)
      .order('name');

    setPartnerOptions(
      ((companies as Array<{ id: string; name: string }> | null) ?? []).map((company) => ({
        id: company.id,
        name: company.name,
      })),
    );
  }

  async function refreshBillingRow(reportId: string) {
    const { data } = await supabase.from('work_reports').select(REPORT_SELECT).eq('id', reportId).maybeSingle();
    if (!data) return;
    const updated = data as unknown as BillingListRow;
    setRows((prev) => prev.map((row) => (row.id === reportId ? updated : row)));
  }

  async function startStalePartnerRecalc(filtered: BillingListRow[], companyId: string) {
    const partnerRowsForRecalc = filtered.filter((row) => {
      if (!canViewerRecalcPartnerBill(row, companyId)) return false;
      if (billingPartnerState(row) === 'billed') return false;
      return true;
    });

    const stalePartnerIds = await findStaleBillableReportIds(
      supabase,
      partnerRowsForRecalc.map((row) => ({
        workReportId: row.id,
        calculatedAt: row.billable?.calculated_at,
        hasCalculation:
          Number(row.billable?.partner_total ?? 0) > 0.005
          && ((row.billable?.calculation as { byUser?: unknown[] } | null | undefined)?.byUser?.length ?? 0) > 0,
        calculation: row.billable?.calculation,
      })),
    );

    const flaggedPartnerIds = partnerRowsForRecalc
      .filter((row) => billingRowNeedsPartnerRecalc(row))
      .map((row) => row.id);
    const workIds = [...new Set([...stalePartnerIds, ...flaggedPartnerIds])];

    if (workIds.length === 0) return;

    setRecalcState({ total: workIds.length, done: 0 });

    await runWithConcurrency(workIds, 3, async (reportId) => {
      setRecalculatingIds((prev) => new Set(prev).add(reportId));
      try {
        await ensurePartnerBillableCalculated(supabase, reportId, companyId);
        await refreshBillingRow(reportId);
      } catch (recalcError) {
        console.error('Kumppanilaskelman päivitys epäonnistui:', reportId, recalcError);
      } finally {
        setRecalcState((state) => (state ? { total: state.total, done: state.done + 1 } : null));
        setRecalculatingIds((prev) => {
          const next = new Set(prev);
          next.delete(reportId);
          return next;
        });
      }
    });

    setRecalcState(null);
  }

  async function load(mode: BillingModuleMode = billingMode) {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);
    setRecalcState(null);
    setRecalculatingIds(new Set());

    const [enabled, customerEnabled, partnerAvailable] = await Promise.all([
      companyHasBillableBilling(supabase, profile.company_id),
      companyHasCustomerBillableBilling(supabase, profile.company_id),
      companyPartnerBillingAvailable(supabase, profile.company_id),
    ]);
    setBillingEnabled(enabled);
    setCustomerBillingEnabled(customerEnabled);
    setPartnerBillingAvailable(partnerAvailable);

    if (mode === 'partner' || mode === 'total') {
      await loadPartnershipPartners(profile.company_id);
    }

    const query = supabase
      .from('work_reports')
      .select(REPORT_SELECT)
      .in('status', [...BILLING_LIST_STATUSES])
      .order('completed_at', { ascending: false, nullsFirst: false });

    let loadError = null as { message: string } | null;
    let all: BillingListRow[] = [];

    const companyScope = `created_by_company_id.eq.${profile.company_id},owner_company_id.eq.${profile.company_id},delegate_company_id.eq.${profile.company_id}`;

    if (mode === 'total') {
      const { data, error } = await query.or(companyScope);
      loadError = error;
      all = (data as unknown as BillingListRow[]) ?? [];
    } else {
      const { data, error } =
        mode === 'customer'
          ? await query.eq('owner_company_id', profile.company_id)
          : await query.or(companyScope);
      loadError = error;
      all = (data as unknown as BillingListRow[]) ?? [];
    }

    if (loadError) {
      setError(loadError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const filtered =
      mode === 'total'
        ? all.filter((row) => isBillablePartnerReport(row) || isBillableCustomerReport(row))
        : mode === 'customer'
          ? all.filter(isBillableCustomerReport)
          : all.filter(isBillablePartnerReport);

    setRows(filtered);

    if ((mode === 'partner' || mode === 'total') && partnerAvailable !== false) {
      try {
        await startStalePartnerRecalc(filtered, profile.company_id);
      } catch (recalcError) {
        console.error('Kumppanilaskelmien taustapaivitys epaonnistui:', recalcError);
        setError('Joidenkin laskelmien paivitys epaonnistui. Kokeile Paivita laskelma -painiketta.');
      }
    }

    setLoading(false);
  }

  async function recalcPartnerRow(reportId: string) {
    setRecalculatingIds((prev) => new Set(prev).add(reportId));
    try {
      await ensurePartnerBillableCalculated(supabase, reportId, profile?.company_id);
      await refreshBillingRow(reportId);
    } catch (recalcError) {
      console.error('Kumppanilaskelman päivitys epäonnistui:', reportId, recalcError);
      setError('Laskelman päivitys epäonnistui. Yritä uudelleen.');
    } finally {
      setRecalculatingIds((prev) => {
        const next = new Set(prev);
        next.delete(reportId);
        return next;
      });
    }
  }

  const partners = useMemo(() => {
    if (billingMode !== 'partner') return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const option of partnerOptions) {
      map.set(option.id, { name: option.name, count: 0 });
    }
    for (const row of rows) {
      const id = billToPartnerId(row, profile?.company_id);
      const prev = map.get(id);
      map.set(id, {
        name: prev?.name ?? billToPartnerName(row, profile?.company_id),
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...map.entries()]
      .map(([id, { name, count }]) => ({ id, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  }, [partnerOptions, rows, billingMode, profile?.company_id]);

  const customers = useMemo(() => {
    if (billingMode !== 'customer') return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const row of rows) {
      const id = billToCustomerKey(row);
      const prev = map.get(id);
      map.set(id, {
        name: billToCustomerName(row),
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...map.entries()]
      .map(([id, { name, count }]) => ({ id, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  }, [rows, billingMode]);

  const moduleEnabled =
    billingModuleEnabled !== false
    && (billingMode === 'total'
      ? customerBillingEnabled !== false || partnerBillingAvailable !== false
      : billingMode === 'customer'
        ? customerBillingEnabled !== false
        : partnerBillingAvailable !== false);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const mode = effectiveBillingRowMode(billingMode, row);
      if (billingMode === 'partner' && partnerFilter && billToPartnerId(row, profile?.company_id) !== partnerFilter) return false;
      if (billingMode === 'customer' && customerFilter && billToCustomerKey(row) !== customerFilter) {
        return false;
      }
      if (!billingRowVisibleInList(row, mode, statusFilter)) return false;
      if (selectedDay) {
        const ymd = toLocalYmd(billingRowDate(row));
        if (ymd !== selectedDay) return false;
      }
      return true;
    });
  }, [rows, partnerFilter, customerFilter, statusFilter, selectedDay, billingMode, profile?.company_id]);

  const summary = useMemo(() => {
    let openTotal = 0;
    let billedTotal = 0;
    let openWork = 0;
    let openMaterials = 0;
    let openCount = 0;
    let billedCount = 0;

    for (const row of rows) {
      const mode = effectiveBillingRowMode(billingMode, row);
      if (billingMode === 'partner' && partnerFilter && billToPartnerId(row, profile?.company_id) !== partnerFilter) continue;
      if (billingMode === 'customer' && customerFilter && billToCustomerKey(row) !== customerFilter) {
        continue;
      }
      if (!billingRowVisibleInList(row, mode, statusFilter)) continue;

      const openAmount = billingRowOpenAmount(row, mode);
      const billedAmount = billingRowBilledAmount(row, mode);
      const breakdown = billingRowBreakdown(row, mode);

      if (statusFilter === 'all' || statusFilter === 'unbilled') {
        const partnerOpenTotal = mode === 'customer' ? breakdown.total : openAmount;
        if (partnerOpenTotal <= 0.005) continue;
        openTotal += partnerOpenTotal;
        if (breakdown.total > 0.005 && openAmount > 0.005 && openAmount < breakdown.total - 0.005) {
          const ratio = openAmount / breakdown.total;
          openWork += breakdown.work * ratio;
          openMaterials += breakdown.materials * ratio;
        } else {
          openWork += breakdown.work;
          openMaterials += breakdown.materials;
        }
        openCount += 1;
      }
      if (statusFilter === 'all' || statusFilter === 'billed') {
        if (billedAmount <= 0.005) continue;
        billedTotal += billedAmount;
        billedCount += 1;
      }
    }

    return { openTotal, billedTotal, openWork, openMaterials, openCount, billedCount, grandTotal: openTotal + billedTotal, totalCount: openCount + billedCount };
  }, [rows, partnerFilter, customerFilter, billingMode, statusFilter, profile?.company_id]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(rangeAnchor, index)),
    [rangeAnchor],
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, { open: number; billed: number }>();
    for (const row of rows) {
      const mode = effectiveBillingRowMode(billingMode, row);
      if (billingMode === 'partner' && partnerFilter && billToPartnerId(row, profile?.company_id) !== partnerFilter) continue;
      if (billingMode === 'customer' && customerFilter && billToCustomerKey(row) !== customerFilter) {
        continue;
      }
      const ymd = toLocalYmd(billingRowDate(row));
      const prev = map.get(ymd) ?? { open: 0, billed: 0 };
      const openAmount = billingRowOpenAmount(row, mode);
      const billedAmount = billingRowBilledAmount(row, mode);
      const isOpen = mode === 'customer' ? billingRowState(row, mode) !== 'billed' : openAmount > 0.005;
      if (isOpen) {
        prev.open += mode === 'customer' ? billingRowBreakdown(row, mode).total : openAmount;
      }
      if (billedAmount > 0.005) prev.billed += billedAmount;
      map.set(ymd, prev);
    }
    return map;
  }, [rows, partnerFilter, customerFilter, billingMode]);

  const customRange = useMemo(() => {
    if (calendarPeriod !== 'custom' || !customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T12:00:00`);
    const to = new Date(`${customTo}T12:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return { from, to, days: daysBetweenInclusive(from, to) };
  }, [calendarPeriod, customFrom, customTo]);

  const calendarDays = useMemo((): Date[] => {
    if (calendarPeriod === 'this_year') return [];
    if (calendarPeriod === 'this_week' || calendarLayout === 'week') {
      return weekDays;
    }
    if (calendarPeriod === 'this_month' || (calendarPeriod === 'custom' && !customRange)) {
      return monthGridDays(rangeAnchor);
    }
    if (calendarPeriod === 'custom' && customRange) {
      return padDaysToWeekRows(customRange.days);
    }
    return monthGridDays(rangeAnchor);
  }, [calendarPeriod, calendarLayout, weekDays, rangeAnchor, customRange]);

  const activeMonth = rangeAnchor.getMonth();

  const maxOpenInView = useMemo(() => {
    let max = 0;
    for (const day of calendarDays) {
      const ymd = toLocalYmd(day);
      max = Math.max(max, dayTotals.get(ymd)?.open ?? 0);
    }
    return max;
  }, [calendarDays, dayTotals]);

  const yearMonthTotals = useMemo(() => {
    const year = rangeAnchor.getFullYear();
    return MONTH_SHORT.map((label, monthIndex) => {
      let open = 0;
      let billed = 0;
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const ymd = toLocalYmd(new Date(year, monthIndex, day));
        const totals = dayTotals.get(ymd);
        if (!totals) continue;
        open += totals.open;
        billed += totals.billed;
      }
      return { label, monthIndex, open, billed };
    });
  }, [rangeAnchor, dayTotals]);

  const maxOpenInYear = useMemo(
    () => Math.max(0, ...yearMonthTotals.map((row) => row.open)),
    [yearMonthTotals],
  );

  const calendarRangeLabel = useMemo(() => {
    if (calendarPeriod === 'this_year') return String(rangeAnchor.getFullYear());
    if (calendarPeriod === 'this_month' || (calendarPeriod === 'custom' && calendarLayout === 'month')) {
      if (calendarPeriod === 'custom' && customRange) {
        return `${formatDate(toLocalYmd(customRange.from))} – ${formatDate(toLocalYmd(customRange.to))}`;
      }
      return formatMonthYear(rangeAnchor);
    }
    if (calendarPeriod === 'custom' && customRange) {
      return `${formatDate(toLocalYmd(customRange.from))} – ${formatDate(toLocalYmd(customRange.to))}`;
    }
    const end = addDays(rangeAnchor, 6);
    return `${formatDate(toLocalYmd(rangeAnchor))} – ${formatDate(toLocalYmd(end))}`;
  }, [calendarPeriod, calendarLayout, rangeAnchor, customRange]);

  function applyCalendarPeriod(period: CalendarPeriod) {
    setCalendarPeriod(period);
    setSelectedDay(null);
    const today = new Date();
    if (period === 'this_week') {
      setCalendarLayout('week');
      setRangeAnchor(startOfWeek(today));
    } else if (period === 'this_month') {
      setCalendarLayout('month');
      setRangeAnchor(startOfMonth(today));
    } else if (period === 'this_year') {
      setRangeAnchor(startOfYear(today));
    } else {
      const from = startOfMonth(today);
      const to = endOfMonth(today);
      setCustomFrom(toLocalYmd(from));
      setCustomTo(toLocalYmd(to));
      setCalendarLayout('month');
      setRangeAnchor(from);
    }
  }

  function goToPreviousRange() {
    setSelectedDay(null);
    if (calendarPeriod === 'this_year') {
      setRangeAnchor((prev) => startOfYear(addYears(prev, -1)));
      return;
    }
    if (calendarPeriod === 'this_month' || (calendarPeriod === 'custom' && calendarLayout === 'month')) {
      setRangeAnchor((prev) => startOfMonth(addMonths(prev, -1)));
      return;
    }
    if (calendarPeriod === 'custom') return;
    setRangeAnchor((prev) => addDays(prev, -7));
  }

  function goToNextRange() {
    setSelectedDay(null);
    if (calendarPeriod === 'this_year') {
      setRangeAnchor((prev) => startOfYear(addYears(prev, 1)));
      return;
    }
    if (calendarPeriod === 'this_month' || (calendarPeriod === 'custom' && calendarLayout === 'month')) {
      setRangeAnchor((prev) => startOfMonth(addMonths(prev, 1)));
      return;
    }
    if (calendarPeriod === 'custom') return;
    setRangeAnchor((prev) => addDays(prev, 7));
  }

  function goToCurrentRange() {
    applyCalendarPeriod(calendarPeriod === 'custom' ? 'this_month' : calendarPeriod);
  }

  function isDayInCustomRange(day: Date): boolean {
    if (!customRange) return true;
    const ymd = toLocalYmd(day);
    return ymd >= toLocalYmd(customRange.from) && ymd <= toLocalYmd(customRange.to);
  }

  function renderDayCell(day: Date, options?: { muted?: boolean; disabled?: boolean }) {
    const ymd = toLocalYmd(day);
    const totals = dayTotals.get(ymd) ?? { open: 0, billed: 0 };
    const intensity = maxOpenInView > 0 ? Math.min(1, totals.open / maxOpenInView) : 0;
    const isSelected = selectedDay === ymd;
    const disabled = options?.disabled ?? false;

    return (
      <button
        key={ymd}
        type="button"
        disabled={disabled}
        className={[
          'billing-day-cell',
          isSelected ? 'selected' : '',
          options?.muted ? 'outside-month' : '',
          disabled ? 'outside-range' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          background:
            !disabled && totals.open > 0
              ? `color-mix(in srgb, #f59e0b ${Math.round(18 + intensity * 42)}%, white)`
              : undefined,
        }}
        onClick={() => {
          if (disabled) return;
          setSelectedDay((prev) => (prev === ymd ? null : ymd));
          if (statusFilter === 'billed' && totals.open > 0) setStatusFilter('unbilled');
        }}
        title={`Avoin ${formatEuro(totals.open)} · Laskutettu ${formatEuro(totals.billed)}`}
      >
        <span className="billing-day-num">{day.getDate()}</span>
        {!disabled && totals.open > 0 && (
          <span className="billing-day-amount">{formatEuro(totals.open)}</span>
        )}
      </button>
    );
  }

  const weekLabel = calendarRangeLabel;

  async function copyBillingText(row: BillingListRow) {
    setError(null);
    setMessage(null);
    setBusyId(row.id);
    try {
      const text = await loadBillingCopyText(supabase, row, rowBillingMode(row));
      await navigator.clipboard.writeText(text);
      setMessage('Laskutusteksti kopioitu leikepöydälle.');
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Kopiointi epäonnistui.');
    } finally {
      setBusyId(null);
    }
  }

  async function markBilled(row: BillingListRow) {
    setError(null);
    setMessage(null);
    setBusyId(row.id);
    try {
      const mode = rowBillingMode(row);
      if (mode === 'customer') {
        await markCustomerReportBilled(supabase, row.id);
        setMessage(`Merkitty laskutetuksi asiakkaalta: ${row.title}`);
      } else {
        const wasPartial = billingPartnerState(row) === 'partial';
        await markPartnerReportBilled(supabase, row.id);
        setMessage(
          wasPartial
            ? `Avoin summa merkitty laskutetuksi: ${row.title}`
            : `Merkitty laskutetuksi: ${row.title}`,
        );
      }
      await load(billingMode);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Merkitseminen epäonnistui.');
    } finally {
      setBusyId(null);
    }
  }

  async function unmarkBilled(row: BillingListRow) {
    const mode = rowBillingMode(row);
    if (mode === 'customer') {
      if (!window.confirm('Palautetaanko asiakaslaskutus avoimeksi?')) return;
    } else {
      const amounts = resolvePartnerBillingAmounts(
        billingRowAmount(row, 'partner'),
        row.billing?.partner_billed_amount,
        row.billing?.partner_invoice_status,
      );
      const confirmMessage =
        amounts.state === 'partial'
          ? 'Poistetaanko kaikki laskutetut merkinnät? Raportti palaa kokonaan avoimeksi.'
          : 'Palautetaanko raportti avoimeksi? Laskutettu-merkintä poistetaan.';
      if (!window.confirm(confirmMessage)) return;
    }

    setError(null);
    setMessage(null);
    setBusyId(row.id);
    try {
      if (mode === 'customer') {
        await unmarkCustomerReportBilled(supabase, row.id);
        setMessage(`Asiakaslaskutus peruttu: ${row.title}`);
      } else {
        await unmarkPartnerReportBilled(supabase, row.id);
        setMessage(`Laskutettu-merkintä peruttu: ${row.title}`);
      }
      await load(billingMode);
    } catch (unmarkError) {
      setError(unmarkError instanceof Error ? unmarkError.message : 'Peruminen epäonnistui.');
    } finally {
      setBusyId(null);
    }
  }

  const pageDisabled = billingModuleEnabled === false;
  const customerModeActive = billingMode === 'customer';
  const partnerModeActive = billingMode === 'partner';
  const totalModeActive = billingMode === 'total';

  const showPartnerBillingModes = partnershipsEnabled !== false;

  const billingModeLabel =
    billingMode === 'customer'
      ? 'asiakaslaskutus omista työraporteista'
      : billingMode === 'partner'
        ? 'kumppanilaskutus työraporteista'
        : 'asiakas- ja kumppanilaskutus yhteensä';

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Laskutus
          </p>
          <h1>Laskutettavat</h1>
          <p className="muted">
            {profile?.companies?.name ?? '—'} • {billingModeLabel}
          </p>
        </div>
      </div>

      {pageDisabled ? (
        <section className="panel">
          <p className="muted">
            Laskutusmoduuli ei ole käytössä tälle yritykselle. Ota yhteys järjestelmän ylläpitoon, jos tarvitset moduulin käyttöön.
          </p>
          <p>
            <Link to="/">Palaa etusivulle</Link>
          </p>
        </section>
      ) : (
        <div className="billing-page">
          <div className="billing-toolbar panel" style={{ marginBottom: '1rem' }}>
            <div className="billing-filter-pills">
              {showPartnerBillingModes && (
                <button
                  type="button"
                  className={totalModeActive ? 'billing-pill active' : 'billing-pill'}
                  onClick={() => {
                    setBillingMode('total');
                    setPartnerFilter('');
                    setCustomerFilter('');
                    setSelectedDay(null);
                  }}
                >
                  Yhteensä
                </button>
              )}
              <button
                type="button"
                className={customerModeActive ? 'billing-pill active' : 'billing-pill'}
                onClick={() => {
                  setBillingMode('customer');
                  setPartnerFilter('');
                  setCustomerFilter('');
                  setSelectedDay(null);
                }}
              >
                Omat asiakkaat
              </button>
              {showPartnerBillingModes && billingEnabled === true && (
                <button
                  type="button"
                  className={partnerModeActive ? 'billing-pill active' : 'billing-pill'}
                  onClick={() => {
                    setBillingMode('partner');
                    setPartnerFilter('');
                    setCustomerFilter('');
                    setSelectedDay(null);
                  }}
                >
                  Kumppanit
                </button>
              )}
            </div>
          </div>

          {partnerModeActive && billingEnabled === false ? (
            <p className="muted panel" style={{ marginBottom: '1rem' }}>
              Käyttäjien laskutusasetukset (tunnit/kulut) vaikuttavat laskurivien sisältöön. Kumppanin
              laskutusmoduuli ei vaikuta — lasket mitä kumppanille laskutat omista työraporteistasi.
              Tarvittaessa ota tunnit tai kulut mukaan kohdassa{' '}
              <Link to="/hallinta/kayttajat">Hallinta → Käyttäjät</Link>.
            </p>
          ) : null}
          <>
          <div className="billing-summary-grid">
            <article className="billing-stat-card billing-stat-open">
              <span className="billing-stat-label">Laskuttamatta</span>
              <strong className="billing-stat-value">
                {moduleEnabled ? formatEuro(summary.openTotal) : '—'}
              </strong>
              {moduleEnabled && (
                <p className="billing-stat-meta">
                  Työ {formatEuro(summary.openWork)} • Kulut / urakat {formatEuro(summary.openMaterials)}
                </p>
              )}
              <span className="billing-stat-count">{summary.openCount} raporttia</span>
            </article>
            <article className="billing-stat-card billing-stat-billed">
              <span className="billing-stat-label">Laskutettu</span>
              <strong className="billing-stat-value">
                {moduleEnabled ? formatEuro(summary.billedTotal) : '—'}
              </strong>
              <span className="billing-stat-count">{summary.billedCount} raporttia</span>
            </article>
            <article className="billing-stat-card billing-stat-total">
              <span className="billing-stat-label">Yhteensä</span>
              <strong className="billing-stat-value">
                {moduleEnabled ? formatEuro(summary.grandTotal) : '—'}
              </strong>
              <span className="billing-stat-count">{summary.totalCount} raporttia</span>
            </article>
          </div>


          {recalcState ? (
            <div className="billing-recalc-banner panel" role="status" aria-live="polite">
              <span className="billing-recalc-spinner" aria-hidden="true" />
              <div>
                <strong>Päivitetään vanhentuneita kumppanilaskelmia</strong>
                <p className="muted billing-recalc-meta">
                  {recalcState.done} / {recalcState.total} valmis — vain muuttuneet raportit, ei kaikkia vanhoja.
                </p>
              </div>
            </div>
          ) : null}

          <div className="billing-toolbar panel">
            <div className="billing-filter-pills">
              <button
                type="button"
                className={statusFilter === 'unbilled' ? 'billing-pill active' : 'billing-pill'}
                onClick={() => {
                  setStatusFilter('unbilled');
                  setSelectedDay(null);
                }}
              >
                Avoimet
              </button>
              <button
                type="button"
                className={statusFilter === 'billed' ? 'billing-pill active' : 'billing-pill'}
                onClick={() => {
                  setStatusFilter('billed');
                  setSelectedDay(null);
                }}
              >
                Laskutettu
              </button>
              <button
                type="button"
                className={statusFilter === 'all' ? 'billing-pill active' : 'billing-pill'}
                onClick={() => {
                  setStatusFilter('all');
                  setSelectedDay(null);
                }}
              >
                Kaikki
              </button>
            </div>
            <div className="billing-toolbar-right">
              <div className="tabs billing-view-tabs">
                <button
                  type="button"
                  className={tab === 'list' ? 'tab active' : 'tab'}
                  onClick={() => setTab('list')}
                >
                  Lista
                </button>
                <button
                  type="button"
                  className={tab === 'calendar' ? 'tab active' : 'tab'}
                  onClick={() => setTab('calendar')}
                >
                  Kalenteri
                </button>
              </div>
              <label>
                {billingMode === 'customer' ? 'Asiakas' : 'Kumppani'}
                <select
                  value={billingMode === 'customer' ? customerFilter : partnerFilter}
                  onChange={(event) => {
                    if (billingMode === 'customer') {
                      setCustomerFilter(event.target.value);
                    } else {
                      setPartnerFilter(event.target.value);
                    }
                    setSelectedDay(null);
                  }}
                >
                  <option value="">
                    {billingMode === 'customer'
                      ? `Kaikki asiakkaat (${rows.length})`
                      : `Kaikki kumppanit (${rows.length})`}
                  </option>
                  {(billingMode === 'customer' ? customers : partners).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ({entry.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {message && <p className="billing-toast">{message}</p>}

          {tab === 'calendar' && (
            <section className="panel billing-calendar-panel">
              <div className="billing-calendar-head">
                <h2>Laskutus kalenterissa</h2>
                <span className="muted">{weekLabel}</span>
              </div>

              <div className="billing-calendar-controls">
                <div className="billing-filter-pills">
                  <button
                    type="button"
                    className={calendarPeriod === 'this_week' ? 'billing-pill active' : 'billing-pill'}
                    onClick={() => applyCalendarPeriod('this_week')}
                  >
                    Tämä viikko
                  </button>
                  <button
                    type="button"
                    className={calendarPeriod === 'this_month' ? 'billing-pill active' : 'billing-pill'}
                    onClick={() => applyCalendarPeriod('this_month')}
                  >
                    Tämä kuukausi
                  </button>
                  <button
                    type="button"
                    className={calendarPeriod === 'this_year' ? 'billing-pill active' : 'billing-pill'}
                    onClick={() => applyCalendarPeriod('this_year')}
                  >
                    Tämä vuosi
                  </button>
                  <button
                    type="button"
                    className={calendarPeriod === 'custom' ? 'billing-pill active' : 'billing-pill'}
                    onClick={() => applyCalendarPeriod('custom')}
                  >
                    Valitse aikaväli
                  </button>
                </div>

                {calendarPeriod !== 'this_year' && (
                  <div className="billing-filter-pills">
                    <button
                      type="button"
                      className={calendarLayout === 'week' ? 'billing-pill active' : 'billing-pill'}
                      onClick={() => {
                        setCalendarLayout('week');
                        setRangeAnchor(startOfWeek(rangeAnchor));
                        setSelectedDay(null);
                      }}
                    >
                      Viikko
                    </button>
                    <button
                      type="button"
                      className={calendarLayout === 'month' ? 'billing-pill active' : 'billing-pill'}
                      onClick={() => {
                        setCalendarLayout('month');
                        setRangeAnchor(startOfMonth(rangeAnchor));
                        setSelectedDay(null);
                      }}
                    >
                      Kuukausi
                    </button>
                  </div>
                )}
              </div>

              {calendarPeriod === 'custom' && (
                <div className="billing-custom-range line-form-grid">
                  <label>
                    Alku
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => {
                        setCustomFrom(e.target.value);
                        setSelectedDay(null);
                      }}
                    />
                  </label>
                  <label>
                    Loppu
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => {
                        setCustomTo(e.target.value);
                        setSelectedDay(null);
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="calendar-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={calendarPeriod === 'custom'}
                  onClick={goToPreviousRange}
                >
                  ← Edellinen
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={goToCurrentRange}>
                  {calendarPeriod === 'this_week' && 'Tämä viikko'}
                  {calendarPeriod === 'this_month' && 'Tämä kuukausi'}
                  {calendarPeriod === 'this_year' && 'Tämä vuosi'}
                  {calendarPeriod === 'custom' && 'Nykyinen jakso'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={calendarPeriod === 'custom'}
                  onClick={goToNextRange}
                >
                  Seuraava →
                </button>
              </div>

              {calendarPeriod === 'this_year' ? (
                <div className="billing-year-grid">
                  {yearMonthTotals.map(({ label, monthIndex, open, billed }) => {
                    const intensity = maxOpenInYear > 0 ? Math.min(1, open / maxOpenInYear) : 0;
                    const isCurrentMonth =
                      monthIndex === new Date().getMonth()
                      && rangeAnchor.getFullYear() === new Date().getFullYear();
                    return (
                      <button
                        key={label}
                        type="button"
                        className="billing-month-summary-cell"
                        style={{
                          background:
                            open > 0
                              ? `color-mix(in srgb, #f59e0b ${Math.round(18 + intensity * 42)}%, white)`
                              : undefined,
                        }}
                        onClick={() => {
                          setCalendarPeriod('this_month');
                          setCalendarLayout('month');
                          setRangeAnchor(startOfMonth(new Date(rangeAnchor.getFullYear(), monthIndex, 1)));
                          setSelectedDay(null);
                        }}
                        title={`Avoin ${formatEuro(open)} · Laskutettu ${formatEuro(billed)}`}
                      >
                        <span className="billing-month-label">
                          {label}
                          {isCurrentMonth ? ' •' : ''}
                        </span>
                        {open > 0 ? (
                          <span className="billing-day-amount">{formatEuro(open)}</span>
                        ) : (
                          <span className="muted billing-month-empty">—</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="billing-weekday-row">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={label}>{label}</div>
                    ))}
                  </div>
                  <div
                    className={
                      calendarLayout === 'month' || calendarPeriod === 'custom'
                        ? 'billing-heatmap-row billing-month-grid'
                        : 'billing-heatmap-row'
                    }
                  >
                    {calendarDays.map((day) => {
                      const inCustomRange = isDayInCustomRange(day);
                      return renderDayCell(day, {
                        muted:
                          calendarPeriod === 'this_month'
                          && day.getMonth() !== activeMonth,
                        disabled: calendarPeriod === 'custom' && !inCustomRange,
                      });
                    })}
                  </div>
                </>
              )}

              {selectedDay && (
                <p className="billing-day-filter-note">
                  Näytetään vain {formatDate(selectedDay)}.{' '}
                  <button type="button" className="link-btn" onClick={() => setSelectedDay(null)}>
                    Poista suodatin
                  </button>
                </p>
              )}
            </section>
          )}

          {loading ? (
            <section className="panel billing-empty-state">Ladataan raporttilistaa…</section>
          ) : filteredRows.length === 0 ? (
            <section className="panel billing-empty-state">
              Ei laskutettavia työraportteja valituilla suodattimilla.
            </section>
          ) : (
            <div className="billing-card-list">
              {filteredRows.map((row) => (
                <BillingReportCard
                  key={row.id}
                  row={row}
                  mode={rowBillingMode(row)}
                  pageMode={billingMode}
                  billingEnabled={moduleEnabled ?? false}
                  busy={busyId === row.id}
                  isRecalculating={recalculatingIds.has(row.id)}
                  viewerCompanyId={profile?.company_id}
                  onCopy={() => void copyBillingText(row)}
                  onMarkBilled={() => void markBilled(row)}
                  onUnmarkBilled={() => void unmarkBilled(row)}
                  onRecalcPartner={
                    canViewerRecalcPartnerBill(row, profile?.company_id)
                      ? () => void recalcPartnerRow(row.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
          </>
        </div>
      )}
    </AppLayout>
  );
}

function BillingReportCard({
  row,
  mode,
  pageMode,
  billingEnabled,
  busy,
  isRecalculating,
  onCopy,
  onMarkBilled,
  onUnmarkBilled,
  onRecalcPartner,
  viewerCompanyId,
}: {
  row: BillingListRow;
  mode: 'partner' | 'customer';
  pageMode: BillingModuleMode;
  billingEnabled: boolean;
  busy: boolean;
  isRecalculating: boolean;
  onCopy: () => void;
  onMarkBilled: () => void;
  onUnmarkBilled: () => void;
  onRecalcPartner?: () => void;
  viewerCompanyId?: string | null;
}) {
  const breakdown = billingRowBreakdown(row, mode);
  const amounts =
    mode === 'customer'
      ? {
          total: breakdown.total,
          billed: billingRowBilledAmount(row, mode),
          open: billingRowState(row, mode) === 'billed' ? 0 : breakdown.total,
          state: billingRowState(row, mode),
        }
      : resolvePartnerBillingAmounts(
          breakdown.total,
          row.billing?.partner_billed_amount,
          row.billing?.partner_invoice_status,
        );
  const statusLabel = billingPartnerStatusLabel(amounts.state);
  const reportStatus = getWorkStatusLabel(row.status);
  const badgeClass =
    amounts.state === 'billed'
      ? 'completed'
      : amounts.state === 'partial'
        ? 'in_progress'
        : 'scheduled';
  const hasCalculation = billingRowHasStoredCalculation(row, mode);
  const calculatedAtLabel = row.billable?.calculated_at
    ? formatDateTime(row.billable.calculated_at)
    : null;

  return (
    <article className={`billing-report-card panel${isRecalculating ? ' billing-report-card-recalculating' : ''}`}>
      <div className="billing-report-main">
        <div className="billing-report-copy">
          <div className="billing-report-title-row">
            <Link to={`/tyoraportit/${row.id}`} className="billing-report-title">
              {row.title}
            </Link>
            <span className={`badge badge-${badgeClass}`}>{statusLabel}</span>
            <span className="badge badge-draft">{reportStatus}</span>
            {billingEnabled && isRecalculating ? (
              <span className="billing-calc-badge billing-calc-badge-updating">Lasketaan…</span>
            ) : billingEnabled && hasCalculation ? (
              <span className="billing-calc-badge billing-calc-badge-ready" title={calculatedAtLabel ?? undefined}>
                Laskettu{calculatedAtLabel ? ` · ${calculatedAtLabel}` : ''}
              </span>
            ) : billingEnabled && billingRowNeedsPartnerRecalc(row) ? (
              <span className="billing-calc-badge billing-calc-badge-none">Päivitettävä</span>
            ) : billingEnabled ? (
              <span className="billing-calc-badge billing-calc-badge-none">Ei laskettu</span>
            ) : null}
          </div>
          <p className="billing-report-meta">
            <strong>{pageMode === 'total' ? 'Tyyppi' : mode === 'customer' ? 'Asiakas' : 'Kumppani'}:</strong>{' '}
            {pageMode === 'total'
              ? mode === 'customer'
                ? `Oma asiakas · ${billToCustomerName(row)}`
                : `Kumppani · ${billToPartnerName(row, viewerCompanyId)}`
              : mode === 'customer'
                ? billToCustomerName(row)
                : billToPartnerName(row, viewerCompanyId)}
          </p>
          {mode === 'partner' && row.customers?.name && (
            <p className="billing-report-meta">
              <strong>Asiakas:</strong> {row.customers.name}
            </p>
          )}
          <p className="billing-report-meta">
            <strong>Päivä:</strong> {formatDate(billingRowDate(row).toISOString().slice(0, 10))}
          </p>
        </div>

        {billingEnabled && (
          <aside className="billing-report-summary">
            <h3>Yhteenveto</h3>
            {isRecalculating ? (
              <p className="muted billing-report-summary-pending">Päivitetään laskelmaa…</p>
            ) : (
            <dl>
              <div>
                <dt>Työ</dt>
                <dd>{formatEuro(breakdown.work)}</dd>
              </div>
              <div>
                <dt>Kulut / urakat</dt>
                <dd>{formatEuro(breakdown.materials)}</dd>
              </div>
              <div className="billing-report-total">
                <dt>{amounts.state === 'partial' ? 'Avoinna' : 'Yhteensä'}</dt>
                <dd>{formatEuro(amounts.state === 'partial' ? amounts.open : breakdown.total)}</dd>
              </div>
              {amounts.state === 'partial' && (
                <div>
                  <dt>Laskutettu</dt>
                  <dd>{formatEuro(amounts.billed)}</dd>
                </div>
              )}
            </dl>
            )}
          </aside>
        )}
      </div>

      <div className="billing-report-actions">
        {onRecalcPartner && billingEnabled && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || isRecalculating}
            onClick={onRecalcPartner}
          >
            {isRecalculating ? 'Lasketaan…' : 'Päivitä laskelma'}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onCopy}>
          Kopioi laskutusteksti
        </button>
        {(mode === 'customer' ? amounts.state !== 'billed' : amounts.open > 0.005) && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onMarkBilled}>
            {amounts.state === 'partial' ? 'Merkitse avoin laskutetuksi' : 'Merkitse laskutetuksi'}
          </button>
        )}
        {amounts.billed > 0.005 && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onUnmarkBilled}>
            Peru laskutettu
          </button>
        )}
        <Link to={`/tyoraportit/${row.id}`} className="btn btn-secondary btn-sm">
          Avaa raportti
        </Link>
      </div>
    </article>
  );
}
