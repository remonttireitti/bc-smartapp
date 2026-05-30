import type { TripDestinationOption } from '../lib/tripDestinations';

type Props = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  options: TripDestinationOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  onPickOption?: (option: TripDestinationOption) => void;
};

export default function TripDestinationInput({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
  onPickOption,
}: Props) {
  const listId = `${id}-options`;

  return (
    <label>
      {label}
      <input
        list={listId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option
            key={option.id}
            value={option.address}
            label={`${option.label} · ${option.group === 'customer' ? 'Asiakas' : option.group === 'supplier' ? 'Tukkuri' : 'Muu'}`}
          />
        ))}
      </datalist>
      {options.length > 0 && (
        <select
          className="trip-destination-quickpick"
          disabled={disabled}
          value=""
          onChange={(e) => {
            const picked = options.find((option) => option.id === e.target.value);
            if (!picked) return;
            onChange(picked.address);
            onPickOption?.(picked);
            e.target.value = '';
          }}
        >
          <option value="">Valitse listasta…</option>
          {options.some((o) => o.group === 'customer') && (
            <optgroup label="Asiakkaat">
              {options
                .filter((o) => o.group === 'customer')
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </optgroup>
          )}
          {options.some((o) => o.group === 'supplier') && (
            <optgroup label="Tukkurit">
              {options
                .filter((o) => o.group === 'supplier')
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </optgroup>
          )}
          {options.some((o) => o.group === 'custom') && (
            <optgroup label="Omat kohteet">
              {options
                .filter((o) => o.group === 'custom')
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      )}
    </label>
  );
}
