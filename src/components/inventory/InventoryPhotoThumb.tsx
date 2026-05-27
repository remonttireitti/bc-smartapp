import { useRef } from 'react';
import { inventoryImagePublicUrl } from '../../lib/inventoryImages';

type Props = {
  imagePath: string | null | undefined;
  label: string;
  canEdit?: boolean;
  busy?: boolean;
  onPick?: (file: File) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
};

export default function InventoryPhotoThumb({ imagePath, label, canEdit, busy, onPick, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = inventoryImagePublicUrl(imagePath);

  return (
    <div className="inventory-photo-thumb">
      <button
        type="button"
        className="inventory-photo-btn"
        disabled={!canEdit || busy}
        onClick={() => {
          if (canEdit) inputRef.current?.click();
        }}
        aria-label={url ? `${label}, vaihda kuva` : `${label}, lisää kuva`}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : (
          <span className="inventory-photo-placeholder" aria-hidden>
            📷
          </span>
        )}
      </button>
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
    </div>
  );
}
