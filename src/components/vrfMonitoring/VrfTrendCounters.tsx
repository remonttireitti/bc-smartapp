import { VRF_ACTIVITY_TREND_META, VRF_BINARY_LANES, type VrfBinaryLaneKey } from '../../lib/vrfMonitoring';
import { formatVrfNumber } from '../../lib/vrfTrendAxis';
import {
  VRF_COUNTER_STATES,
  formatVrfDuration,
  vrfCounterAverageMs,
  vrfCounterPerHour,
  type VrfCounter,
  type VrfStateCounters,
} from '../../lib/vrfStateCounters';

export type VrfTrendCountersView =
  | { status: 'ok'; counters: VrfStateCounters }
  | { status: 'loading'; previous: VrfStateCounters | null }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

type Props = {
  view: VrfTrendCountersView;
  lanes: VrfBinaryLaneKey[];
  spanMs: number;
  onRetry?: () => void;
};

function share(onMs: number, coveredMs: number) {
  if (coveredMs <= 0) return '—';
  const v = (onMs / coveredMs) * 100;
  return `${formatVrfNumber(v, v > 0 && v < 10 ? 1 : 0)} %`;
}

function perHour(counter: VrfCounter, coveredMs: number) {
  const v = vrfCounterPerHour(counter, coveredMs);
  if (v == null) return '—';
  return formatVrfNumber(v, v === 0 ? 0 : v < 10 ? 1 : 0);
}

function Row({ label, color, counter, coveredMs }: { label: string; color: string; counter: VrfCounter; coveredMs: number }) {
  const avg = vrfCounterAverageMs(counter);
  return (
    <tr>
      <th scope="row">
        <span className="vrf-trend-legend-dot" style={{ background: color }} />
        {label}
      </th>
      <td className="vrf-tv-counters-n">{counter.transitions.toLocaleString('fi-FI')}</td>
      <td>{counter.onMs > 0 ? formatVrfDuration(counter.onMs) : '—'}</td>
      <td>{counter.onMs > 0 ? share(counter.onMs, coveredMs) : '—'}</td>
      <td>{avg != null ? formatVrfDuration(avg) : '—'}</td>
      <td>{perHour(counter, coveredMs)}</td>
    </tr>
  );
}

/** Tilalaskurit valitulle (tai zoomatulle) välille — tarkat raakamittauksista. */
export default function VrfTrendCounters({ view, lanes, spanMs, onRetry }: Props) {
  const counters = view.status === 'ok' ? view.counters : view.status === 'loading' ? view.previous : null;

  if (!counters) {
    return (
      <section className="vrf-tv-counters" aria-label="Laskurit">
        <div className="vrf-tv-counters-head">
          <strong>Laskurit</strong>
          {view.status === 'loading' && <span className="muted"> · lasketaan…</span>}
          {view.status === 'unavailable' && <span className="muted"> · {view.message}</span>}
          {view.status === 'error' && (
            <span className="form-error">
              {' '}
              · {view.message}{' '}
              {onRetry && (
                <button type="button" className="vrf-tv-text-btn" onClick={onRetry}>
                  Yritä uudelleen
                </button>
              )}
            </span>
          )}
        </div>
      </section>
    );
  }

  const laneDefs = VRF_BINARY_LANES.filter((l) => lanes.includes(l.key));
  const states = VRF_COUNTER_STATES.filter((s) => {
    const c = counters.states[s];
    if (c.onMs <= 0 && c.episodes <= 0) return false;
    // ei toisteta samaa lukua: sulatus-tila ≈ sulatusviiva; hälytystila näytetään vain jos se eroaa DI3-viivasta
    if (s === 'defrost' && lanes.includes('defrost')) return false;
    if (s === 'alarm' && lanes.includes('alarm')) {
      const lane = counters.lanes.alarm;
      if (lane.transitions === c.transitions && Math.abs(lane.onMs - c.onMs) < 60_000) return false;
    }
    return true;
  });
  const coverage = spanMs > 0 ? counters.coveredMs / spanMs : 1;

  return (
    <section
      className={`vrf-tv-counters ${view.status === 'loading' ? 'is-loading' : ''}`}
      aria-label="Laskurit"
      aria-busy={view.status === 'loading'}
    >
      <div className="vrf-tv-counters-head">
        <strong>Laskurit</strong>
        <span className="muted">
          {' '}
          · valitulla välillä
          {coverage < 0.95 && ` · mittausdataa ${formatVrfDuration(counters.coveredMs)}`}
          {view.status === 'loading' && ' · lasketaan…'}
        </span>
      </div>
      <div className="vrf-tv-counters-scroll">
        <table className="vrf-tv-counters-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Kerrat</th>
              <th scope="col">Aika yht.</th>
              <th scope="col" title="Osuus ajasta, jolta on mittausdataa">
                Osuus
              </th>
              <th scope="col" title="Päälläoloaika / päälläolojaksot">
                Keskim. jakso
              </th>
              <th scope="col" title="Kerrat mittaustuntia kohden">
                Kertaa / h
              </th>
            </tr>
          </thead>
          <tbody>
            {laneDefs.map((lane) => (
              <Row key={lane.key} label={lane.label} color={lane.color} counter={counters.lanes[lane.key]} coveredMs={counters.coveredMs} />
            ))}
            {states.length > 0 && (
              <tr className="vrf-tv-counters-group">
                <th scope="rowgroup" colSpan={6}>
                  Tilatieto
                </th>
              </tr>
            )}
            {states.map((state) => (
              <Row
                key={state}
                label={VRF_ACTIVITY_TREND_META[state].label}
                color={VRF_ACTIVITY_TREND_META[state].color}
                counter={counters.states[state]}
                coveredMs={counters.coveredMs}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="vrf-tv-counters-note muted">
        Kerrat = pois → päälle (kompressorilla käynnistykset). Välin alussa jo päällä ollut tai mittaustauon jälkeen
        päällä ollut ei ole uusi kerta.
      </p>
    </section>
  );
}
