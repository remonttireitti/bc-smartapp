import { Link } from 'react-router-dom';
import { customerAddressLine } from '../lib/customers';
import type { Customer } from '../types';

type Props = {
  customer: Customer;
  showPortalAction?: boolean;
};

export function CustomerListItem({ customer, showPortalAction }: Props) {
  const isPartner = customer.owner_company?.name;
  const portalHref = `/asiakkaat/${customer.id}#customer-portal`;

  return (
    <div className="report-list-row-actions customer-list-row">
      <Link to={`/asiakkaat/${customer.id}`} className="report-link customer-list-link">
        <div className="report-link-body">
          <strong>{customer.name}</strong>
          <span className="muted">{customerAddressLine(customer)}</span>
          {customer.phone && <span className="muted">{customer.phone}</span>}
          {isPartner && (
            <span className="muted">Rekisteri: {customer.owner_company?.name}</span>
          )}
        </div>
        <span className="report-link-arrow">→</span>
      </Link>
      {showPortalAction && (
        <Link to={portalHref} className="btn btn-secondary btn-sm">
          Avaa asiakasportaali
        </Link>
      )}
    </div>
  );
}
