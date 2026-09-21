import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ToolBookingMultiSelectDialog from '../components/ToolBookingMultiSelectDialog';
import {
  createPublicToolBookings,
  loadToolsBookingPublic,
} from '../lib/toolBookingShares';
import { inventoryImagePublicUrl } from '../lib/inventoryImages';
import {
  buildMonthGrid,
  computeDeliveryFee,
  dateInputToIsoEnd,
  dateInputToIsoStart,
  dateYmdAllSelectedFree,
  evaluateMultiToolAvailability,
  formatToolEuro,
  formatYmdRangeFi,
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
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const selectedTools = useMemo(
    () => (bundle?.tools ?? []).filter((t) => selectedToolIds.includes(t.id)),
    [bundle?.tools, selectedToolIds],
  );

  const availability = useMemo(() => {
    if (!bundle || !start || !end) return null;
    return evaluateMultiToolAvailability({
      tools: bundle.tools.map((t) => ({ id: t.id, name: t.name })),
      selectedIds: selectedToolIds,
      startYmd: start,
      endYmd: end,
      busy: bundle.busy,
    });
  }, [bundle, selectedToolIds, start, end]);

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
    setPickerOpen(true);
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
      setError('Valitse vähintään yksi työkalu.');
      setPickerOpen(true);
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
      setPickerOpen(true);
      return;
    }

    setBusy(true);
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
        deliveryDistanceKm:
          deliveryMode === 'delivery' ? Number(String(distanceKm).replace(',', '.')) || 0 : null,
        deliveryAddress: deliveryMode === 'delivery' ? deliveryAddress.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      const bookedNames = (bundle?.tools ?? [])
        .filter((t) => result.createdToolIds.includes(t.id))
        .map((t) => t.name);
      const failNote =
        result.failures.length > 0
          ? ` (${result.failures.length} työkalua ei voitu varata limittäisyyden vuoksi)`
          : '';
      setMessage(
        bookedNames.length === 1
          ? `Varauspyyntö lähetetty: ${bookedNames[0]}.${failNote} Saat vahvistuksen yritykseltä.`
          : `Varauspyynnöt lähetetty (${bookedNames.length} työkalua): ${bookedNames.join(', ')}.${failNote} Saat vahvistuksen yritykseltä.`,
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
        <p className="muted">
          Valitse jakso kalenterista, sitten työkalut. Vapaa = vihreä, varattu = punainen
          {selectedToolIds.length > 1 ? ' (valituille työkaluille yhteinen vapaus)' : ''}.
        </p>
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
            const allFree = dateYmdAllSelectedFree(cell.ymd, bundle.busy, selectedToolIds);
            const inRange =
              Boolean(start) &&
              cell.ymd >= start &&
              Boolean(end ? cell.ymd <= end : cell.ymd === start);
            return (
              <button
                key={cell.ymd}
                type="button"
                className={`tool-booking-cal-day ${cell.inMonth ? '' : 'is-outside'} ${
                  allFree ? 'is-free' : 'is-busy'
                } ${inRange ? 'is-selected' : ''}`}
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
            {start ? (end ? formatYmdRangeFi(start, end) : start) : '—'}
            {selectedTools.length > 0 ? ` · ${selectedTools.map((t) => t.name).join(', ')}` : ''}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!start || !end}
            onClick={() => setPickerOpen(true)}
          >
            Valitse työkalut…
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Lainattavat työkalut</h2>
        {bundle.tools.length === 0 ? (
          <p className="muted">Ei lainattavia työkaluja juuri nyt.</p>
        ) : (
          <ul className="tool-card-grid">
            {bundle.tools.map((tool) => {
              const selected = selectedToolIds.includes(tool.id);
              const thumb = tool.image_path ? inventoryImagePublicUrl(tool.image_path) : null;
              const dayBadge = toolDayRateBadge(tool);
              const conflict =
                selected &&
                start &&
                end &&
                availability?.busyTools.some((b) => b.id === tool.id);
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={`tool-card tool-card-select ${selected ? 'is-selected' : ''} ${
                      conflict ? 'is-conflict' : ''
                    }`}
                    onClick={() => {
                      setSelectedToolIds((prev) =>
                        prev.includes(tool.id)
                          ? prev.filter((id) => id !== tool.id)
                          : [...prev, tool.id],
                      );
                      if (start && end) setPickerOpen(true);
                    }}
                  >
                    <div className="tool-card-thumb" aria-hidden="true">
                      {thumb ? <img src={thumb} alt="" /> : <span className="muted">—</span>}
                    </div>
                    <div className="tool-card-body">
                      <strong>{tool.name}</strong>
                      <p className="muted" style={{ margin: '.2rem 0 0' }}>
                        {tool.category ?? 'Työkalu'}
                        {dayBadge ? ` · ${dayBadge}` : ''}
                        {selected ? (conflict ? ' · varattu jaksolla' : ' · valittu') : ''}
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

      {availability && selectedToolIds.length > 0 && start && end && (
        <section className="panel tool-booking-suggest-panel">
          {availability.messagesFi.skipBusy && (
            <div className="tool-booking-suggest" role="status">
              <p style={{ margin: 0 }}>{availability.messagesFi.skipBusy}</p>
              {availability.freeTools.length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={proceedWithoutBusy}>
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
              Kaikki valitut työkalut ovat vapaita jaksolla {formatYmdRangeFi(start, end)}.
            </p>
          )}
        </section>
      )}

      <section className="panel form-section">
        <h2>Tee varaus</h2>
        <form onSubmit={(e) => void onSubmit(e)} className="line-form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ margin: '0 0 .35rem' }}>
              <strong>Työkalut *</strong>{' '}
              <span className="muted">
                {selectedTools.length === 0
                  ? 'ei valittu'
                  : selectedTools.map((t) => t.name).join(', ')}
              </span>
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!start || !end}
              onClick={() => setPickerOpen(true)}
            >
              Muokkaa työkaluvalintaa…
            </button>
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || selectedToolIds.length === 0 || !start || !end}
            >
              {busy
                ? 'Lähetetään…'
                : selectedToolIds.length > 1
                  ? `Lähetä varauspyynnöt (${selectedToolIds.length})`
                  : 'Lähetä varauspyyntö'}
            </button>
          </div>
        </form>
      </section>

      <ToolBookingMultiSelectDialog
        open={pickerOpen}
        tools={bundle.tools}
        busy={bundle.busy}
        startYmd={start || end}
        endYmd={end || start}
        selectedIds={selectedToolIds}
        onChangeSelectedIds={setSelectedToolIds}
        onClose={() => setPickerOpen(false)}
        onConfirm={() => setPickerOpen(false)}
        onApplyNextWindow={(s, eYmd) => applyNextWindow(s, eYmd)}
        onProceedWithoutBusy={proceedWithoutBusy}
      />
    </div>
  );
}
