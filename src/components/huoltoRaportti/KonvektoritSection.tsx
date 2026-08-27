import { useMemo, useState } from 'react';
import type { KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import {
  cloneKonvektoriRow,
  createEmptyKonvektoriRow,
  ensureKonvektoriRowsList,
} from '../../lib/huoltoRaportti/defaults';
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

export function KonvektoritSection({
  rows,
  onChange,
  onPrintFaults,
  printFaultsBusy,
  embeddedInParentDialog = false,
}: Props) {
  const effectiveRows = useMemo(() => ensureKonvektoriRowsList(rows), [rows]);
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);

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

  const dialogRow = dialogIndex != null ? effectiveRows[dialogIndex] : null;
  const dialogLabel =
    dialogRow?.tunnus.trim()
    || dialogRow?.huone?.trim()
    || [dialogRow?.valmistaja, dialogRow?.malli].filter(Boolean).join(' ')
    || (dialogIndex != null ? `Konvektori ${dialogIndex + 1}` : '');

  const body = (
    <>
      <p className="muted huolto-help">
        Valitse tyyppi ja täytä tunnistetiedot. Mittaukset ja tarkastus avataan popupista. Tuloste näyttää konvektorit ruudukkona kuvineen.
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

        {effectiveRows.map((row, index) => {
          const status = rowStatusLabel(row);
          return (
            <div key={row.id ?? index} className="konvektori-compact-row">
              <span className="konvektori-compact-num">{index + 1}</span>
              <label className="konvektori-compact-field konvektori-compact-field--type">
                <span className="sr-only">Tyyppi</span>
                <select
                  value={row.tyyppi ?? ''}
                  onChange={(e) => patchRow(index, { tyyppi: e.target.value as KonvektoriRowData['tyyppi'] })}
                >
                  <option value="">Valitse…</option>
                  {KONVEKTORI_TYYPPI_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="konvektori-compact-field">
                <span className="sr-only">Tunnus</span>
                <input
                  value={row.tunnus}
                  onChange={(e) => patchRow(index, { tunnus: e.target.value })}
                  placeholder="Tunnus"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className="sr-only">Huone</span>
                <input
                  value={row.huone ?? ''}
                  onChange={(e) => patchRow(index, { huone: e.target.value })}
                  placeholder="Huone"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className="sr-only">Valmistaja</span>
                <input
                  value={row.valmistaja}
                  onChange={(e) => patchRow(index, { valmistaja: e.target.value })}
                  placeholder="Valmistaja"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className="sr-only">Malli</span>
                <input
                  value={row.malli}
                  onChange={(e) => patchRow(index, { malli: e.target.value })}
                  placeholder="Malli"
                />
              </label>
              <label className="konvektori-compact-field">
                <span className="sr-only">Sarjanumero</span>
                <input
                  value={row.sarjanumero}
                  onChange={(e) => patchRow(index, { sarjanumero: e.target.value })}
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
                  onClick={() => setDialogIndex(index)}
                >
                  Tarkastus
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow(index)}>
                  Poista
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {dialogRow && dialogIndex != null && (
        <KonvektoriTarkastusDialog
          open
          row={dialogRow}
          rowLabel={dialogLabel}
          onClose={() => setDialogIndex(null)}
          onSave={(nextRow) => patchRow(dialogIndex, nextRow)}
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
