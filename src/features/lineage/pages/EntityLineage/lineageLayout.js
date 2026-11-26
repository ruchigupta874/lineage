import { flowOrderOf, legendOf } from '@/features/lineage/catalog';
import { edgeId, topologicalOrder } from '@/features/lineage/lineageGraph';

/**
 * Pixel geometry for the lineage canvas.
 *
 * `columnGap` is the room an edge has to turn in between two columns.
 * `sidePad` is the margin beside the outermost columns. `headRoom` is the
 * strip above the columns their headings sit in, so the first row of tables
 * never runs under one.
 */
export const LINEAGE_GEOMETRY = {
  nodeWidth: 228,
  nodeHeight: 54,
  rowGap: 16,
  columnGap: 96,
  sidePad: 18,
  headRoom: 48,
  pad: 24,
};

/**
 * The enterprise overview's geometry: one-line cards packed close, and no
 * column headings — each card wears its layer's tint itself — so the whole
 * workspace fits on one screen.
 */
export const COMPACT_GEOMETRY = {
  nodeWidth: 200,
  nodeHeight: 32,
  rowGap: 14,
  columnGap: 108,
  sidePad: 0,
  headRoom: 0,
  pad: 24,
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value) => Math.round(value * 10) / 10;

/**
 * Each asset's column: how far along the flow it sits. Left to right is
 * always the way the data moves, whatever the catalog calls its layers.
 *
 * An asset goes one column past the furthest of its inputs. The workspace's
 * layer order adds a floor: an asset in an ordered layer sits past every
 * asset of the layer before it, so ordered layers read left to right in
 * whole columns — a medallion workspace looks as it always has. Assets with
 * no place in the order (`flowOrderOf`: unclassified, outside the catalog, a
 * layer the workspace doesn't list, or a label the flow contradicts) follow
 * the flow alone, between or beside the layered ones.
 *
 * A source with no place in the order — a lookup table, a file a job picks
 * up — moves right to just before its first reader, instead of waiting at
 * the far left with a long line across the canvas.
 *
 * The floor cannot loop: the catalog has already taken the order away from
 * every asset whose flow contradicts it, so following the flow never steps
 * back down the order.
 */
function rankAssets(ids, graph) {
  const members = new Set(ids);
  const inputsOf = (id) => graph.parents.get(id).filter((parent) => members.has(parent));
  const readersOf = (id) => graph.children.get(id).filter((child) => members.has(child));
  const orderOf = (id) => flowOrderOf(graph.byId.get(id));

  // The floor, as extra inputs: each ordered layer present is fed by every
  // asset of the ordered layer present before it.
  const tiers = [...new Set(ids.map(orderOf).filter((order) => order !== null))].sort(
    (a, b) => a - b,
  );
  const tierOf = new Map(tiers.map((order, index) => [order, index]));
  const byTier = tiers.map(() => []);
  ids.forEach((id) => {
    if (orderOf(id) !== null) byTier[tierOf.get(orderOf(id))].push(id);
  });
  const floorOf = (id) => {
    const tier = orderOf(id) === null ? 0 : tierOf.get(orderOf(id));
    return tier > 0 ? byTier[tier - 1] : [];
  };
  const before = (id) => [...inputsOf(id), ...floorOf(id)];

  const rank = new Map();
  topologicalOrder(ids, before).forEach((id) => {
    const placed = before(id).filter((other) => rank.has(other));
    rank.set(id, placed.length ? 1 + Math.max(...placed.map((other) => rank.get(other))) : 0);
  });

  ids.forEach((id) => {
    const readers = readersOf(id);
    if (orderOf(id) !== null || inputsOf(id).length > 0 || readers.length === 0) return;
    rank.set(id, Math.max(rank.get(id), Math.min(...readers.map((other) => rank.get(other))) - 1));
  });

  // Moving sources right can empty a column; close it up.
  const used = [...new Set(rank.values())].sort((a, b) => a - b);
  const compact = new Map(used.map((value, index) => [value, index]));
  ids.forEach((id) => rank.set(id, compact.get(rank.get(id))));
  return rank;
}

/**
 * Row order within each column, by the barycentre heuristic: sweep right
 * sorting each column by where its inputs sit, then left by where its readers
 * sit. Four round trips settle a medallion graph; the point is fewer crossed
 * edges, not a proof of the fewest.
 */
function orderColumns(columns, graph) {
  const position = new Map();
  const index = (column) =>
    column.forEach((id, i) => position.set(id, i - (column.length - 1) / 2));
  const sortBy = (column, neighbours) => {
    const score = new Map(
      column.map((id) => {
        const placed = neighbours.get(id).filter((other) => position.has(other));
        return [id, placed.length ? mean(placed.map((o) => position.get(o))) : position.get(id)];
      }),
    );
    column.sort((a, b) => score.get(a) - score.get(b));
    index(column);
  };
  columns.forEach(index);
  for (let pass = 0; pass < 4; pass += 1) {
    columns.slice(1).forEach((column) => sortBy(column, graph.parents));
    columns
      .slice(0, -1)
      .reverse()
      .forEach((column) => sortBy(column, graph.children));
  }
}

/**
 * Vertical position in each column, keeping the order just chosen.
 *
 * Every table wants to sit level with the average of what it connects to, so
 * a gold table lands in the middle of its inputs and lines run as flat as they
 * can. The order and the spacing are hard limits: packing down from the top
 * and up from the bottom gives two layouts that both respect them, and their
 * average respects them too while splitting the difference evenly.
 *
 * Positions are centres, and the spacing between two neighbours depends on
 * both their heights, because an opened table is as tall as its column list.
 */
function placeRows(columns, graph, heightOf, rowGap) {
  const gap = (above, below) => (heightOf(above) + heightOf(below)) / 2 + rowGap;
  const y = new Map();
  columns.forEach((column) => {
    let cursor = 0;
    column.forEach((id, i) => {
      if (i > 0) cursor += gap(column[i - 1], id);
      y.set(id, cursor);
    });
    column.forEach((id) => y.set(id, y.get(id) - cursor / 2));
  });
  const settle = (column, ...sides) => {
    const wanted = column.map((id) => {
      const placed = sides.flatMap((side) => side.get(id)).filter((other) => y.has(other));
      return placed.length ? mean(placed.map((other) => y.get(other))) : y.get(id);
    });
    const last = wanted.length - 1;
    const down = [];
    wanted.forEach((want, i) =>
      down.push(i === 0 ? want : Math.max(want, down[i - 1] + gap(column[i - 1], column[i]))),
    );
    const up = [];
    for (let i = last; i >= 0; i -= 1) {
      up[i] =
        i === last ? wanted[i] : Math.min(wanted[i], up[i + 1] - gap(column[i], column[i + 1]));
    }
    column.forEach((id, i) => y.set(id, (down[i] + up[i]) / 2));
  };
  for (let pass = 0; pass < 3; pass += 1) {
    columns.forEach((column) => settle(column, graph.parents));
    [...columns].reverse().forEach((column) => settle(column, graph.children));
  }
  columns.forEach((column) => settle(column, graph.parents, graph.children));
  return y;
}

/**
 * A line out of one card's right edge and into another's left, leaving and
 * landing flat. The end stops short of the card so the arrowhead sits clear
 * of its border.
 */
export function edgePath(x1, y1, x2, y2) {
  const end = x2 - 3;
  const bend = round(Math.max(36, (end - x1) / 2));
  return `M${x1} ${y1}C${x1 + bend} ${y1} ${end - bend} ${y2} ${end} ${y2}`;
}

/**
 * Where every table, line and column heading goes.
 *
 * `heightOf` gives each card's height — the header alone unless its columns
 * are open. Table-to-table lines attach at the header, so opening a card
 * never moves where its lines meet it. `geometry` is the spacing to lay out
 * with: the lineage page's, unless the caller draws smaller cards.
 *
 * `heads` says, for each column, which layers its assets are in and how many
 * of each, for a heading above it: one layer in a medallion column, a mix
 * where the flow puts layers and unclassified assets side by side. A run of
 * columns all in the same one layer has a single heading across them.
 *
 * Pure: the same graph, visible set, focus and heights always give the same
 * picture. `key` names that picture, so the canvas can tell a new layout from
 * a re-render of the old one. Nodes come back column by column, top to
 * bottom, which is also the order a keyboard should tab through them.
 */
export function layoutLineage(
  graph,
  visible,
  focusId,
  { heightOf: cardHeight, geometry = LINEAGE_GEOMETRY } = {},
) {
  const geo = geometry;
  const heightOf = cardHeight ?? (() => geo.nodeHeight);
  const ids = [...visible].sort();
  const rank = rankAssets(ids, graph);
  const columns = Array.from({ length: Math.max(...rank.values()) + 1 }, () => []);
  ids.forEach((id) => columns[rank.get(id)].push(id));
  orderColumns(columns, graph);
  const rowY = placeRows(columns, graph, heightOf, geo.rowGap);

  const topOf = (id) => rowY.get(id) - heightOf(id) / 2;
  const top = Math.min(...ids.map(topOf));
  const span = Math.max(...ids.map((id) => topOf(id) + heightOf(id))) - top;
  const xOf = (column) => geo.pad + geo.sidePad + column * (geo.nodeWidth + geo.columnGap);
  const nodes = columns.flatMap((column, index) =>
    column.map((id) => ({
      ...graph.byId.get(id),
      column: index,
      x: xOf(index),
      y: round(geo.pad + geo.headRoom + topOf(id) - top),
      height: heightOf(id),
    })),
  );
  const at = new Map(nodes.map((node) => [node.id, node]));

  // Neighbouring columns of one and the same layer share a heading, as a
  // layer spanning two columns in a medallion workspace always has.
  const heads = [];
  columns.forEach((column, index) => {
    const layers = legendOf(column.map((id) => graph.byId.get(id)));
    const previous = heads.at(-1);
    const continues =
      previous?.layers.length === 1 &&
      layers.length === 1 &&
      previous.layers[0].key === layers[0].key;
    if (continues) {
      previous.width = xOf(index) + geo.nodeWidth - previous.x;
      previous.layers = [{ ...layers[0], count: previous.layers[0].count + layers[0].count }];
    } else {
      heads.push({ index, x: xOf(index), y: geo.pad, width: geo.nodeWidth, layers });
    }
  });

  // One line per table edge, header to header — at either level.
  const edges = nodes.flatMap((target) =>
    graph.parents
      .get(target.id)
      .filter((id) => at.has(id))
      .map((id) => {
        const source = at.get(id);
        return {
          id: edgeId(id, target.id),
          d: edgePath(
            source.x + geo.nodeWidth,
            source.y + geo.nodeHeight / 2,
            target.x,
            target.y + geo.nodeHeight / 2,
          ),
        };
      }),
  );

  return {
    key: `${focusId}|${ids.map((id) => `${id}:${heightOf(id)}`).join(',')}`,
    width: xOf(columns.length - 1) + geo.nodeWidth + geo.sidePad + geo.pad,
    height: geo.pad * 2 + geo.headRoom + span + geo.sidePad,
    nodes,
    edges,
    heads,
  };
}
