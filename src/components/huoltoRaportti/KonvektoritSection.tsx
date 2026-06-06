import type { HuomioLuonne, KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import { cloneKonvektoriRow, createEmptyKonvektoriRow } from '../../lib/huoltoRaportti/defaults';
import { FormInput } from './FormInput';
import { konvektoritSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';

const CHECKBOX_FIELDS = [
  ['suodatinPuhdistettu', 'Suodatin'],
  ['kennoPuhdistettu', 'Kenno'],
  ['kondenssiTarkastettu', 'Kondenssi'],
  ['puhallinTarkastettu', 'Puhallin'],
  ['venttiiliTarkastettu', 'Venttiili'],
] as const;

interface Props {
  rows: KonvektoriRowData[];
  onChange: (rows: KonvektoriRowData[]) => void;
}

export function KonvektoritSection({ rows, onChange }: Props) {
  const patchRow = (index: number, patch: Partial<KonvektoriRowData>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.length > 1 ? rows.filter((_, i) => i !== index) : [createEmptyKonvektoriRow()]);
  };

  return (
    <HuoltoModuleSection moduleKey="konvektorit" title={konvektoritSectionTitle('konvektorit')}>
      <p className="muted huolto-help">
        Lisää huolletut konvektorit riveittäin. Rasti tarkoittaa, että kohde on tarkastettu ja todettu
        kunnossa (OK).
      </p>
      <div className="btn-group">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange([...rows, cloneKonvektoriRow(rows[rows.length - 1])])}
        >
          Kopioi rivi
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange([...rows, createEmptyKonvektoriRow()])}
        >
          + Lisää rivi
        </button>
      </div>

      <div className="huolto-table-wrap">
        <table className="huolto-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Tunnus / tila</th>
              <th>Valmistaja</th>
              <th>Malli</th>
              <th>Sarjanumero</th>
              {CHECKBOX_FIELDS.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th>Huomio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id ?? index}>
                <td>{index + 1}</td>
                <td>
                  <input
                    value={row.tunnus}
                    onChange={(e) => patchRow(index, { tunnus: e.target.value })}
                    placeholder="Esim. Neuvottelu / K1"
                  />
                </td>
                <td>
                  <input value={row.valmistaja} onChange={(e) => patchRow(index, { valmistaja: e.target.value })} />
                </td>
                <td>
                  <input value={row.malli} onChange={(e) => patchRow(index, { malli: e.target.value })} />
                </td>
                <td>
                  <input
                    value={row.sarjanumero}
                    onChange={(e) => patchRow(index, { sarjanumero: e.target.value })}
                  />
                </td>
                {CHECKBOX_FIELDS.map(([field]) => (
                  <td key={field} className="huolto-table-checkbox">
                    <input
                      type="checkbox"
                      checked={!!row[field]}
                      onChange={(e) => patchRow(index, { [field]: e.target.checked })}
                      title="Tarkastettu, OK"
                    />
                  </td>
                ))}
                <td>
                  <select
                    value={row.huomioTyyppi ?? 'kommentti'}
                    onChange={(e) => patchRow(index, { huomioTyyppi: e.target.value as HuomioLuonne })}
                    aria-label="Huomion tyyppi"
                  >
                    <option value="kommentti">Kommentti</option>
                    <option value="vika">Vika</option>
                  </select>
                  <input
                    value={row.huomio}
                    onChange={(e) => patchRow(index, { huomio: e.target.value })}
                    placeholder="Lisähuomio"
                  />
                </td>
                <td>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow(index)}>
                    Poista
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="huolto-mobile-cards">
        {rows.map((row, index) => (
          <div key={`mobile-${row.id ?? index}`} className="huolto-submodule">
            <div className="huolto-circuit-header">
              <h4>Rivi {index + 1}</h4>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow(index)}>
                Poista
              </button>
            </div>
            <div className="line-form-grid">
              <FormInput
                label="Tunnus / tila"
                value={row.tunnus}
                onChange={(v) => patchRow(index, { tunnus: v })}
              />
              <FormInput label="Valmistaja" value={row.valmistaja} onChange={(v) => patchRow(index, { valmistaja: v })} />
              <FormInput label="Malli" value={row.malli} onChange={(v) => patchRow(index, { malli: v })} />
              <FormInput
                label="Sarjanumero"
                value={row.sarjanumero}
                onChange={(v) => patchRow(index, { sarjanumero: v })}
              />
            </div>
            <div className="checkbox-grid huolto-konvektori-checks">
              {CHECKBOX_FIELDS.map(([field, label]) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={!!row[field]}
                    onChange={(e) => patchRow(index, { [field]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label>
              Huomion tyyppi
              <select
                value={row.huomioTyyppi ?? 'kommentti'}
                onChange={(e) => patchRow(index, { huomioTyyppi: e.target.value as HuomioLuonne })}
              >
                <option value="kommentti">Kommentti</option>
                <option value="vika">Vika</option>
              </select>
            </label>
            <FormInput label="Huomio" value={row.huomio} onChange={(v) => patchRow(index, { huomio: v })} />
          </div>
        ))}
      </div>
    </HuoltoModuleSection>
  );
}
