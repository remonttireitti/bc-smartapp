import {
  formatRelativeTime,
  formatTempC,
  isVrfDeviceOnline,
  vrfOperatingStateLabel,
  type VrfDevice,
} from '../../lib/vrfMonitoring';

type Props = {
  device: VrfDevice;
  onDelete: () => void;
  deleteDisabled?: boolean;
};

export default function VrfDeviceListCard({ device, onDelete, deleteDisabled = false }: Props) {
  const online = isVrfDeviceOnline(device.last_seen_at);

  return (
    <li className="temp-device-list-item">
      <div className="temp-device-card temp-device-card-static">
        <div className="temp-device-card-top">
          <div className="temp-device-card-title-wrap">
            <strong className="temp-device-card-title">{device.name}</strong>
            <span className={`temp-status ${online ? 'online' : 'offline'}`}>
              <span className="temp-status-dot" aria-hidden="true" />
              {online ? 'Online' : 'Offline'}
            </span>
            {device.any_alarm && online && (
              <span className="badge badge-alert temp-device-alarm-badge">Hälytys</span>
            )}
          </div>
          {online ? (
            <div className="temp-device-card-temp" aria-label={`Ulkoilma ${formatTempC(device.outdoor_c)}`}>
              {formatTempC(device.outdoor_c)}
            </div>
          ) : (
            <span className="temp-device-card-offline-label muted">Ei yhteyttä</span>
          )}
        </div>
        <div className="temp-device-card-meta">
          <span>{formatRelativeTime(device.last_seen_at)}</span>
          <span className="muted">
            {device.heat_enabled == null
              ? 'Ohjaus —'
              : device.heat_enabled
                ? 'Lämpölupa päällä'
                : 'Lämpölupa pois'}
            {' · '}
            {vrfOperatingStateLabel(device.operating_state)}
          </span>
        </div>
        {device.external_device_id && (
          <p className="temp-device-card-meta muted">Laite-ID: {device.external_device_id}</p>
        )}
      </div>
      <button
        type="button"
        className="temp-device-delete-btn"
        aria-label={`Poista laite ${device.name}`}
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        Poista
      </button>
    </li>
  );
}
