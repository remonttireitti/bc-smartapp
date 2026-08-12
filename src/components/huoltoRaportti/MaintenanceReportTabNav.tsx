import { useEffect, useRef } from 'react';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { maintenanceTabCompletionLabel } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';

export type MaintenanceReportTabItem = {
  id: string;
  label: string;
};

type Props = {
  tabs: MaintenanceReportTabItem[];
  activeId: string;
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>;
  onChange: (id: string) => void;
  /** Mobiilidokumentti: vaakasuora hyppyvalikko ilman modaalia */
  variant?: 'modal' | 'document';
};

export default function MaintenanceReportTabNav({
  tabs,
  activeId,
  tabCompletion,
  onChange,
  variant = 'modal',
}: Props) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    const activeTab = tabRefs.current.get(activeId);
    activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId, tabs]);

  if (tabs.length === 0) return null;

  return (
    <nav
      className={`maintenance-report-tabs${variant === 'document' ? ' maintenance-report-tabs--document' : ''}`}
      aria-label="Raportin osiot"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(node) => {
            if (node) tabRefs.current.set(tab.id, node);
            else tabRefs.current.delete(tab.id);
          }}
          type="button"
          className={`maintenance-report-tab${activeId === tab.id ? ' is-active' : ''}`}
          aria-pressed={activeId === tab.id ? true : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span className="maintenance-report-tab-label">{tab.label}</span>
          {tabCompletion?.[tab.id] === 'ok' ? (
            <span className="maintenance-report-tab-check" aria-label={maintenanceTabCompletionLabel('ok')}>
              ✓
            </span>
          ) : tabCompletion?.[tab.id] === 'attention' ? (
            <span
              className="maintenance-report-tab-check maintenance-report-tab-check--attention"
              aria-label={maintenanceTabCompletionLabel('attention')}
            >
              !
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
