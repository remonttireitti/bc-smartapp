import type { MlpData, RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { computeMlpHeatPumpEnergyBalance } from '../../lib/huoltoRaportti/mlpEnergyCalc';

interface Props {
  mlp: MlpData;
  kp1: RefrigerantCircuitData;
  wholeDeviceElectric: boolean;
  /** Kun true, energiatehokkuuden varoituslista piilotetaan (sama kuin tuloste). */
  hideWarnings?: boolean;
}

function fmtKw(value: number | null | undefined): string {
  if (value == null || value <= 0) return '—';
  return `${value.toFixed(2)} kW`;
}

export function MlpEnergyDashboard({ mlp, kp1, wholeDeviceElectric, hideWarnings }: Props) {
  const balance = computeMlpHeatPumpEnergyBalance(mlp, kp1);
  const maaperanOsuus =
    balance.deviceOutputKw > 0 && balance.maaperastaKw > 0
      ? ((balance.maaperastaKw / balance.deviceOutputKw) * 100).toFixed(0)
      : null;

  return (
    <div className="huolto-energy-dashboard">
      <div className="huolto-energy-dashboard-section">
        <div className="huolto-energy-dashboard-heading">Energiatehokkuus</div>
        <div className="huolto-energy-balance-grid">
          <div className="huolto-energy-balance-card huolto-energy-balance-input">
            <span className="huolto-energy-balance-label">Maaperästä/kaivosta</span>
            <strong>{fmtKw(balance.maaperastaKw)}</strong>
            {maaperanOsuus ? <span className="muted">{maaperanOsuus} %</span> : null}
          </div>
          <div className="huolto-energy-balance-card huolto-energy-balance-electric">
            <span className="huolto-energy-balance-label">Sähköverkosta</span>
            <strong>{fmtKw(balance.pInKw)}</strong>
            <span className="muted">{wholeDeviceElectric ? '(koko laite)' : '(kompressori)'}</span>
          </div>
          <div className="huolto-energy-balance-card huolto-energy-balance-total">
            <span className="huolto-energy-balance-label">Tuotanto yhteensä</span>
            <strong>{fmtKw(balance.deviceOutputKw)}</strong>
            {balance.qLatausKw != null && balance.qLatausKw > 0 ? (
              <span className="muted">Latauspiiri: {balance.qLatausKw.toFixed(1)} kW</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="huolto-energy-dashboard-section">
        <div className="huolto-energy-dashboard-heading">Tuotanto (mitä laite työntää järjestelmään)</div>
        <div className="huolto-energy-balance-grid">
          <div className="huolto-energy-balance-card">
            <span className="huolto-energy-balance-label">Latauspiiri (varastoon/jakeluun)</span>
            <strong>{fmtKw(balance.qLatausKw)}</strong>
          </div>
          {balance.qTulistusKw != null && balance.qTulistusKw > 0 ? (
            <div className="huolto-energy-balance-card">
              <span className="huolto-energy-balance-label">Tulistuspiiri</span>
              <strong>{fmtKw(balance.qTulistusKw)}</strong>
            </div>
          ) : null}
          <div className="huolto-energy-balance-card">
            <span className="huolto-energy-balance-label">Yhteensä tuotanto</span>
            <strong>{fmtKw(balance.deviceOutputKw)}</strong>
          </div>
        </div>
      </div>

      <div className="huolto-energy-summary">
        <div className="huolto-energy-cop">
          <span className="huolto-energy-cop-label">Laskennallinen COP</span>
          <strong className="huolto-energy-cop-value">
            {balance.cop != null && balance.cop > 0 ? balance.cop.toFixed(2) : '—'}
          </strong>
          <span className="muted">tuotanto / sähkönkulutus</span>
          {balance.copEfficiencyLabel !== 'Ei voida laskea' ? (
            <span className="huolto-energy-cop-badge">{balance.copEfficiencyLabel}</span>
          ) : null}
        </div>
        <div className="line-form-grid huolto-energy-grid">
          {balance.qKeruuKw != null && balance.qKeruuKw > 0 ? (
            <div className="huolto-alert huolto-alert-success">Keruupiiri: {balance.qKeruuKw.toFixed(2)} kW</div>
          ) : null}
        </div>
        {!hideWarnings && balance.warnings.length > 0 ? (
          <ul className="huolto-energy-warnings">
            {balance.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : !hideWarnings && balance.canCalculateCop ? (
          <div className="huolto-alert huolto-alert-success">
            Mittaukset vaikuttavat normaaleilta, ei havaittu poikkeamia
          </div>
        ) : null}
      </div>
    </div>
  );
}
