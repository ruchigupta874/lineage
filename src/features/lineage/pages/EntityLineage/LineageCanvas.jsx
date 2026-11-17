import { useState } from 'react';
import PropTypes from 'prop-types';
import { LAYER_META } from '@/features/lineage/constants';
import { frameView, holdInPlace, revealNode } from './canvasFrame';
import LineageEdges from './LineageEdges';
import { ZOOM, usePanZoom } from './usePanZoom';
import ZoomControls from './ZoomControls';
import styles from './LineageCanvas.module.css';

/** Dot-grid pitch at 100%. It scales and travels with the drawing, so a pan reads as movement. */
const GRID = 20;

/** A band's heading sits this far into its band, and this far below the canvas top once pinned. */
const HEAD_INSET = 12;

/** Narrower than this on screen and a heading is all ellipsis; better left out. */
const HEAD_MIN_WIDTH = 64;

/** Whether two views are the same, give or take rounding. */
const sameView = (a, b) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k - b.k) < 1e-4;

/**
 * The lineage drawn: a band per layer, the lines between tables, the tables.
 *
 * Band headings live outside the zoomed drawing, so they keep their size at
 * any zoom and pin to the edges of the canvas when the drawing is panned —
 * which layer a column is never scrolls out of sight.
 *
 * It draws whatever layout it is given — the table graph, or one column's
 * trace — and leaves the tables themselves to `renderNode`. `frameOn` is the
 * table a fresh view is framed around; `inset` is canvas covered by
 * something floating over it, which the framing keeps the drawing clear of.
 */
export default function LineageCanvas({
  layout,
  path,
  label,
  frameOn,
  anchorId,
  inset,
  renderNode,
  onBackgroundClick,
}) {
  const { ref, size, view, setView, zoomBy, isPanning, panHandlers } = usePanZoom({
    onBackgroundClick,
  });
  // What the view was last set to, for which layout and at which canvas size,
  // and whether the view has been panned or zoomed by hand since a fresh frame.
  const [framed, setFramed] = useState(null);

  // Adjusted while rendering rather than in an effect, so nothing is ever
  // painted at a stale offset first.
  //
  // A new layout made by opening or closing a card or a side keeps that table
  // still — lifted only as far as it takes to show a card that just opened —
  // and any other is framed afresh.
  //
  // A new canvas size (the details pane opening or being dragged, the window
  // or the browser zoom changing) frames the drawing afresh too, so it always
  // fits the room it now has — unless it has been panned or zoomed by hand,
  // which a resize must not undo: then what was in the middle stays there.
  if (size.width > 0) {
    let next = null;
    let touched = false;
    if (framed?.layout.key !== layout.key) {
      if (!framed || !anchorId) next = frameView(layout, size, frameOn, ZOOM.readable, inset);
      else {
        touched = framed.touched || !sameView(view, framed.view);
        next = revealNode(
          layout,
          anchorId,
          size,
          holdInPlace(framed.layout, layout, anchorId, view),
        );
      }
    } else if (framed.size.width !== size.width || framed.size.height !== size.height) {
      touched = framed.touched || !sameView(view, framed.view);
      next = touched
        ? {
            ...view,
            x: view.x + (size.width - framed.size.width) / 2,
            y: view.y + (size.height - framed.size.height) / 2,
          }
        : frameView(layout, size, frameOn, ZOOM.readable, inset);
    }
    if (next) {
      setFramed({ layout, size, view: next, touched });
      setView(next);
    }
  }

  const { x, y, k } = view;

  // Pinned on both axes: to the canvas top once the band scrolls up past it,
  // and to the left edge once its band starts off-screen. `isPinned` is the
  // first case, when cards can scroll up underneath it.
  const heads = framed
    ? layout.bands
        .map((band) => {
          const left = Math.max(0, x + band.x * k);
          const top = y + (band.y + HEAD_INSET) * k;
          return {
            band,
            left,
            top: Math.max(HEAD_INSET, top),
            isPinned: top < HEAD_INSET,
            width: x + (band.x + band.width) * k - left,
          };
        })
        .filter((head) => head.width >= HEAD_MIN_WIDTH)
    : [];

  return (
    <div
      ref={ref}
      className={styles.viewport}
      data-panning={isPanning || undefined}
      style={{ backgroundSize: `${GRID * k}px ${GRID * k}px`, backgroundPosition: `${x}px ${y}px` }}
      {...panHandlers}
    >
      <div
        role="group"
        aria-label={label}
        className={styles.world}
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${x}px, ${y}px) scale(${k})`,
          visibility: framed ? undefined : 'hidden',
        }}
      >
        {layout.bands.map((band) => (
          <div
            key={band.layer}
            className={styles.band}
            data-layer={band.layer}
            style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
          />
        ))}

        <LineageEdges layout={layout} path={path} />

        {layout.nodes.map(renderNode)}
      </div>

      {heads.map(({ band, left, top, isPinned, width }) => (
        <div
          key={band.layer}
          className={styles.layerHead}
          data-layer={band.layer}
          data-pinned={isPinned || undefined}
          aria-hidden="true"
          style={{ left, top, width }}
        >
          <span className={styles.layerDot} />
          <span className={styles.layerName}>{LAYER_META[band.layer].label}</span>
          <span className={styles.layerCount}>{band.count}</span>
          <span className={styles.layerBlurb}>{LAYER_META[band.layer].blurb}</span>
        </div>
      ))}

      <ZoomControls
        zoom={k}
        onZoomIn={() => zoomBy(ZOOM.step)}
        onZoomOut={() => zoomBy(1 / ZOOM.step)}
        onFit={() => setView(frameView(layout, size, frameOn, ZOOM.min, inset))}
      />
    </div>
  );
}

LineageCanvas.propTypes = {
  layout: PropTypes.shape({
    key: PropTypes.string.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    nodes: PropTypes.array.isRequired,
    edges: PropTypes.array.isRequired,
    bands: PropTypes.array.isRequired,
  }).isRequired,
  path: PropTypes.shape({ edgeIds: PropTypes.instanceOf(Set).isRequired }),
  label: PropTypes.string.isRequired,
  frameOn: PropTypes.string,
  anchorId: PropTypes.string,
  inset: PropTypes.shape({ top: PropTypes.number, right: PropTypes.number }),
  /** Draws one laid-out table; must return an element keyed by `node.id`. */
  renderNode: PropTypes.func.isRequired,
  onBackgroundClick: PropTypes.func,
};
