import type { WorkReportDailyLog } from '../types';
import { EXPENSE_TYPE_LABELS, HOUR_ENTRY_LABELS } from '../types';

export type DailyLogEntryTileKind = 'work' | 'expenses' | 'materials';

export const DAILY_LOG_ENTRY_TILE_COLORS: Record<DailyLogEntryTileKind, string> = {
  work: '#388E3C',
  expenses: '#D97706',
  materials: '#7C3AED',
};

export type DailyLogEntryTileDescriptor = {
  key: string;
  kind: DailyLogEntryTileKind;
  logId: string;
  title: string;
  subtitle: string;
};

const MATERIAL_EXPENSE_TYPES = new Set(['material', 'part']);

function truncate(text: string, max = 72): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function formatHours(log: WorkReportDailyLog): string {
  const total =
    Number(log.hours_regular ?? 0) + Number(log.hours_overtime ?? 0) + Number(log.hours_on_call ?? 0);
  return `${total.toFixed(2)} h`;
}

type BuildTilesOptions = {
  formatDate: (value: string) => string;
  logExpensesTotal: (log: WorkReportDailyLog) => number;
  showMoney: boolean;
};

export function buildDailyLogEntryTiles(
  log: WorkReportDailyLog,
  options: BuildTilesOptions,
): DailyLogEntryTileDescriptor[] {
  const { formatDate, logExpensesTotal, showMoney } = options;
  const dateLabel = formatDate(log.log_date);
  const tiles: DailyLogEntryTileDescriptor[] = [];

  const workSubtitleParts = [HOUR_ENTRY_LABELS[log.entry_type] ?? log.entry_type, formatHours(log)];
  if (log.work_done.trim()) {
    workSubtitleParts.push(truncate(log.work_done, 56));
  }

  tiles.push({
    key: `${log.id}:work`,
    kind: 'work',
    logId: log.id,
    title: `Työkirjaus · ${dateLabel}`,
    subtitle: workSubtitleParts.join(' · '),
  });

  const tripLegs = log.trip_legs ?? [];
  const tripKm = tripLegs.reduce((sum, leg) => sum + Number(leg.distance_km || 0), 0);
  const expenseLines = log.expense_lines ?? [];
  const expenseKulut = expenseLines.filter((line) => !MATERIAL_EXPENSE_TYPES.has(line.expense_type));
  const expenseTotal = logExpensesTotal(log);
  const kulutCount = expenseKulut.length + tripLegs.length;

  if (kulutCount > 0 || expenseTotal > 0.005 || tripKm > 0) {
    const subtitleParts: string[] = [];
    if (expenseTotal > 0.005 && showMoney) {
      subtitleParts.push(`${expenseTotal.toFixed(2)} €`);
    }
    if (tripKm > 0) {
      subtitleParts.push(`${tripKm.toFixed(1)} km`);
    }
    subtitleParts.push(`${kulutCount} riviä`);
    tiles.push({
      key: `${log.id}:expenses`,
      kind: 'expenses',
      logId: log.id,
      title: `Kulut · ${dateLabel}`,
      subtitle: subtitleParts.join(' · '),
    });
  }

  const materialLines = expenseLines.filter((line) => MATERIAL_EXPENSE_TYPES.has(line.expense_type));
  const refrigerantLines = log.refrigerant_lines ?? [];
  const tarvikeCount = materialLines.length + refrigerantLines.length;

  if (tarvikeCount > 0) {
    const subtitleParts: string[] = [`${tarvikeCount} riviä`];
    const firstMaterial = materialLines[0];
    if (firstMaterial) {
      subtitleParts.push(
        `${EXPENSE_TYPE_LABELS[firstMaterial.expense_type] ?? firstMaterial.expense_type}: ${firstMaterial.description}`,
      );
    } else if (refrigerantLines[0]) {
      subtitleParts.push(refrigerantLines[0].refrigerant_type ?? 'Kylmäaine');
    }
    tiles.push({
      key: `${log.id}:materials`,
      kind: 'materials',
      logId: log.id,
      title: `Tarvikkeet · ${dateLabel}`,
      subtitle: truncate(subtitleParts.join(' · '), 72),
    });
  }

  return tiles;
}

type TileProps = {
  descriptor: DailyLogEntryTileDescriptor;
  onClick: () => void;
  onDelete?: () => void;
};

export function DailyLogEntryTile({ descriptor, onClick, onDelete }: TileProps) {
  return (
    <div className={`work-report-entry-tile-wrap work-report-entry-tile-wrap--${descriptor.kind}`}>
      <button
        type="button"
        className={`tile work-report-entry-tile work-report-entry-tile--${descriptor.kind}`}
        style={{ background: DAILY_LOG_ENTRY_TILE_COLORS[descriptor.kind] }}
        onClick={onClick}
      >
        <strong>{descriptor.title}</strong>
        <span>{descriptor.subtitle}</span>
      </button>
      {descriptor.kind === 'work' && onDelete ? (
        <button type="button" className="btn btn-secondary btn-sm work-report-entry-tile-delete" onClick={onDelete}>
          Poista
        </button>
      ) : null}
    </div>
  );
}

export function DailyLogEntryTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid work-report-entry-grid">{children}</div>;
}
