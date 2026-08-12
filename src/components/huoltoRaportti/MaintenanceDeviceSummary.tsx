import { deviceTypes } from '../../lib/huoltoRaportti/constants';
import { isKonvektoritDevice } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { PrintInnerBox } from './print/MaintenancePrintLayout';

type Props = {
  form: HuoltoReportData;
  deviceFieldErrors: Record<string, string>;
  complete: boolean;
  onEdit?: () => void;
  editButtonLabel?: string;
  emptyHint?: string;
};

function printRow(label: string, value: string) {
  return (
    <div className="huolto-print-readonly-row">
      <span>{label}: </span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export function MaintenanceDeviceSummary({
  form,
  deviceFieldErrors,
  complete,
  onEdit,
  editButtonLabel = 'Laitetiedot',
  emptyHint = 'Täytä laitteen perustiedot painamalla Laitetiedot.',
}: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const deviceTypeLabel =
    deviceTypes.find((dt) => dt.value === form.laiteTyyppi)?.label ?? form.laiteTyyppi;

  const deviceRows = form.laiteTyyppi ? (
    isKonvektoritDevice(form.laiteTyyppi) ? (
      <>
        {printRow('Tyyppi', deviceTypeLabel)}
        {printRow('Verkoston kuvaus', form.laiteKayttotarkoitus || '')}
        {printRow('Alue', form.laiteSijainti || '')}
      </>
    ) : (
      <>
        {printRow('Tyyppi', deviceTypeLabel)}
        {printRow('Valmistaja', form.laiteValmistaja || '')}
        {printRow('Malli', form.laiteMalli || '')}
        {printRow('Tunnus', form.laiteTunnus || '')}
        {printRow('Sarjanumero', form.laiteSarjanumero || '')}
        {printRow('Sijainti', form.laiteSijainti || '')}
        {(form.selectedModules.kylmaainePiiri || form.laiteTyyppi === 'lämpöpumppu') &&
          printRow(
            'Kylmäaine',
            [form.kylmaaineTyyppi, form.kylmaainePiireja ? `${form.kylmaainePiireja} piiriä` : '']
              .filter(Boolean)
              .join(' · '),
          )}
      </>
    )
  ) : (
    <p className="muted">{emptyHint}</p>
  );

  if (printLayout) {
    return (
      <PrintInnerBox title="LAITETIEDOT" accent="#388E3C" className="maintenance-device-summary">
        <div className="maintenance-device-summary-head">
          <div className="maintenance-device-summary-actions">
            {complete ? (
              <span className="badge badge-completed">Valmis</span>
            ) : (
              <span className="badge badge-scheduled">Puuttuu</span>
            )}
            {onEdit ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                {editButtonLabel}
              </button>
            ) : null}
          </div>
        </div>
        {deviceRows}
        {Object.keys(deviceFieldErrors).length > 0 ? (
          <div className="maintenance-device-summary-errors">
            {Object.values(deviceFieldErrors).map((message) => (
              <p key={message} className="error">
                {message}
              </p>
            ))}
          </div>
        ) : null}
      </PrintInnerBox>
    );
  }

  return (
    <div className="maintenance-device-summary">
      <div className="maintenance-device-summary-head">
        <h3>Laitetiedot</h3>
        <div className="maintenance-device-summary-actions">
          {complete ? (
            <span className="badge badge-completed">Valmis</span>
          ) : (
            <span className="badge badge-scheduled">Puuttuu</span>
          )}
          {onEdit ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              {editButtonLabel}
            </button>
          ) : null}
        </div>
      </div>
      {form.laiteTyyppi ? (
        <div className="info-grid">
          <div className="info-box">
            <span className="info-label">Laitetyyppi</span>
            <strong>{deviceTypeLabel}</strong>
          </div>
          {isKonvektoritDevice(form.laiteTyyppi) ? (
            <>
              <div className="info-box">
                <span className="info-label">Verkoston kuvaus</span>
                <strong>{form.laiteKayttotarkoitus || '—'}</strong>
              </div>
              <div className="info-box">
                <span className="info-label">Alue</span>
                <strong>{form.laiteSijainti || '—'}</strong>
              </div>
            </>
          ) : (
            <>
              <div className="info-box">
                <span className="info-label">Laite</span>
                <strong>
                  {[form.laiteValmistaja, form.laiteMalli].filter(Boolean).join(' ') || '—'}
                </strong>
                <span className="muted">
                  {[form.laiteTunnus, form.laiteSarjanumero].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="info-box">
                <span className="info-label">Sijainti</span>
                <strong>{form.laiteSijainti || '—'}</strong>
              </div>
              {(form.selectedModules.kylmaainePiiri || form.laiteTyyppi === 'lämpöpumppu') && (
                <div className="info-box">
                  <span className="info-label">Kylmäaine</span>
                  <strong>{form.kylmaaineTyyppi || '—'}</strong>
                  {form.kylmaainePiireja ? (
                    <span className="muted">{form.kylmaainePiireja} piiriä</span>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="muted">{emptyHint}</p>
      )}
      {Object.keys(deviceFieldErrors).length > 0 ? (
        <div className="maintenance-device-summary-errors">
          {Object.values(deviceFieldErrors).map((message) => (
            <p key={message} className="error">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
