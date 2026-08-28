import { useEffect, useRef, useState } from 'react';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import { IconGear } from '../icons';
import {
  bottleFillRatio,
  formatBottleContentShort,
  formatBottleLabel,
  formatBottleSizeLabel,
  isBottleEmpty,
} from '../../lib/refrigerantBottle';
import type { RefrigerantCylinder } from '../../types/inventory';
import { REFRIGERANT_CYLINDER_OWNERSHIP_LABELS } from '../../types/inventory';

type Props = {
  cylinder: RefrigerantCylinder;
  canEdit: boolean;
  busy: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  onShowDetails: () => void;
  onShowQr: () => void;
  onEdit: () => void;
  onRetrieve: () => void;
  onEmpty: () => void;
  onRecycle: () => void;
  onReturnRental: () => void;
  onRetire: () => void;
};

export default function RefrigerantBottleCard({
  cylinder: c,
  canEdit,
  busy,
  onPickPhoto,
  onShowDetails,
  onShowQr,
  onEdit,
  onRetrieve,
  onEmpty,
  onRecycle,
  onReturnRental,
  onRetire,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const empty = isBottleEmpty(c);
  const fillPct = Math.round(bottleFillRatio(c) * 100);
  const locationLine = [c.location, c.customer?.name].filter(Boolean).join(' · ');

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  function runAction(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <article
      className={`inventory-bottle-card${empty ? ' inventory-bottle-empty' : ''}${menuOpen ? ' inventory-bottle-menu-open' : ''}`}
      aria-label={formatBottleLabel(c)}
    >
      <div className="inventory-bottle-card-visual">
        <InventoryPhotoThumb
          imagePath={c.image_path}
          label={formatBottleLabel(c)}
          canEdit={canEdit}
          busy={busy}
          placeholder="bottle"
          size="lg"
          onPick={onPickPhoto}
        />
        {!empty && (
          <div className="inventory-bottle-meter" aria-hidden>
            <div className="inventory-bottle-meter-fill" style={{ width: `${fillPct}%` }} />
          </div>
        )}
      </div>

      <p className={`inventory-bottle-state${empty ? ' inventory-bottle-state-empty' : ''}`}>
        {formatBottleContentShort(c)}
      </p>

      <div className="inventory-bottle-title-row">
        <button
          type="button"
          className="inventory-bottle-card-title-btn"
          onClick={onShowDetails}
          disabled={busy}
        >
          {formatBottleLabel(c)}
        </button>
        <div className="toolbar-popover-anchor inventory-bottle-menu-anchor" ref={menuRef}>
          <button
            type="button"
            className="icon-btn inventory-bottle-menu-btn"
            aria-label={`Toiminnot: ${formatBottleLabel(c)}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <IconGear />
          </button>
          {menuOpen && (
            <div className="toolbar-popover-panel toolbar-action-menu inventory-bottle-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="inventory-bottle-menu-item"
                onClick={() => runAction(onShowDetails)}
              >
                Näytä tiedot
              </button>
              <button
                type="button"
                role="menuitem"
                className="inventory-bottle-menu-item"
                onClick={() => runAction(onShowQr)}
              >
                QR-koodi ja linkki
              </button>
              {canEdit && (
                <>
                  <button type="button" role="menuitem" className="inventory-bottle-menu-item" onClick={() => runAction(onEdit)}>
                    Muokkaa
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="inventory-bottle-menu-item inventory-bottle-menu-item-primary"
                    onClick={() => runAction(onRetrieve)}
                  >
                    Talteen asiakkaalta
                  </button>
                  {!empty && (
                    <button type="button" role="menuitem" className="inventory-bottle-menu-item" onClick={() => runAction(onEmpty)}>
                      Tyhjennä
                    </button>
                  )}
                  {c.ownership_type === 'rental' && (
                    <button
                      type="button"
                      role="menuitem"
                      className="inventory-bottle-menu-item"
                      onClick={() => runAction(onReturnRental)}
                    >
                      Palauta vuokra
                    </button>
                  )}
                  {c.ownership_type === 'owned' && (
                    <button type="button" role="menuitem" className="inventory-bottle-menu-item" onClick={() => runAction(onRetire)}>
                      Poista / myy
                    </button>
                  )}
                  {!c.non_recyclable && !empty && (
                    <button type="button" role="menuitem" className="inventory-bottle-menu-item" onClick={() => runAction(onRecycle)}>
                      Kierrätys
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="inventory-bottle-card-badges">
        <span className="inventory-bottle-badge">{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[c.ownership_type]}</span>
        <span className="inventory-bottle-badge inventory-bottle-badge-muted">{formatBottleSizeLabel(c.bottle_size)}</span>
        {c.non_recyclable && (
          <span className="inventory-bottle-badge inventory-bottle-badge-muted">Ei kierrätys</span>
        )}
      </div>

      {locationLine ? <p className="inventory-bottle-card-meta muted">{locationLine}</p> : null}
      {c.notes ? <p className="inventory-bottle-card-note muted">{c.notes}</p> : null}
    </article>
  );
}
