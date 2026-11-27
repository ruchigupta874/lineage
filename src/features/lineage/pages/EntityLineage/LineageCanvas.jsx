import { useState } from 'react';
import PropTypes from 'prop-types';
import { frameView, holdInPlace, revealNode } from './canvasFrame';
import LineageEdges from './LineageEdges';
import { ZOOM, usePanZoom } from './usePanZoom';
import ZoomControls from './ZoomControls';
import styles from './LineageCanvas.module.css';

/**
 * Dot-grid pitch at 100%. It scales and travels with the drawing, so a pan
 * reads as movement; zoomed far out, every other dot drops out, as often as
 * it takes to keep them at least `GRID_MIN` apart rather than a grey smear.
 */
const GRID = 20;
const GRID_MIN = 10;

const gridPitch = (k) => {
  let pitch = GRID * k;
  while (pitch < GRID_MIN) pitch *= 2;
  return pitch;
};

/** A heading sits this far below its column's top, and this far below the canvas top once pinned. */
const HEAD_INSET = 12;

/** Narrower than this on screen and a heading is all ellipsis; better left out. */
const HEAD_MIN_WIDTH = 64;

/**
 * Roughly how wide a heading's parts run, in screen pixels, to decide how
 * much of it to show. Headings keep their size at any zoom while their
 * column narrows, so this is worked out against the column's width on
 * screen. `char` is a bold 12px letter; `chip` is a layer's dot, count and
 * the gaps around its name; `compact` is a dot and count alone.
 */
const HEAD_TEXT = { char: 6.8, chip: 42, compact: 34, gap: 12, pad: 20, blurb: 64 };

const chipWidth = (layer) => layer.label.length * HEAD_TEXT.char + HEAD_TEXT.chip;

/** Whether two views are the same, give or take rounding. */
const sameView = (a, b) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k - b.k) < 1e-4;

const headLayerShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hue: PropTypes.string.isRequired,
  blurb: PropTypes.string,
  count: PropTypes.number.isRequired,
});

/**
 * What a column holds, by layer, fitted to the room it has on screen.
 *
 * One layer — every medallion column — reads as its name and count, and
 * what the layer means if there is room for that to be read. A column where
 * the flow puts layers side by side names each with its count. Too narrow
 * for the names — a mix, or any column zoomed far out — each layer becomes
 * its coloured dot and count, the colours keyed by the layer list over the
 * canvas, rather than a label cut off mid-word.
 */
function ColumnHead({ layers, width, isPinned, inBand, style }) {
  const isMixed = layers.length > 1;
  const named =
    layers.reduce((sum, layer) => sum + chipWidth(layer), 0) +
    HEAD_TEXT.gap * (layers.length - 1) +
    HEAD_TEXT.pad;
  const isCompact = named > width;
  const [only] = layers;
  const hasBlurb = !isMixed && only.blurb && width - named >= HEAD_TEXT.blurb;

  return (
    <div
      className={styles.columnHead}
      data-pinned={isPinned || undefined}
      data-mixed={isMixed || undefined}
      data-in-band={inBand || undefined}
      aria-hidden="true"
      style={style}
    >
      {layers.map((layer) => (
        <span key={layer.key} className={styles.headLayer} data-hue={layer.hue}>
          <span className={styles.layerDot} />
          {!isCompact && <span className={styles.layerName}>{layer.label}</span>}
          <span className={styles.layerCount}>{layer.count}</span>
          {hasBlurb && <span className={styles.layerBlurb}>{layer.blurb}</span>}
        </span>
      ))}
    </div>
  );
}

ColumnHead.propTypes = {
  layers: PropTypes.arrayOf(headLayerShape).isRequired,
  /** On screen, in pixels: what the heading has to fit in. */
  width: PropTypes.number.isRequired,
  isPinned: PropTypes.bool.isRequired,
  /** Heads a band, whose own glow it sits in, rather than a bare column. */
  inBand: PropTypes.bool.isRequired,
  style: PropTypes.object.isRequired,
};

/**
 * The lineage drawn: the lines between tables, the tables, and above each
 * column a heading saying which layers it holds.
 *
 * Columns are the flow, left to right, and a column can mix layers — so the
 * layers are named per column rather than drawn as bands around them. A
 * workspace that asks for bands gets a layout with `bands` in it, where no
 * column mixes: each band is drawn as a lane behind its columns — a layer's
 * colour, or grey for what sits between layers — with one heading across it.
 * Headings live outside the zoomed drawing, so they keep their size at any
 * zoom and pin to the edges of the canvas when the drawing is panned — what
 * a column holds never scrolls out of sight.
 *
 * It draws whatever layout it is given — the table graph, or one column's
 * trace — and leaves the tables themselves to `renderNode`. `frameOn` is the
 * table a fresh view is framed around; `inset` is canvas covered by
 * something floating over it, which the framing keeps the drawing clear of.
 * `showHeads` off leaves the headings out, for cards that carry their
 * layer's colour themselves. `zoomCorner` is the bottom corner the zoom
 * controls sit in.
 */
export default function LineageCanvas({
  layout,
  path,
  label,
  frameOn,
  anchorId,
  inset,
  showHeads = true,
  zoomCorner = 'left',
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

  // Pinned on both axes: to the canvas top once the column scrolls up past
  // it, and to the left edge once its column starts off-screen. `isPinned` is
  // the first case, when cards can scroll up underneath it.
  const heads =
    framed && showHeads
      ? layout.heads
          .map((head) => {
            const left = Math.max(0, x + head.x * k);
            const top = y + (head.y + HEAD_INSET) * k;
            return {
              head,
              left,
              top: Math.max(HEAD_INSET, top),
              isPinned: top < HEAD_INSET,
              width: x + (head.x + head.width) * k - left,
            };
          })
          .filter((placed) => placed.width >= HEAD_MIN_WIDTH)
      : [];

  return (
    <div
      ref={ref}
      className={styles.viewport}
      data-panning={isPanning || undefined}
      style={{
        backgroundSize: `${gridPitch(k)}px ${gridPitch(k)}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
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
        {layout.bands?.map((band) => (
          <div
            key={band.key}
            className={styles.band}
            data-hue={band.hue}
            style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
          />
        ))}

        <LineageEdges layout={layout} path={path} />

        {layout.nodes.map(renderNode)}
      </div>

      {heads.map(({ head, left, top, isPinned, width }) => (
        <ColumnHead
          key={head.index}
          layers={head.layers}
          width={width}
          isPinned={isPinned}
          inBand={Boolean(layout.bands)}
          style={{ left, top, width }}
        />
      ))}

      <ZoomControls
        corner={zoomCorner}
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
    heads: PropTypes.arrayOf(
      PropTypes.shape({
        index: PropTypes.number.isRequired,
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired,
        width: PropTypes.number.isRequired,
        layers: PropTypes.arrayOf(headLayerShape).isRequired,
      }),
    ).isRequired,
    /** Present when the workspace draws its layers as bands. */
    bands: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        hue: PropTypes.string.isRequired,
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired,
        width: PropTypes.number.isRequired,
        height: PropTypes.number.isRequired,
      }),
    ),
  }).isRequired,
  path: PropTypes.shape({ edgeIds: PropTypes.instanceOf(Set).isRequired }),
  label: PropTypes.string.isRequired,
  frameOn: PropTypes.string,
  anchorId: PropTypes.string,
  inset: PropTypes.shape({ top: PropTypes.number, right: PropTypes.number }),
  showHeads: PropTypes.bool,
  zoomCorner: PropTypes.oneOf(['left', 'right']),
  /** Draws one laid-out table; must return an element keyed by `node.id`. */
  renderNode: PropTypes.func.isRequired,
  onBackgroundClick: PropTypes.func,
};
