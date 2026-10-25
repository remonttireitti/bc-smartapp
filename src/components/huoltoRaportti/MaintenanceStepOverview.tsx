import { useEffect, useRef } from 'react';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';

export type MaintenanceStepItem = {
  key: string;
  title: string;
  completion?: MaintenanceTabCompletionState | 'na';
};

export function maintenanceStepStatusLabel(completion?: MaintenanceStepItem['completion']): string {
  if (completion === 'ok') return 'Valmis';
  if (completion === 'attention') return 'Huomio';
  if (completion === 'na') return 'Ei kuulu';
  return 'Kesken';
}

function statusClass(completion?: MaintenanceStepItem['completion']): string {
  if (completion === 'ok') return 'is-ok';
  if (completion === 'attention') return 'is-attention';
  if (completion === 'na') return 'is-na';
  return 'is-incomplete';
}

type OverviewProps = {
  steps: MaintenanceStepItem[];
  /** Ei kuuluvat valinnaiset moduulit (napautus lisää). */
  optional?: { key: string; title: string; onAdd: () => void }[];
  activeIndex: number;
  summaryIndex: number;
  onJump: (index: number) => void;
};

/** Yleiskatsaus: jokainen moduuli tilan kanssa, napautus hyppää suoraan. */
export function MaintenanceStepOverview({ steps, optional = [], activeIndex, summaryIndex, onJump }: OverviewProps) {
  const done = steps.filter((s) => s.completion === 'ok' || s.completion === 'attention').length;
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('.maintenance-step-chip.is-active');
    if (!list || !active) return;
    list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }, [activeIndex]);
  return (
    <nav className="maintenance-step-overview" aria-label="Yleiskatsaus">
      <div className="maintenance-step-overview-head">
        <strong>Yleiskatsaus</strong>
        <span className="muted">{done}/{steps.length} valmis</span>
      </div>
      <ol ref={listRef} className="maintenance-step-overview-list">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              className={`maintenance-step-chip ${statusClass(step.completion)}${index === activeIndex ? ' is-active' : ''}`}
              aria-current={index === activeIndex ? 'step' : undefined}
              onClick={() => onJump(index)}
            >
              <span className="maintenance-step-chip-num">{index + 1}</span>
              <span className="maintenance-step-chip-title">{step.title}</span>
              <span className="maintenance-step-chip-status">{maintenanceStepStatusLabel(step.completion)}</span>
            </button>
          </li>
        ))}
        {optional.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="maintenance-step-chip is-na"
              title="Lisää moduuli"
              onClick={item.onAdd}
            >
              <span className="maintenance-step-chip-num">+</span>
              <span className="maintenance-step-chip-title">{item.title}</span>
              <span className="maintenance-step-chip-status">Ei kuulu</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={`maintenance-step-chip is-summary${activeIndex === summaryIndex ? ' is-active' : ''}`}
            aria-current={activeIndex === summaryIndex ? 'step' : undefined}
            onClick={() => onJump(summaryIndex)}
          >
            <span className="maintenance-step-chip-num">✓</span>
            <span className="maintenance-step-chip-title">Yhteenveto</span>
          </button>
        </li>
      </ol>
    </nav>
  );
}

type FooterProps = {
  activeIndex: number;
  summaryIndex: number;
  onJump: (index: number) => void;
};

export function MaintenanceStepFooter({ activeIndex, summaryIndex, onJump }: FooterProps) {
  const atSummary = activeIndex >= summaryIndex;
  return (
    <div className="maintenance-step-footer">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={activeIndex <= 0}
        onClick={() => onJump(activeIndex - 1)}
      >
        ← Takaisin
      </button>
      <span className="muted maintenance-step-footer-pos">
        {atSummary ? 'Yhteenveto' : `${activeIndex + 1} / ${summaryIndex}`}
      </span>
      {atSummary ? <span /> : (
        <button type="button" className="btn btn-primary" onClick={() => onJump(activeIndex + 1)}>
          {activeIndex + 1 === summaryIndex ? 'Yhteenveto →' : 'Seuraava →'}
        </button>
      )}
    </div>
  );
}

type SummaryProps = {
  steps: MaintenanceStepItem[];
  onJump: (index: number) => void;
};

/** Yhteenveto ennen pöytäkirjan valmiiksi merkitsemistä. */
export function MaintenanceStepSummary({ steps, onJump }: SummaryProps) {
  const open = steps.filter((s) => s.completion !== 'ok' && s.completion !== 'attention' && s.completion !== 'na');
  const attention = steps.filter((s) => s.completion === 'attention');
  return (
    <section className="panel maintenance-step-summary">
      <h2>Yhteenveto</h2>
      <p className={open.length ? 'error' : 'success'}>
        {open.length
          ? `${open.length} moduulia kesken`
          : 'Kaikki moduulit täytetty – merkitse valmiiksi alta.'}
        {attention.length ? ` · ${attention.length} huomiota` : ''}
      </p>
      <ul className="maintenance-step-summary-list">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button type="button" className="maintenance-step-summary-row" onClick={() => onJump(index)}>
              <span>{index + 1}. {step.title}</span>
              <span className={`maintenance-step-chip-status ${statusClass(step.completion)}`}>
                {maintenanceStepStatusLabel(step.completion)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
