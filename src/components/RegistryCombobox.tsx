import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RegistryComboboxOption } from '../lib/registrySearch';

type Props = {
  label: string;
  placeholder?: string;
  disabled?: boolean;
  valueId: string;
  options: RegistryComboboxOption[];
  minChars?: number;
  minCharsForCreate?: number;
  createLabel?: (query: string) => string;
  allowCreate?: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
  onCreateClick?: (query: string) => void;
};

export default function RegistryCombobox({
  label,
  placeholder = 'Kirjoita hakeaksesi…',
  disabled,
  valueId,
  options,
  minChars = 1,
  minCharsForCreate = 2,
  createLabel,
  allowCreate = false,
  onSelect,
  onClear,
  onCreateClick,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedOption = options.find((option) => option.id === valueId);

  useEffect(() => {
    if (selectedOption && !open) {
      setQuery(selectedOption.label);
    }
  }, [valueId, selectedOption, open]);

  useEffect(() => {
    if (!valueId && !open) {
      setQuery('');
    }
  }, [valueId, open]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= minChars;

  const filtered = useMemo(() => {
    if (!canSearch) return [];
    const q = trimmed.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) || (option.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, trimmed, canSearch]);

  const showCreateOption =
    allowCreate &&
    trimmed.length >= minCharsForCreate &&
    filtered.length === 0 &&
    !options.some((option) => option.label.toLowerCase() === trimmed.toLowerCase());

  function handleInputChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (valueId && value !== selectedOption?.label) {
      onClear();
    }
  }

  function pick(option: RegistryComboboxOption) {
    onSelect(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className={`registry-combobox${open ? ' registry-combobox--open' : ''}`} ref={rootRef}>
      <label>
        {label}
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setOpen(true)}
        />
      </label>
      {open && canSearch && (filtered.length > 0 || showCreateOption) && (
        <ul id={listId} className="registry-combobox-list" role="listbox">
          {filtered.map((option) => (
            <li key={option.id}>
              <button type="button" role="option" onClick={() => pick(option)}>
                <span className="registry-combobox-option-label">{option.label}</span>
                {option.hint && <span className="muted registry-combobox-option-hint">{option.hint}</span>}
              </button>
            </li>
          ))}
          {showCreateOption && (
            <li>
              <button
                type="button"
                className="registry-combobox-create"
                onClick={() => {
                  onCreateClick?.(trimmed);
                  setOpen(false);
                }}
              >
                {createLabel?.(trimmed) ?? `+ Tallenna uusi: ${trimmed}`}
              </button>
            </li>
          )}
        </ul>
      )}
      {open && canSearch && filtered.length === 0 && !showCreateOption && (
        <p className="registry-combobox-empty muted">Ei tuloksia.</p>
      )}
    </div>
  );
}
