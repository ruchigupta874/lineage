import { LINEAGE_GEOMETRY, layoutLineage } from './lineageLayout';

/**
 * Geometry of an opened card's column list. These must match ColumnList's CSS
 * (`.list`, `.row`, `.more`): a card's height is worked out here, before
 * anything renders, so the layout can space the cards around it.
 *
 * `maxRows` is how many columns a card lists before folding the rest into a
 * "+N more" row — enough to see a table's shape at a glance, short of a wall
 * of names on an 18-column raw table.
 */
export const COLUMN_GEOMETRY = {
  divider: 1,
  listPad: 6,
  row: 26,
  more: 30,
  maxRows: 8,
};

/** The columns an opened card lists, and how tall that makes it. Closed, it is the header alone. */
function cardFor(asset, { isOpen, showAll }) {
  const geo = LINEAGE_GEOMETRY;
  const g = COLUMN_GEOMETRY;
  if (!isOpen) return { height: geo.nodeHeight, rows: null, hidden: 0, hasFooter: false };

  const hasFooter = asset.columns.length > g.maxRows;
  const rows = showAll ? asset.columns : asset.columns.slice(0, g.maxRows);
  return {
    rows,
    hidden: asset.columns.length - rows.length,
    hasFooter,
    height:
      geo.nodeHeight + g.divider + g.listPad * 2 + rows.length * g.row + (hasFooter ? g.more : 0),
  };
}

/**
 * The column-level picture: the entity-level layout with opened cards as tall
 * as their column lists. Lines stay table to table and meet each card at its
 * header, so opening a card never moves where its lines land.
 *
 * `open` and `showAll` are sets of asset ids.
 */
export function layoutColumns(graph, visible, focusId, { open, showAll }) {
  const cards = new Map(
    [...visible].map((id) => [
      id,
      cardFor(graph.byId.get(id), { isOpen: open.has(id), showAll: showAll.has(id) }),
    ]),
  );
  const layout = layoutLineage(graph, visible, focusId, (id) => cards.get(id).height);
  return { ...layout, nodes: layout.nodes.map((node) => ({ ...node, card: cards.get(node.id) })) };
}
