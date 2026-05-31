import { formatTempC, type VrfDigitalInputs } from '../../lib/vrfMonitoring';

const HOTSPOTS = [
  { key: 'outdoor_c', label: 'Ulkoilma', className: 'vrf-hp-hotspot--sky' },
  { key: 'outdoor_coil_c', label: 'Ulkoyks. kenno', className: 'vrf-hp-hotspot--coil' },
  { key: 'refrigerant_supply_c', label: 'Kylmäaine meno', className: 'vrf-hp-hotspot--supply' },
  { key: 'refrigerant_return_c', label: 'Kylmäaine paluu', className: 'vrf-hp-hotspot--return' },
  { key: 'hot_gas_c', label: 'Kuumakaasu', className: 'vrf-hp-hotspot--hotgas' },
] as const;

interface Props {
  temperatures: Record<string, number | null | undefined>;
  digitalInputs: VrfDigitalInputs | null;
  compressorRunning: boolean;
  stale?: boolean;
  showTemps?: boolean;
}

export default function VrfSchematicBoard({
  temperatures,
  digitalInputs,
  compressorRunning,
  stale = false,
  showTemps = true,
}: Props) {
  const supply = temperatures.refrigerant_supply_c;
  const ret = temperatures.refrigerant_return_c;
  const delta =
    typeof supply === 'number' && typeof ret === 'number' && Number.isFinite(supply) && Number.isFinite(ret)
      ? supply - ret
      : null;

  return (
    <div className={`vrf-hp-board ${stale ? 'vrf-hp-board--stale' : ''} ${compressorRunning ? 'vrf-hp-board--comp-running' : ''}`}>
      {stale && (
        <p className="vrf-hp-stale-note">Mittaus ei ole tuore — lämpötilat piilotettu.</p>
      )}
      <div className="vrf-hp-wrap">
        <img
          className="vrf-hp-schematic-img"
          src="/assets/vrf/heat-pump-schematic.svg"
          width={715}
          height={367}
          alt="Lämpöpumpun höyrypuristinkierto"
          decoding="async"
        />

        {HOTSPOTS.map(({ key, label, className }) => (
          <div key={key} className={`vrf-hp-hotspot ${className}`} aria-label={`${label}: lämpötila`}>
            <span className="vrf-hp-hotspot-eyebrow">{label}</span>
            <span className="vrf-hp-hotspot-value">
              {showTemps && !stale ? formatTempC(temperatures[key]).replace(' °C', '') : '—'}
            </span>
            <span className="vrf-hp-hotspot-unit">°C</span>
          </div>
        ))}

        <div className="vrf-hp-hotspot vrf-hp-hotspot--tent" aria-label="Meno/paluu lämpötilaero">
          <span className="vrf-hp-hotspot-eyebrow">Meno/paluu-ero</span>
          <span className="vrf-hp-hotspot-value">
            {showTemps && !stale && delta != null ? delta.toFixed(1) : '—'}
          </span>
          <span className="vrf-hp-hotspot-unit">°C</span>
        </div>

        <div className={`vrf-hp-di-badge vrf-hp-di-badge--unit ${digitalInputs?.di4_unit_ready ? 'active' : ''}`}>
          <span>DI4</span>
          <strong>{digitalInputs?.di4_unit_ready ? 'Päällä' : 'Pois'}</strong>
        </div>
        <div className={`vrf-hp-di-badge vrf-hp-di-badge--comp ${digitalInputs?.di2_compressor_running ? 'active' : ''}`}>
          <span>DI2</span>
          <strong>{digitalInputs?.di2_compressor_running ? 'Käy' : 'Pois'}</strong>
        </div>
        <div className={`vrf-hp-di-badge vrf-hp-di-badge--alarm ${digitalInputs?.di3_alarm ? 'active' : ''}`}>
          <span>DI3</span>
          <strong>{digitalInputs?.di3_alarm ? 'Hälytys' : 'OK'}</strong>
        </div>
      </div>
    </div>
  );
}
