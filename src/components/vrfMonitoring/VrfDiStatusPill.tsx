interface Props {
  active: boolean | null;
  stale?: boolean;
  variant?: 'default' | 'alarm';
  labelOn?: string;
  labelOff?: string;
}

export default function VrfDiStatusPill({
  active,
  stale = false,
  variant = 'default',
  labelOn = 'ON',
  labelOff = 'OFF',
}: Props) {
  if (stale || active == null) {
    return (
      <span className="vrf-di-pill vrf-di-pill--unknown" aria-label="Tila ei tiedossa">
        —
      </span>
    );
  }

  const on = active === true;
  const alarmOn = variant === 'alarm' && on;

  return (
    <span
      className={`vrf-di-pill ${on ? (alarmOn ? 'vrf-di-pill--alarm-on' : 'vrf-di-pill--on') : 'vrf-di-pill--off'}`}
      aria-label={on ? labelOn : labelOff}
    >
      {on ? labelOn : labelOff}
    </span>
  );
}
