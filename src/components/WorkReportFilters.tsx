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
  return (
    <div className="toolbar-filters">
      <Tooltip side="bottom" label="Näytä vain raportit, jotka on tehty valitun yrityksen nimissä.">
        <label className="toolbar-filter">
          <span className="toolbar-filter-prefix" aria-hidden="true">
            Yritys
          </span>
          <select value={brandingId} onChange={(e) => onBrandingChange(e.target.value)}>
            <option value="">Kaikki</option>
            {options.branding.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </Tooltip>

      <Tooltip
        side="bottom"
        label="Suodata tekijän tai laatijan mukaan. Minä = sinulle osoitetut tai itse laatimasi raportit."
      >
        <label className="toolbar-filter">
          <span className="toolbar-filter-prefix" aria-hidden="true">
            Henkilö
          </span>
          <select value={personId} onChange={(e) => onPersonChange(e.target.value)}>
            <option value="">Kaikki</option>
            <option value={WORK_REPORT_PERSON_ME}>Minä</option>
            {options.people.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </Tooltip>

      <Tooltip side="bottom" label="Näytä vain valitun asiakkaan työraportit.">
        <label className="toolbar-filter">
          <span className="toolbar-filter-prefix" aria-hidden="true">
            Asiakas
          </span>
          <select value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
            <option value="">Kaikki</option>
            {options.customers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </Tooltip>

      {hasActiveFilters && (
        <Tooltip side="bottom" label="Poista kaikki suodattimet.">
          <button type="button" className="toolbar-filter-clear" onClick={onClear}>
            ×
          </button>
        </Tooltip>
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
