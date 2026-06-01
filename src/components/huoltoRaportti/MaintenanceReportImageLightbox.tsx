import { useEffect } from 'react';

type Props = {
  url: string;
  onClose: () => void;
};

export function MaintenanceReportImageLightbox({ url, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="huolto-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Kuva suurennettu"
      onClick={onClose}
    >
      <button type="button" className="huolto-image-lightbox-close btn btn-secondary" onClick={onClose}>
        Sulje
      </button>
      <img src={url} alt="" className="huolto-image-lightbox-img" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
