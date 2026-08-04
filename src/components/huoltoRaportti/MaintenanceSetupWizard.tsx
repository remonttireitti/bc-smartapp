import type { ReactNode } from 'react';

export type MaintenanceSetupStep = 'raportointi' | 'kylmaaine';

type StepItem = {
  id: MaintenanceSetupStep;
  label: string;
};

type Props = {
  step: MaintenanceSetupStep;
  steps: StepItem[];
  gateMessage: string | null;
  nextLabel: string;
  showBack: boolean;
  onBack: () => void;
  onNext: () => void;
  onOpenDevice: () => void;
  deviceButtonLabel: string;
  children: ReactNode;
};

export function MaintenanceSetupWizard({
  step,
  steps,
  gateMessage,
  nextLabel,
  showBack,
  onBack,
  onNext,
  onOpenDevice,
  deviceButtonLabel,
  children,
}: Props) {
  const stepIndex = steps.findIndex((item) => item.id === step);

  return (
    <section className="maintenance-setup-wizard panel">
      <ol className="maintenance-setup-steps" aria-label="Raportin alkuaskeleet">
        {steps.map((item, index) => {
          const isActive = item.id === step;
          const isDone = index < stepIndex;
          return (
            <li
              key={item.id}
              className={`maintenance-setup-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="maintenance-setup-step-index">{index + 1}</span>
              <span className="maintenance-setup-step-label">{item.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="maintenance-setup-body">{children}</div>

      {gateMessage ? <p className="error maintenance-setup-gate">{gateMessage}</p> : null}

      <div className="maintenance-setup-actions">
        {showBack ? (
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Edellinen
          </button>
        ) : null}
        {step === 'raportointi' ? (
          <button type="button" className="btn btn-secondary" onClick={onOpenDevice}>
            {deviceButtonLabel}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </section>
  );
}
