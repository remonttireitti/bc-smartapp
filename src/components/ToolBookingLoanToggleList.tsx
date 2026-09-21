import ToggleSwitch from './ToggleSwitch';
import {
  isQueuedBusyRange,
  rangeOverlapsBusyForTool,
  toolDayRateBadge,
  type BusyRange,
} from '../lib/toolInventory';
import { inventoryImagePublicUrl } from '../lib/inventoryImages';
import type { ToolBookingPublicTool } from '../types/inventory';

export type ToolBookingLoanToggleListProps = {
  tools: ToolBookingPublicTool[];
  busy: BusyRange[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  startYmd?: string;
  endYmd?: string;
  conflictIds?: string[];
  emptyLabel?: string;
};

export default function ToolBookingLoanToggleList({
  tools,
  busy,
  selectedIds,
  onChangeSelectedIds,
  startYmd = '',
  endYmd = '',
  conflictIds = [],
  emptyLabel = 'Ei lainattavia työkaluja.',
}: ToolBookingLoanToggleListProps) {
  const selectedSet = new Set(selectedIds);
  const conflictSet = new Set(conflictIds);

  function setLoan(id: string, on: boolean) {
    if (on) {
      if (!selectedSet.has(id)) onChangeSelectedIds([...selectedIds, id]);
    } else {
      onChangeSelectedIds(selectedIds.filter((x) => x !== id));
    }
  }

  function isQueuedOnly(toolId: string): boolean {
    if (!startYmd || !endYmd) return false;
    if (rangeOverlapsBusyForTool(startYmd, endYmd, busy, toolId, { hardOnly: true })) return false;
    return busy.some(
      (r) =>
        r.tool_id === toolId &&
        isQueuedBusyRange(r) &&
        rangeOverlapsBusyForTool(startYmd, endYmd, [r], toolId, { hardOnly: false }),
    );
  }

  if (tools.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <ul className="tool-booking-loan-list">
      {tools.map((tool) => {
        const on = selectedSet.has(tool.id);
        const conflict = on && conflictSet.has(tool.id);
        const queued = on && isQueuedOnly(tool.id);
        const thumb = tool.image_path ? inventoryImagePublicUrl(tool.image_path) : null;
        const dayBadge = toolDayRateBadge(tool);
        return (
          <li key={tool.id}>
            <div
              className={`tool-booking-loan-item ${on ? 'is-on' : ''} ${conflict ? 'is-conflict' : ''}`}
            >
              <span className="tool-booking-loan-thumb" aria-hidden="true">
                {thumb ? <img src={thumb} alt="" /> : <span className="muted">—</span>}
              </span>
              <div className="tool-booking-loan-meta">
                <strong>{tool.name}</strong>
                <span className="muted">
                  {tool.category ?? 'Työkalu'}
                  {dayBadge ? ` · ${dayBadge}` : ''}
                  {conflict
                    ? ' · varattu jaksolla'
                    : queued
                      ? ' · vahvistamaton varaus (voit silti lähettää — FIFO)'
                      : on
                        ? ' · vapaa'
                        : ''}
                </span>
                <ToggleSwitch
                  checked={on}
                  onChange={(checked) => setLoan(tool.id, checked)}
                  label="Lainaa tämä"
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
