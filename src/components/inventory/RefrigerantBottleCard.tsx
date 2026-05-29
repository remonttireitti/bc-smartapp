import InventoryPhotoThumb from './InventoryPhotoThumb';
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
  onEdit,
  onRetrieve,
  onEmpty,
  onRecycle,
  onReturnRental,
  onRetire,
}: Props) {
  const empty = isBottleEmpty(c);
  const fillPct = Math.round(bottleFillRatio(c) * 100);
  const locationLine = [c.location, c.customer?.name].filter(Boolean).join(' · ');

  return (
    <article
      className={`inventory-bottle-card${empty ? ' inventory-bottle-empty' : ''}`}
      aria-label={formatBottleLabel(c)}
    >
      <div className="inventory-bottle-card-visual">
        <InventoryPhotoThumb
          imagePath={c.image_path}
          label={formatBottleLabel(c)}
          canEdit={canEdit}
          busy={busy}
          placeholder="bottle"
          size="md"
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
        <strong className="inventory-bottle-card-title">{formatBottleLabel(c)}</strong>
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

      {canEdit && (
        <div className="inventory-bottle-card-actions">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onEdit}>
            Muokkaa
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onRetrieve}>
            Talteen
          </button>
          {!empty && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onEmpty}>
              Tyhjennä
            </button>
          )}
          {c.ownership_type === 'rental' && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onReturnRental}>
              Palauta vuokra
            </button>
          )}
          {c.ownership_type === 'owned' && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onRetire}>
              Poista / myy
            </button>
          )}
          {!c.non_recyclable && !empty && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onRecycle}>
              Kierrätys
            </button>
          )}
        </div>
      )}
    </article>
  );
}
