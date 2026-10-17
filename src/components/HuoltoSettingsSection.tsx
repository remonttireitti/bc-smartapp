import { Fragment, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import {
  HUOLTO_CATEGORIES,
  huoltoReportTypesOf,
  parseHuoltoSettings,
  serializeHuoltoSettings,
  type HuoltoSettings,
  type HuoltoTypeSetting,
} from '../lib/huoltoCategories';

type Props = {
  /** companies.settings kokonaisuudessaan (huolto-avain luetaan tästä). */
  companySettings: unknown;
  onChange: (next: HuoltoSettings) => void;
  /** toggles = moduuli + lajit, prices = hinnasto käytössä oleville tyypeille. */
  mode: 'toggles' | 'prices';
  /** Ilman omaa otsikkoa/section-kääriä (esim. välilehdellä). */
  bare?: boolean;
};

function fmt(n: number | null | undefined): string {
  return n != null && n > 0 ? String(n).replace('.', ',') : '';
}

function parse(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Yritystiedot → Huoltoraportit: lajit päälle/pois ja hinnasto (alv 0 %). */
export default function HuoltoSettingsSection({ companySettings, onChange, mode, bare }: Props) {
  const settings = parseHuoltoSettings(companySettings);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function update(next: HuoltoSettings) {
    onChange(serializeHuoltoSettings(next));
  }

  function setType(key: string, patch: Partial<HuoltoTypeSetting>) {
    update({ ...settings, types: { ...settings.types, [key]: { ...settings.types[key], ...patch } } });
  }

  function setCategory(category: (typeof HUOLTO_CATEGORIES)[number]['key'], enabled: boolean) {
    const types = { ...settings.types };
    for (const t of huoltoReportTypesOf(category)) types[t.key] = { ...types[t.key], enabled };
    update({ ...settings, types });
  }

  function priceInput(key: string, field: 'price' | 'hourly', disabled: boolean) {
    const draftKey = `${key}:${field}`;
    const value = drafts[draftKey] ?? fmt(settings.types[key]?.[field]);
    return (
      <input
        inputMode="decimal"
        className="huolto-price-input"
        value={value}
        disabled={disabled}
        aria-label={field === 'price' ? 'Perushinta' : 'Tuntihinta'}
        onChange={(e) => {
          setDrafts((d) => ({ ...d, [draftKey]: e.target.value }));
          setType(key, { [field]: parse(e.target.value) });
        }}
        onBlur={() => setDrafts((d) => {
          const next = { ...d };
          delete next[draftKey];
          return next;
        })}
      />
    );
  }

  if (mode === 'prices') {
    const rows = HUOLTO_CATEGORIES.flatMap((category) =>
      huoltoReportTypesOf(category.key)
        .filter((t) => settings.enabled && settings.types[t.key]?.enabled)
        .map((t) => ({ t, category })),
    );
    const body = rows.length === 0 ? (
      <p className="muted">Ei käytössä olevia huoltolajeja.</p>
    ) : (
      <div className="huolto-settings-table-wrap">
        <table className="huolto-settings-table">
          <thead>
            <tr>
              <th>Laji</th>
              <th>Perushinta € (alv 0 %)</th>
              <th>Lisätunti €/h (alv 0 %)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, category }) => (
              <tr key={t.key} className="huolto-settings-category" style={{ borderLeftColor: category.color }}>
                <td>{t.key === category.key ? <strong>{t.label}</strong> : <>{category.short} · {t.label}</>}</td>
                <td>{priceInput(t.key, 'price', false)}</td>
                <td>{priceInput(t.key, 'hourly', false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    return bare ? body : (
      <section className="form-section" id="huoltohinnasto">
        <h2>Huoltohinnasto</h2>
        {body}
      </section>
    );
  }

  const toggles = (
    <>
      <ToggleSwitch label="Huoltoraportit käytössä" checked={settings.enabled} onChange={(enabled) => update({ ...settings, enabled })} />
      {settings.enabled ? (
        <div className="huolto-settings-table-wrap">
          <table className="huolto-settings-table">
            <tbody>
              {HUOLTO_CATEGORIES.map((category) => {
                const types = huoltoReportTypesOf(category.key);
                if (types.length === 1 && types[0].key === category.key) {
                  const on = settings.types[category.key]?.enabled === true;
                  return (
                    <tr key={category.key} className="huolto-settings-category" style={{ borderLeftColor: category.color }}>
                      <td><strong>{category.label}</strong></td>
                      <td><ToggleSwitch checked={on} onChange={(v) => setType(category.key, { enabled: v })} /></td>
                    </tr>
                  );
                }
                const anyOn = types.some((t) => settings.types[t.key]?.enabled);
                return (
                  <Fragment key={category.key}>
                    <tr className="huolto-settings-category" style={{ borderLeftColor: category.color }}>
                      <td><strong>{category.label}</strong></td>
                      <td><ToggleSwitch checked={anyOn} onChange={(v) => setCategory(category.key, v)} /></td>
                    </tr>
                    {anyOn
                      ? types.map((t) => (
                          <tr key={t.key} className="huolto-settings-type">
                            <td>{t.label}</td>
                            <td>
                              <ToggleSwitch
                                checked={settings.types[t.key]?.enabled === true}
                                onChange={(v) => setType(t.key, { enabled: v })}
                              />
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
  return bare ? toggles : (
    <section className="form-section" id="huoltoraportit">
      <h2>Huoltoraportit</h2>
      {toggles}
    </section>
  );
}
