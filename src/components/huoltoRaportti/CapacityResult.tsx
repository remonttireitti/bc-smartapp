import { formatKw, type AirCapacityResult } from '../../lib/huoltoRaportti/airCapacity';

/** Tehon tulos, vain luku. */
export function AirCapacityResultView({ result, latent }: { result: AirCapacityResult | null; latent: boolean }) {
  if (!result) return null;
  return (
    <p className="huolto-capacity-result huolto-span-all" aria-live="polite">
      <strong>Teho {formatKw(result.totalKw)}</strong>
      {result.sensibleOnly ? <span className="muted"> · vain tuntuva</span> : null}
      {latent && !result.sensibleOnly ? (
        <span className="muted"> · tuntuva {formatKw(result.sensibleKw)} · latentti {formatKw(result.latentKw)}</span>
      ) : null}
    </p>
  );
}

export function StaticCapacityResultView({ kw, dtK, areaM2, u }: { kw: number; dtK: number; areaM2: number; u: number }) {
  return (
    <p className="huolto-capacity-result huolto-span-all" aria-live="polite">
      <strong>Teho (arvio) {formatKw(kw)}</strong>
      <span className="muted"> · A {areaM2.toFixed(1).replace('.', ',')} m² · U {u} W/m²K · ΔT {dtK.toFixed(1).replace('.', ',')} K</span>
    </p>
  );
}
