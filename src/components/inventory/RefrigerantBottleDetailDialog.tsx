import { useEffect } from 'react';

import InventoryPhotoThumb from './InventoryPhotoThumb';
import {
  formatBottleContent,
  formatBottleLabel,
  formatBottleSizeLabel,
  isBottleEmpty,
} from '../../lib/refrigerantBottle';
import type { RefrigerantCylinder } from '../../types/inventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_CYLINDER_STATUS_LABELS,
  REFRIGERANT_STOCK_SOURCE_LABELS,
} from '../../types/inventory';

type Props = {
  open: boolean;
  cylinder: RefrigerantCylinder | null;
  canEdit: boolean;
  busy?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onShowQr?: () => void;
};

export default function RefrigerantBottleDetailDialog({
  open,
  cylinder,
  canEdit,
  busy = false,
  onClose,
  onEdit,
  onShowQr,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open || !cylinder) return null;

  const empty = isBottleEmpty(cylinder);
  const locationLine = [cylinder.location, cylinder.customer?.name].filter(Boolean).join(' · ');

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog inventory-bottle-detail-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-bottle-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inventory-bottle-detail-head">
          <InventoryPhotoThumb
            imagePath={cylinder.image_path}
            label={formatBottleLabel(cylinder)}
            canEdit={false}
            busy={busy}
            placeholder="bottle"
            size="xl"
          />
          <div className="inventory-bottle-detail-head-text">
            <h2 id="inventory-bottle-detail-title">{formatBottleLabel(cylinder)}</h2>
            <p className={`inventory-bottle-state${empty ? ' inventory-bottle-state-empty' : ''}`}>
              {formatBottleContent(cylinder)}
            </p>
          </div>
        </div>

        <dl className="detail-list inventory-bottle-detail-list">
          <dt>Koko</dt>
          <dd>{formatBottleSizeLabel(cylinder.bottle_size)}</dd>
          <dt>Omistus</dt>
          <dd>{REFRIGERANT_CYLINDER_OWNERSHIP_LABELS[cylinder.ownership_type]}</dd>
          <dt>Tila</dt>
          <dd>{REFRIGERANT_CYLINDER_STATUS_LABELS[cylinder.status] ?? cylinder.status}</dd>
          <dt>Lähde</dt>
          <dd>{REFRIGERANT_STOCK_SOURCE_LABELS[cylinder.stock_source]}</dd>
          {cylinder.owner_user?.display_name || cylinder.owner_user?.email ? (
            <>
              <dt>Vastuuhenkilö</dt>
              <dd>{cylinder.owner_user.display_name || cylinder.owner_user.email}</dd>
            </>
          ) : null}
          {locationLine ? (
            <>
              <dt>Sijainti</dt>
              <dd>{locationLine}</dd>
            </>
          ) : null}
          {cylinder.notes ? (
            <>
              <dt>Muistiinpano</dt>
              <dd>{cylinder.notes}</dd>
            </>
          ) : null}
        </dl>

        <div className="leave-draft-actions inventory-bottle-detail-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
          {onShowQr ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onShowQr}>
              QR-koodi ja linkki
            </button>
          ) : null}
          {canEdit && onEdit ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onEdit}>
              Muokkaa
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
