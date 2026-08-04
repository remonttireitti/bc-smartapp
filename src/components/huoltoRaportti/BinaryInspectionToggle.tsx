type Props = {
  value: boolean | null;
  onChange: (next: boolean) => void;
  name: string;
  disabled?: boolean;
};

export function BinaryInspectionToggle({ value, onChange, name, disabled }: Props) {
  return (
    <div className="konvektori-yesno huolto-binary-inspection" role="group" aria-label={name}>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === true ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
        aria-pressed={value === true}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        Kunnossa
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === false ? ' konvektori-yesno-btn--active konvektori-yesno-btn--no' : ''}`}
        aria-pressed={value === false}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        Ei kunnossa
      </button>
    </div>
  );
}
