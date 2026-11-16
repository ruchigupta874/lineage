import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import {
  ASSET_KIND_META,
  DIRECTIONS,
  HEALTH_META,
  LAYER_META,
  LINEAGE_COPY,
} from '@/features/lineage/constants';
import { assetShape, graphShape } from './assetShape';
import NeighbourList from './NeighbourList';
import styles from './AssetDetail.module.css';

/**
 * The selected asset, over the right of the canvas: what it is, whether it
 * can be trusted, where it comes from and goes, and its columns.
 */
export default function AssetDetail({ asset, graph, isFocus, onClose, onReveal, onFocusHere }) {
  const kind = ASSET_KIND_META[asset.kind];
  const health = HEALTH_META[asset.health];
  const stats = [
    { label: LINEAGE_COPY.rows, value: asset.rows ?? LINEAGE_COPY.noRows },
    { label: LINEAGE_COPY.columns, value: String(asset.columns.length) },
    { label: LINEAGE_COPY.updated, value: asset.updatedAt },
  ];

  return (
    <aside className={styles.panel} data-layer={asset.layer} aria-label={asset.name}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <span className={styles.layerTag}>
            <span className={styles.layerDot} />
            {LAYER_META[asset.layer].label}
          </span>
          <span className={styles.kind}>
            <Icon name={kind.icon} size={12} />
            {kind.label}
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={LINEAGE_COPY.close}
            title={LINEAGE_COPY.close}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <h2 className={styles.name}>{asset.name}</h2>
        <p className={styles.fqn}>{asset.fqn}</p>
        {asset.description && <p className={styles.description}>{asset.description}</p>}
      </header>

      <div className={styles.body}>
        <dl className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <dt className={styles.statLabel}>{stat.label}</dt>
              <dd className={styles.statValue}>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <dl className={styles.facts}>
          <dt>{LINEAGE_COPY.owner}</dt>
          <dd>{asset.owner}</dd>
          <dt>{asset.source ? LINEAGE_COPY.source : LINEAGE_COPY.job}</dt>
          <dd>{asset.source ?? asset.job}</dd>
          <dt>{LINEAGE_COPY.health}</dt>
          <dd>
            <span className={styles.health} data-tone={health.tone}>
              <span className={styles.healthDot} />
              {health.label}
            </span>
            {asset.healthNote && <span className={styles.healthNote}>{asset.healthNote}</span>}
          </dd>
        </dl>

        {DIRECTIONS.map((direction) => (
          <NeighbourList
            key={direction}
            asset={asset}
            direction={direction}
            graph={graph}
            onReveal={onReveal}
          />
        ))}

        <section className={styles.section}>
          <h3 className={styles.sectionHead}>
            {LINEAGE_COPY.columns}
            <span className={styles.sectionCount}>{asset.columns.length}</span>
          </h3>
          <ul className={styles.columns}>
            {asset.columns.map((column) => (
              <li key={column.name} className={styles.column}>
                <span className={styles.columnName}>{column.name}</span>
                <span className={styles.columnType}>{column.type}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!isFocus && (
        <footer className={styles.foot}>
          <Button iconLeft="workflow" block onClick={() => onFocusHere(asset.id)}>
            {LINEAGE_COPY.focusHere}
          </Button>
        </footer>
      )}
    </aside>
  );
}

AssetDetail.propTypes = {
  asset: assetShape.isRequired,
  graph: graphShape.isRequired,
  isFocus: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onReveal: PropTypes.func.isRequired,
  onFocusHere: PropTypes.func.isRequired,
};
