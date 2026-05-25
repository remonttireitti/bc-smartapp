import { Link } from 'react-router-dom';
import {
  CALENDAR_DAY_END_MINUTES,
  CALENDAR_DAY_START_MINUTES,
  CALENDAR_EVENT_COLORS,
  calendarDayEntryCount,
  formatTimeRange,
  layoutCalendarDayEvents,
  type WorkReportCalendarEvent,
} from '../lib/workReportCalendar';
import { WORK_STATUS_LABELS } from '../types';

type Props = {
  dayYmd: string;
  events: WorkReportCalendarEvent[];
  compact?: boolean;
};

function eventColorStyle(colorIndex: number) {
  const palette = CALENDAR_EVENT_COLORS[colorIndex % CALENDAR_EVENT_COLORS.length];
  return {
    background: palette.bg,
    borderColor: palette.border,
    color: palette.accent,
  } as const;
}

function CalendarEventTooltip({ text }: { text: string }) {
  return (
    <span className="calendar-event-tooltip" role="tooltip">
      {text.split('\n').map((line, index) => (
        <span key={`${line}-${index}`} className="calendar-event-tooltip-line">
          {line}
        </span>
      ))}
    </span>
  );
}

export default function WorkReportCalendarTimeline({ dayYmd, events, compact = false }: Props) {
  const dayEvents = layoutCalendarDayEvents(events.filter((event) => event.dayYmd === dayYmd));

  if (dayEvents.length === 0) {
    return <span className="muted">{compact ? '' : '—'}</span>;
  }

  if (compact) {
    return (
      <div className="calendar-month-events">
        {dayEvents.map((event) => (
          <Link
            key={event.id}
            to={`/tyoraportit/${event.reportId}`}
            className={`calendar-month-block kind-${event.kind} status-${event.status}`}
            style={{
              top: event.layout.top,
              height: event.layout.height,
              left: event.layout.left,
              width: event.layout.width,
              ...eventColorStyle(event.layout.colorIndex),
            }}
            title={event.tooltip}
            aria-label={event.tooltip.replace('\n', '. ')}
          >
            <span className="calendar-month-block-label">
              {formatTimeRange(event.startMinutes, event.durationMinutes)} · {event.title}
            </span>
            <CalendarEventTooltip text={event.tooltip} />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="calendar-timeline">
      <div className="calendar-timeline-axis" aria-hidden="true">
        <span>07</span>
        <span>12</span>
        <span>17</span>
      </div>
      <div className="calendar-timeline-track">
        {dayEvents.map((event) => (
          <Link
            key={event.id}
            to={`/tyoraportit/${event.reportId}`}
            className={`calendar-timeline-event kind-${event.kind} status-${event.status}`}
            style={{
              top: event.layout.top,
              height: event.layout.height,
              left: event.layout.left,
              width: event.layout.width,
              ...eventColorStyle(event.layout.colorIndex),
            }}
            title={event.tooltip}
            aria-label={event.tooltip.replace('\n', '. ')}
          >
            <strong>{event.title}</strong>
            <span>
              {formatTimeRange(event.startMinutes, event.durationMinutes)} ·{' '}
              {WORK_STATUS_LABELS[event.status]}
            </span>
            <span className="calendar-timeline-meta">
              {event.report.customers?.name ?? event.report.location_text ?? '—'}
            </span>
            <CalendarEventTooltip text={event.tooltip} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function calendarDayHoursLabel(events: WorkReportCalendarEvent[], dayYmd: string) {
  const minutes = events
    .filter((event) => event.dayYmd === dayYmd)
    .reduce((sum, event) => sum + event.durationMinutes, 0);
  if (minutes <= 0) return null;
  const hours = (minutes / 60).toFixed(1).replace(/\.0$/, '');
  const count = calendarDayEntryCount(events, dayYmd);
  if (count > 1) return `${hours} h · ${count} työtä`;
  return `${hours} h`;
}

export { CALENDAR_DAY_START_MINUTES, CALENDAR_DAY_END_MINUTES };
