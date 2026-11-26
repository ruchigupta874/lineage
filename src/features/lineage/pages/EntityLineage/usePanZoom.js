import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Zoom limits. `readable` is the floor the canvas opens at: below it table
 * names stop being legible, so a lineage too big to fit opens centred on its
 * focus rather than shrunk to a thumbnail. Fit to screen may go lower, because
 * then someone asked to see everything — and `min` is low enough for a
 * catalog twenty-odd hops wide to fit, as its shape if not its names.
 */
export const ZOOM = { min: 0.1, max: 1.6, readable: 0.7, step: 1.2 };

/** Pointer travel, in pixels, before a press on the canvas counts as a drag. */
const DRAG_SLOP = 3;

const clampZoom = (k) => Math.min(ZOOM.max, Math.max(ZOOM.min, k));

/** Presses that belong to a control or a table, not to the canvas behind them. */
const isOwnedByControl = (target) => Boolean(target.closest('button, [data-no-pan]'));

/**
 * Pan and zoom over a drawing laid out in real pixels.
 *
 * The wheel zooms about the pointer, so what is under the cursor stays under
 * it. Dragging empty canvas pans; a press that never travels is a click on the
 * background, which `onBackgroundClick` hears. `view` is the drawing's offset
 * and scale; `size` is the canvas's own, zero until first measured.
 */
export function usePanZoom({ onBackgroundClick }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);

  // What a new size does to the view is the canvas's call (LineageCanvas
  // re-frames or re-centres); this only reports it.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomAt = useCallback(
    (factor, cx, cy) =>
      setView((current) => {
        const k = clampZoom(current.k * factor);
        const ratio = k / current.k;
        return { k, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
      }),
    [],
  );

  // React attaches wheel listeners as passive, and a passive listener cannot
  // stop the page scrolling underneath the zoom.
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), event.clientX - box.left, event.clientY - box.top);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [zoomAt]);

  const zoomBy = useCallback(
    (factor) => zoomAt(factor, size.width / 2, size.height / 2),
    [zoomAt, size],
  );

  const panHandlers = {
    onPointerDown(event) {
      if (event.button !== 0 || isOwnedByControl(event.target)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
    },
    onPointerMove(event) {
      const start = drag.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!start.moved) setIsPanning(true);
      start.moved = true;
      setView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy });
    },
    onPointerUp() {
      const start = drag.current;
      drag.current = null;
      setIsPanning(false);
      if (start && !start.moved) onBackgroundClick?.();
    },
  };

  return { ref, size, view, setView, zoomBy, isPanning, panHandlers };
}
