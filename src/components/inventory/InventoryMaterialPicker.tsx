import { createContext, useContext, useMemo, useState } from 'react';

import {
  applyInventoryPick,
  searchInventoryItems,
  type InventoryPickItem,
} from '../../lib/inventoryExpenseLink';

/** Oman varaston materiaalit (tyhjä = varasto ei käytössä / SQL ajamatta). */
export const InventoryPickContext = createContext<InventoryPickItem[]>([]);

const fmt = (n: number) => n.toLocaleString('fi-FI', { maximumFractionDigits: 3 });
const eur = (n: number | null) =>
  n == null ? '–' : `${n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

type Row = Parameters<typeof applyInventoryPick>[0];

export default function InventoryMaterialPicker<T extends Row>({
  row,
  onChange,
}: {
  row: T;
  onChange: (next: T) => void;
}) {
  const items = useContext(InventoryPickContext);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchInventoryItems(items, query), [items, query]);
  if (items.length === 0) return null;
  const linked = row.inventory_item_id ? items.find((i) => i.id === row.inventory_item_id) : null;

  if (linked) {
    return (
      <div className="inventory-picker-linked">
        <span>
          📦 Varastosta: <strong>{linked.name}</strong>
          {linked.sku ? ` · ${linked.sku}` : ''} · saldo {fmt(linked.qty_on_hand)} {linked.unit}
        </span>
        <button
          type="button"
          className="btn-link"
          onClick={() => onChange({ ...row, inventory_item_id: null, unit: null })}
        >
          Irrota varastosta
        </button>
        <p className="muted inventory-picker-hint">Saldo päivittyy tallennettaessa (poisto palauttaa).</p>
      </div>
    );
  }

  return (
    <div className="inventory-picker">
      <label>
        Hae varastosta (valinnainen)
        <input
          type="search"
          value={query}
          placeholder="Nimi tai tuotenumero"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </label>
      {open && (
        <ul className="inventory-picker-results" role="listbox">
          {results.length === 0 ? (
            <li className="muted">Ei osumia — kirjoita rivi vapaasti alle.</li>
          ) : (
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(applyInventoryPick(row, item));
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <span className="inventory-picker-name">
                    {item.name}
                    {item.sku ? <span className="muted"> · {item.sku}</span> : null}
                  </span>
                  <span className="inventory-picker-meta">
                    saldo {fmt(item.qty_on_hand)} {item.unit} · osto {eur(item.purchase_price)} · myynti{' '}
                    {eur(item.sale_price)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
