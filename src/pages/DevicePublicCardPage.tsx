import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DeviceQrNotFoundError, loadDevicePublicCard, type DevicePublicCard } from '../lib/devicePublicCard';
import { refrigerantGwp } from '../lib/huoltoSchedule';

/** d.m.yyyy */
function dateFi(value: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : '—';
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} kg`;
}

/** QR-sivu: julkinen, vain luku. Laitteen tiedot + huoltojen ja korjausten lista (uusin ensin). */
export default function DevicePublicCardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [card, setCard] = useState<DevicePublicCard | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void loadDevicePublicCard(token).then(
      (c) => {
        if (cancelled) return;
        setCard(c);
        setState('ok');
      },
      (err) => {
        if (cancelled) return;
        setCard(null);
        setState(err instanceof DeviceQrNotFoundError ? 'invalid' : 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') return <div className="device-public-page"><p className="device-public-status">Ladataan…</p></div>;
  if (state !== 'ok' || !card) {
    return (
      <div className="device-public-page">
        <p className="device-public-status device-public-error" data-testid="device-public-invalid">
          {state === 'error' ? 'Tietojen haku epäonnistui.' : 'Linkki ei ole voimassa.'}
        </p>
      </div>
    );
  }

  const d = card.device;
  const title = d.tag || d.name || 'Laite';
  const model = [d.manufacturer, d.model].filter(Boolean).join(' ');
  const gwp = d.gwp ?? refrigerantGwp(d.refrigerant);
  const refrigerant = [d.refrigerant, d.chargeKg != null ? formatKg(d.chargeKg) : null, gwp != null ? `GWP ${gwp.toLocaleString('fi-FI')}` : null]
    .filter(Boolean)
    .join(' · ');
  const site = [d.address, d.location].filter(Boolean).join(' · ');
  const info: Array<[string, string, string]> = [
    ['Malli', model, 'model'],
    ['Kylmäaine', refrigerant, 'refrigerant'],
    ['Omistaja', d.owner ?? '', 'owner'],
    ['Osoite', site, 'address'],
  ];

  return (
    <div className="device-public-page" data-testid="device-public-card">
      <h1 className="device-public-title" data-testid="device-public-title">{title}</h1>
      <dl className="device-public-info-list">
        {info.filter(([, v]) => v).map(([k, v, id]) => (
          <div key={id} data-testid={`device-public-${id}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h2 className="device-public-subtitle">Huollot ja korjaukset</h2>
      {card.rows.length === 0 ? (
        <p className="device-public-status">Ei merkintöjä vielä.</p>
      ) : (
        <ul className="device-public-rows" data-testid="device-public-rows">
          {card.rows.map((r) => (
            <li key={r.id} className="device-public-row">
              <span className="device-public-row-head">
                <strong>{dateFi(r.date)}</strong>
                {r.installer ? ` · ${r.installer}` : ''}
                {r.tukes ? ` · Tukes ${r.tukes}` : ''}
              </span>
              {r.text ? <span className="device-public-row-text">{r.text}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="device-public-footer">
        Huoltopöytäkirjaa ylläpitää <a href="https://bestcool.eu" target="_blank" rel="noreferrer">BC Smartapp</a>
      </p>
    </div>
  );
}
