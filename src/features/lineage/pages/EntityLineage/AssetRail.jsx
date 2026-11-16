import { useState } from 'react';
import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import SearchInput from '@/components/ui/SearchInput';
import Skeleton from '@/components/ui/Skeleton';
import {
  ASSET_KIND_META,
  HEALTH,
  HEALTH_META,
  LAYER_META,
  LAYER_ORDER,
  LINEAGE_COPY,
} from '@/features/lineage/constants';
import { assetShape } from './assetShape';
import styles from './EntityLineage.module.css';

/** Rows per layer while loading: enough to read as a list, not a count of anything. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

function RailSkeleton() {
  return LAYER_ORDER.map((layer) => (
    <div key={layer} className={styles.group} aria-hidden="true">
      <div className={styles.groupHead}>
        <Skeleton width={64} height={10} />
      </div>
      {SKELETON_ROWS.map((row) => (
        <div key={row} className={styles.itemSkeleton}>
          <Skeleton width={13} height={13} />
          <Skeleton width="70%" height={11} />
        </div>
      ))}
    </div>
  ));
}

/**
 * Every asset in the catalog, by layer: where you pick what to trace. The
 * focus is marked here as well as on the canvas, so after panning away it is
 * still plain which table the picture is of.
 */
export default function AssetRail({ assets, focusId, onPick, isLoading }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const groups = LAYER_ORDER.map((layer) => ({
    layer,
    items: assets.filter(
      (asset) => asset.layer === layer && asset.name.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.items.length > 0);

  let body;
  if (isLoading) body = <RailSkeleton />;
  else if (groups.length === 0) body = <p className={styles.empty}>{LINEAGE_COPY.noMatches}</p>;
  else {
    body = groups.map((group) => (
      <div key={group.layer} className={styles.group} data-layer={group.layer}>
        <h2 className={styles.groupHead}>
          <span className={styles.layerDot} />
          {LAYER_META[group.layer].label}
          <span className={styles.groupCount}>{group.items.length}</span>
        </h2>
        <ul className={styles.items}>
          {group.items.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className={styles.item}
                aria-current={asset.id === focusId ? 'true' : undefined}
                title={asset.fqn}
                onClick={() => onPick(asset.id)}
              >
                <Icon
                  name={ASSET_KIND_META[asset.kind].icon}
                  size={13}
                  className={styles.itemIcon}
                />
                <span className={styles.itemName}>{asset.name}</span>
                {asset.health !== HEALTH.healthy && (
                  <span
                    className={styles.itemHealth}
                    data-tone={HEALTH_META[asset.health].tone}
                    aria-label={HEALTH_META[asset.health].label}
                    role="img"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ));
  }

  return (
    <nav className={styles.rail} aria-label={LINEAGE_COPY.railTitle}>
      <div className={styles.railHead}>
        <span className={styles.railTitle}>{LINEAGE_COPY.railTitle}</span>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={LINEAGE_COPY.search}
          width="100%"
        />
      </div>
      <div className={styles.railBody}>{body}</div>
    </nav>
  );
}

AssetRail.propTypes = {
  assets: PropTypes.arrayOf(assetShape).isRequired,
  focusId: PropTypes.string,
  onPick: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
};
