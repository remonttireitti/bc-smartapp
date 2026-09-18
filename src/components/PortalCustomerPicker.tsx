import { useMemo, type ReactNode } from 'react';
import { formatCustomerAddressParts } from '../lib/customers';
import type { Customer } from '../types';

type Props = {
  label?: string;
  customers: Pick<Customer, 'id' | 'name' | 'address' | 'postal_code' | 'city'>[];
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
        {options.map((c) => {
          const address = formatCustomerAddressParts(c);
          return (
            <option key={c.id} value={c.id}>
              {c.name}
              {address ? ` (${address})` : ''}
            </option>
          );
        })}
      </select>
      {hint ? <span className="muted field-hint">{hint}</span> : null}
    </label>
  );
}
