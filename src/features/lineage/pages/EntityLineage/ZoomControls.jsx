import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { LINEAGE_COPY } from '@/features/lineage/constants';
import { ZOOM } from './usePanZoom';
import styles from './LineageCanvas.module.css';

/** Zoom is a float, so a value a hair inside a limit still counts as at it. */
const EPSILON = 0.001;

/**
 * Zoom out, the current zoom, zoom in, and fit. Anchored bottom-left by
 * default: the details panel opens on the right and would otherwise cover
 * them. A canvas with no panel can put them bottom-right.
 */
export default function ZoomControls({ corner = 'left', zoom, onZoomIn, onZoomOut, onFit }) {
  return (
    <div
      className={styles.controls}
      role="group"
      aria-label={LINEAGE_COPY.zoom}
      data-corner={corner}
      data-no-pan
    >
      <button
        type="button"
        className={styles.controlButton}
        onClick={onZoomOut}
        disabled={zoom <= ZOOM.min + EPSILON}
        aria-label={LINEAGE_COPY.zoomOut}
        title={LINEAGE_COPY.zoomOut}
      >
        <Icon name="minus" size={14} />
      </button>
      <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className={styles.controlButton}
        onClick={onZoomIn}
        disabled={zoom >= ZOOM.max - EPSILON}
        aria-label={LINEAGE_COPY.zoomIn}
        title={LINEAGE_COPY.zoomIn}
      >
        <Icon name="plus" size={14} />
      </button>
      <span className={styles.controlDivider} />
      <button
        type="button"
        className={styles.controlButton}
        onClick={onFit}
        aria-label={LINEAGE_COPY.fit}
        title={LINEAGE_COPY.fit}
      >
        <Icon name="expand" size={13} />
      </button>
    </div>
  );
}

ZoomControls.propTypes = {
  corner: PropTypes.oneOf(['left', 'right']),
  zoom: PropTypes.number.isRequired,
  onZoomIn: PropTypes.func.isRequired,
  onZoomOut: PropTypes.func.isRequired,
  onFit: PropTypes.func.isRequired,
};
