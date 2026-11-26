import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { DIRECTION, DIRECTION_META } from '@/features/lineage/constants';
import { assetShape, graphShape } from './assetShape';
import styles from './AssetDetail.module.css';

/**
 * What the open asset reads from, or what reads it — from the whole catalog,
 * not just the canvas. Opening one that is off the canvas brings it on first.
 */
export default function NeighbourList({ asset, direction, graph, onReveal }) {
  const ids = (direction === DIRECTION.upstream ? graph.parents : graph.children).get(asset.id);
  const meta = DIRECTION_META[direction];
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHead}>
        {meta.label}
        <span className={styles.sectionCount}>{ids.length}</span>
      </h3>
      {ids.length === 0 ? (
        <p className={styles.none}>{meta.empty}</p>
      ) : (
        <ul className={styles.links}>
          {ids.map((id) => {
            const other = graph.byId.get(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={styles.link}
                  data-hue={other.layer.hue}
                  title={other.fqn}
                  onClick={() => onReveal(asset.id, direction, id)}
                >
                  <span className={styles.linkDot} />
                  <span className={styles.linkName}>{other.name}</span>
                  <Icon name="arrowRight" size={12} className={styles.linkGo} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

NeighbourList.propTypes = {
  asset: assetShape.isRequired,
  direction: PropTypes.oneOf(Object.values(DIRECTION)).isRequired,
  graph: graphShape.isRequired,
  onReveal: PropTypes.func.isRequired,
};
