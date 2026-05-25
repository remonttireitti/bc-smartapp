import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import EquipmentSnapshotReadOnly from '../components/equipment/EquipmentSnapshotReadOnly';
import { DeviceCardIcon, HistoryIcon, PrinterIcon } from '../components/PrintIcons';
import Tooltip from '../components/Tooltip';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { CUSTOMER_SELECT, EQUIPMENT_SELECT, customerAddressLine } from '../lib/customers';
import {
  buildEquipmentCardPrintHtml,
  buildLatestMaintenanceByEquipment,
  buildMaintenanceHistoryForEquipment,
  buildMaintenanceHistoryPrintHtml,
  formatMaintenanceDateFi,
  loadCustomerMaintenanceContext,
} from '../lib/equipmentMaintenanceHistory';
import {
  CUSTOMER_DOCUMENT_KIND_LABELS,
  loadCustomerLinkedDocuments,
  type CustomerLinkedDocument,
} from '../lib/customerDocuments';
import { deviceTypeLabel, parseEquipmentSnapshot } from '../lib/huoltoRaportti/equipmentSnapshotDisplay';
import { customerDetailTrail, equipmentDetailTrail, withNavTrail } from '../lib/navigationTrail';
import { openPrintHtml } from '../lib/openPrintWindow';
import { supabase } from '../lib/supabase';
import { useProfile } from '../hooks/useProfile';
import type { Customer, Equipment } from '../types';

interface Props {
  session: Session;
}

function equipmentTitle(eq: Equipment): string {
  return eq.tag ? `${eq.tag} — ${eq.name}` : eq.name;
}

export default function EquipmentDetailPage({ session }: Props) {
  const { customerId, equipmentId } = useParams<{ customerId: string; equipmentId: string }>();
  const { profile } = useProfile(session);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [documents, setDocuments] = useState<CustomerLinkedDocument[]>([]);
  const [maintenanceRows, setMaintenanceRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['maintenanceRows']
  >([]);
  const [workRows, setWorkRows] = useState<
    Awaited<ReturnType<typeof loadCustomerMaintenanceContext>>['workRows']
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState<'card' | 'history' | null>(null);

  useEffect(() => {
    if (customerId && equipmentId) void load();
  }, [customerId, equipmentId, profile?.company_id]);

  async function load() {
    if (!customerId || !equipmentId) return;
    setLoading(true);
    setError(null);

    const [customerResult, equipmentResult, linkedDocuments, maintenanceContext] = await Promise.all([
      supabase.from('customers').select(CUSTOMER_SELECT).eq('id', customerId).maybeSingle(),
      supabase.from('equipment').select(EQUIPMENT_SELECT).eq('id', equipmentId).maybeSingle(),
      loadCustomerLinkedDocuments(supabase, customerId),
      loadCustomerMaintenanceContext(supabase, customerId),
    ]);

    if (customerResult.error || !customerResult.data) {
      setError(customerResult.error?.message ?? 'Asiakasta ei löytynyt.');
      setLoading(false);
      return;
    }

    if (equipmentResult.error || !equipmentResult.data) {
      setError(equipmentResult.error?.message ?? 'Laitetta ei löytynyt.');
      setLoading(false);
      return;
    }

    const customerRow = customerResult.data as unknown as Customer;
    const equipmentRow = equipmentResult.data as Equipment;
    if (equipmentRow.customer_id !== customerId) {
      setError('Laite ei kuulu valittuun asiakkaaseen.');
      setLoading(false);
      return;
    }

    setCustomer(customerRow);
    setEquipment(equipmentRow);
    setDocuments(linkedDocuments.filter((doc) => doc.equipmentId === equipmentId));
    setMaintenanceRows(maintenanceContext.maintenanceRows);
    setWorkRows(maintenanceContext.workRows);
    setLoading(false);
  }

  const latestMaintenanceByEquipment = useMemo(
    () => (equipment ? buildLatestMaintenanceByEquipment([equipment], maintenanceRows) : {}),
    [equipment, maintenanceRows],
  );

  const snapshot = useMemo(
    () => parseEquipmentSnapshot(equipment?.huolto_technical_snapshot),
    [equipment?.huolto_technical_snapshot],
  );

  async function loadPrintBranding(ownerCompanyId: string) {
    const { data } = await supabase.from('companies').select('name, logo_url').eq('id', ownerCompanyId).single();
    const row = data as { name: string; logo_url: string | null } | null;
    let logoUrl: string | null = null;
    try {
      logoUrl = await resolveCompanyLogoUrl(row?.logo_url);
    } catch {
      logoUrl = null;
    }
    return { companyName: row?.name?.trim() || customer?.name || '—', logoUrl };
  }

  async function printEquipmentCard() {
    if (!customer || !equipment) return;
    setPrintBusy('card');
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      openPrintHtml(
        buildEquipmentCardPrintHtml({
          customerName: customer.name,
          equipment,
          latestMaintenanceYmd: latestMaintenanceByEquipment[equipment.id] ?? null,
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Laitekortin tulostus epäonnistui.');
    } finally {
      setPrintBusy(null);
    }
  }

  async function printEquipmentHistory() {
    if (!customer || !equipment) return;
    setPrintBusy('history');
    try {
      const branding = await loadPrintBranding(customer.owner_company_id);
      const entries = buildMaintenanceHistoryForEquipment(equipment, maintenanceRows, workRows);
      openPrintHtml(
        buildMaintenanceHistoryPrintHtml({
          customerName: customer.name,
          sections: [{ deviceLabel: equipmentTitle(equipment), entries }],
          branding,
        }),
      );
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Huoltohistorian tulostus epäonnistui.');
    } finally {
      setPrintBusy(null);
    }
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!customer || !equipment) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Laitetta ei löytynyt.'}</p>
        <Link to={customerId ? `/asiakkaat/${customerId}` : '/asiakkaat'} className="btn btn-secondary">
          ← Takaisin
        </Link>
      </AppLayout>
    );
  }

  const title = equipmentTitle(equipment);
  const trail = equipmentDetailTrail(customer.id, customer.name, title);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/asiakkaat">Asiakkaat</Link> /{' '}
            <Link to={`/asiakkaat/${customer.id}`}>{customer.name}</Link> / {title}
          </p>
          <h1>{title}</h1>
          <p className="muted">
            {deviceTypeLabel(equipment.device_type)} • {customerAddressLine(customer)}
            {equipment.location ? ` • ${equipment.location}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Tooltip label="Tulosta laitekortti">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusy === 'card'}
              onClick={() => void printEquipmentCard()}
              aria-label="Tulosta laitekortti"
            >
              <DeviceCardIcon />
            </button>
          </Tooltip>
          <Tooltip label="Tulosta huoltohistoria">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusy === 'history'}
              onClick={() => void printEquipmentHistory()}
              aria-label="Tulosta huoltohistoria"
            >
              <HistoryIcon />
            </button>
          </Tooltip>
          <Link
            to={`/huoltoraportit/uusi?customerId=${customer.id}&equipmentId=${equipment.id}`}
            className="btn btn-primary"
            {...withNavTrail(trail)}
          >
            + Uusi huoltoraportti
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="panel">
        <h2>Laiteperustiedot</h2>
        <dl className="detail-list">
          <div>
            <dt>Asiakas</dt>
            <dd>
              <Link to={`/asiakkaat/${customer.id}`} {...withNavTrail(customerDetailTrail(customer.id, customer.name))}>
                {customer.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Laite</dt>
            <dd>{equipment.name}</dd>
          </div>
          <div>
            <dt>Tunniste</dt>
            <dd>{equipment.tag || '—'}</dd>
          </div>
          <div>
            <dt>Tyyppi</dt>
            <dd>{deviceTypeLabel(equipment.device_type)}</dd>
          </div>
          <div>
            <dt>Malli</dt>
            <dd>{equipment.model || '—'}</dd>
          </div>
          <div>
            <dt>Sarjanumero</dt>
            <dd>{equipment.serial_number || '—'}</dd>
          </div>
          <div>
            <dt>Sijainti</dt>
            <dd>{equipment.location || '—'}</dd>
          </div>
          <div>
            <dt>Viimeisin huolto</dt>
            <dd>
              {latestMaintenanceByEquipment[equipment.id]
                ? formatMaintenanceDateFi(latestMaintenanceByEquipment[equipment.id])
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Huomiot</dt>
            <dd>{equipment.notes || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Kiinteät laitetiedot</h2>
        <p className="muted">
          Huoltopöytäkirjasta laiterekisteriin tallennetut tiedot: pumput, kompressorit, puhaltimet, paisuntaventtiilit
          ja mallit. Mittaukset ja tarkastukset eivät näy tässä.
        </p>
        {snapshot ? (
          <EquipmentSnapshotReadOnly snapshot={snapshot} />
        ) : (
          <p className="muted">
            Ei vielä tallennettua teknistä tilannekuvaa. Tiedot päivittyvät, kun huoltopöytäkirja tallentaa laiterekisteriin.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Dokumentit ({documents.length})</h2>
        {documents.length === 0 ? (
          <p className="muted">Ei tälle laitteelle kohdistettuja raportteja tai tarjouksia.</p>
        ) : (
          <ul className="report-list compact customer-document-list">
            {documents.map((doc) => (
              <li key={`${doc.kind}:${doc.id}`} className="customer-document-row">
                <Link to={doc.href} className="customer-document-link">
                  <div className="report-link-body">
                    <strong>{doc.title}</strong>
                    <span className="muted">
                      {CUSTOMER_DOCUMENT_KIND_LABELS[doc.kind]}
                      {doc.statusLabel ? ` • ${doc.statusLabel}` : ''}
                      {' • '}
                      {new Date(doc.date).toLocaleDateString('fi-FI')}
                    </span>
                  </div>
                </Link>
                {doc.printHref ? (
                  <Link
                    to={doc.printHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-action-btn customer-document-print"
                    aria-label="Tulosta"
                  >
                    <PrinterIcon title="Tulosta" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}
