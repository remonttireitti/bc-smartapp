import { FormEvent, useMemo, useRef, useState } from 'react';
import PriceEstimateTable from './PriceEstimateTable';
import {
  ADDON_MODULES,
  ADDON_MODULE_LABELS,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  emptySignupForm,
  estimateMonthly,
  formatEur,
  signupSelection,
  submitSignup,
  validateSignup,
  type PriceList,
  type SignupErrors,
  type SignupForm,
  type StaffRole,
} from '../lib/companySignup';

type Props = { prices: PriceList };

export default function CompanySignupForm({ prices }: Props) {
  const [form, setForm] = useState<SignupForm>(() => emptySignupForm());
  const [errors, setErrors] = useState<SignupErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [website, setWebsite] = useState('');
  const startedAt = useRef(Date.now());

  const estimate = useMemo(() => estimateMonthly(signupSelection(form), prices), [form, prices]);

  function patch(p: Partial<SignupForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function patchUser(i: number, p: Partial<SignupForm['users'][number]>) {
    setForm((f) => ({ ...f, users: f.users.map((u, j) => (j === i ? { ...u, ...p } : u)) }));
  }

  function toggleRole(i: number, role: StaffRole, on: boolean) {
    const roles = form.users[i].roles;
    patchUser(i, { roles: on ? [...roles, role] : roles.filter((r) => r !== role) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validateSignup(form);
    setErrors(v);
    if (Object.keys(v).length) {
      setError('Tarkista merkityt kentät.');
      return;
    }
    setBusy(true);
    const res = await submitSignup(form, { website, startedAt: startedAt.current });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      return;
    }
    if (res.fields) setErrors(res.fields);
    setError(res.message);
  }

  if (sent) {
    return (
      <div className="signup-sent" role="status">
        <h3>Kiitos, tilaus on vastaanotettu</h3>
        <p className="muted">Käsittelemme sen pian. Saat kutsun sähköpostiin, kun tili on avattu.</p>
      </div>
    );
  }

  const fe = (key: string) => (errors[key] ? <span className="field-error">{errors[key]}</span> : null);
  const text = (key: keyof SignupForm, label: string, props: Record<string, unknown> = {}) => (
    <label className={errors[key] ? 'has-error' : undefined}>
      {label}
      <input
        value={String(form[key] ?? '')}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<SignupForm>)}
        {...props}
      />
      {fe(key)}
    </label>
  );

  return (
    <form className="signup-form" onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend>Yritys</legend>
        <div className="signup-grid">
          {text('company_name', 'Yrityksen nimi', { autoComplete: 'organization' })}
          {text('business_id', 'Y-tunnus', { placeholder: '1234567-8', inputMode: 'numeric' })}
          {text('address', 'Katuosoite', { autoComplete: 'street-address' })}
          {text('postal_code', 'Postinumero', { inputMode: 'numeric', maxLength: 5, autoComplete: 'postal-code' })}
          {text('city', 'Postitoimipaikka', { autoComplete: 'address-level2' })}
          {text('contact_name', 'Yhteyshenkilö', { autoComplete: 'name' })}
          {text('email', 'Sähköposti', { type: 'email', autoComplete: 'email' })}
          {text('phone', 'Puhelin', { type: 'tel', autoComplete: 'tel' })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Moduulit</legend>
        <div className="signup-checks">
          <label className="signup-check signup-check-fixed">
            <input type="checkbox" checked disabled /> Peruspaketti <span className="muted">{formatEur(prices.base_monthly_eur)}</span>
          </label>
          {ADDON_MODULES.map((k) => (
            <label key={k} className="signup-check">
              <input
                type="checkbox"
                checked={form.modules[k]}
                onChange={(e) => patch({ modules: { ...form.modules, [k]: e.target.checked } })}
              />{' '}
              {ADDON_MODULE_LABELS[k]} <span className="muted">{formatEur(prices.module_prices[k])}</span>
            </label>
          ))}
          {HUOLTO_KEYS.map((k) => (
            <label key={k} className="signup-check">
              <input
                type="checkbox"
                checked={form.huolto[k]}
                onChange={(e) => patch({ huolto: { ...form.huolto, [k]: e.target.checked } })}
              />{' '}
              {HUOLTO_LABELS[k]} <span className="muted">{formatEur(prices.huolto_prices[k])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Käyttäjät</legend>
        {errors.users ? <p className="field-error">{errors.users}</p> : null}
        <div className="signup-users">
          {form.users.map((u, i) => (
            <div key={i} className="signup-user-row">
              <label className={errors[`users.${i}.name`] ? 'has-error' : undefined}>
                Nimi
                <input value={u.name} onChange={(e) => patchUser(i, { name: e.target.value })} />
                {fe(`users.${i}.name`)}
              </label>
              <label className={errors[`users.${i}.email`] ? 'has-error' : undefined}>
                Sähköposti
                <input type="email" value={u.email} onChange={(e) => patchUser(i, { email: e.target.value })} />
                {fe(`users.${i}.email`)}
              </label>
              <label className={errors[`users.${i}.phone`] ? 'has-error' : undefined}>
                Puhelin
                <input type="tel" value={u.phone} onChange={(e) => patchUser(i, { phone: e.target.value })} />
                {fe(`users.${i}.phone`)}
              </label>
              <div className="signup-user-roles" role="group" aria-label="Roolit">
                {STAFF_ROLES.map((r) => (
                  <label key={r} className="signup-check">
                    <input type="checkbox" checked={u.roles.includes(r)} onChange={(e) => toggleRole(i, r, e.target.checked)} />{' '}
                    {STAFF_ROLE_LABELS[r]}
                  </label>
                ))}
                {fe(`users.${i}.roles`)}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm signup-user-remove"
                disabled={form.users.length <= 1}
                onClick={() => patch({ users: form.users.filter((_, j) => j !== i) })}
                aria-label="Poista käyttäjä"
              >
                Poista
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => patch({ users: [...form.users, { name: '', email: '', phone: '', roles: ['technician'] }] })}
        >
          + Lisää käyttäjä
        </button>
        <p className="muted signup-role-prices">
          {STAFF_ROLES.map((r) => `${STAFF_ROLE_LABELS[r]} ${formatEur(prices.role_prices[r])}`).join(' · ')} /kk.
          Usean roolin käyttäjä maksaa kalleimman roolinsa hinnan.
        </p>
      </fieldset>

      <label>
        Lisätietoja
        <textarea rows={3} value={form.message} onChange={(e) => patch({ message: e.target.value })} />
      </label>

      <label className="signup-hp" aria-hidden="true">
        Verkkosivu
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>

      <PriceEstimateTable estimate={estimate} title="Arvioitu kuukausihinta" />

      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary landing-btn-lg" disabled={busy}>
        {busy ? 'Lähetetään…' : 'Lähetä tilaus'}
      </button>
    </form>
  );
}
