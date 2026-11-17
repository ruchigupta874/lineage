import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Skeleton from '@/components/ui/Skeleton';
import {
  ASSET_KIND_META,
  LAYER_META,
  LAYER_ORDER,
  LENS,
  LEVEL,
  LEVELS,
  LEVEL_META,
  LINEAGE_COPY,
} from '@/features/lineage/constants';
import { assetShape } from './assetShape';
import styles from './EntityLineage.module.css';

const LEVEL_OPTIONS = LEVELS.map((id) => ({ id, label: LEVEL_META[id].label }));

/** Heading and one line under it: the traced table, or the catalog as a whole. */
function Subject({ focus, reach, assets }) {
  if (!focus) {
    return (
      <>
        <span className={styles.overviewIcon}>
          <Icon name="workflow" size={16} />
        </span>
        <div className={styles.focusBody}>
          <div className={styles.focusTitle}>
            <h1 className={styles.focusName}>{LINEAGE_COPY.overviewTitle}</h1>
          </div>
          <p className={styles.focusMeta}>
            {LINEAGE_COPY.overviewCount(assets.length)}
            {LAYER_ORDER.map((layer) => (
              <span key={layer} className={styles.layerStat} data-layer={layer}>
                <span className={styles.layerDot} />
                {assets.filter((asset) => asset.layer === layer).length}{' '}
                {LAYER_META[layer].label.toLowerCase()}
              </span>
            ))}
          </p>
        </div>
      </>
    );
  }

  const kind = ASSET_KIND_META[focus.kind];
  return (
    <>
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
    </>
  );
}

const reachShape = PropTypes.shape({
  upstream: PropTypes.instanceOf(Set).isRequired,
  downstream: PropTypes.instanceOf(Set).isRequired,
});

Subject.propTypes = {
  focus: assetShape,
  reach: reachShape,
  assets: PropTypes.arrayOf(assetShape).isRequired,
};

/**
 * What the canvas is showing and which level it is drawn at: the asset being
 * traced and how far its lineage reaches across the whole catalog — not just
 * what is open on the canvas, which can be less — or, with nothing traced,
 * the catalog itself, layer by layer.
 *
 * The level is a toggle, not a tab strip: both levels are the same canvas
 * drawn at two grains, so nothing is swapped out for a tab panel to name. It
 * sits inside the lens tabs' panel because each lens is read at both levels.
 */
export default function StageHead({ focus, reach, assets, isLoading, lens, level, onLevelChange }) {
  const levelSwitch = (
    <SegmentedControl
      options={LEVEL_OPTIONS}
      value={level}
      onChange={onLevelChange}
      ariaLabel={LINEAGE_COPY.level}
    />
  );

  if (isLoading) {
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

  return (
    <header className={styles.stageHead} data-layer={focus?.layer}>
      <Subject focus={focus} reach={reach} assets={assets} />
      {lens === LENS.technical && (
        <p className={styles.hint}>
          <Icon name="info" size={12} />
          {LEVEL_META[level].hint}
        </p>
      )}
      {levelSwitch}
    </header>
  );
}

StageHead.propTypes = {
  focus: assetShape,
  reach: reachShape,
  assets: PropTypes.arrayOf(assetShape).isRequired,
  isLoading: PropTypes.bool.isRequired,
  lens: PropTypes.oneOf(Object.values(LENS)).isRequired,
  level: PropTypes.oneOf(Object.values(LEVEL)).isRequired,
  onLevelChange: PropTypes.func.isRequired,
};
