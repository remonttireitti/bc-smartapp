import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';

interface Props {
  title: string;
  subtitle?: string;
  status: HuoltoInspectionStatus;
  disabled?: boolean;
  onInspect: () => void;
}

export function HuoltoPartInspectionRow({ title, subtitle, status, disabled, onInspect }: Props) {
  return (
    <button
      type="button"
      className={`huolto-part-inspection-row${disabled ? ' huolto-part-inspection-row--disabled' : ''}`}
      disabled={disabled}
      onClick={onInspect}
    >
      <span className="huolto-part-inspection-row-main">
        <span className="huolto-part-inspection-row-title">{title}</span>
        {subtitle ? <span className="muted huolto-part-inspection-row-subtitle">{subtitle}</span> : null}
      </span>
      {status === 'ok' ? (
        <span className="maintenance-report-tab-check huolto-part-inspection-row-check" aria-label="Valmis">
          ✓
        </span>
      ) : status === 'faulty' ? (
        <span
          className="maintenance-report-tab-check maintenance-report-tab-check--attention huolto-part-inspection-row-check"
          aria-label="Ei kunnossa"
        >
          !
        </span>
      ) : status === 'na' ? (
        <span className="muted huolto-part-inspection-row-hint">Ei laitteessa</span>
      ) : (
        <span className="muted huolto-part-inspection-row-hint">Täytä</span>
      )}
    </button>
  );
}
