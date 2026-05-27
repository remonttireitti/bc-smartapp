type Props = {
  value: number;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  busy?: boolean;
  onCommit: (next: number) => void | Promise<void>;
};

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export default function InventoryQtyStepper({
  value,
  step,
  min = 0,
  max,
  unit,
  decimals = 0,
  disabled,
  busy,
  onCommit,
}: Props) {
  const display = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));

  function clamp(next: number) {
    let v = roundTo(next, decimals);
    if (v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  function applyDelta(delta: number) {
    if (disabled || busy) return;
    void onCommit(clamp(value + delta));
  }

  function onInputBlur(raw: string) {
    if (disabled || busy) return;
    const parsed = Number(raw.replace(',', '.'));
    if (Number.isNaN(parsed)) return;
    void onCommit(clamp(parsed));
  }

  return (
    <div className={`inventory-qty-stepper${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className="inventory-qty-btn"
        aria-label="Vähennä"
        disabled={disabled || busy || value <= min}
        onClick={() => applyDelta(-step)}
      >
        −
      </button>
      <div className="inventory-qty-value">
        <input
          key={display}
          type="text"
          inputMode="decimal"
          className="inventory-qty-input"
          defaultValue={display}
          disabled={disabled || busy}
          onBlur={(e) => onInputBlur(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
        {unit ? <span className="inventory-qty-unit">{unit}</span> : null}
      </div>
      <button
        type="button"
        className="inventory-qty-btn"
        aria-label="Lisää"
        disabled={disabled || busy || (max != null && value >= max)}
        onClick={() => applyDelta(step)}
      >
        +
      </button>
    </div>
  );
}
