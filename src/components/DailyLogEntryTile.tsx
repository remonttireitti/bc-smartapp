import type { WorkReportDailyLog } from '../types';
import { EXPENSE_TYPE_LABELS, HOUR_ENTRY_LABELS } from '../types';
import { deviceTileSubtitle } from '../lib/workReportDeviceEntries';

export type DailyLogEntryTileKind = 'work' | 'expenses' | 'materials' | 'device';

const KIND_LABELS: Record<DailyLogEntryTileKind, string> = {
  work: 'Työ',
  expenses: 'Kulut',
  materials: 'Tarvikkeet',
  device: 'Laite',
};

export const DAILY_LOG_ENTRY_TILE_COLORS: Record<DailyLogEntryTileKind, string> = {
  work: '#388E3C',
  expenses: '#D97706',
  materials: '#7C3AED',
  device: '#BE185D',
};

export type DailyLogEntryTileDescriptor = {
  key: string;
  kind: DailyLogEntryTileKind;
  logId: string;
  title: string;
  subtitle: string;
  /** suggested = esitäytetty tarjouspyynnöstä (ei vielä kirjattu), add = kevyt "+ Laite". */
  variant?: 'suggested' | 'add';
  /** Pieni merkintä, esim. "tarjouspyynnöstä". */
  marker?: string;
};

const MATERIAL_EXPENSE_TYPES = new Set(['material', 'part']);
const DEVICE_EXPENSE_TYPES = new Set(['device']);

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
  formatEuro?: (value: number) => string;
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
    title: dateLabel,
    subtitle: workSubtitleParts.join(' · '),
  });

  const tripLegs = log.trip_legs ?? [];
  const tripKm = tripLegs.reduce((sum, leg) => sum + Number(leg.distance_km || 0), 0);
  const expenseLines = log.expense_lines ?? [];
  const expenseKulut = expenseLines.filter(
    (line) => !MATERIAL_EXPENSE_TYPES.has(line.expense_type) && !DEVICE_EXPENSE_TYPES.has(line.expense_type),
  );
  const expenseTotal = logExpensesTotal(log);
  const kulutCount = expenseKulut.length + tripLegs.length;

  const onlyDeviceLines =
    expenseLines.length > 0 && expenseLines.every((line) => DEVICE_EXPENSE_TYPES.has(line.expense_type));
  if (kulutCount > 0 || (expenseTotal > 0.005 && !onlyDeviceLines) || tripKm > 0) {
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
      title: dateLabel,
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
      title: dateLabel,
      subtitle: truncate(subtitleParts.join(' · '), 72),
    });
  }

  const deviceSubtitle = deviceTileSubtitle(log, {
    showMoney: !!options.showMoney,
    formatEuro: options.formatEuro ?? ((value) => `${value.toFixed(2)} €`),
  });
  if (deviceSubtitle) {
    tiles.push({
      key: `${log.id}:device`,
      kind: 'device',
      logId: log.id,
      title: dateLabel,
      subtitle: truncate(deviceSubtitle, 72),
    });
  }

  return tiles;
}

type TileProps = {
  descriptor: DailyLogEntryTileDescriptor;
  onClick: () => void;
  disabled?: boolean;
};

export function DailyLogEntryTile({ descriptor, onClick, disabled = false }: TileProps) {
  const variantClass = descriptor.variant ? ` work-report-entry-tile--${descriptor.variant}` : '';
  const color = DAILY_LOG_ENTRY_TILE_COLORS[descriptor.kind];
  return (
    <button
      type="button"
      className={`tile work-report-entry-tile work-report-entry-tile--${descriptor.kind}${variantClass}`}
      style={
        descriptor.variant === 'add'
          ? { borderColor: color, color }
          : descriptor.variant === 'suggested'
            ? { background: color }
            : { background: color }
      }
      onClick={onClick}
      disabled={disabled}
    >
      <span className="work-report-entry-tile-kind">
        {KIND_LABELS[descriptor.kind]}
        {descriptor.marker ? <span className="work-report-entry-tile-marker">{descriptor.marker}</span> : null}
      </span>
      <strong>{descriptor.title}</strong>
      {descriptor.subtitle ? <span className="work-report-entry-tile-meta">{descriptor.subtitle}</span> : null}
    </button>
  );
}

export function DailyLogEntryTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid work-report-entry-grid">{children}</div>;
}
