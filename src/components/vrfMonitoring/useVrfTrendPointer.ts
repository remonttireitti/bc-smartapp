import { useCallback, useRef, useState } from 'react';

export type VrfTrendViewport = { startMs: number; endMs: number };

/** Hiiri/kosketus: kohdistin (hover) + vetämällä rajaus (zoom) + tuplaklikkaus palauttaa. */
export function useVrfTrendPointer(opts: {
  padLeft: number;
  innerW: number;
  viewport: VrfTrendViewport;
  onHoverT: (t: number | null) => void;
  onZoom?: (startMs: number, endMs: number) => void;
  onResetZoom?: () => void;
}) {
  const { padLeft, innerW, viewport, onHoverT, onZoom, onResetZoom } = opts;
  const [active, setActive] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const dragRef = useRef<{ x0: number; x1: number; pointerId: number } | null>(null);

  const span = Math.max(viewport.endMs - viewport.startMs, 1);
  const clampX = useCallback((x: number) => Math.min(padLeft + innerW, Math.max(padLeft, x)), [padLeft, innerW]);
  const xToT = useCallback(
    (x: number) => viewport.startMs + ((clampX(x) - padLeft) / Math.max(innerW, 1)) * span,
    [viewport.startMs, padLeft, innerW, span, clampX],
  );

  const localX = (event: React.PointerEvent) => event.clientX - event.currentTarget.getBoundingClientRect().left;

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onZoom || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const x = clampX(localX(event));
      dragRef.current = { x0: x, x1: x, pointerId: event.pointerId };
      setDrag({ x0: x, x1: x });
      setActive(true);
      onHoverT(xToT(x));
    },
    [onZoom, clampX, onHoverT, xToT],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const x = localX(event);
      setActive(true);
      onHoverT(xToT(x));
      const d = dragRef.current;
      if (d && d.pointerId === event.pointerId) {
        d.x1 = clampX(x);
        if (Math.abs(d.x1 - d.x0) > 3 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* ei tuettu */
          }
        }
        setDrag({ x0: d.x0, x1: d.x1 });
      }
    },
    [onHoverT, xToT, clampX],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !commit || !onZoom) return;
      if (Math.abs(d.x1 - d.x0) < 8) return;
      const a = xToT(Math.min(d.x0, d.x1));
      const b = xToT(Math.max(d.x0, d.x1));
      onZoom(a, b);
    },
    [onZoom, xToT],
  );

  const onPointerUp = useCallback(() => finishDrag(true), [finishDrag]);
  const onPointerCancel = useCallback(() => finishDrag(false), [finishDrag]);
  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) return;
      dragRef.current = null;
      setDrag(null);
      setActive(false);
      onHoverT(null);
    },
    [onHoverT],
  );
  const onDoubleClick = useCallback(() => onResetZoom?.(), [onResetZoom]);

  const selection =
    drag && Math.abs(drag.x1 - drag.x0) >= 2
      ? { x: Math.min(drag.x0, drag.x1), width: Math.abs(drag.x1 - drag.x0) }
      : null;

  return {
    active,
    selection,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, onDoubleClick },
  };
}
