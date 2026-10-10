import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';

interface Props {
  value: HuoltoInspectionStatus;
  /** null = ei valintaa (ei kuulu tarkastukseen). */
  onChange: (next: 'ok' | 'faulty' | null) => void;
  name: string;
  disabled?: boolean;
}

/** Kunnossa / Vika ilman oletusvalintaa. Aktiivisen napin painallus poistaa valinnan. */
export function InspectionChoiceToggle({ value, onChange, name, disabled }: Props) {
  const pick = (next: 'ok' | 'faulty') => onChange(value === next ? null : next);
  return (
    <div className="konvektori-yesno huolto-tristate-inspection" role="group" aria-label={name}>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === 'ok' ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
        aria-pressed={value === 'ok'}
        disabled={disabled}
        onClick={() => pick('ok')}
      >
        Kunnossa
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === 'faulty' ? ' konvektori-yesno-btn--active konvektori-yesno-btn--no' : ''}`}
        aria-pressed={value === 'faulty'}
        disabled={disabled}
        onClick={() => pick('faulty')}
      >
        Vika
      </button>
    </div>
  );
}
