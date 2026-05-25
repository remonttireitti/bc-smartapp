import { Link } from 'react-router-dom';
import { customerAddressLine } from '../lib/customers';
import type { Customer } from '../types';

export function CustomerListItem({ customer }: { customer: Customer }) {
  const isPartner = customer.owner_company?.name;

  return (
    <Link to={`/asiakkaat/${customer.id}`} className="report-link">
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
  );
}
