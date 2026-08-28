import {
  formatFinnishDayCount,
  formatRentalPeriodLabel,
  rentalDayCount,
  rentalRegisteredDate,
} from '../../lib/refrigerantBottle';
import { formatDate } from '../../types';
import type { RefrigerantCylinder } from '../../types/inventory';

type Props = {
  cylinder: RefrigerantCylinder;
  variant?: 'card' | 'detail';
};

export default function RefrigerantRentalInfo({ cylinder, variant = 'card' }: Props) {
  if (cylinder.ownership_type !== 'rental') return null;

  const days = rentalDayCount(cylinder);
  if (days == null) return null;

  const startDate = rentalRegisteredDate(cylinder);
  const returned = Boolean(cylinder.returned_at);

  if (variant === 'detail') {
    return (
      <div className="inventory-bottle-rental-info inventory-bottle-rental-info-detail">
        <p className="inventory-bottle-rental-days">{formatFinnishDayCount(days)}</p>
        <p className="inventory-bottle-rental-meta muted">
          {returned
            ? `Vuokralla ${formatDate(startDate)} – ${formatDate(cylinder.returned_at!.slice(0, 10))}`
            : `Varastoon kirjattu ${formatDate(startDate)}`}
        </p>
      </div>
    );
  }

  return (
    <p className="inventory-bottle-rental-info" title={formatRentalPeriodLabel(cylinder) ?? undefined}>
      <strong>{formatFinnishDayCount(days)}</strong>
      <span className="inventory-bottle-rental-meta">
        {returned
          ? ` vuokralla · ${formatDate(startDate)} – ${formatDate(cylinder.returned_at!.slice(0, 10))}`
          : ` vuokralla · varastoon ${formatDate(startDate)}`}
      </span>
    </p>
  );
}
