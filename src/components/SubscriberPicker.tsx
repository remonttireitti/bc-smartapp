import { useMemo, type ReactNode } from 'react';
import type { Subscriber } from '../types';

type Props = {
  label?: string;
  subscribers: Subscriber[];
  subscriberId: string;
  disabled?: boolean;
  hint?: ReactNode;
  onChange: (subscriberId: string) => void;
};

export default function SubscriberPicker({
  label = 'Tilaaja',
  subscribers,
  subscriberId,
  disabled,
  hint,
  onChange,
}: Props) {
  const options = useMemo(
    () => [...subscribers].sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    [subscribers],
  );

  return (
    <label className="field-block">
      {label}
      <select
        value={subscriberId}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Ei tilaajaa (suora asiakas) —</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.business_id ? ` (${s.business_id})` : ''}
          </option>
        ))}
      </select>
      {hint ? <span className="muted field-hint">{hint}</span> : null}
    </label>
  );
}
