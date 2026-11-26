import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { ASSET_KIND, ASSET_KIND_META, LINEAGE_COPY } from '@/features/lineage/constants';
import { columnId } from '@/features/lineage/lineageGraph';
import { layerShape } from './assetShape';
import { shortType } from './columnLayout';
import canvas from './LineageCanvas.module.css';
import styles from './ColumnTrace.module.css';

const columnShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
});

/**
 * One table on a column's path. Its path columns come first and are marked —
 * each one traces itself if clicked — then a couple of its other columns,
 * dimmed, and a count of the rest. The traced column is filled in, with the
 * mark for its transformations; the table it lives in wears the accent edge.
 */
export default function TraceNode({ node, tracedId, onPick }) {
  const kind = ASSET_KIND_META[node.kind];
  const { pathRows, contextRows, hidden, total } = node.card;
  const holdsTraced = pathRows.some((column) => columnId(node.id, column.name) === tracedId);

  return (
    <div
      className={canvas.node}
      style={{ left: node.x, top: node.y, height: node.height }}
      data-hue={node.layer.hue}
      data-focus={holdsTraced || undefined}
    >
      <div className={canvas.card}>
        <div className={canvas.cardHead} title={node.fqn}>
          <span className={canvas.cardIcon}>
            <Icon name={kind.icon} size={14} />
          </span>
          <span className={canvas.cardBody}>
            <span className={canvas.cardName}>{node.name}</span>
            <span className={canvas.cardMeta}>
              {LINEAGE_COPY.traceOnPath(pathRows.length, total)}
            </span>
          </span>
        </div>
        <ul className={styles.list}>
          {pathRows.map((column) => {
            const id = columnId(node.id, column.name);
            const isTraced = id === tracedId;
            return (
              <li key={column.name}>
                <button
                  type="button"
                  className={styles.pathRow}
                  data-traced={isTraced || undefined}
                  aria-current={isTraced ? 'true' : undefined}
                  title={
                    isTraced
                      ? LINEAGE_COPY.traceDetails(column.name)
                      : LINEAGE_COPY.traceColumn(column.name)
                  }
                  onClick={() => onPick(id)}
                >
                  <span className={styles.rowName}>{column.name}</span>
                  <span className={styles.rowType}>{shortType(column.type)}</span>
                  {isTraced && <Icon name="sparkles" size={12} className={styles.rowMark} />}
                </button>
              </li>
            );
          })}
          {contextRows.map((column) => (
            <li key={column.name} className={styles.contextRow}>
              <span className={styles.rowName}>{column.name}</span>
              <span className={styles.rowType}>{shortType(column.type)}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && <p className={styles.others}>{LINEAGE_COPY.traceOthers(hidden)}</p>}
      </div>
    </div>
  );
}

TraceNode.propTypes = {
  /** An asset plus where the trace layout put it and which of its columns it lists. */
  node: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    fqn: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(Object.values(ASSET_KIND)).isRequired,
    layer: layerShape.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    card: PropTypes.shape({
      pathRows: PropTypes.arrayOf(columnShape).isRequired,
      contextRows: PropTypes.arrayOf(columnShape).isRequired,
      hidden: PropTypes.number.isRequired,
      total: PropTypes.number.isRequired,
    }).isRequired,
  }).isRequired,
  tracedId: PropTypes.string.isRequired,
  onPick: PropTypes.func.isRequired,
};
