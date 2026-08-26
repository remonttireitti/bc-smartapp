import { useCallback, useState, type ReactNode } from 'react';
import { QuoteDialogShell } from './QuoteDialogShell';
import { QuoteDocumentTile } from './QuoteDocumentTile';
import { QuoteModuleDialogProvider, useRegisterQuoteModuleDialog } from './QuoteModuleDialogContext';
import {
  QUOTE_TILE_THEMES,
  type QuoteDocumentTileEntry,
} from '../../lib/quoteRequest/quoteDocumentThemes';

export function QuoteTileDialogUnit({
  tileId,
  title,
  children,
}: {
  tileId: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  useRegisterQuoteModuleDialog(tileId, openDialog);

  return (
    <QuoteDialogShell open={open} title={title} titleId={`quote-dialog-${tileId}`} onClose={closeDialog}>
      {children}
    </QuoteDialogShell>
  );
}

type Props<TId extends string> = {
  sectionTitle: string;
  hint?: string;
  tiles: QuoteDocumentTileEntry<TId>[];
  renderTileContent: (tileId: TId) => ReactNode;
  footer?: ReactNode;
};

function QuoteDocumentSectionViewInner<TId extends string>({
  sectionTitle,
  hint,
  tiles,
  renderTileContent,
  footer,
}: Props<TId>) {
  return (
    <section className="form-section quote-document-section">
      <h2>{sectionTitle}</h2>
      {hint ? <p className="muted quote-document-section-hint">{hint}</p> : null}
      <div className="grid quote-document-grid">
        {tiles.map((tile) => (
          <QuoteDocumentTile
            key={tile.id}
            tileId={tile.id}
            title={tile.title}
            subtitle={tile.subtitle}
            theme={QUOTE_TILE_THEMES[tile.themeKey]}
          >
            <QuoteTileDialogUnit tileId={tile.id} title={tile.title}>
              {renderTileContent(tile.id)}
            </QuoteTileDialogUnit>
          </QuoteDocumentTile>
        ))}
      </div>
      {footer}
    </section>
  );
}

export default function QuoteDocumentSectionView<TId extends string>(props: Props<TId>) {
  return (
    <QuoteModuleDialogProvider>
      <QuoteDocumentSectionViewInner {...props} />
    </QuoteModuleDialogProvider>
  );
}
