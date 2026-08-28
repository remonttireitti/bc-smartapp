import { useRef, useState } from 'react';
import { MaintenanceReportImageLightbox } from '../huoltoRaportti/MaintenanceReportImageLightbox';
import { inventoryImagePublicUrl } from '../../lib/inventoryImages';

export const DEFAULT_REFRIGERANT_BOTTLE_IMAGE = '/refrigerant-bottle-default.png';

type Props = {
  imagePath: string | null | undefined;
  label: string;
  canEdit?: boolean;
  busy?: boolean;
  placeholder?: 'camera' | 'bottle';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onPick?: (file: File) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
};

export default function InventoryPhotoThumb({
  imagePath,
  label,
  canEdit,
  busy,
  placeholder = 'camera',
  size = 'sm',
  onPick,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const url = inventoryImagePublicUrl(imagePath);
  const hasCustomImage = Boolean(url);
  const previewUrl = url ?? (placeholder === 'bottle' ? DEFAULT_REFRIGERANT_BOTTLE_IMAGE : null);

  function openPicker() {
    if (canEdit && !busy) inputRef.current?.click();
  }

  function openPreview() {
    if (previewUrl) setLightboxOpen(true);
  }

  return (
    <div className={`inventory-photo-thumb inventory-photo-thumb-${size}`}>
      <button
        type="button"
        className={`inventory-photo-btn${placeholder === 'bottle' ? ' inventory-photo-btn-bottle' : ''}${hasCustomImage ? ' inventory-photo-btn-previewable' : ''}`}
        disabled={busy || (!hasCustomImage && !canEdit)}
        onClick={() => {
          if (hasCustomImage) openPreview();
          else openPicker();
        }}
        aria-label={
          hasCustomImage
            ? `${label}, näytä kuva suurena`
            : canEdit
              ? `${label}, lisää kuva`
              : `${label}, ei kuvaa`
        }
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" loading="lazy" className={placeholder === 'bottle' && !url ? 'inventory-bottle-default-img' : undefined} />
        ) : (
          <span className="inventory-photo-placeholder" aria-hidden>
            📷
          </span>
        )}
      </button>
      {canEdit && hasCustomImage ? (
        <button
          type="button"
          className="inventory-photo-edit"
          disabled={busy}
          onClick={openPicker}
          aria-label={`${label}, vaihda kuva`}
        >
          Vaihda
        </button>
      ) : null}
      {canEdit && url && onRemove ? (
        <button type="button" className="inventory-photo-remove" disabled={busy} onClick={() => void onRemove()}>
          ×
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && onPick) void onPick(file);
        }}
      />
      {lightboxOpen && previewUrl ? (
        <MaintenanceReportImageLightbox url={previewUrl} onClose={() => setLightboxOpen(false)} />
      ) : null}
    </div>
  );
}
