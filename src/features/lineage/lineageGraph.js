import { DIRECTION, DIRECTIONS } from './constants';

/**
 * Lineage as a graph: each asset's inputs and readers, by id, built once.
 *
 * An input missing from the catalog is dropped rather than drawn as an edge to
 * nowhere — the canvas can only place what it knows.
 */
export function indexLineage(assets) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const parents = new Map(
    assets.map((asset) => [asset.id, asset.upstream.filter((id) => byId.has(id))]),
  );
  const children = new Map(assets.map((asset) => [asset.id, []]));
  parents.forEach((inputs, id) => inputs.forEach((input) => children.get(input).push(id)));
  return { byId, parents, children };
}

export const edgeId = (from, to) => `${from}->${to}`;

/**
 * `ids` with every asset after all of its inputs (`parentsOf(id)`, counted
 * only among `ids`). Lineage should have no loops; if bad data has one, the
 * assets caught in it come last, in the order given, rather than hanging the
 * walk or vanishing.
 */
export function topologicalOrder(ids, parentsOf) {
  const members = new Set(ids);
  const waiting = new Map();
  const readers = new Map(ids.map((id) => [id, []]));
  ids.forEach((id) => {
    const inputs = parentsOf(id).filter((parent) => members.has(parent));
    waiting.set(id, inputs.length);
    inputs.forEach((parent) => readers.get(parent).push(id));
  });
  const order = ids.filter((id) => waiting.get(id) === 0);
  for (let i = 0; i < order.length; i += 1) {
    readers.get(order[i]).forEach((reader) => {
      waiting.set(reader, waiting.get(reader) - 1);
      if (waiting.get(reader) === 0) order.push(reader);
    });
  }
  const placed = new Set(order);
  return [...order, ...ids.filter((id) => !placed.has(id))];
}

/** A column's id: its asset's id and its name, `silver.silver_campaign_fact.campaign_code`. */
export const columnId = (assetId, name) => `${assetId}.${name}`;

/**
 * Column lineage as a graph of the same shape as `indexLineage`'s, so the
 * same walks (`tracePath`) run over it. Each column carries its asset, its
 * type and how it was made; a bronze column, with no derivation, is raw.
 */
export function indexColumns(assets) {
  const byId = new Map();
  assets.forEach((asset) =>
    asset.columns.forEach((column) => {
      const id = columnId(asset.id, column.name);
      byId.set(id, {
        id,
        assetId: asset.id,
        name: column.name,
        type: column.type,
        derivation: asset.derivations?.[column.name] ?? null,
      });
    }),
  );
  const parents = new Map(
    [...byId.values()].map((column) => [
      column.id,
      (column.derivation?.from ?? []).filter((id) => byId.has(id)),
    ]),
  );
  const children = new Map([...byId.keys()].map((id) => [id, []]));
  parents.forEach((inputs, id) => inputs.forEach((input) => children.get(input).push(id)));
  return { byId, parents, children };
}

const neighboursOf = (graph, direction) =>
  direction === DIRECTION.upstream ? graph.parents : graph.children;

/**
 * What someone has opened or closed by hand, on top of the default picture.
 *
 * By default the canvas shows the focus's whole lineage both ways. `collapsed`
 * stops that walk at an asset. `expanded` adds one hop on a side the walk
 * never takes — a gold table's other inputs, when you reached it by going
 * downstream from one of its silver ones.
 */
export const EMPTY_EXPANSION = {
  collapsed: { [DIRECTION.upstream]: new Set(), [DIRECTION.downstream]: new Set() },
  expanded: { [DIRECTION.upstream]: new Set(), [DIRECTION.downstream]: new Set() },
};

const withMember = (set, id, isMember) => {
  const next = new Set(set);
  if (isMember) next.add(id);
  else next.delete(id);
  return next;
};

/** One side of one asset opened (its neighbours shown) or closed (hidden). */
export function withSide(expansion, id, direction, isOpen) {
  return {
    collapsed: {
      ...expansion.collapsed,
      [direction]: withMember(expansion.collapsed[direction], id, !isOpen),
    },
    expanded: {
      ...expansion.expanded,
      [direction]: withMember(expansion.expanded[direction], id, isOpen),
    },
  };
}

/** The ids on the canvas: the focus, its lineage both ways, and anything opened by hand. */
export function visibleLineage(graph, focusId, expansion) {
  const visible = new Set([focusId]);
  DIRECTIONS.forEach((direction) => {
    const next = neighboursOf(graph, direction);
    const queue = [focusId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (expansion.collapsed[direction].has(id)) continue;
      next.get(id).forEach((other) => {
        if (visible.has(other)) return;
        visible.add(other);
        queue.push(other);
      });
    }
  });
  // A Set visits what is added to it mid-iteration, so a neighbour that was
  // itself opened by hand is opened in this same pass.
  visible.forEach((id) =>
    DIRECTIONS.forEach((direction) => {
      if (!expansion.expanded[direction].has(id)) return;
      neighboursOf(graph, direction)
        .get(id)
        .forEach((other) => visible.add(other));
    }),
  );
  return visible;
}

/**
 * The expander on each side of each visible asset. `hidden` is the "+3": its
 * neighbours on that side that are off the canvas. `canHide` says whether
 * closing that side would take anything away — without it, a table whose
 * inputs are on the canvas for some other reason would offer a "−" that does
 * nothing.
 */
export function sidesFor(graph, focusId, expansion, visible) {
  const sides = new Map();
  visible.forEach((id) => {
    const entry = {};
    DIRECTIONS.forEach((direction) => {
      const neighbours = neighboursOf(graph, direction).get(id);
      const hidden = neighbours.filter((other) => !visible.has(other)).length;
      const canHide =
        neighbours.length > 0 &&
        hidden === 0 &&
        visibleLineage(graph, focusId, withSide(expansion, id, direction, false)).size <
          visible.size;
      entry[direction] = { hidden, canHide };
    });
    sides.set(id, entry);
  });
  return sides;
}

/**
 * Everything one asset reads from and everything that reads it, walking only
 * through `within` (anything with `has(id)`: the visible set for the hover
 * trace, `graph.byId` for the whole catalog).
 */
export function tracePath(graph, id, within) {
  const path = {
    [DIRECTION.upstream]: new Set(),
    [DIRECTION.downstream]: new Set(),
    edgeIds: new Set(),
  };
  DIRECTIONS.forEach((direction) => {
    const next = neighboursOf(graph, direction);
    const reached = path[direction];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift();
      next.get(current).forEach((other) => {
        if (!within.has(other)) return;
        path.edgeIds.add(
          direction === DIRECTION.upstream ? edgeId(other, current) : edgeId(current, other),
        );
        if (reached.has(other)) return;
        reached.add(other);
        queue.push(other);
      });
    }
  });
  return path;
}
