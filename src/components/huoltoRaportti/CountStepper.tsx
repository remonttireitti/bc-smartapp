type Props = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
};

/** Määrävalitsin (− n +), 48 px korkeat kontrollit. */
export function CountStepper({ label, value, onChange, min = 1, max = 10 }: Props) {
  return (
    <div className="huolto-count-stepper">
      <span className="huolto-count-label">{label}</span>
      <div className="konvektori-yesno" role="group" aria-label={label}>
        <button type="button" className="konvektori-yesno-btn" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <output className="huolto-count-value" aria-live="polite">{value}</output>
        <button type="button" className="konvektori-yesno-btn" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}
