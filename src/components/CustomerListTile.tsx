import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { customerAddressLine } from '../lib/customers';
import { subscriberLabel } from '../lib/subscribers';
import type { Customer } from '../types';

type Props = {
  customer: Customer;
  color: string;
  showSubscriber?: boolean;
  showPortalAction?: boolean;
};

export function CustomerListTile({ customer, color, showSubscriber, showPortalAction }: Props) {
  const hasSubscriber = Boolean(customer.subscriber_id || customer.subscriber?.name);
  const portalHref = `/asiakkaat/${customer.id}#customer-portal`;

  return (
    <div className="customer-list-tile-wrap">
      <Link to={`/asiakkaat/${customer.id}`} className="tile customer-list-tile" style={{ background: color }}>
        <div className="customer-list-tile-body">
          <strong className="customer-list-tile-title">{customer.name}</strong>
          {customer.is_onboarding_demo ? <span className="badge badge-demo">Esimerkki</span> : null}
          <span className="customer-list-tile-line">{customerAddressLine(customer)}</span>
          {customer.phone ? <span className="customer-list-tile-line">{customer.phone}</span> : null}
          {showSubscriber ? (
            <span className={`customer-list-tile-meta${hasSubscriber ? '' : ' customer-list-no-subscriber'}`}>
              Tilaaja: {subscriberLabel(customer.subscriber)}
            </span>
          ) : null}
          {customer.owner_company?.name ? (
            <span className="customer-list-tile-meta">Rekisteri: {customer.owner_company.name}</span>
          ) : null}
        </div>
      </Link>
      {showPortalAction ? (
        <Link to={portalHref} className="btn btn-secondary btn-sm customer-list-tile-action">
          Asiakasportaali
        </Link>
      ) : null}
    </div>
  );
}

export function CustomerListGrid({ children }: { children: ReactNode }) {
  return <div className="grid customer-list-grid">{children}</div>;
}
