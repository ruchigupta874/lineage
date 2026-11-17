import { useState } from 'react';
import PropTypes from 'prop-types';
import { LINEAGE_COPY } from '@/features/lineage/constants';
import { DETAILS_SHARE } from './useDetailsShare';
import styles from './PaneSplitter.module.css';

const MIDPOINT = (DETAILS_SHARE.min + DETAILS_SHARE.max) / 2;

const percent = (share) => Math.round(share * 100);

/**
 * The rule between the canvas and the details pane, and the handle that moves
 * it. Drag it, or focus it and use the arrow keys (Home and End jump to
 * either end); a double-click flips between 80 : 20 and 70 : 30. While it is
 * held, the split shows as a ratio, since a ratio is what it is limited to.
 *
 * `containerRef` is the box both panes share, which the pointer is measured
 * against.
 */
export default function PaneSplitter({ share, onChange, containerRef }) {
  const [isDragging, setDragging] = useState(false);

  const shareAt = (clientX) => {
    const box = containerRef.current.getBoundingClientRect();
    return (box.right - clientX) / box.width;
  };

  const onKeyDown = (event) => {
    const moves = {
      ArrowLeft: share + DETAILS_SHARE.step,
      ArrowRight: share - DETAILS_SHARE.step,
      Home: DETAILS_SHARE.max,
      End: DETAILS_SHARE.min,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    onChange(moves[event.key]);
  };

  const canvasShare = percent(1 - share);

  // A focusable separator is a widget — the ARIA window-splitter pattern — but
  // jsx-a11y's role table still files `separator` as non-interactive.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={LINEAGE_COPY.splitter}
      aria-valuemin={percent(1 - DETAILS_SHARE.max)}
      aria-valuemax={percent(1 - DETAILS_SHARE.min)}
      aria-valuenow={canvasShare}
      aria-valuetext={LINEAGE_COPY.splitRatio(canvasShare, 100 - canvasShare)}
      tabIndex={0}
      title={LINEAGE_COPY.splitterHint}
      className={styles.splitter}
      data-dragging={isDragging || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (isDragging) onChange(shareAt(event.clientX));
      }}
      onPointerUp={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onDoubleClick={() => onChange(share < MIDPOINT ? DETAILS_SHARE.max : DETAILS_SHARE.min)}
      onKeyDown={onKeyDown}
    >
      <span className={styles.grip} aria-hidden="true" />
      {isDragging && (
        <span className={styles.ratio} aria-hidden="true">
          {LINEAGE_COPY.splitRatio(canvasShare, 100 - canvasShare)}
        </span>
      )}
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}

PaneSplitter.propTypes = {
  /** The details pane's share of the width, between DETAILS_SHARE.min and .max. */
  share: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  containerRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }).isRequired,
};
