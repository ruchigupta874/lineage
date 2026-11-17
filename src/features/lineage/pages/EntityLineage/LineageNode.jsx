import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import {
  ASSET_KIND_META,
  DIRECTION,
  DIRECTIONS,
  DIRECTION_META,
  HEALTH,
  HEALTH_META,
  LAYER_META,
  LEVEL,
  LINEAGE_COPY,
} from '@/features/lineage/constants';
import { columnId } from '@/features/lineage/lineageGraph';
import { joinMeta } from '@/utils/format';
import { assetShape } from './assetShape';
import ColumnList from './ColumnList';
import styles from './LineageCanvas.module.css';

/**
 * The expander on one side of a card: "+3" while neighbours there are off the
 * canvas, "−" once they are all on it and closing would hide some. Absent when
 * that side has nothing to do.
 */
function SideHandle({ asset, direction, side, onToggle }) {
  const isMore = side.hidden > 0;
  if (!isMore && !side.canHide) return null;
  const { label } = DIRECTION_META[direction];
  const action = isMore ? LINEAGE_COPY.showMore(side.hidden, label) : LINEAGE_COPY.hide(label);
  return (
    <button
      type="button"
      className={styles.handle}
      data-side={direction}
      data-state={isMore ? 'more' : 'less'}
      aria-label={`${action}: ${asset.name}`}
      title={action}
      onClick={() => onToggle(asset.id, direction)}
    >
      {isMore ? `+${side.hidden}` : <Icon name="minus" size={10} strokeWidth={2} />}
    </button>
  );
}

SideHandle.propTypes = {
  asset: assetShape.isRequired,
  direction: PropTypes.oneOf(Object.values(DIRECTION)).isRequired,
  side: PropTypes.shape({
    hidden: PropTypes.number.isRequired,
    canHide: PropTypes.bool.isRequired,
  }).isRequired,
  onToggle: PropTypes.func.isRequired,
};

/**
 * One table: its name, its shape, and an icon tinted in its layer's colour.
 * The band it sits in already says which layer it is, so the card carries no
 * stripe or tag of its own — only the tint, which still reads when dimmed.
 *
 * Hover — or keyboard focus — traces its whole path and dims the rest. Click
 * opens its details; double-click makes it the focus. A dot appears only when
 * something is wrong, so the eye goes straight to it. At column level a
 * chevron opens the card onto its columns.
 */
export default function LineageNode({ node, lineage }) {
  const kind = ASSET_KIND_META[node.kind];
  const health = HEALTH_META[node.health];
  const isHealthy = node.health === HEALTH.healthy;
  const isColumnLevel = lineage.level === LEVEL.column;
  const isOpen = Boolean(node.card?.rows);
  const isSelected = node.id === lineage.selected?.id;
  const isFocus = node.id === lineage.focus?.id;
  const sides = lineage.sides.get(node.id);
  const meta = joinMeta(
    `${node.columns.length} cols`,
    node.rows ? `${node.rows} rows` : kind.label,
  );
  const kindName = `${LAYER_META[node.layer].label} ${kind.label.toLowerCase()}`;

  return (
    <div
      className={styles.node}
      style={{ left: node.x, top: node.y, height: node.height }}
      data-layer={node.layer}
      data-level={lineage.level}
      data-focus={isFocus || undefined}
      data-selected={isSelected || undefined}
      data-dimmed={(lineage.path && !lineage.path.nodeIds.has(node.id)) || undefined}
      onMouseEnter={() => lineage.hover(node.id)}
      onMouseLeave={() => lineage.hover(null)}
    >
      {isFocus && <span className={styles.focusTag}>{LINEAGE_COPY.focusTag}</span>}
      <div className={styles.card}>
        <button
          type="button"
          className={styles.cardHead}
          aria-pressed={isSelected}
          aria-label={joinMeta(node.name, kindName, !isHealthy && health.label)}
          title={joinMeta(node.fqn, !isHealthy && health.label)}
          onClick={() => lineage.select(node.id)}
          onDoubleClick={() => lineage.focusOn(node.id)}
          onFocus={() => lineage.hover(node.id)}
          onBlur={() => lineage.hover(null)}
        >
          <span className={styles.cardIcon}>
            <Icon name={kind.icon} size={14} />
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardName}>{node.name}</span>
            <span className={styles.cardMeta}>{meta}</span>
          </span>
          {!isHealthy && <span className={styles.health} data-tone={health.tone} />}
        </button>
        {isColumnLevel && (
          <button
            type="button"
            className={styles.columnToggle}
            aria-expanded={isOpen}
            aria-label={(isOpen ? LINEAGE_COPY.closeColumns : LINEAGE_COPY.openColumns)(node.name)}
            title={(isOpen ? LINEAGE_COPY.closeColumns : LINEAGE_COPY.openColumns)(node.name)}
            onClick={() => lineage.toggleColumns(node.id)}
          >
            <Icon name="chevronDown" size={14} />
          </button>
        )}
        {isOpen && (
          <ColumnList
            card={node.card}
            onToggleAll={() => lineage.toggleAllColumns(node.id)}
            onTrace={(name) => lineage.traceColumn(columnId(node.id, name))}
          />
        )}
      </div>
      {DIRECTIONS.map((direction) => (
        <SideHandle
          key={direction}
          asset={node}
          direction={direction}
          side={sides[direction]}
          onToggle={lineage.toggle}
        />
      ))}
    </div>
  );
}

LineageNode.propTypes = {
  /** An asset plus where the layout put it, and its column list when opened. */
  node: assetShape.isRequired,
  lineage: PropTypes.shape({
    level: PropTypes.oneOf(Object.values(LEVEL)).isRequired,
    focus: assetShape,
    selected: assetShape,
    path: PropTypes.shape({ nodeIds: PropTypes.instanceOf(Set).isRequired }),
    sides: PropTypes.instanceOf(Map).isRequired,
    select: PropTypes.func.isRequired,
    focusOn: PropTypes.func.isRequired,
    hover: PropTypes.func.isRequired,
    toggle: PropTypes.func.isRequired,
    toggleColumns: PropTypes.func.isRequired,
    toggleAllColumns: PropTypes.func.isRequired,
    traceColumn: PropTypes.func.isRequired,
  }).isRequired,
};
