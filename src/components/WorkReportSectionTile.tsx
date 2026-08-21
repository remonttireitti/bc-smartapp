type Props = {
  title: string;
  subtitle: string;
  color: string;
  active?: boolean;
  onClick: () => void;
};

export function WorkReportSectionTile({ title, subtitle, color, active = false, onClick }: Props) {
  return (
    <button
      type="button"
      className={`tile work-report-section-tile${active ? ' work-report-section-tile--active' : ''}`}
      style={{ background: color }}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </button>
  );
}

export function WorkReportSectionTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid work-report-section-grid">{children}</div>;
}
