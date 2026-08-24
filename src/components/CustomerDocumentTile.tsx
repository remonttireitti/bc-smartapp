import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PrinterIcon } from './PrintIcons';
import {
  CUSTOMER_DOCUMENT_TILE_COLORS,
  documentTileSubtitle,
} from '../lib/customerSectionHelpers';
import type { CustomerLinkedDocument } from '../lib/customerDocuments';

type Props = {
  document: CustomerLinkedDocument;
};

export function CustomerDocumentTile({ document: doc }: Props) {
  const color = CUSTOMER_DOCUMENT_TILE_COLORS[doc.kind] ?? '#64748B';
  const subtitle = documentTileSubtitle(doc);

  if (doc.kind === 'file') {
    return (
      <div className="tile customer-document-tile is-static" style={{ background: color }}>
        <div className="customer-document-tile-body">
          <strong className="customer-document-tile-title">{doc.title}</strong>
          <span className="customer-document-tile-line">{subtitle}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-document-tile-wrap">
      <Link to={doc.href} className="tile customer-document-tile" style={{ background: color }}>
        <div className="customer-document-tile-body">
          <strong className="customer-document-tile-title">{doc.title}</strong>
          <span className="customer-document-tile-line">{subtitle}</span>
        </div>
      </Link>
      {doc.printHref ? (
        <Link
          to={doc.printHref}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-action-btn customer-document-tile-print"
          aria-label="Tulosta"
        >
          <PrinterIcon title="Tulosta" />
        </Link>
      ) : null}
    </div>
  );
}

export function CustomerDocumentGrid({ children }: { children: ReactNode }) {
  return <div className="grid customer-document-grid">{children}</div>;
}
