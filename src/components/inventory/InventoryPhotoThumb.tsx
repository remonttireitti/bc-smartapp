import { useRef } from 'react';
import { inventoryImagePublicUrl } from '../../lib/inventoryImages';

function RefrigerantBottleIcon() {
  return (
    <svg className="inventory-bottle-icon" viewBox="0 0 64 96" aria-hidden>
      <path
        d="M22 8h20c2 0 4 2 4 4v6h6c3 0 5 2 5 5v58c0 6-5 11-11 11H22c-6 0-11-5-11-11V23c0-3 2-5 5-5h6v-6c0-2 2-4 4-4z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M26 10h12v8h-12V10zm-2 14h16v52c0 4-3 7-7 7H31c-4 0-7-3-7-7V24z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M28 38h8v28H28z" fill="currentColor" opacity="0.35" />
      <ellipse cx="32" cy="18" rx="8" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type Props = {
  imagePath: string | null | undefined;
  label: string;
  canEdit?: boolean;
  busy?: boolean;
  placeholder?: 'camera' | 'bottle';
  size?: 'sm' | 'md';
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
  const url = inventoryImagePublicUrl(imagePath);

  return (
    <div className={`inventory-photo-thumb inventory-photo-thumb-${size}`}>
      <button
        type="button"
        className={`inventory-photo-btn${placeholder === 'bottle' ? ' inventory-photo-btn-bottle' : ''}`}
        disabled={!canEdit || busy}
        onClick={() => {
          if (canEdit) inputRef.current?.click();
        }}
        aria-label={url ? `${label}, vaihda kuva` : `${label}, lisää kuva`}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : placeholder === 'bottle' ? (
          <RefrigerantBottleIcon />
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
