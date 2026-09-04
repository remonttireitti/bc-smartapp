import { useMemo, useState } from 'react';
import type { KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import {
  cloneKonvektoriRow,
  createEmptyKonvektoriRow,
  ensureKonvektoriRowsList,
} from '../../lib/huoltoRaportti/defaults';
import { sortKonvektoriRowsByTunnus } from '../../lib/huoltoRaportti/konvektoriRows';
import { konvektoriTarkastusSummary } from '../../lib/huoltoRaportti/konvektoriTarkastus';
import { KONVEKTORI_TYYPPI_OPTIONS } from '../../lib/huoltoRaportti/konvektoriTypes';
import { konvektoritSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { KonvektoriTarkastusDialog } from './KonvektoriTarkastusDialog';

interface Props {
  rows: KonvektoriRowData[];
  onChange: (rows: KonvektoriRowData[]) => void;
  onPrintFaults?: () => void;
  printFaultsBusy?: boolean;
  embeddedInParentDialog?: boolean;
}

function rowStatusLabel(row: KonvektoriRowData): { text: string; className: string } {
  const summary = konvektoriTarkastusSummary(row);
  if (row.huomioTyyppi === 'vika' || row.huomio.trim()) {
    return {
      text: row.huomioTyyppi === 'vika' ? 'Vika' : 'Huomio',
      className: row.huomioTyyppi === 'vika' ? 'konvektori-status konvektori-status--vika' : 'konvektori-status konvektori-status--note',
    };
  }
  if (!summary.complete) {
    return { text: `${summary.answered}/${summary.total}`, className: 'konvektori-status konvektori-status--pending' };
  }
  if (summary.anyNo) {
    return { text: 'Huomioita', className: 'konvektori-status konvektori-status--warn' };
  }
  return { text: 'OK', className: 'konvektori-status konvektori-status--ok' };
}

function fieldLabelClass(embeddedInParentDialog: boolean): string {
  return embeddedInParentDialog ? 'konvektori-compact-label' : 'sr-only';
}

export function KonvektoritSection({
  rows,
  onChange,
  onPrintFaults,
  printFaultsBusy,
  embeddedInParentDialog = false,
}: Props) {
  const sortedRows = useMemo(
    () => sortKonvektoriRowsByTunnus(ensureKonvektoriRowsList(rows)),
    [rows],
  );
  const [dialogRowId, setDialogRowId] = useState<string | null>(null);

  const commitRows = (nextRows: KonvektoriRowData[]) => {
    onChange(sortKonvektoriRowsByTunnus(ensureKonvektoriRowsList(nextRows)));
  };

  const patchRow = (rowId: string, patch: Partial<KonvektoriRowData>) => {
    const list = ensureKonvektoriRowsList(rows);
    const next = list.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    if ('tunnus' in patch) {
      onChange(next);
      return;
    }
    commitRows(next);
  };

  const sortRowsByTunnus = () => {
    commitRows(rows);
  };

  const removeRow = (rowId: string) => {
    const list = ensureKonvektoriRowsList(rows);
    commitRows(
      list.length > 1
        ? list.filter((row) => row.id !== rowId)
        : [createEmptyKonvektoriRow()],
    );
  };

  const dialogRow = dialogRowId ? sortedRows.find((row) => row.id === dialogRowId) ?? null : null;
  const dialogLabel =
    dialogRow?.tunnus.trim()
    || dialogRow?.huone?.trim()
    || [dialogRow?.valmistaja, dialogRow?.malli].filter(Boolean).join(' ')
    || (dialogRowId ? `Konvektori ${sortedRows.findIndex((row) => row.id === dialogRowId) + 1}` : '');

  const body = (
    <>
      <p className="muted huolto-help">
        Täytä konvektorin tunnistetiedot listaan. Kaikki mittaukset ja tarkastuskohdat syötetään vain Tarkastus-popupissa — niitä ei tarvitse toistaa muualla.
      </p>
      <div className="btn-group konvektori-list-actions">
        {onPrintFaults ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={printFaultsBusy}
            onClick={onPrintFaults}
          >
            {printFaultsBusy ? 'Avataan…' : 'Tulosta vialliset'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            commitRows([
              ...ensureKonvektoriRowsList(rows),
              cloneKonvektoriRow(sortedRows[sortedRows.length - 1]),
            ])
          }
        >
          Kopioi rivi
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => commitRows([...ensureKonvektoriRowsList(rows), createEmptyKonvektoriRow()])}
        >
          + Lisää rivi
        </button>
      </div>

      <div className="konvektori-compact-list">
        <div className="konvektori-compact-head" aria-hidden="true">
          <span>#</span>
          <span>Tyyppi</span>
          <span>Tunnus</span>
          <span>Huone</span>
          <span>Valmistaja</span>
          <span>Malli</span>
          <span>Sarjanumero</span>
          <span className="konvektori-compact-head-status">Tila</span>
          <span className="konvektori-compact-head-actions">Toiminnot</span>
        </div>

        {sortedRows.map((row, index) => {
          const status = rowStatusLabel(row);
          const rowId = row.id ?? `row-${index}`;
          return (
            <div key={rowId} className="konvektori-compact-row">
              <span className="konvektori-compact-num">{index + 1}</span>
              <label className="konvektori-compact-field konvektori-compact-field--type">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Tyyppi</span>
                <select
                  value={row.tyyppi ?? ''}
                  onChange={(e) => patchRow(rowId, { tyyppi: e.target.value as KonvektoriRowData['tyyppi'] })}
                >
                  <option value="">Valitse…</option>
                  {KONVEKTORI_TYYPPI_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="konvektori-compact-field">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Tunnus</span>
                <input
                  value={row.tunnus}
                  onChange={(e) => patchRow(rowId, { tunnus: e.target.value })}
                  onBlur={sortRowsByTunnus}
                  placeholder="Tunnus"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Huone</span>
                <input
                  value={row.huone ?? ''}
                  onChange={(e) => patchRow(rowId, { huone: e.target.value })}
                  placeholder="Huone"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Valmistaja</span>
                <input
                  value={row.valmistaja}
                  onChange={(e) => patchRow(rowId, { valmistaja: e.target.value })}
                  placeholder="Valmistaja"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Malli</span>
                <input
                  value={row.malli}
                  onChange={(e) => patchRow(rowId, { malli: e.target.value })}
                  placeholder="Malli"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className={fieldLabelClass(embeddedInParentDialog)}>Sarjanumero</span>
                <input
                  value={row.sarjanumero}
                  onChange={(e) => patchRow(rowId, { sarjanumero: e.target.value })}
                  placeholder="Sarjanumero"
                />
              </label>
              <span className={`konvektori-compact-status ${status.className}`} title={status.text}>
                {status.text}
              </span>
              <div className="konvektori-compact-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDialogRowId(rowId)}
                >
                  Tarkastus
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow(rowId)}>
                  Poista
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {dialogRow && dialogRowId && (
        <KonvektoriTarkastusDialog
          open
          row={dialogRow}
          rowLabel={dialogLabel}
          onClose={() => setDialogRowId(null)}
          onSave={(nextRow) => {
            const list = ensureKonvektoriRowsList(rows);
            commitRows(list.map((row) => (row.id === dialogRowId ? nextRow : row)));
          }}
        />
      )}
    </>
  );

  if (embeddedInParentDialog) {
    return <div className="konvektorit-section konvektorit-section--embedded">{body}</div>;
  }

  return (
    <HuoltoModuleSection moduleKey="konvektorit" title={konvektoritSectionTitle('konvektorit')}>
      {body}
    </HuoltoModuleSection>
  );
}
