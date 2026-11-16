import { LINEAGE_GEOMETRY } from './lineageLayout';

/** Breathing room between a fitted drawing and the canvas edge. */
const MARGIN = 28;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The stretch of drawing to keep in view when it is too wide for the canvas:
 * the focus and whichever side of it holds more of the lineage. A gold table
 * leads with what it was built from, a bronze one with what reads it — so the
 * cut falls on the thinner side, never through the middle of both.
 */
function leadingSpan(layout, focus) {
  const geo = LINEAGE_GEOMETRY;
  const before = layout.nodes.filter((node) => node.x < focus.x).length;
  const after = layout.nodes.filter((node) => node.x > focus.x).length;
  const isUpstreamFirst = before >= after;
  return isUpstreamFirst
    ? { start: 0, end: focus.x + geo.nodeWidth + geo.bandPad + geo.pad, isUpstreamFirst }
    : { start: focus.x - geo.bandPad - geo.pad, end: layout.width, isUpstreamFirst };
}

/**
 * Where the drawing sits when it first appears or is re-centred.
 *
 * Fit the whole lineage if it fits at `minZoom` or better, never enlarging
 * past 100%. If it does not, stay at `minZoom` — readable beats complete.
 * Across, that keeps the focus and its larger side in view; down, it centres
 * the focus. Neither ever pulls blank canvas in past an end of the drawing.
 */
export function frameView(layout, size, focusId, minZoom) {
  const fit = Math.min(
    (size.width - MARGIN * 2) / layout.width,
    (size.height - MARGIN * 2) / layout.height,
  );
  const k = clamp(fit, minZoom, 1);
  const focus = layout.nodes.find((node) => node.id === focusId);
  const centred = (room, length) => (room - length * k) / 2;
  const inBounds = (room, length, offset) => clamp(offset, room - length * k, 0);

  let x = centred(size.width, layout.width);
  if (focus && layout.width * k > size.width) {
    const { start, end, isUpstreamFirst } = leadingSpan(layout, focus);
    let offset;
    if ((end - start) * k <= size.width) offset = centred(size.width, end - start) - start * k;
    else offset = isUpstreamFirst ? size.width - end * k : -start * k;
    x = inBounds(size.width, layout.width, offset);
  }

  let y = centred(size.height, layout.height);
  if (focus && layout.height * k > size.height) {
    const middle = focus.y + LINEAGE_GEOMETRY.nodeHeight / 2;
    y = inBounds(size.height, layout.height, size.height / 2 - middle * k);
  }

  return { k, x, y };
}

/**
 * The same view, nudged up just enough to bring one card's foot on screen —
 * a card opened near the bottom would otherwise list its columns out of
 * sight — but never so far that its header leaves the top.
 */
export function revealNode(layout, id, size, view) {
  const node = layout.nodes.find((candidate) => candidate.id === id);
  if (!node) return view;
  const top = view.y + node.y * view.k;
  const overflow = view.y + (node.y + node.height) * view.k - (size.height - MARGIN);
  const lift = Math.max(0, Math.min(overflow, top - MARGIN));
  return lift > 0 ? { ...view, y: view.y - lift } : view;
}

/**
 * The same view, shifted so one asset stays put on screen across a
 * re-layout. Opening a "+3" moves every table; the one you clicked should not
 * be among them, or you lose your place at the moment you asked for more.
 */
export function holdInPlace(previous, next, id, view) {
  const before = previous.nodes.find((node) => node.id === id);
  const after = next.nodes.find((node) => node.id === id);
  if (!before || !after) return view;
  return {
    ...view,
    x: view.x + (before.x - after.x) * view.k,
    y: view.y + (before.y - after.y) * view.k,
  };
}
