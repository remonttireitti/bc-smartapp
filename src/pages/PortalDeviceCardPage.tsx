import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { EQUIPMENT_SELECT } from '../lib/customers';
import { loadCustomerLinkedDocuments, type CustomerLinkedDocument } from '../lib/customerDocuments';
import { effectiveDeviceFields, formatRefrigerant, loadEquipmentDeviceFields, type EquipmentDeviceFields } from '../lib/equipmentDeviceFields';
import { getPortalCustomerId, getPortalSubscriberId, isPortalView } from '../lib/portalPreview';
import { supabase } from '../lib/supabase';
import type { Equipment } from '../types';

const SECTIONS: Array<[CustomerLinkedDocument['kind'], string]> = [
  ['maintenance_report', 'Huoltopöytäkirjat'],
  ['work_report', 'Työraportit'],
  ['quote_request', 'Tarjoukset'],
];

function fiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI');
}

/** Asiakasportaalin laitekortti: vain luku, linkit asiakastulosteisiin. */
export default function PortalDeviceCardPage({ session }: { session: Session }) {
  const { id } = useParams();
  const { profile, loading } = useProfile(session);
  const portal = isPortalView(profile);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [fields, setFields] = useState<EquipmentDeviceFields | null>(null);
  const [docs, setDocs] = useState<CustomerLinkedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !profile || !id) return;
    void (async () => {
      const { data, error: e } = await supabase.from('equipment').select(EQUIPMENT_SELECT).eq('id', id).maybeSingle();
      const eq = data as (Equipment & { customers?: { subscriber_id?: string | null } | null }) | null;
      if (e || !eq) {
        setError('Laitetta ei löytynyt.');
        return;
      }
      // Vain portaalin oma kohde (myös esikatselussa).
      const ownCustomer = getPortalCustomerId(profile);
      const ownSubscriber = getPortalSubscriberId(profile);
      if (ownCustomer && eq.customer_id !== ownCustomer) {
        setError('Laitetta ei löytynyt.');
        return;
      }
      if (ownSubscriber) {
        const { data: c } = await supabase.from('customers').select('subscriber_id').eq('id', eq.customer_id).maybeSingle();
        if ((c as { subscriber_id?: string } | null)?.subscriber_id !== ownSubscriber) {
          setError('Laitetta ei löytynyt.');
          return;
        }
      }
      setEquipment(eq);
      const map = await loadEquipmentDeviceFields(supabase, [eq.id]).catch(() => null);
      setFields(effectiveDeviceFields(map?.get(eq.id) ?? null, eq.huolto_technical_snapshot));
      const all = await loadCustomerLinkedDocuments(supabase, eq.customer_id, { portalReadOnly: true }).catch(() => []);
      setDocs(all.filter((d) => d.equipmentId === eq.id || d.equipmentIds?.includes(eq.id)));
    })();
  }, [loading, profile?.id, id]);

  const rows: Array<[string, string | null | undefined]> = equipment
    ? [
        ['Tunnus', equipment.tag],
        ['Merkki / malli', [fields?.manufacturer, equipment.model].filter(Boolean).join(' ')],
        ['Sarjanumero', equipment.serial_number],
        ['Kylmäaine', fields ? formatRefrigerant(fields) : ''],
        ['Sijainti', equipment.location],
        ['Asennettu', fields?.installed_on ? fiDate(fields.installed_on) : ''],
      ]
    : [];

  return (
    <AppLayout session={session}>
      {!portal ? (
        <p className="muted">Näkymä on asiakasportaalia varten.</p>
      ) : error ? (
        <>
          <p className="error">{error}</p>
          <Link to="/laitteet" className="btn btn-secondary">← Laitteet</Link>
        </>
      ) : !equipment ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1>{equipment.name}</h1>
            </div>
            <div className="page-header-actions">
              <Link to="/laitteet" className="btn btn-secondary">← Laitteet</Link>
            </div>
          </div>
          <section className="panel">
            <dl className="detail-list compact">
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
          {SECTIONS.map(([kind, label]) => {
            const list = docs.filter((d) => d.kind === kind);
            return (
              <section key={kind} className="panel">
                <h2>{label} ({list.length})</h2>
                {list.length === 0 ? (
                  <p className="muted">Ei vielä.</p>
                ) : (
                  <ul className="report-list report-list-modern">
                    {list.map((d) => (
                      <li key={d.id}>
                        <Link to={d.printHref ?? d.href} className="report-link">
                          <div className="report-link-body">
                            <strong>{d.title}</strong>
                            <span className="muted">{fiDate(d.date)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </AppLayout>
  );
}
