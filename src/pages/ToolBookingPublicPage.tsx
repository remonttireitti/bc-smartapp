import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  createPublicToolBooking,
  loadToolsBookingPublic,
} from '../lib/toolBookingShares';
import { inventoryImagePublicUrl } from '../lib/inventoryImages';
import {
  buildMonthGrid,
  computeDeliveryFee,
  dateInputToIsoEnd,
  dateInputToIsoStart,
  dateYmdOverlapsBusy,
  formatToolEuro,
  shiftMonth,
  toolDayRateBadge,
  toolRateLabelRows,
} from '../lib/toolInventory';
import type { ToolBookingPublicBundle } from '../types/inventory';

const WEEKDAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

export default function ToolBookingPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [bundle, setBundle] = useState<ToolBookingPublicBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex0: now.getMonth() };
  });
  const [selectedToolId, setSelectedToolId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'none' | 'delivery' | 'pickup'>('none');
  const [distanceKm, setDistanceKm] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  async function reload() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadToolsBookingPublic(token);
      setBundle(data);
      setSelectedToolId((prev) => prev || data.tools[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lataus epäonnistui.');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Varauslinkki puuttuu.');
      setLoading(false);
      return;
    }
    void reload();
  }, [token]);

  useEffect(() => {
    if (!bundle?.company.name) return;
    const prev = document.title;
    document.title = `Varauskalenteri — ${bundle.company.name}`;
    return () => {
      document.title = prev;
    };
  }, [bundle?.company.name]);

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.monthIndex0),
    [cursor.year, cursor.monthIndex0],
  );

  const monthLabel = useMemo(
    () =>
      new Date(cursor.year, cursor.monthIndex0, 1).toLocaleDateString('fi-FI', {
        month: 'long',
        year: 'numeric',
      }),
    [cursor.year, cursor.monthIndex0],
  );

  const selectedTool = bundle?.tools.find((t) => t.id === selectedToolId) ?? null;
  const toolBusy = useMemo(
    () => (bundle?.busy ?? []).filter((b) => !selectedToolId || b.tool_id === selectedToolId),
    [bundle?.busy, selectedToolId],
  );

  const deliveryFee = useMemo(() => {
    if (deliveryMode !== 'delivery' || !bundle) return null;
    const dist = Number(String(distanceKm).replace(',', '.'));
    if (!Number.isFinite(dist)) return null;
    return computeDeliveryFee({
      distanceKm: dist,
      minFeeEur: Number(bundle.company.delivery_min_fee_eur ?? 0),
      limitKm: Number(bundle.company.delivery_distance_limit_km ?? 0),
      perKmEur: Number(bundle.company.delivery_per_km_eur ?? 0),
    });
  }, [bundle, deliveryMode, distanceKm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedToolId) return;
    const startsAt = dateInputToIsoStart(start);
    const endsAt = dateInputToIsoEnd(end);
    if (!startsAt || !endsAt) {
      setError('Valitse alku- ja loppupäivä.');
      return;
    }
    if (!guestName.trim()) {
      setError('Nimi on pakollinen.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createPublicToolBooking({
        token,
        toolId: selectedToolId,
        startsAt,
        endsAt,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
        deliveryMode,
        deliveryDistanceKm:
          deliveryMode === 'delivery' ? Number(String(distanceKm).replace(',', '.')) || 0 : null,
        deliveryAddress: deliveryMode === 'delivery' ? deliveryAddress.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      setMessage('Varauspyyntö lähetetty. Saat vahvistuksen yritykseltä.');
      setGuestName('');
      setGuestPhone('');
      setGuestEmail('');
      setNotes('');
      setDistanceKm('');
      setDeliveryAddress('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Varaus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="public-booking-page">
        <p className="muted">Ladataan varauskalenteria…</p>
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <div className="public-booking-page">
        <h1>Varauskalenteri</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!bundle) return null;

  return (
    <div className="public-booking-page">
      <header className="public-booking-header">
        <p className="muted" style={{ margin: 0 }}>
          Julkinen varaus
        </p>
        <h1 style={{ margin: '.2rem 0 0' }}>{bundle.company.name}</h1>
        <p className="muted">Varaa lainattava työkalu. Vapaa = vihreä, varattu = punainen.</p>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <section className="panel">
        <div className="tool-booking-cal-nav">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, -1))}
          >
            ←
          </button>
          <h2 style={{ margin: 0, textTransform: 'capitalize', fontSize: '1.1rem' }}>{monthLabel}</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, 1))}
          >
            →
          </button>
        </div>
        <div className="tool-booking-cal-weekdays">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="tool-booking-cal-grid" role="grid" aria-label="Varauskalenteri">
          {grid.map((cell) => {
            const busyDay = dateYmdOverlapsBusy(cell.ymd, toolBusy, selectedToolId || undefined);
            return (
              <button
                key={cell.ymd}
                type="button"
                className={`tool-booking-cal-day ${cell.inMonth ? '' : 'is-outside'} ${
                  busyDay ? 'is-busy' : 'is-free'
                } ${start === cell.ymd || end === cell.ymd ? 'is-selected' : ''}`}
                disabled={!cell.inMonth}
                onClick={() => {
                  if (!start || (start && end)) {
                    setStart(cell.ymd);
                    setEnd('');
                  } else if (cell.ymd < start) {
                    setStart(cell.ymd);
                    setEnd('');
                  } else {
                    setEnd(cell.ymd);
                  }
                }}
              >
                <span className="tool-booking-cal-day-num">{cell.date.getDate()}</span>
              </button>
            );
          })}
        </div>
        <p className="muted" style={{ margin: '.65rem 0 0', fontSize: '.9rem' }}>
          Valittu: {start || '—'} {end ? `– ${end}` : ''}
          {selectedTool ? ` · ${selectedTool.name}` : ''}
        </p>
      </section>

      <section className="panel">
        <h2>Lainattavat työkalut</h2>
        {bundle.tools.length === 0 ? (
          <p className="muted">Ei lainattavia työkaluja juuri nyt.</p>
        ) : (
          <ul className="tool-card-grid">
            {bundle.tools.map((tool) => {
              const selected = tool.id === selectedToolId;
              const thumb = tool.image_path ? inventoryImagePublicUrl(tool.image_path) : null;
              const dayBadge = toolDayRateBadge(tool);
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={`tool-card tool-card-select ${selected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedToolId(tool.id)}
                  >
                    <div className="tool-card-thumb" aria-hidden="true">
                      {thumb ? <img src={thumb} alt="" /> : <span className="muted">—</span>}
                    </div>
                    <div className="tool-card-body">
                      <strong>{tool.name}</strong>
                      <p className="muted" style={{ margin: '.2rem 0 0' }}>
                        {tool.category ?? 'Työkalu'}
                        {dayBadge ? ` · ${dayBadge}` : ''}
                      </p>
                      <p style={{ margin: '.35rem 0 0', fontSize: '.85rem' }}>
                        {toolRateLabelRows(tool)
                          .filter((r) => r.value !== '—')
                          .map((r) => `${r.label} ${r.value}`)
                          .join(' · ') || 'Hinnasto sovitaan'}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel form-section">
        <h2>Tee varaus</h2>
        <form onSubmit={(e) => void onSubmit(e)} className="line-form-grid">
          <label>
            Työkalu *
            <select value={selectedToolId} onChange={(e) => setSelectedToolId(e.target.value)} required>
              {bundle.tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alkaa *
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            Päättyy *
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label>
            Nimi *
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
          </label>
          <label>
            Puhelin
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
          </label>
          <label>
            Sähköposti
            <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
          </label>

          {(bundle.company.delivery_enabled || bundle.company.pickup_enabled) && (
            <fieldset className="tool-delivery-fieldset" style={{ gridColumn: '1 / -1' }}>
              <legend>Kuljetus / nouto</legend>
              <div className="tool-delivery-options">
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="delivery_mode"
                    checked={deliveryMode === 'none'}
                    onChange={() => setDeliveryMode('none')}
                  />{' '}
                  Ei kuljetusta
                </label>
                {bundle.company.delivery_enabled && (
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="delivery_mode"
                      checked={deliveryMode === 'delivery'}
                      onChange={() => setDeliveryMode('delivery')}
                    />{' '}
                    Kuljetus
                  </label>
                )}
                {bundle.company.pickup_enabled && (
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="delivery_mode"
                      checked={deliveryMode === 'pickup'}
                      onChange={() => setDeliveryMode('pickup')}
                    />{' '}
                    Nouto
                  </label>
                )}
              </div>
              {deliveryMode === 'delivery' && (
                <div className="line-form-grid" style={{ marginTop: '.65rem' }}>
                  <label>
                    Etäisyys (km)
                    <input
                      inputMode="decimal"
                      value={distanceKm}
                      onChange={(e) => setDistanceKm(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Toimitusosoite
                    <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                  </label>
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Minimihinta {formatToolEuro(bundle.company.delivery_min_fee_eur)} (
                    {bundle.company.delivery_distance_limit_km ?? 0} km asti)
                    {bundle.company.delivery_per_km_eur != null
                      ? ` · yli rajan ${formatToolEuro(bundle.company.delivery_per_km_eur)}/km`
                      : ''}
                    {deliveryFee != null && Number.isFinite(deliveryFee)
                      ? ` · arvioitu maksu ${formatToolEuro(deliveryFee)}`
                      : ''}
                  </p>
                </div>
              )}
            </fieldset>
          )}

          <label style={{ gridColumn: '1 / -1' }}>
            Huomio
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !selectedToolId}>
              {busy ? 'Lähetetään…' : 'Lähetä varauspyyntö'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
