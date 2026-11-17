import { columnId, edgeId } from '@/features/lineage/lineageGraph';
import { COLUMN_GEOMETRY } from './columnLayout';
import { LINEAGE_GEOMETRY, edgePath, layoutLineage } from './lineageLayout';

/**
 * Columns a trace card lists after its path columns, dimmed, so the card
 * still reads as a table rather than a lone row. The rest are a count.
 */
const CONTEXT_ROWS = 2;

/**
 * One table on a column's path, as its trace card shows it: the columns on
 * the path first, in schema order, then a couple of the others, then how many
 * more there are. The heights are ColumnList's, so the rows sit where the
 * lines between them are drawn.
 */
function traceCardFor(asset, onPath) {
  const geo = LINEAGE_GEOMETRY;
  const g = COLUMN_GEOMETRY;
  const pathRows = asset.columns.filter((column) => onPath.has(columnId(asset.id, column.name)));
  const others = asset.columns.filter((column) => !onPath.has(columnId(asset.id, column.name)));
  const contextRows = others.slice(0, CONTEXT_ROWS);
  const hidden = others.length - contextRows.length;
  const rows = pathRows.length + contextRows.length;
  return {
    pathRows,
    contextRows,
    hidden,
    total: asset.columns.length,
    height: geo.nodeHeight + g.divider + g.listPad * 2 + rows * g.row + (hidden > 0 ? g.more : 0),
  };
}

/** Where row `index` of a card sits down the drawing: the middle of that row. */
const rowCentre = (node, index) => {
  const g = COLUMN_GEOMETRY;
  return node.y + LINEAGE_GEOMETRY.nodeHeight + g.divider + g.listPad + (index + 0.5) * g.row;
};

/**
 * The picture of one column's lineage: only the tables its path runs
 * through, laid out as the table graph would be, and a line from each column
 * to each column it feeds — row to row, not header to header.
 *
 * `path` is `tracePath` over the column graph, already confined to whatever
 * scope the trace has. Returns the layout shape the canvas draws, plus the ids
 * of every column and line on the path.
 */
export function layoutColumnTrace(graph, columns, tracedId, path) {
  const onPath = new Set([tracedId, ...path.upstream, ...path.downstream]);
  const tables = new Set([...onPath].map((id) => columns.byId.get(id).assetId));
  const cards = new Map([...tables].map((id) => [id, traceCardFor(graph.byId.get(id), onPath)]));
  const traced = columns.byId.get(tracedId);
  const base = layoutLineage(graph, tables, traced.assetId, (id) => cards.get(id).height);
  const nodes = base.nodes.map((node) => ({ ...node, card: cards.get(node.id) }));
  const at = new Map(nodes.map((node) => [node.id, node]));

  /** Where a column's row is, for a line to leave from or land on. */
  const rowOf = (id) => {
    const column = columns.byId.get(id);
    const node = at.get(column.assetId);
    const index = node.card.pathRows.findIndex((row) => row.name === column.name);
    return { node, y: rowCentre(node, index) };
  };

  const edges = [...onPath].flatMap((id) =>
    columns.parents
      .get(id)
      .filter((parent) => onPath.has(parent) && path.edgeIds.has(edgeId(parent, id)))
      .map((parent) => {
        const from = rowOf(parent);
        const to = rowOf(id);
        return {
          id: edgeId(parent, id),
          d: edgePath(from.node.x + LINEAGE_GEOMETRY.nodeWidth, from.y, to.node.x, to.y),
        };
      }),
  );

  return {
    ...base,
    key: `trace|${tracedId}|${[...onPath].sort().join(',')}`,
    nodes,
    edges,
    onPath,
    edgeIds: new Set(edges.map((edge) => edge.id)),
  };
}
