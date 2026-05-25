import { useMemo, type ReactNode } from 'react';
import type { Customer } from '../types';

type Props = {
  label?: string;
  customers: Pick<Customer, 'id' | 'name' | 'address' | 'city'>[];
  customerId: string;
  disabled?: boolean;
  hint?: ReactNode;
  onChange: (customerId: string) => void;
};

export default function PortalCustomerPicker({
  label = 'Asiakaskohde',
  customers,
  customerId,
  disabled,
  hint,
  onChange,
}: Props) {
  const options = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    [customers],
  );

  return (
    <label className="field-block">
      {label}
      <select
        value={customerId}
        disabled={disabled}
        required
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Valitse kohde —</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {[c.address, c.city].filter(Boolean).length
              ? ` (${[c.address, c.city].filter(Boolean).join(', ')})`
              : ''}
          </option>
        ))}
      </select>
      {hint ? <span className="muted field-hint">{hint}</span> : null}
    </label>
  );
}
