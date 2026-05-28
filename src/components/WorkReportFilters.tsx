import { useEffect, useRef, useState } from 'react';
import { IconFilter } from './icons';
import Tooltip from './Tooltip';

export type WorkReportFilterOptions = {
  branding: Array<{ id: string; label: string }>;
  people: Array<{ id: string; label: string }>;
  customers: Array<{ id: string; label: string }>;
};

export const WORK_REPORT_PERSON_ME = '__me__';

type Props = {
  brandingId: string;
  personId: string;
  customerId: string;
  onBrandingChange: (value: string) => void;
  onPersonChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  options: WorkReportFilterOptions;
  hasActiveFilters: boolean;
  onClear: () => void;
};

export default function WorkReportFilters({
  brandingId,
  personId,
  customerId,
  onBrandingChange,
  onPersonChange,
  onCustomerChange,
  options,
  hasActiveFilters,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const activeCount = [brandingId, personId, customerId].filter(Boolean).length;

  return (
    <div className="toolbar-popover-anchor" ref={rootRef}>
      <Tooltip
        side="bottom"
        label={
          hasActiveFilters
            ? `Suodattimet (${activeCount} aktiivinen) — avaa valinta`
            : 'Suodattimet — avaa valinta'
        }
        touchHelp={false}
      >
        <button
          type="button"
          className={`icon-btn${hasActiveFilters ? ' icon-btn-active' : ''}`}
          aria-label="Suodattimet"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <IconFilter />
          {hasActiveFilters && <span className="icon-btn-badge" aria-hidden="true" />}
        </button>
      </Tooltip>

      {open && (
        <div className="toolbar-popover-panel toolbar-filter-popover" role="dialog" aria-label="Suodattimet">
          <p className="toolbar-filter-popover-title">Suodata listaa</p>

          <label>
            Yritys
            <select value={brandingId} onChange={(e) => onBrandingChange(e.target.value)}>
              <option value="">Kaikki</option>
              {options.branding.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="muted toolbar-filter-hint">
              Näytä vain raportit, jotka on tehty valitun yrityksen nimissä.
            </span>
          </label>

          <label>
            Henkilö
            <select value={personId} onChange={(e) => onPersonChange(e.target.value)}>
              <option value="">Kaikki</option>
              <option value={WORK_REPORT_PERSON_ME}>Minä</option>
              {options.people.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="muted toolbar-filter-hint">
              Minä = sinulle osoitetut tai itse laatimasi raportit.
            </span>
          </label>

          <label>
            Asiakas
            <select value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">Kaikki</option>
              {options.customers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary btn-sm toolbar-filter-popover-clear" onClick={onClear}>
              Poista suodattimet
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function buildWorkReportFilterOptions(
  reports: Array<{
    branding_company_id: string;
    branding_company: { name: string } | null;
    created_by_user_id: string | null;
    created_by_user: { display_name: string | null; email: string | null } | null;
    assigned_user_id: string | null;
    assigned_user: { display_name: string | null } | null;
    customer_id: string | null;
    customers: { name: string } | null;
  }>,
): WorkReportFilterOptions {
  const branding = new Map<string, string>();
  const people = new Map<string, string>();
  const customers = new Map<string, string>();

  const addPerson = (userId: string | null | undefined, label: string | null | undefined) => {
    if (!userId || !label?.trim()) return;
    people.set(userId, label.trim());
  };

  for (const report of reports) {
    const brandingLabel = report.branding_company?.name?.trim();
    if (brandingLabel) branding.set(report.branding_company_id, brandingLabel);

    addPerson(
      report.created_by_user_id,
      report.created_by_user?.display_name?.trim() || report.created_by_user?.email?.trim(),
    );
    addPerson(report.assigned_user_id, report.assigned_user?.display_name?.trim());

    if (report.customer_id && report.customers?.name?.trim()) {
      customers.set(report.customer_id, report.customers.name.trim());
    }
  }

  const sortByLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, 'fi');

  return {
    branding: [...branding.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort(sortByLabel),
    people: [...people.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort(sortByLabel),
    customers: [...customers.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort(sortByLabel),
  };
}

export function matchesWorkReportFilters(
  report: {
    branding_company_id: string;
    created_by_user_id: string | null;
    assigned_user_id: string | null;
    customer_id: string | null;
  },
  filters: { brandingId: string; personId: string; customerId: string },
  currentUserId?: string,
): boolean {
  if (filters.brandingId && report.branding_company_id !== filters.brandingId) return false;

  if (filters.personId === WORK_REPORT_PERSON_ME) {
    if (!currentUserId) return false;
    if (report.assigned_user_id !== currentUserId && report.created_by_user_id !== currentUserId) {
      return false;
    }
  } else if (filters.personId) {
    if (
      report.assigned_user_id !== filters.personId
      && report.created_by_user_id !== filters.personId
    ) {
      return false;
    }
  }

  if (filters.customerId && report.customer_id !== filters.customerId) return false;
  return true;
}
