import { useId, type ReactNode } from 'react';
import { useQuoteModuleDialog } from './QuoteModuleDialogContext';

export type QuoteTileTheme = {
  header: string;
};

type Props = {
  tileId: string;
  title: string;
  subtitle?: string;
  theme: QuoteTileTheme;
  children: ReactNode;
};

export function quoteSectionDomId(tileId: string) {
  return `quote-section-${tileId}`;
}

export function QuoteDocumentTile({ tileId, title, subtitle, theme, children }: Props) {
  const contentId = useId();
  const moduleDialog = useQuoteModuleDialog();

  function handleClick() {
    moduleDialog?.open(tileId);
  }

  return (
    <div id={quoteSectionDomId(tileId)} className="quote-document-tile-wrap">
      <button
        type="button"
        className="tile quote-document-tile"
        style={{ background: theme.header }}
        onClick={handleClick}
        aria-controls={contentId}
      >
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </button>
      <div id={contentId} className="quote-document-section-body--hidden" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
