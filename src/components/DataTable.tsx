import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export type DataTableColumn<T> = {
  key: string;
  label: string;
  /** Lajittelu- ja hakuarvo. */
  value: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | null;
  rowState?: (row: T) => unknown;
  /** Toimintopainikkeet viimeiseen sarakkeeseen (eivät avaa riviä). */
  actions?: (row: T) => ReactNode;
  /** Piilota oma hakukenttä (sivulla on jo haku). */
  hideFilter?: boolean;
  filterPlaceholder?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyText?: string;
  ariaLabel?: string;
};

export function compareTableValues(a: unknown, b: unknown): number {
  const an = a == null || a === '';
  const bn = b == null || b === '';
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fi', { numeric: true, sensitivity: 'base' });
}

export function filterAndSortRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  query: string,
  sort: { key: string; dir: 'asc' | 'desc' } | null,
): T[] {
  const q = query.trim().toLowerCase();
  let out = q
    ? rows.filter((r) => columns.some((c) => String(c.value(r) ?? '').toLowerCase().includes(q)))
    : rows.slice();
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
  if (col && sort) {
    const m = sort.dir === 'asc' ? 1 : -1;
    out = out
      .map((r, i) => ({ r, i }))
      .sort((x, y) => {
        const va = col.value(x.r);
        const vb = col.value(y.r);
        const empties = (va == null || va === '') !== (vb == null || vb === '');
        const c = compareTableValues(va, vb);
        return (empties ? c : c * m) || x.i - y.i;
      })
      .map((x) => x.r);
  }
  return out;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || v === '—';
}

function cellClass<T>(c: DataTableColumn<T>, row: T): string | undefined {
  const parts = [c.className, !c.render && isEmpty(c.value(row)) ? 'data-table-empty-cell' : null].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** Täysleveä, hillitty taulukkolista: lajiteltavat otsikot, haku, koko rivi klikattava. */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  rowState,
  actions,
  hideFilter,
  filterPlaceholder = 'Suodata…',
  initialSort,
  emptyText = 'Ei rivejä.',
  ariaLabel,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const visible = useMemo(() => filterAndSortRows(rows, columns, query, sort), [rows, columns, query, sort]);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const open = (row: T, e: MouseEvent) => {
    const href = rowHref?.(row);
    if (!href) return;
    if ((e.target as HTMLElement).closest('a,button,input,select,label,.data-table-actions')) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank');
      return;
    }
    navigate(href, { state: rowState?.(row) });
  };

  return (
    <div className="data-table-block">
      {!hideFilter && rows.length > 5 ? (
        <input
          type="search"
          className="data-table-filter"
          placeholder={filterPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Suodata listaa"
        />
      ) : null}
      <div className="data-table-scroll">
        <table className="data-table" aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    className={c.className}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button type="button" className="data-table-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        <span className="data-table-sort-mark" aria-hidden="true">
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              {actions ? <th className="data-table-actions-col" aria-label="Toiminnot" /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={href ? 'data-table-row-link' : undefined}
                  onClick={(e) => open(row, e)}
                  tabIndex={href ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (href && e.key === 'Enter' && e.target === e.currentTarget) navigate(href, { state: rowState?.(row) });
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cellClass(c, row)} data-label={c.label}>
                      {c.render ? c.render(row) : (isEmpty(c.value(row)) ? '—' : c.value(row))}
                    </td>
                  ))}
                  {actions ? (
                    <td className="data-table-actions-col">
                      <div className="data-table-actions">{actions(row)}</div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="muted">{emptyText}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusMark({ color, label }: { color: string; label: string }) {
  return (
    <span className="status-mark">
      <span className="status-mark-dot" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
