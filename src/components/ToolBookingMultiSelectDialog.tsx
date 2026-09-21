import { useEffect, useMemo } from 'react';
import {
  evaluateMultiToolAvailability,
  formatYmdRangeFi,
  toolDayRateBadge,
  type BusyRange,
} from '../lib/toolInventory';
import { inventoryImagePublicUrl } from '../lib/inventoryImages';
import type { ToolBookingPublicTool } from '../types/inventory';

export type ToolBookingMultiSelectDialogProps = {
  open: boolean;
  tools: ToolBookingPublicTool[];
  busy: BusyRange[];
  startYmd: string;
  endYmd: string;
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  onApplyNextWindow?: (startYmd: string, endYmd: string) => void;
  onProceedWithoutBusy?: () => void;
  /** filter = calendar filter (no period suggestions); booking = renter flow */
  mode?: 'booking' | 'filter';
};

export default function ToolBookingMultiSelectDialog({
  open,
  tools,
  busy,
  startYmd,
  endYmd,
  selectedIds,
  onChangeSelectedIds,
  onClose,
  onConfirm,
  onApplyNextWindow,
  onProceedWithoutBusy,
  mode = 'booking',
}: ToolBookingMultiSelectDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const availability = useMemo(
    () =>
      evaluateMultiToolAvailability({
        tools: tools.map((t) => ({ id: t.id, name: t.name })),
        selectedIds,
        startYmd,
        endYmd,
        busy,
      }),
    [tools, selectedIds, startYmd, endYmd, busy],
  );

  if (!open) return null;

  const selectedSet = new Set(selectedIds);
  const busyIdSet = new Set(availability.busyTools.map((t) => t.id));
  const rangeLabel = formatYmdRangeFi(startYmd, endYmd);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChangeSelectedIds(selectedIds.filter((x) => x !== id));
    else onChangeSelectedIds([...selectedIds, id]);
  }

  return (
    <div
      className="leave-draft-overlay tool-booking-multi-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="leave-draft-dialog panel tool-booking-multi-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-booking-multi-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="tool-booking-multi-title">Valitse työkalut</h2>
        <p className="muted" style={{ margin: '0 0 .75rem' }}>
          {mode === 'filter' ? (
            'Valitse yksi tai useampi työkalu kalenterisuodattimeen. Tyhjä valinta = kaikki lainattavat.'
          ) : (
            <>
              Jakso <strong>{rangeLabel}</strong>. Valitse yksi tai useampi lainattava työkalu.
            </>
          )}
        </p>

        <div className="tool-booking-multi-actions-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChangeSelectedIds(tools.map((t) => t.id))}
          >
            Valitse kaikki
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChangeSelectedIds([])}
          >
            Tyhjennä
          </button>
        </div>

        {tools.length === 0 ? (
          <p className="muted">Ei lainattavia työkaluja.</p>
        ) : (
          <ul className="tool-booking-multi-list">
            {tools.map((tool) => {
              const checked = selectedSet.has(tool.id);
              const conflict = mode === 'booking' && checked && busyIdSet.has(tool.id);
              const thumb = tool.image_path ? inventoryImagePublicUrl(tool.image_path) : null;
              const dayBadge = toolDayRateBadge(tool);
              return (
                <li key={tool.id}>
                  <label
                    className={`tool-booking-multi-item ${checked ? 'is-selected' : ''} ${
                      conflict ? 'is-conflict' : ''
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(tool.id)} />
                    <span className="tool-booking-multi-thumb" aria-hidden="true">
                      {thumb ? <img src={thumb} alt="" /> : <span className="muted">—</span>}
                    </span>
                    <span className="tool-booking-multi-meta">
                      <strong>{tool.name}</strong>
                      <span className="muted">
                        {tool.category ?? 'Työkalu'}
                        {dayBadge ? ` · ${dayBadge}` : ''}
                        {conflict ? ' · varattu jaksolla' : checked ? ' · vapaa' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {mode === 'booking' && availability.messagesFi.skipBusy && (
          <div className="tool-booking-suggest" role="status">
            <p style={{ margin: 0 }}>{availability.messagesFi.skipBusy}</p>
            {onProceedWithoutBusy && availability.freeTools.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onProceedWithoutBusy}
              >
                Vuokraa ilman varattuja
              </button>
            )}
          </div>
        )}

        {mode === 'booking' && availability.messagesFi.nextWindow && (
          <div className="tool-booking-suggest" role="status">
            <p style={{ margin: 0 }}>{availability.messagesFi.nextWindow}</p>
            {onApplyNextWindow && availability.nextAllFreeWindow && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  onApplyNextWindow(
                    availability.nextAllFreeWindow!.startYmd,
                    availability.nextAllFreeWindow!.endYmd,
                  )
                }
              >
                Käytä ehdotettua jaksoa
              </button>
            )}
          </div>
        )}

        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sulje
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={mode === 'booking' && selectedIds.length === 0}
            onClick={onConfirm}
          >
            {mode === 'filter' ? 'Käytä suodatinta' : `Valitse (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
