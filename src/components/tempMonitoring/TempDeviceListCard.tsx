import { Link } from 'react-router-dom';
import {
  formatRelativeTime,
  formatTempC,
  isEsp32ZoneDevice,
  isTempDeviceOnline,
  type TempDevice,
} from '../../lib/tempMonitoring';

type Props = {
  device: TempDevice;
  to: string;
  onDelete: () => void;
  deleteDisabled?: boolean;
};

export default function TempDeviceListCard({ device, to, onDelete, deleteDisabled = false }: Props) {
  const online = isTempDeviceOnline(device.last_seen_at);
  const isDemo = device.is_shared_demo === true;
  const zoneDevice = isEsp32ZoneDevice(device);

  return (
    <li className="temp-device-list-item">
      <Link to={to} className="temp-device-card">
        <div className="temp-device-card-top">
          <div className="temp-device-card-title-wrap">
            <strong className="temp-device-card-title">{device.name}</strong>
            {isDemo && <span className="temp-demo-badge">Demo · oikea laite</span>}
            <span className={`temp-status ${online ? 'online' : 'offline'}`}>
              <span className="temp-status-dot" aria-hidden="true" />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          {online ? (
            <div className="temp-device-card-temp" aria-label={`Lämpötila ${formatTempC(device.last_temp_c)}`}>
              {zoneDevice && device.last_temp_c2 != null
                ? `${formatTempC(device.last_temp_c)} / ${formatTempC(device.last_temp_c2)}`
                : formatTempC(device.last_temp_c)}
            </div>
          ) : (
            <span className="temp-device-card-offline-label muted">Ei yhteyttä</span>
          )}
        </div>
        <div className="temp-device-card-meta">
          <span>{formatRelativeTime(device.last_seen_at)}</span>
          <span className="temp-device-card-cta">Avaa seuranta →</span>
        </div>
      </Link>
      <button
        type="button"
        className="temp-device-delete-btn"
        aria-label={`Poista laite ${device.name}`}
        disabled={deleteDisabled}
        onClick={(event) => {
          event.preventDefault();
          onDelete();
        }}
      >
        Poista
      </button>
    </li>
  );
}
