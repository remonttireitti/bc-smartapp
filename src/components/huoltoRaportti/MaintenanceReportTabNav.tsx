export type MaintenanceReportTabItem = {
  id: string;
  label: string;
};

type Props = {
  tabs: MaintenanceReportTabItem[];
  activeId: string;
  onChange: (id: string) => void;
};

export default function MaintenanceReportTabNav({ tabs, activeId, onChange }: Props) {
  if (tabs.length === 0) return null;

  return (
    <nav className="maintenance-report-tabs" aria-label="Raportin osiot">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`maintenance-report-tab${activeId === tab.id ? ' is-active' : ''}`}
          aria-current={activeId === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
