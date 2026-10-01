export type VrfTrendHoverRow = {
  color?: string;
  label: string;
  value: string;
  /** Lisätieto arvon perään, esim. aikaikkunan min–max. */
  detail?: string;
};

type Props = {
  leftPct: number;
  timeLabel: string;
  rows: VrfTrendHoverRow[];
  footer?: string;
};

export default function VrfTrendHoverTip({ leftPct, timeLabel, rows, footer }: Props) {
  const clampedLeft = Math.min(94, Math.max(6, leftPct));

  return (
    <div className="vrf-trend-hover-tip" style={{ left: `${clampedLeft}%` }}>
      <p className="vrf-trend-hover-tip-time">{timeLabel}</p>
      <ul className="vrf-trend-hover-tip-rows">
        {rows.map((row) => (
          <li key={row.label}>
            {row.color ? (
              <span className="vrf-trend-hover-tip-dot" style={{ background: row.color }} aria-hidden="true" />
            ) : null}
            <span className="vrf-trend-hover-tip-label">{row.label}</span>
            <strong>
              {row.value}
              {row.detail ? <span className="vrf-trend-hover-tip-detail"> {row.detail}</span> : null}
            </strong>
          </li>
        ))}
      </ul>
      {footer ? <p className="vrf-trend-hover-tip-footer">{footer}</p> : null}
    </div>
  );
}
