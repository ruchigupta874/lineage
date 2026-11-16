import { useState } from 'react';
import PropTypes from 'prop-types';
import { LAYER_META, LINEAGE_COPY } from '@/features/lineage/constants';
import { assetShape } from './assetShape';
import { frameView, holdInPlace, revealNode } from './canvasFrame';
import LineageEdges from './LineageEdges';
import LineageNode from './LineageNode';
import { ZOOM, usePanZoom } from './usePanZoom';
import ZoomControls from './ZoomControls';
import styles from './LineageCanvas.module.css';

/** Dot-grid pitch at 100%. It scales and travels with the drawing, so a pan reads as movement. */
const GRID = 20;

/** A band's heading sits this far into its band, and this far below the canvas top once pinned. */
const HEAD_INSET = 12;

/** Narrower than this on screen and a heading is all ellipsis; better left out. */
const HEAD_MIN_WIDTH = 64;

/**
 * The lineage drawn: a band per layer, the lines between tables, the tables.
 *
 * Band headings live outside the zoomed drawing, so they keep their size at
 * any zoom and pin to the edges of the canvas when the drawing is panned —
 * which layer a column is never scrolls out of sight.
 */
export default function LineageCanvas({ lineage }) {
  const { layout, path, focus } = lineage;
  const { ref, size, view, setView, zoomBy, isPanning, panHandlers } = usePanZoom({
    onBackgroundClick: () => lineage.select(null),
  });
  const [framed, setFramed] = useState(null);

  // Adjusted while rendering rather than in an effect, so a new layout is
  // never painted at the old one's offset first. A layout made by opening or
  // closing a card or a side keeps that table still — lifted only as far as
  // it takes to show a card that just opened — and any other is framed afresh.
  if (size.width > 0 && framed?.key !== layout.key) {
    setFramed(layout);
    setView((current) => {
      if (!framed || !lineage.anchorId) return frameView(layout, size, focus.id, ZOOM.readable);
      const held = holdInPlace(framed, layout, lineage.anchorId, current);
      return revealNode(layout, lineage.anchorId, size, held);
    });
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
        aria-label={LINEAGE_COPY.canvas(focus.name)}
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

        {layout.nodes.map((node) => (
          <LineageNode key={node.id} node={node} lineage={lineage} />
        ))}
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
        onFit={() => setView(frameView(layout, size, focus.id, ZOOM.min))}
      />
    </div>
  );
}

LineageCanvas.propTypes = {
  lineage: PropTypes.shape({
    layout: PropTypes.shape({
      key: PropTypes.string.isRequired,
      width: PropTypes.number.isRequired,
      height: PropTypes.number.isRequired,
      nodes: PropTypes.array.isRequired,
      edges: PropTypes.array.isRequired,
      bands: PropTypes.array.isRequired,
    }).isRequired,
    focus: assetShape.isRequired,
    path: PropTypes.shape({ edgeIds: PropTypes.instanceOf(Set).isRequired }),
    anchorId: PropTypes.string,
    select: PropTypes.func.isRequired,
  }).isRequired,
};
