import { Link } from 'react-router-dom';
import {
  formatPendingWorkOrderMessage,
  type PendingWorkOrderCounts,
} from '../lib/pendingWorkOrders';

interface Props {
  counts: PendingWorkOrderCounts;
  className?: string;
}

export default function PendingWorkOrdersBanner({ counts, className }: Props) {
  const message = formatPendingWorkOrderMessage(counts);
  if (!message) return null;

  return (
    <section
      className={['pending-work-orders-banner', className].filter(Boolean).join(' ')}
      role="status"
    >
      <div className="pending-work-orders-banner__content">
        <strong className="pending-work-orders-banner__title">{message}</strong>
        <p className="muted pending-work-orders-banner__hint">
          Avaa työraportit, ota tilaus vastaan tai siirrä kumppanille.
        </p>
      </div>
      <Link to="/tyoraportit" className="btn btn-primary">
        Avaa työtilaukset
      </Link>
    </section>
  );
}
