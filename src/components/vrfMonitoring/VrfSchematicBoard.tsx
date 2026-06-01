import { formatTempC, type VrfBinaryLaneKey, type VrfDigitalInputs, type VrfSchematicClickKey } from '../../lib/vrfMonitoring';

const HOTSPOTS = [
  { key: 'outdoor_c' as const, label: 'Ulkoilma', className: 'vrf-hp-hotspot--sky' },
  { key: 'outdoor_coil_c' as const, label: 'Ulkoyks. kenno', className: 'vrf-hp-hotspot--coil' },
  { key: 'refrigerant_supply_c' as const, label: 'Kylmäaine meno', className: 'vrf-hp-hotspot--supply' },
  { key: 'refrigerant_return_c' as const, label: 'Kylmäaine paluu', className: 'vrf-hp-hotspot--return' },
  { key: 'hot_gas_c' as const, label: 'Kuumakaasu', className: 'vrf-hp-hotspot--hotgas' },
] as const;

const SCHEMATIC_DI_BADGES = [
  {
    lane: 'compressor' as const,
    className: 'vrf-hp-di-badge--comp',
    di: 'DI2',
    name: 'Kompressori',
    activeText: 'Käy',
    idleText: 'Pois',
  },
  {
    lane: 'alarm' as const,
    className: 'vrf-hp-di-badge--alarm',
    di: 'DI3',
    name: 'Hälytys',
    activeText: 'Hälytys',
    idleText: 'Normaali',
  },
] as const;

interface Props {
  temperatures: Record<string, number | null | undefined>;
  digitalInputs: VrfDigitalInputs | null;
  compressorRunning: boolean;
  stale?: boolean;
  showTemps?: boolean;
  onHotspotClick?: (key: VrfSchematicClickKey) => void;
  onDiClick?: (lane: VrfBinaryLaneKey) => void;
}

export default function VrfSchematicBoard({
  temperatures,
  digitalInputs,
  compressorRunning,
  stale = false,
  showTemps = true,
  onHotspotClick,
  onDiClick,
}: Props) {
  const supply = temperatures.refrigerant_supply_c;
  const ret = temperatures.refrigerant_return_c;
  const delta =
    typeof supply === 'number' && typeof ret === 'number' && Number.isFinite(supply) && Number.isFinite(ret)
      ? supply - ret
      : null;

  const interactive = Boolean(onHotspotClick);

  function renderHotspot(
    key: VrfSchematicClickKey,
    label: string,
    className: string,
    value: string,
  ) {
    const content = (
      <>
        <span className="vrf-hp-hotspot-eyebrow">{label}</span>
        <span className="vrf-hp-hotspot-value">{value}</span>
        <span className="vrf-hp-hotspot-unit">°C</span>
      </>
    );

    if (interactive && onHotspotClick) {
      return (
        <button
          key={key}
          type="button"
          className={`vrf-hp-hotspot vrf-hp-hotspot--clickable ${className}`}
          aria-label={`${label}: ${value} °C — avaa trendi`}
          onClick={() => onHotspotClick(key)}
        >
          {content}
        </button>
      );
    }

    return (
      <div key={key} className={`vrf-hp-hotspot ${className}`} aria-label={`${label}: lämpötila`}>
        {content}
      </div>
    );
  }

  function renderDiBadge(
    lane: VrfBinaryLaneKey,
    className: string,
    di: string,
    name: string,
    active: boolean,
    activeText: string,
    idleText: string,
  ) {
    const status = active ? activeText : idleText;
    const body = (
      <>
        <span className="vrf-hp-di-badge-eyebrow">{name}</span>
        <span className="vrf-hp-di-badge-pin">{di}</span>
        <strong>{status}</strong>
      </>
    );

    if (onDiClick) {
      return (
        <button
          type="button"
          className={`vrf-hp-di-badge vrf-hp-di-badge--clickable ${className} ${active ? 'active' : ''}`}
          aria-label={`${name} (${di}): ${status} — avaa trendi`}
          onClick={() => onDiClick(lane)}
        >
          {body}
        </button>
      );
    }

    return (
      <div
        className={`vrf-hp-di-badge ${className} ${active ? 'active' : ''}`}
        aria-label={`${name} (${di}): ${status}`}
      >
        {body}
      </div>
    );
  }

  return (
    <div className={`vrf-hp-board ${stale ? 'vrf-hp-board--stale' : ''} ${compressorRunning ? 'vrf-hp-board--comp-running' : ''}`}>
      {stale && <p className="vrf-hp-stale-note">Mittaus ei ole tuore — lämpötilat piilotettu.</p>}
      <div className="vrf-hp-wrap">
        <img
          className="vrf-hp-schematic-img"
          src="/assets/vrf/heat-pump-schematic.svg"
          width={715}
          height={367}
          alt="Lämpöpumpun höyrypuristinkierto"
          decoding="async"
        />

        {HOTSPOTS.map(({ key, label, className }) =>
          renderHotspot(
            key,
            label,
            className,
            showTemps && !stale ? formatTempC(temperatures[key]).replace(' °C', '') : '—',
          ),
        )}

        {renderHotspot(
          'delta',
          'Meno/paluu-ero',
          'vrf-hp-hotspot--tent',
          showTemps && !stale && delta != null ? delta.toFixed(1) : '—',
        )}

        {SCHEMATIC_DI_BADGES.map(({ lane, className, di, name, activeText, idleText }) => {
          const active =
            lane === 'compressor'
              ? Boolean(digitalInputs?.di2_compressor_running)
              : Boolean(digitalInputs?.di3_alarm);
          return renderDiBadge(lane, className, di, name, active, activeText, idleText);
        })}
      </div>
      {interactive && <p className="muted vrf-hp-hint">Paina lämpötilaa tai DI-merkkiä avataksesi trendin.</p>}
    </div>
  );
}
