import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Skeleton from '@/components/ui/Skeleton';
import {
  ASSET_KIND_META,
  LAYER_META,
  LEVEL,
  LEVELS,
  LEVEL_META,
  LINEAGE_COPY,
} from '@/features/lineage/constants';
import { assetShape } from './assetShape';
import styles from './EntityLineage.module.css';

const LEVEL_OPTIONS = LEVELS.map((id) => ({ id, label: LEVEL_META[id].label }));

/**
 * The asset the canvas is tracing, how far its lineage reaches across the
 * whole catalog — not just what is open on the canvas, which can be less —
 * and which level it is drawn at.
 *
 * The level is a toggle, not a tab strip: both levels are the same canvas
 * drawn at two grains, so nothing is swapped out for a tab panel to name.
 */
export default function StageHead({ focus, reach, level, onLevelChange }) {
  const levelSwitch = (
    <SegmentedControl
      options={LEVEL_OPTIONS}
      value={level}
      onChange={onLevelChange}
      ariaLabel={LINEAGE_COPY.level}
    />
  );

  if (!focus || !reach) {
    return (
      <header className={styles.stageHead}>
        <Skeleton width={32} height={32} radius="var(--radius-lg)" />
        <div className={styles.focusBody} aria-hidden="true">
          <Skeleton width={180} height={14} />
          <Skeleton width={300} height={10} />
        </div>
        {levelSwitch}
      </header>
    );
  }

  const kind = ASSET_KIND_META[focus.kind];
  return (
    <header className={styles.stageHead} data-layer={focus.layer}>
      <span className={styles.focusIcon}>
        <Icon name={kind.icon} size={15} />
      </span>
      <div className={styles.focusBody}>
        <div className={styles.focusTitle}>
          <h1 className={styles.focusName}>{focus.name}</h1>
          <span className={styles.layerTag}>
            {LAYER_META[focus.layer].label} · {kind.label}
          </span>
        </div>
        <p className={styles.focusMeta}>
          <span className={styles.fqn}>{focus.fqn}</span>
          <span aria-hidden="true"> · </span>
          {LINEAGE_COPY.reach(reach.upstream.size, reach.downstream.size)}
        </p>
      </div>
      <p className={styles.hint}>
        <Icon name="info" size={12} />
        {LEVEL_META[level].hint}
      </p>
      {levelSwitch}
    </header>
  );
}

StageHead.propTypes = {
  focus: assetShape,
  reach: PropTypes.shape({
    upstream: PropTypes.instanceOf(Set).isRequired,
    downstream: PropTypes.instanceOf(Set).isRequired,
  }),
  level: PropTypes.oneOf(Object.values(LEVEL)).isRequired,
  onLevelChange: PropTypes.func.isRequired,
};
