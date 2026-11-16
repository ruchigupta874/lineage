import { LAYER_ORDER } from '@/features/lineage/constants';
import { edgeId } from '@/features/lineage/lineageGraph';

/**
 * Pixel geometry for the lineage canvas.
 *
 * `columnGap` is the room an edge has to turn in between two columns, and
 * it is the same within a layer as between layers: a band's own `bandPad` is
 * what tells the layers apart. `headRoom` is the strip at the top of a band
 * its heading sits in, so the first row of tables never runs under it.
 */
export const LINEAGE_GEOMETRY = {
  nodeWidth: 228,
  nodeHeight: 54,
  rowGap: 16,
  columnGap: 96,
  bandPad: 18,
  headRoom: 48,
  pad: 24,
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value) => Math.round(value * 10) / 10;

/**
 * Each asset's column. Layers take whole columns, left to right in medallion
 * order, so no column ever mixes two layers. Inside a layer, a table built
 * from another table of the same layer sits a column further on — the longest
 * such chain sets how many columns the layer takes.
 */
function rankAssets(ids, graph) {
  const rank = new Map();
  let offset = 0;
  LAYER_ORDER.forEach((layer) => {
    const members = new Set(ids.filter((id) => graph.byId.get(id).layer === layer));
    if (members.size === 0) return;
    const depth = new Map();
    const depthOf = (id) => {
      if (depth.has(id)) return depth.get(id);
      depth.set(id, 0); // a cycle in bad data stops here instead of recursing forever
      const inputs = graph.parents.get(id).filter((parent) => members.has(parent));
      depth.set(id, inputs.length ? 1 + Math.max(...inputs.map(depthOf)) : 0);
      return depth.get(id);
    };
    members.forEach((id) => rank.set(id, offset + depthOf(id)));
    offset = Math.max(...[...members].map((id) => rank.get(id))) + 1;
  });
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
function placeRows(columns, graph, heightOf) {
  const gap = (above, below) => (heightOf(above) + heightOf(below)) / 2 + LINEAGE_GEOMETRY.rowGap;
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

const headHeight = () => LINEAGE_GEOMETRY.nodeHeight;

/**
 * Where every table, line and layer band goes.
 *
 * `heightOf` gives each card's height — the header alone unless its columns
 * are open. Table-to-table lines attach at the header, so opening a card
 * never moves where its lines meet it.
 *
 * Pure: the same graph, visible set, focus and heights always give the same
 * picture. `key` names that picture, so the canvas can tell a new layout from
 * a re-render of the old one. Nodes come back column by column, top to
 * bottom, which is also the order a keyboard should tab through them.
 */
export function layoutLineage(graph, visible, focusId, heightOf = headHeight) {
  const geo = LINEAGE_GEOMETRY;
  const ids = [...visible].sort();
  const rank = rankAssets(ids, graph);
  const columns = Array.from({ length: Math.max(...rank.values()) + 1 }, () => []);
  ids.forEach((id) => columns[rank.get(id)].push(id));
  orderColumns(columns, graph);
  const rowY = placeRows(columns, graph, heightOf);

  const topOf = (id) => rowY.get(id) - heightOf(id) / 2;
  const top = Math.min(...ids.map(topOf));
  const span = Math.max(...ids.map((id) => topOf(id) + heightOf(id))) - top;
  const xOf = (column) => geo.pad + geo.bandPad + column * (geo.nodeWidth + geo.columnGap);
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

  const bandHeight = geo.headRoom + span + geo.bandPad;
  const bands = LAYER_ORDER.flatMap((layer) => {
    const members = nodes.filter((node) => node.layer === layer);
    if (members.length === 0) return [];
    const first = Math.min(...members.map((node) => node.column));
    const last = Math.max(...members.map((node) => node.column));
    return [
      {
        layer,
        count: members.length,
        x: xOf(first) - geo.bandPad,
        y: geo.pad,
        width: xOf(last) - xOf(first) + geo.nodeWidth + geo.bandPad * 2,
        height: bandHeight,
      },
    ];
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
    width: xOf(columns.length - 1) + geo.nodeWidth + geo.bandPad + geo.pad,
    height: geo.pad * 2 + bandHeight,
    nodes,
    edges,
    bands,
  };
}
