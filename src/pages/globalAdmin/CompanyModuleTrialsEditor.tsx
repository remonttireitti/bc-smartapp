import { useCallback, useEffect, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import { invalidateCompanyLicenseCache } from '../../hooks/useCompanyLicense';
import {
  formatTrialEnd,
  MODULE_TRIAL_KEYS,
  parseModuleTrials,
  type ModuleTrial,
  type ModuleTrialKey,
} from '../../lib/moduleTrials';
import { supabase } from '../../lib/supabase';

type Props = {
  companyId: string;
  /** Kutsutaan muutoksen jälkeen (esim. kuukausihinnan päivitys). */
  onChanged?: () => void;
};

const DEFAULT_DAYS = 14;

function clampDays(raw: string) {
  const n = Math.round(Number(raw.replace(',', '.')));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 3650) : null;
}

/** Palvelun hallinta → yritys → Moduulit: moduulikokeilut (myös maksavalle tilaajalle). */
export default function CompanyModuleTrialsEditor({ companyId, onChanged }: Props) {
  const [trials, setTrials] = useState<ModuleTrial[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [allDays, setAllDays] = useState(String(DEFAULT_DAYS));
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('company_license_snapshot', { p_company_id: companyId });
    if (e) {
      setError(e.message);
      return;
    }
    const raw = (data as Record<string, unknown> | null)?.module_trials;
    setAvailable(Array.isArray(raw));
    setTrials(parseModuleTrials(raw));
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    invalidateCompanyLicenseCache(companyId);
    setMessage(ok);
    await load();
    onChanged?.();
  }

  function grant(keys: ModuleTrialKey[], n: number | null) {
    if (!n) {
      setError('Anna kokeilun pituus päivinä (1–3650).');
      return;
    }
    void run(
      () => supabase.rpc('global_admin_grant_module_trials', { p_company_id: companyId, p_module_keys: keys, p_days: n }),
      keys.length > 1 ? `Kokeilu ${n} pv annettu kaikille moduuleille.` : `Kokeilu ${n} pv annettu.`,
    );
  }

  function end(key: ModuleTrialKey) {
    void run(
      () => supabase.rpc('global_admin_end_module_trials', { p_company_id: companyId, p_module_keys: [key] }),
      'Kokeilu lopetettu.',
    );
  }

  function setKeep(key: ModuleTrialKey, keep: boolean) {
    void run(
      () => supabase.rpc('company_set_module_trial_keep', { p_module_key: key, p_keep: keep, p_company_id: companyId }),
      keep ? 'Merkitty tilatuksi kokeilun jälkeen.' : 'Tilaus kokeilun jälkeen peruttu.',
    );
  }

  if (available === false) {
    return (
      <section className="form-section">
        <h2>Moduulikokeilut</h2>
        <p className="muted">Moduulikokeilut otetaan käyttöön ajamalla module_trials.sql.</p>
      </section>
    );
  }

  const byKey = new Map(trials.map((t) => [t.module_key, t]));

  return (
    <section className="form-section module-trials-editor">
      <h2>Moduulikokeilut</h2>
      <p className="muted">
        Kokeilun ajan moduuli on käytössä eikä sitä laskuteta, myös maksavalla tilaajalla. Päättymisen jälkeen
        moduuli lukittuu, ellei yritys tilaa sitä (Tilaa jatkoon). Käynnissä olevaa kokeilua jatketaan annetulla
        päivämäärällä.
      </p>

      <div className="module-trials-all">
        <label>
          Kaikki moduulit kokeiluun
          <span className="module-trials-days">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={allDays}
              disabled={busy || available == null}
              onChange={(e) => setAllDays(e.target.value)}
            />
            <span className="muted">pv</span>
          </span>
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || available == null}
          onClick={() => grant(MODULE_TRIAL_KEYS.map((k) => k.key), clampDays(allDays))}
        >
          Anna kokeilu kaikille
        </button>
      </div>

      <div className="settings-toggle-list module-trials-list">
        {MODULE_TRIAL_KEYS.map(({ key, label, group }, i) => {
          const t = byKey.get(key);
          const active = !!t?.active;
          const kept = !!t && !t.active && t.keep_after;
          const d = days[key] ?? String(DEFAULT_DAYS);
          const prevGroup = i > 0 ? MODULE_TRIAL_KEYS[i - 1].group : null;
          return (
            <div key={key}>
              {group !== prevGroup && <h4 className="module-trials-group">{group === 'module' ? 'Lisämoduulit' : 'Huoltoraportit'}</h4>}
              <div className="module-trials-row">
                <ToggleSwitch
                  checked={active}
                  disabled={busy || available == null}
                  label={label}
                  onChange={(on) => (on ? grant([key], clampDays(d)) : end(key))}
                />
                <span className="module-trials-days">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3650}
                    aria-label={`${label}: kokeilun pituus päivinä`}
                    value={d}
                    disabled={busy || available == null}
                    onChange={(e) => setDays((cur) => ({ ...cur, [key]: e.target.value }))}
                  />
                  <span className="muted">pv</span>
                </span>
                {active && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => grant([key], clampDays(d))}>
                    Jatka +{clampDays(d) ?? '?'} pv
                  </button>
                )}
                <span className="module-trials-state">
                  {active && t && (
                    <span className="module-trial-badge">Kokeilu — päättyy {formatTrialEnd(t.ends_at)}</span>
                  )}
                  {kept && <span className="module-trial-kept">Tilattu kokeilun jälkeen</span>}
                  {t && !active && !kept && <span className="muted">Kokeilu päättyi {formatTrialEnd(t.ends_at)}</span>}
                </span>
                {t && (active || kept) && (
                  <ToggleSwitch
                    checked={t.keep_after}
                    disabled={busy}
                    label="Tilaa jatkoon"
                    onChange={(v) => setKeep(key, v)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
