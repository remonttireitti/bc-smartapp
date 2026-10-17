import { Link } from 'react-router-dom';
import DataTable, { type DataTableColumn } from './DataTable';
import { customerAddressLine } from '../lib/customers';
import { subscriberLabel } from '../lib/subscribers';
import type { Customer } from '../types';

type Props = {
  customers: Customer[];
  showSubscriber?: boolean;
  showPortalAction?: (customer: Customer) => boolean;
};

/** Asiakasrekisteri taulukkona: Nimi, Osoite, Puhelin, Tilaaja, Rekisteri. */
export function CustomerListTable({ customers, showSubscriber, showPortalAction }: Props) {
  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      label: 'Nimi',
      value: (c) => c.name,
      render: (c) => (
        <>
          {c.name}
          {c.is_onboarding_demo ? <span className="badge badge-demo" style={{ marginLeft: 6 }}>Esimerkki</span> : null}
        </>
      ),
    },
    { key: 'address', label: 'Osoite', value: (c) => customerAddressLine(c) },
    { key: 'phone', label: 'Puhelin', value: (c) => c.phone ?? '', className: 'nowrap' },
  ];
  if (showSubscriber) {
    columns.push({
      key: 'subscriber',
      label: 'Tilaaja',
      value: (c) => (c.subscriber_id || c.subscriber?.name ? subscriberLabel(c.subscriber) : ''),
    });
  }
  if (customers.some((c) => c.owner_company?.name)) {
    columns.push({ key: 'registry', label: 'Rekisteri', value: (c) => c.owner_company?.name ?? '' });
  }
  const anyAction = !!showPortalAction && customers.some((c) => showPortalAction(c));

  return (
    <DataTable
      rows={customers}
      columns={columns}
      rowKey={(c) => c.id}
      rowHref={(c) => `/asiakkaat/${c.id}`}
      hideFilter
      initialSort={{ key: 'name', dir: 'asc' }}
      ariaLabel="Asiakasrekisteri"
      actions={
        anyAction
          ? (c) =>
              showPortalAction!(c) ? (
                <Link to={`/asiakkaat/${c.id}#customer-portal`} className="btn btn-secondary btn-sm">
                  Asiakasportaali
                </Link>
              ) : null
          : undefined
      }
    />
  );
}
