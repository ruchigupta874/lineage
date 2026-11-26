import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { ASSET_KIND_META, HEALTH, HEALTH_META } from '@/features/lineage/constants';
import { joinMeta } from '@/utils/format';
import { assetShape } from '../EntityLineage/assetShape';
import { COMPACT_GEOMETRY } from '../EntityLineage/lineageLayout';
import styles from './EnterpriseLineage.module.css';

/**
 * One asset on the enterprise canvas: a one-line card in its layer's tint,
 * with the layer's colour on its icon. There are no column headings here, so
 * the card itself says which layer it is in — plain white when the catalog
 * sets none, a dashed ghost when it is not in the catalog at all. A dot
 * appears only when something is wrong.
 *
 * Hover — or keyboard focus — traces its whole path and dims the rest, as on
 * the lineage page. Click opens its lineage there.
 */
export default function EnterpriseNode({ node, isDimmed, onHover, onOpen }) {
  const kind = ASSET_KIND_META[node.kind];
  const health = HEALTH_META[node.health];
  const isHealthy = node.health === HEALTH.healthy;

  return (
    <button
      type="button"
      className={styles.node}
      style={{ left: node.x, top: node.y, width: COMPACT_GEOMETRY.nodeWidth, height: node.height }}
      data-hue={node.layer.hue}
      data-dimmed={isDimmed || undefined}
      aria-label={joinMeta(node.name, node.layer.label, kind.label, !isHealthy && health.label)}
      title={joinMeta(node.fqn, node.layer.label, !isHealthy && health.label)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={() => onOpen(node.id)}
    >
      <span className={styles.nodeIcon}>
        <Icon name={kind.icon} size={12} />
      </span>
      <span className={styles.nodeName}>{node.name}</span>
      {!isHealthy && <span className={styles.health} data-tone={health.tone} />}
    </button>
  );
}

EnterpriseNode.propTypes = {
  /** An asset plus where the layout put it. */
  node: assetShape.isRequired,
  isDimmed: PropTypes.bool.isRequired,
  onHover: PropTypes.func.isRequired,
  onOpen: PropTypes.func.isRequired,
};
