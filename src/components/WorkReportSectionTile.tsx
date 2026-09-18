import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: ReactNode;
  color: string;
  active?: boolean;
  incomplete?: boolean;
  onClick: () => void;
};

export function WorkReportSectionTile({
  title,
  subtitle,
  color,
  active = false,
  incomplete = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      className={`tile work-report-section-tile${active ? ' work-report-section-tile--active' : ''}${incomplete ? ' work-report-section-tile--incomplete' : ''}`}
      style={{ background: color }}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span className="work-report-section-tile-subtitle">{subtitle}</span>
    </button>
  );
}

export function WorkReportSectionTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid work-report-section-grid">{children}</div>;
}
