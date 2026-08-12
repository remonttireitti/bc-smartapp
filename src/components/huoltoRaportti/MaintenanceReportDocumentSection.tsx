import { useId, type ReactNode } from 'react';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { maintenanceTabCompletionLabel } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import type { ModuleTheme } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoCollapse } from './HuoltoEditUiContext';

export function maintenanceSectionDomId(tabId: string): string {
  return `maintenance-section-${tabId.replace(/:/g, '-')}`;
}

type Props = {
  tabId: string;
  title: string;
  theme: ModuleTheme;
  summary?: string;
  completion?: MaintenanceTabCompletionState;
  defaultOpen?: boolean;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
};

function fallbackSummary(completion?: MaintenanceTabCompletionState): string {
  if (completion === 'ok') return 'Valmis';
  if (completion === 'attention') return 'Tarkista';
  return 'Avaa täyttääksesi';
}

export function MaintenanceReportDocumentSection({
  tabId,
  title,
  theme,
  summary,
  completion,
  defaultOpen = false,
  showSettings = false,
  onOpenSettings,
  headerExtra,
  children,
}: Props) {
  const contentId = useId();
  const { open, toggle } = useHuoltoCollapse(`document:${tabId}`, defaultOpen);
  const collapsedSummary = summary?.trim() || fallbackSummary(completion);

  function handleSettingsClick(event: React.MouseEvent) {
    event.stopPropagation();
    onOpenSettings?.();
  }

  return (
    <section
      id={maintenanceSectionDomId(tabId)}
      className={`maintenance-report-document-section maintenance-print-box${open ? ' is-open' : ' is-collapsed'}`}
      style={
        {
          '--doc-section-accent': theme.accent,
          '--doc-section-bg': theme.bg,
          '--doc-section-border': theme.border,
          '--doc-section-header': theme.header,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="maintenance-report-document-section-header"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="maintenance-report-document-section-heading">
          <span className="maintenance-report-document-section-title">{title}</span>
          {!open ? (
            <span className="maintenance-report-document-section-summary">{collapsedSummary}</span>
          ) : null}
        </span>
        <span className="maintenance-report-document-section-meta">
          {showSettings ? (
            <span
              role="button"
              tabIndex={0}
              className="maintenance-report-document-section-settings"
              aria-label="Tulostusasetukset"
              onClick={handleSettingsClick}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenSettings?.();
                }
              }}
            >
              ⚙
            </span>
          ) : null}
          {completion === 'ok' ? (
            <span className="maintenance-report-tab-check" aria-label={maintenanceTabCompletionLabel('ok')}>
              ✓
            </span>
          ) : completion === 'attention' ? (
            <span
              className="maintenance-report-tab-check maintenance-report-tab-check--attention"
              aria-label={maintenanceTabCompletionLabel('attention')}
            >
              !
            </span>
          ) : null}
          <span className="maintenance-report-document-section-chevron" aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div id={contentId} className="maintenance-report-document-section-body">
          {headerExtra}
          {children}
        </div>
      ) : null}
    </section>
  );
}