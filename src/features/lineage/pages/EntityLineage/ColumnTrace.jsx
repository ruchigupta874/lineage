import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { LINEAGE_COPY } from '@/features/lineage/constants';
import LineageCanvas from './LineageCanvas';
import TraceNode from './TraceNode';
import styles from './ColumnTrace.module.css';

/** Canvas the banner covers along the top, which a fresh view is framed clear of. */
const BANNER_INSET = { top: 84, right: 0 };

/**
 * One column's lineage, in place of the column-level canvas: only the tables
 * its path runs through, the path's columns marked and joined row to row.
 * The column's transformations are not drawn here but in the page's details
 * pane, beside the whole stage, so nothing ever sits over the drawing.
 *
 * A banner says what is traced and leads back out. Clicking another marked
 * column traces that one instead; clicking the traced column reopens its
 * details if they were closed.
 */
export default function ColumnTrace({ lineage, onOpenDetails }) {
  const { trace, graph } = lineage;
  const { column, path, layout } = trace;
  const asset = graph.byId.get(column.assetId);

  const pick = (id) => {
    if (id === column.id) onOpenDetails();
    else lineage.traceColumn(id);
  };

  return (
    <>
      <LineageCanvas
        layout={layout}
        path={{ edgeIds: layout.edgeIds }}
        label={`${LINEAGE_COPY.traceTitle} ${asset.name}.${column.name}`}
        frameOn={column.assetId}
        inset={BANNER_INSET}
        renderNode={(node) => (
          <TraceNode key={node.id} node={node} tracedId={column.id} onPick={pick} />
        )}
      />

      <div className={styles.banner}>
        <div className={styles.bannerText}>
          <p className={styles.bannerTitle}>
            {LINEAGE_COPY.traceTitle}{' '}
            <code className={styles.bannerColumn}>
              {asset.name}.<strong>{column.name}</strong>
            </code>
          </p>
          <p className={styles.bannerMeta}>
            {LINEAGE_COPY.traceCounts(
              path.upstream.size,
              path.downstream.size,
              layout.nodes.length,
            )}
          </p>
        </div>
        <button type="button" className={styles.exit} onClick={lineage.exitTrace}>
          <Icon name="arrowLeft" size={14} strokeWidth={1.7} />
          {LINEAGE_COPY.traceExit}
        </button>
      </div>

      <p className={styles.hint}>
        <Icon name="info" size={12} />
        {LINEAGE_COPY.traceHint}
      </p>
    </>
  );
}

ColumnTrace.propTypes = {
  lineage: PropTypes.shape({
    trace: PropTypes.shape({
      column: PropTypes.object.isRequired,
      path: PropTypes.shape({
        upstream: PropTypes.instanceOf(Set).isRequired,
        downstream: PropTypes.instanceOf(Set).isRequired,
      }).isRequired,
      layout: PropTypes.object.isRequired,
    }).isRequired,
    graph: PropTypes.object.isRequired,
    traceColumn: PropTypes.func.isRequired,
    exitTrace: PropTypes.func.isRequired,
  }).isRequired,
  onOpenDetails: PropTypes.func.isRequired,
};
