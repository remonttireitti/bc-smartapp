interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  ariaLabel: string;
  size?: 'md' | 'lg';
}

export default function VrfToggleSwitch({
  checked,
  disabled = false,
  onChange,
  labelOn = 'ON',
  labelOff = 'OFF',
  ariaLabel,
  size = 'md',
}: Props) {
  const interactive = Boolean(onChange) && !disabled;
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`vrf-toggle ${size === 'lg' ? 'vrf-toggle--lg' : ''} ${checked ? 'vrf-toggle--on' : 'vrf-toggle--off'}${disabled ? ' vrf-toggle--disabled' : ''}`}
      disabled={interactive ? disabled : undefined}
      aria-pressed={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onClick={interactive ? () => onChange?.(!checked) : undefined}
    >
      <span className="vrf-toggle-knob" aria-hidden="true" />
      <span className="vrf-toggle-label">{checked ? labelOn : labelOff}</span>
    </Tag>
  );
}
