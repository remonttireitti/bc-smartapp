import {
  huoltoInspectionStatusClassName,
  huoltoInspectionStatusLabel,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';

interface Props {
  title: string;
  subtitle?: string;
  status: HuoltoInspectionStatus;
  disabled?: boolean;
  onInspect: () => void;
}

export function HuoltoPartInspectionRow({ title, subtitle, status, disabled, onInspect }: Props) {
  return (
    <div className={`huolto-part-inspection-row${disabled ? ' huolto-part-inspection-row--disabled' : ''}`}>
      <div className="huolto-part-inspection-row-main">
        <div className="huolto-part-inspection-row-title">{title}</div>
        {subtitle ? <div className="muted huolto-part-inspection-row-subtitle">{subtitle}</div> : null}
      </div>
      <span className={huoltoInspectionStatusClassName(status)}>{huoltoInspectionStatusLabel(status)}</span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={disabled}
        onClick={onInspect}
      >
        Tarkastus
      </button>
    </div>
  );
}
