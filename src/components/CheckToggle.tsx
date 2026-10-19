/**
 * Drop-in on/off switch replacing <CheckToggle>. Renders a
 * role="switch" button; placed inside a <label>, clicking the label text toggles it.
 */
interface CheckToggleProps {
  checked?: boolean;
  onChange?: (event: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  id?: string;
  title?: string;
  className?: string;
  'aria-label'?: string;
}

export default function CheckToggle({ checked = false, onChange, disabled = false, id, title, className = '', ...rest }: CheckToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      title={title}
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      className={`toggle-switch check-toggle ${disabled ? 'toggle-switch-disabled' : ''} ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.({ target: { checked: !checked } });
      }}
    >
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-thumb" />
      </span>
    </button>
  );
}
