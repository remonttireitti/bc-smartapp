import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';

interface Props {
  value: HuoltoInspectionStatus;
  onChange: (next: Exclude<HuoltoInspectionStatus, null>) => void;
  name: string;
  disabled?: boolean;
}

export function TriStateInspectionToggle({ value, onChange, name, disabled }: Props) {
  return (
    <div className="konvektori-yesno huolto-tristate-inspection" role="group" aria-label={name}>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === 'ok' ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
        aria-pressed={value === 'ok'}
        disabled={disabled}
        onClick={() => onChange('ok')}
      >
        Kunnossa
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === 'faulty' ? ' konvektori-yesno-btn--active konvektori-yesno-btn--no' : ''}`}
        aria-pressed={value === 'faulty'}
        disabled={disabled}
        onClick={() => onChange('faulty')}
      >
        Vika
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === 'na' ? ' konvektori-yesno-btn--active' : ''}`}
        aria-pressed={value === 'na'}
        disabled={disabled}
        onClick={() => onChange('na')}
      >
        Ei kuulu
      </button>
    </div>
  );
}
