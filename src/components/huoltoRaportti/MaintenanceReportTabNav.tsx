import { useEffect, useRef } from 'react';

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
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const activeTab = tabRefs.current.get(activeId);
    activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId, tabs]);

  if (tabs.length === 0) return null;

  return (
    <nav className="maintenance-report-tabs" aria-label="Raportin osiot">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(node) => {
            if (node) tabRefs.current.set(tab.id, node);
            else tabRefs.current.delete(tab.id);
          }}
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
