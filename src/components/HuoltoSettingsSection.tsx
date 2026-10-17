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
export default function HuoltoSettingsSection({ companySettings, onChange }: Props) {
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

  return (
    <section className="form-section" id="huoltoraportit">
      <h2>Huoltoraportit</h2>
      <ToggleSwitch label="Käytössä" checked={settings.enabled} onChange={(enabled) => update({ ...settings, enabled })} />
      {settings.enabled ? (
        <div className="huolto-settings-table-wrap">
          <table className="huolto-settings-table">
            <thead>
              <tr>
                <th>Laji</th>
                <th>Käytössä</th>
                <th>Perushinta € (alv 0 %)</th>
                <th>Lisätunti €/h (alv 0 %)</th>
              </tr>
            </thead>
            <tbody>
              {HUOLTO_CATEGORIES.map((category) => {
                const types = huoltoReportTypesOf(category.key);
                if (types.length === 1 && types[0].key === category.key) {
                  const on = settings.types[category.key]?.enabled === true;
                  return (
                    <tr key={category.key} className="huolto-settings-category" style={{ borderLeftColor: category.color }}>
                      <td><strong>{category.label}</strong></td>
                      <td><ToggleSwitch checked={on} onChange={(v) => setType(category.key, { enabled: v })} /></td>
                      <td>{priceInput(category.key, 'price', !on)}</td>
                      <td>{priceInput(category.key, 'hourly', !on)}</td>
                    </tr>
                  );
                }
                const anyOn = types.some((t) => settings.types[t.key]?.enabled);
                return (
                  <Fragment key={category.key}>
                    <tr className="huolto-settings-category" style={{ borderLeftColor: category.color }}>
                      <td><strong>{category.label}</strong></td>
                      <td>
                        <ToggleSwitch checked={anyOn} onChange={(v) => setCategory(category.key, v)} />
                      </td>
                      <td />
                      <td />
                    </tr>
                    {anyOn
                      ? types.map((t) => {
                          const on = settings.types[t.key]?.enabled === true;
                          return (
                            <tr key={t.key} className="huolto-settings-type">
                              <td>{t.label}</td>
                              <td><ToggleSwitch checked={on} onChange={(v) => setType(t.key, { enabled: v })} /></td>
                              <td>{priceInput(t.key, 'price', !on)}</td>
                              <td>{priceInput(t.key, 'hourly', !on)}</td>
                            </tr>
                          );
                        })
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
