import type { MaintenanceStepStatus } from '../../lib/huoltoRaportti/maintenanceSteps';

export type MaintenanceStepItem = {
  key: string;
  title: string;
  status: MaintenanceStepStatus;
};

export function maintenanceStepStatusLabel(status: MaintenanceStepStatus): string {
  if (status === 'ok') return 'Valmis';
  if (status === 'fault') return 'Vika';
  return 'Kesken';
}

type OverviewProps = {
  steps: MaintenanceStepItem[];
  activeIndex: number;
  onJump: (index: number) => void;
};

/** Yleiskatsaus: vaiheet tiloineen, napautus hyppää vaiheeseen. */
export function MaintenanceStepOverview({ steps, activeIndex, onJump }: OverviewProps) {
  const done = steps.filter((s) => s.status !== 'incomplete').length;
  return (
    <nav className="maintenance-step-overview" aria-label="Vaiheet">
      <div className="maintenance-step-overview-head">
        <strong>Vaiheet</strong>
        <span className="muted">{done}/{steps.length} valmis</span>
      </div>
      <ol className="maintenance-step-overview-list">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              className={`maintenance-step-chip is-${step.status}${index === activeIndex ? ' is-active' : ''}`}
              aria-current={index === activeIndex ? 'step' : undefined}
              onClick={() => onJump(index)}
            >
              <span className="maintenance-step-chip-num">{index + 1}</span>
              <span className="maintenance-step-chip-text">
                <span className="maintenance-step-chip-title">{step.title}</span>
                <span className="maintenance-step-chip-status">{maintenanceStepStatusLabel(step.status)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

type FooterProps = {
  activeIndex: number;
  count: number;
  onJump: (index: number) => void;
};

export function MaintenanceStepFooter({ activeIndex, count, onJump }: FooterProps) {
  const last = activeIndex >= count - 1;
  return (
    <div className="maintenance-step-footer">
      <button type="button" className="btn btn-secondary" disabled={activeIndex <= 0} onClick={() => onJump(activeIndex - 1)}>
        ← Takaisin
      </button>
      <span className="muted maintenance-step-footer-pos">{activeIndex + 1} / {count}</span>
      {last ? <span /> : (
        <button type="button" className="btn btn-primary" onClick={() => onJump(activeIndex + 1)}>
          Seuraava →
        </button>
      )}
    </div>
  );
}

type OpenStepsProps = {
  steps: MaintenanceStepItem[];
  activeIndex: number;
  onJump: (index: number) => void;
};

/** Viimeisen vaiheen tilarivi: keskeneräiset vaiheet linkkeinä. */
export function MaintenanceStepOpenList({ steps, activeIndex, onJump }: OpenStepsProps) {
  const open = steps.map((s, i) => ({ ...s, i })).filter((s) => s.status === 'incomplete' && s.i !== activeIndex);
  if (!open.length) return <p className="success maintenance-step-open">Kaikki vaiheet valmiina.</p>;
  return (
    <p className="maintenance-step-open">
      Kesken:{' '}
      {open.map((s, n) => (
        <span key={s.key}>
          {n ? ', ' : ''}
          <button type="button" className="link-button" onClick={() => onJump(s.i)}>{s.title}</button>
        </span>
      ))}
    </p>
  );
}
