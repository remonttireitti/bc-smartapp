import { useEffect, useId, useRef, useState } from 'react';

import {
  filterTripDestinationOptions,
  tripDestinationGroupLabel,
  type TripDestinationOption,
} from '../lib/tripDestinations';

type Props = {
  label: string;
  value: string;
  placeholder?: string;
  options: TripDestinationOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export default function TripDestinationInput({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = filterTripDestinationOptions(options, value);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, options.length]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function pickOption(option: TripDestinationOption) {
    onChange(option.address);
    setOpen(false);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open || matches.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter' && matches[activeIndex]) {
      event.preventDefault();
      pickOption(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showSuggestions = open && !disabled && matches.length > 0;

  return (
    <div ref={rootRef} className="trip-destination-field">
      <label htmlFor={listId}>{label}</label>
      <input
        id={listId}
        className="trip-destination-input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={`${listId}-listbox`}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onInputKeyDown}
      />
      {showSuggestions && (
        <ul id={`${listId}-listbox`} className="trip-destination-suggestions" role="listbox">
          {matches.map((option, index) => (
            <li key={option.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={index === activeIndex ? 'is-active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickOption(option)}
              >
                <span className="trip-destination-suggestion-label">{option.label}</span>
                <span className="trip-destination-suggestion-meta">
                  {tripDestinationGroupLabel(option.group)} · {option.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
