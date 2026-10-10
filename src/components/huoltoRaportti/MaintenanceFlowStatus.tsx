export type MaintenanceFlowStep = { label: string; done: boolean };

type Props = {
  steps: MaintenanceFlowStep[];
  /** esim. "Laite luotu: Katto ILP 2" / "Laite linkitetty: Katto ILP 1" / "Ei laitetta". */
  equipmentText: string | null;
  equipmentOk: boolean;
  /** esim. "Tallennettu klo 10.31" / "Tallentamatta". */
  saveText: string;
  saveOk: boolean;
};

/** Tiivis tila: missä vaiheessa ollaan, onko laite rekisterissä ja onko tallennettu. */
export function MaintenanceFlowStatus({ steps, equipmentText, equipmentOk, saveText, saveOk }: Props) {
  const currentIndex = steps.findIndex((step) => !step.done);
  return (
    <div className="maintenance-flow-status" aria-live="polite">
      <ol className="maintenance-flow-steps">
        {steps.map((step, index) => {
          const state = step.done ? 'done' : index === currentIndex ? 'current' : 'todo';
          return (
            <li key={step.label} className={`maintenance-flow-step maintenance-flow-step--${state}`}>
              <span className="maintenance-flow-step-num">{step.done ? '✓' : index + 1}</span>
              {step.label}
            </li>
          );
        })}
      </ol>
      <div className="maintenance-flow-chips">
        {equipmentText ? (
          <span className={`maintenance-flow-chip${equipmentOk ? ' maintenance-flow-chip--ok' : ''}`}>{equipmentText}</span>
        ) : null}
        <span className={`maintenance-flow-chip${saveOk ? ' maintenance-flow-chip--ok' : ' maintenance-flow-chip--pending'}`}>
          {saveText}
        </span>
      </div>
    </div>
  );
}
