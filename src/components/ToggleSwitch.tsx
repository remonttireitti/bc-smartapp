import { useId, type ReactNode } from 'react';

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
  const autoId = useId();
  const switchId = id ?? autoId;
  const ariaLabel = label ?? (icon ? 'Kytkin' : undefined);

  return (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`toggle-switch ${disabled ? 'toggle-switch-disabled' : ''} ${className}`.trim()}
      onClick={() => onChange(!checked)}
    >
      {icon ? <span className="toggle-switch-icon">{icon}</span> : null}
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-thumb" />
      </span>
      {label ? <span className="toggle-switch-label">{label}</span> : null}
    </button>
  );
}
