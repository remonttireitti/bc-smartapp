import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ToolBookingLoanToggleList from '../components/ToolBookingLoanToggleList';
import {
  createPublicToolBookings,
  loadToolsBookingPublic,
} from '../lib/toolBookingShares';
import {
  buildMonthGrid,
  computeBookingDeliveryFee,
  dateInputToIsoEnd,
  dateInputToIsoStart,
  dateYmdBookingDayStatus,
  deliveryModeNeedsAddress,
  evaluateMultiToolAvailability,
  formatToolEuro,
  formatYmdRangeFi,
  shiftMonth,
} from '../lib/toolInventory';
import {
  TOOL_BOOKING_DELIVERY_LABELS,
  type ToolBookingDeliveryMode,
  type ToolBookingPublicBundle,
} from '../types/inventory';

const WEEKDAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

export default function ToolBookingPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [bundle, setBundle] = useState<ToolBookingPublicBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex0: now.getMonth() };
  });
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<ToolBookingDeliveryMode>('none');
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
      setSelectedToolIds((prev) => {
        const allowed = new Set(data.tools.map((t) => t.id));
        return prev.filter((id) => allowed.has(id));
      });
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
    const prev = document.title;
    document.title = 'Työkalu varauskalenteri';
    return () => {
      document.title = prev;
    };
  }, []);

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

  const selectedTools = useMemo(
    () => (bundle?.tools ?? []).filter((t) => selectedToolIds.includes(t.id)),
    [bundle?.tools, selectedToolIds],
  );

  const availability = useMemo(() => {
    if (!bundle || !start || !end || selectedToolIds.length === 0) return null;
    return evaluateMultiToolAvailability({
      tools: bundle.tools.map((t) => ({ id: t.id, name: t.name })),
      selectedIds: selectedToolIds,
      startYmd: start,
      endYmd: end,
      busy: bundle.busy,
    });
  }, [bundle, selectedToolIds, start, end]);

  const needsAddress = deliveryModeNeedsAddress(deliveryMode);

  const deliveryFee = useMemo(() => {
    if (!needsAddress || !bundle) return null;
    const dist = Number(String(distanceKm).replace(',', '.'));
    if (!Number.isFinite(dist)) return null;
    return computeBookingDeliveryFee(deliveryMode, {
      distanceKm: dist,
      minFeeEur: Number(bundle.company.delivery_min_fee_eur ?? 0),
      limitKm: Number(bundle.company.delivery_distance_limit_km ?? 0),
      perKmEur: Number(bundle.company.delivery_per_km_eur ?? 0),
    });
  }, [bundle, deliveryMode, distanceKm, needsAddress]);

  function onPickDay(ymd: string) {
    if (!start || (start && end)) {
      setStart(ymd);
      setEnd('');
      return;
    }
    if (ymd < start) {
      setStart(ymd);
      setEnd('');
      return;
    }
    setEnd(ymd);
  }

  function proceedWithoutBusy() {
    if (!availability) return;
    setSelectedToolIds(availability.freeTools.map((t) => t.id));
  }

  function applyNextWindow(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const startsAt = dateInputToIsoStart(start);
    const endsAt = dateInputToIsoEnd(end);
    if (!startsAt || !endsAt) {
      setError('Valitse alku- ja loppupäivä.');
      return;
    }
    if (selectedToolIds.length === 0) {
      setError('Valitse vähintään yksi työkalu (Lainaa tämä).');
      return;
    }
    if (!guestName.trim()) {
      setError('Nimi on pakollinen.');
      return;
    }

    const evalNow = bundle
      ? evaluateMultiToolAvailability({
          tools: bundle.tools.map((t) => ({ id: t.id, name: t.name })),
          selectedIds: selectedToolIds,
          startYmd: start,
          endYmd: end,
          busy: bundle.busy,
        })
      : null;
    const freeIds = evalNow?.freeTools.map((t) => t.id) ?? selectedToolIds;
    if (freeIds.length === 0) {
      setError(
        evalNow?.messagesFi.skipBusy ||
          'Mikään valituista työkaluista ei ole vapaa valitulla jaksolla.',
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createPublicToolBookings({
        token,
        toolIds: freeIds,
        startsAt,
        endsAt,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
        deliveryMode,
        deliveryDistanceKm: needsAddress
          ? Number(String(distanceKm).replace(',', '.')) || 0
          : null,
        deliveryAddress: needsAddress ? deliveryAddress.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      const bookedNames = (bundle?.tools ?? [])
        .filter((t) => result.createdToolIds.includes(t.id))
        .map((t) => t.name);
      const failNote =
        result.failures.length > 0
          ? ` (${result.failures.length} työkalua ei voitu varata)`
          : '';
      setMessage(
        bookedNames.length === 1
          ? `Varauspyyntö jonossa: ${bookedNames[0]}.${failNote} Saat vahvistuksen yritykseltä.`
          : `Varauspyynnöt jonossa (${bookedNames.length}): ${bookedNames.join(', ')}.${failNote} Saat vahvistuksen yritykseltä.`,
      );
      setGuestName('');
      setGuestPhone('');
      setGuestEmail('');
      setNotes('');
      setDistanceKm('');
      setDeliveryAddress('');
      setSelectedToolIds([]);
      setStart('');
      setEnd('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Varaus epäonnistui.');
    } finally {
      setSubmitting(false);
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
        <h1>Työkalu varauskalenteri</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!bundle) return null;

  const hasSelection = selectedToolIds.length > 0;

  return (
    <div className="public-booking-page">
      <header className="public-booking-header">
        <h1 style={{ margin: 0 }}>Työkalu varauskalenteri</h1>
        <p className="muted" style={{ margin: '.35rem 0 0' }}>
          Vapaa = vihreä, jonossa = keltainen, varattu = punainen. Kalenteri päivittyy valittujen
          työkalujen mukaan.
        </p>
        <ul className="tool-booking-legend" aria-label="Värien selite">
          <li>
            <span className="tool-booking-legend-swatch is-free" aria-hidden="true" /> Vapaa
          </li>
          <li>
            <span className="tool-booking-legend-swatch is-queued" aria-hidden="true" /> Jonossa
          </li>
          <li>
            <span className="tool-booking-legend-swatch is-busy" aria-hidden="true" /> Varattu
          </li>
        </ul>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="tool-booking-public-layout">
        <section className="panel tool-booking-tools-panel">
          <h2 style={{ marginTop: 0 }}>Lainattavat työkalut</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Kytke päälle &quot;Lainaa tämä&quot; — kalenteri näyttää heti yhteisen vapauden.
          </p>
          <ToolBookingLoanToggleList
            tools={bundle.tools}
            busy={bundle.busy}
            selectedIds={selectedToolIds}
            onChangeSelectedIds={setSelectedToolIds}
            startYmd={start}
            endYmd={end}
            conflictIds={availability?.busyTools.map((t) => t.id) ?? []}
          />
        </section>

        <section className="panel tool-booking-cal-panel">
          <div className="tool-booking-cal-nav">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, -1))}
            >
              ←
            </button>
            <h2 style={{ margin: 0, textTransform: 'capitalize', fontSize: '1.05rem' }}>{monthLabel}</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, 1))}
            >
              →
            </button>
          </div>

          {!hasSelection && (
            <p className="muted tool-booking-select-hint" role="status">
              Valitse vähintään yksi työkalu nähdäksesi vapaat / jonossa / varatut päivät.
            </p>
          )}

          <div className="tool-booking-cal-weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="tool-booking-cal-grid tool-booking-cal-grid--compact"
            role="grid"
            aria-label="Varauskalenteri"
          >
            {grid.map((cell) => {
              const status = hasSelection
                ? dateYmdBookingDayStatus(cell.ymd, bundle.busy, selectedToolIds)
                : 'neutral';
              const inRange =
                Boolean(start) &&
                cell.ymd >= start &&
                Boolean(end ? cell.ymd <= end : cell.ymd === start);
              const statusClass =
                status === 'free'
                  ? 'is-free'
                  : status === 'queued'
                    ? 'is-queued'
                    : status === 'busy'
                      ? 'is-busy'
                      : 'is-neutral';
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  className={`tool-booking-cal-day tool-booking-cal-day--sm ${
                    cell.inMonth ? '' : 'is-outside'
                  } ${statusClass} ${inRange ? 'is-selected' : ''}`}
                  disabled={!cell.inMonth}
                  onClick={() => onPickDay(cell.ymd)}
                >
                  <span className="tool-booking-cal-day-num">{cell.date.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="tool-booking-range-bar">
            <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
              Valittu jakso:{' '}
              {start ? (end ? formatYmdRangeFi(start, end) : `${start} …`) : '—'}
              {selectedTools.length > 0 ? ` · ${selectedTools.map((t) => t.name).join(', ')}` : ''}
            </p>
          </div>

          {availability && start && end && (
            <div className="tool-booking-suggest-panel">
              {availability.messagesFi.skipBusy && (
                <div className="tool-booking-suggest" role="status">
                  <p style={{ margin: 0 }}>{availability.messagesFi.skipBusy}</p>
                  {availability.freeTools.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={proceedWithoutBusy}
                    >
                      Vuokraa ilman varattuja
                    </button>
                  )}
                </div>
              )}
              {availability.messagesFi.nextWindow && (
                <div className="tool-booking-suggest" role="status">
                  <p style={{ margin: 0 }}>{availability.messagesFi.nextWindow}</p>
                  {availability.nextAllFreeWindow && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        applyNextWindow(
                          availability.nextAllFreeWindow!.startYmd,
                          availability.nextAllFreeWindow!.endYmd,
                        )
                      }
                    >
                      Käytä ehdotettua jaksoa
                    </button>
                  )}
                </div>
              )}
              {!availability.messagesFi.skipBusy && selectedToolIds.length > 1 && (
                <p className="muted" style={{ margin: 0 }}>
                  Kaikki valitut työkalut ovat vapaita (tai vain jonossa) jaksolla{' '}
                  {formatYmdRangeFi(start, end)}.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="panel form-section">
        <h2>Lähetä varauspyyntö</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Pyyntö menee jonoon (keltainen). Yritys vahvistaa — vapautuessa ensimmäinen jonossa saa
          vuoron.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="line-form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ margin: 0 }}>
              <strong>Työkalut *</strong>{' '}
              <span className="muted">
                {selectedTools.length === 0
                  ? 'ei valittu — käytä kytkimiä yllä'
                  : selectedTools.map((t) => t.name).join(', ')}
              </span>
            </p>
          </div>
          <label>
            Alkaa *
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value && end && e.target.value > end) setEnd('');
              }}
              required
            />
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
                  {TOOL_BOOKING_DELIVERY_LABELS.none}
                </label>
                {bundle.company.pickup_enabled && (
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="delivery_mode"
                      checked={deliveryMode === 'pickup'}
                      onChange={() => setDeliveryMode('pickup')}
                    />{' '}
                    {TOOL_BOOKING_DELIVERY_LABELS.pickup}
                  </label>
                )}
                {bundle.company.delivery_enabled && (
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="delivery_mode"
                      checked={deliveryMode === 'delivery'}
                      onChange={() => setDeliveryMode('delivery')}
                    />{' '}
                    {TOOL_BOOKING_DELIVERY_LABELS.delivery}
                  </label>
                )}
                {bundle.company.delivery_enabled && bundle.company.pickup_enabled && (
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="delivery_mode"
                      checked={deliveryMode === 'both'}
                      onChange={() => setDeliveryMode('both')}
                    />{' '}
                    {TOOL_BOOKING_DELIVERY_LABELS.both}
                  </label>
                )}
              </div>
              {needsAddress && (
                <div className="line-form-grid" style={{ marginTop: '.65rem' }}>
                  <label>
                    Arvioitu etäisyys (km) — lopullinen matka kuljettajan navigaattorin mukaan
                    <input
                      inputMode="decimal"
                      value={distanceKm}
                      onChange={(e) => setDistanceKm(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Osoite
                    <input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </label>
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Km-kenttä on vain arvio hinnoittelua varten — lopullinen matka tulee
                    kuljettajan navigaattorista. Ajoja pyritään yhdistämään kustannusten
                    pienentämiseksi.
                  </p>
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Arvioitu maksu. Hinta per kuljetusosuus: minimihinta{' '}
                    {formatToolEuro(bundle.company.delivery_min_fee_eur)} (
                    {bundle.company.delivery_distance_limit_km ?? 0} km asti)
                    {bundle.company.delivery_per_km_eur != null
                      ? ` · yli rajan ${formatToolEuro(bundle.company.delivery_per_km_eur)}/km`
                      : ''}
                    {deliveryMode === 'both'
                      ? ' · kaksi osuutta (vienti + palautusnouto)'
                      : deliveryMode === 'pickup'
                        ? ' · yksi osuus (palautusnouto)'
                        : deliveryMode === 'delivery'
                          ? ' · yksi osuus (vienti)'
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || selectedToolIds.length === 0 || !start || !end}
            >
              {submitting
                ? 'Lähetetään…'
                : selectedToolIds.length > 1
                  ? `Lähetä jonoon (${selectedToolIds.length})`
                  : 'Lähetä jonoon'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
