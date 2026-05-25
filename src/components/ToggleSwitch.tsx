import type { ReactNode } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  icon?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  icon,
  disabled = false,
  id,
  className = '',
}: ToggleSwitchProps) {
  const switchId = id ?? (label ? `toggle-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const ariaLabel = label ?? (icon ? 'Kytkin' : undefined);

  return (
    <label
      className={`toggle-switch ${disabled ? 'toggle-switch-disabled' : ''} ${className}`.trim()}
      htmlFor={switchId}
    >
      {icon ? <span className="toggle-switch-icon">{icon}</span> : null}
      <input
        id={switchId}
        type="checkbox"
        className="toggle-switch-input"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-thumb" />
      </span>
      {label ? <span className="toggle-switch-label">{label}</span> : null}
    </label>
  );
}
