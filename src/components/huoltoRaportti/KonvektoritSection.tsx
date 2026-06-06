import { useMemo } from 'react';
import type { HuomioLuonne, KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import {
  cloneKonvektoriRow,
  createEmptyKonvektoriRow,
  ensureKonvektoriRowsList,
} from '../../lib/huoltoRaportti/defaults';
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
  const effectiveRows = useMemo(() => ensureKonvektoriRowsList(rows), [rows]);

  const commitRows = (nextRows: KonvektoriRowData[]) => {
    onChange(nextRows);
  };

  const patchRow = (index: number, patch: Partial<KonvektoriRowData>) => {
    commitRows(effectiveRows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    commitRows(
      effectiveRows.length > 1
        ? effectiveRows.filter((_, i) => i !== index)
        : [createEmptyKonvektoriRow()],
    );
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
          onClick={() =>
            commitRows([
              ...effectiveRows,
              cloneKonvektoriRow(effectiveRows[effectiveRows.length - 1]),
            ])
          }
        >
          Kopioi rivi
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => commitRows([...effectiveRows, createEmptyKonvektoriRow()])}
        >
          + Lisää rivi
        </button>
      </div>

      <div className="huolto-table-wrap huolto-konvektori-table-wrap">
        <table className="huolto-table huolto-konvektori-table">
          <thead>
            <tr>
              <th className="huolto-konvektori-col-num">#</th>
              <th className="huolto-konvektori-col-text">Tunnus / tila</th>
              <th className="huolto-konvektori-col-text">Valmistaja</th>
              <th className="huolto-konvektori-col-text">Malli</th>
              <th className="huolto-konvektori-col-text">Sarjanumero</th>
              {CHECKBOX_FIELDS.map(([, label]) => (
                <th key={label} className="huolto-table-checkbox">
                  {label}
                </th>
              ))}
              <th className="huolto-konvektori-col-huomio">Huomio</th>
              <th className="huolto-konvektori-col-actions" />
            </tr>
          </thead>
          <tbody>
            {effectiveRows.map((row, index) => (
              <tr key={row.id ?? index}>
                <td className="huolto-konvektori-col-num">{index + 1}</td>
                <td className="huolto-konvektori-col-text">
                  <input
                    value={row.tunnus}
                    onChange={(e) => patchRow(index, { tunnus: e.target.value })}
                    placeholder="Esim. Neuvottelu / K1"
                  />
                </td>
                <td className="huolto-konvektori-col-text">
                  <input value={row.valmistaja} onChange={(e) => patchRow(index, { valmistaja: e.target.value })} />
                </td>
                <td className="huolto-konvektori-col-text">
                  <input value={row.malli} onChange={(e) => patchRow(index, { malli: e.target.value })} />
                </td>
                <td className="huolto-konvektori-col-text">
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
                <td className="huolto-konvektori-col-huomio">
                  <div className="huolto-konvektori-huomio-fields">
                    <select
                      value={row.huomioTyyppi ?? 'kommentti'}
                      onChange={(e) => patchRow(index, { huomioTyyppi: e.target.value as HuomioLuonne })}
                      aria-label="Huomion tyyppi"
                    >
                      <option value="kommentti">Kommentti</option>
                      <option value="vika">Vika</option>
                    </select>
                    <textarea
                      rows={2}
                      value={row.huomio}
                      onChange={(e) => patchRow(index, { huomio: e.target.value })}
                      placeholder="Lisähuomio"
                    />
                  </div>
                </td>
                <td className="huolto-konvektori-col-actions">
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
        {effectiveRows.map((row, index) => (
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
            <label className="huolto-konvektori-huomio-mobile">
              Huomio
              <textarea
                rows={3}
                value={row.huomio}
                onChange={(e) => patchRow(index, { huomio: e.target.value })}
                placeholder="Lisähuomio"
              />
            </label>
          </div>
        ))}
      </div>
    </HuoltoModuleSection>
  );
}
