interface Props {
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onChange?: (next: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  ariaLabel: string;
  size?: 'md' | 'lg';
}

export default function VrfToggleSwitch({
  checked,
  disabled = false,
  pending = false,
  onChange,
  labelOn = 'ON',
  labelOff = 'OFF',
  ariaLabel,
  size = 'md',
}: Props) {
  const blocked = disabled || pending;
  const interactive = Boolean(onChange) && !blocked;
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`vrf-toggle ${size === 'lg' ? 'vrf-toggle--lg' : ''} ${checked ? 'vrf-toggle--on' : 'vrf-toggle--off'}${blocked ? ' vrf-toggle--disabled' : ''}${pending ? ' vrf-toggle--pending' : ''}`}
      disabled={interactive ? blocked : undefined}
      aria-pressed={checked}
      aria-label={pending ? `${ariaLabel} — tallennetaan` : ariaLabel}
      aria-busy={pending || undefined}
      aria-disabled={blocked || undefined}
      onClick={interactive ? () => onChange?.(!checked) : undefined}
    >
      <span className="vrf-toggle-knob" aria-hidden="true">
        {pending && <span className="vrf-toggle-spinner" />}
      </span>
      <span className="vrf-toggle-label">{pending ? '…' : checked ? labelOn : labelOff}</span>
    </Tag>
  );
}
