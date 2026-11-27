import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  COLUMN_PARAM,
  DIRECTION,
  LENS,
  LENS_PARAM,
  LEVEL,
  LEVEL_PARAM,
  LINEAGE_PARAM,
  TRACE_ALL,
  TRACE_PARAM,
} from '@/features/lineage/constants';
import {
  EMPTY_EXPANSION,
  indexColumns,
  indexLineage,
  sidesFor,
  tracePath,
  visibleLineage,
  withSide,
} from '@/features/lineage/lineageGraph';
import { layoutColumns } from './columnLayout';
import { layoutColumnTrace } from './traceLayout';
import { layoutLineage } from './lineageLayout';

const NOTHING = new Set();

/** Leaving a column trace: both of its params go together. */
const NO_TRACE = { [COLUMN_PARAM]: null, [TRACE_PARAM]: null };

/** With every table on the canvas, no side has anything to show or hide. */
const NOTHING_TO_TOGGLE = {
  [DIRECTION.upstream]: { hidden: 0, canHide: false },
  [DIRECTION.downstream]: { hidden: 0, canHide: false },
};

/**
 * What belongs to one focus. A new focus starts from this, not from the last
 * one's leftovers. At column level the focus opens with its columns showing,
 * since its columns are what someone switching level came to see.
 */
const freshState = (focusId) => ({
  focusId,
  expansion: EMPTY_EXPANSION,
  selectedId: null,
  anchorId: null,
  open: new Set(focusId ? [focusId] : []),
  showAll: NOTHING,
});

const toggled = (set, id) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/**
 * Everything the lineage page shows, derived from the assets and the URL.
 *
 * With no focus the page is the overview: every table in the catalog, all of
 * its lineage at once. Picking a table — from the search, or by double-click —
 * traces that one; clearing it comes back here.
 *
 * The focus, the lens and the level live in the URL
 * (`?asset=…&lens=business&level=column`), so a view can be linked to and Back
 * returns to the previous one. Everything else —
 * expansion, selection, which cards are open — belongs to a focus (or to the
 * overview): it is stored with the focus it was made under, and reads as fresh
 * once the URL moves on, so no effect has to notice and reset it.
 *
 * `anchorId` is the table whose card or side was last opened or closed, which
 * the canvas keeps still on screen while the layout reflows around it.
 *
 * At column level a column can be traced (`?column=…`): `trace` is then its
 * path, confined to the tables that were in view when it was picked — what
 * someone was looking at — until `trace=all` widens it to the whole catalog.
 * Picking another table, or another level, ends the trace.
 *
 * `bands` lays every picture out with its layers drawn as bands, for a
 * workspace that asks for them.
 */
export function useLineageView(assets, { bands = false } = {}) {
  const graph = useMemo(() => indexLineage(assets), [assets]);
  const columns = useMemo(() => indexColumns(assets), [assets]);
  const [params, setParams] = useSearchParams();
  const requested = params.get(LINEAGE_PARAM);
  const focusId = graph.byId.has(requested) ? requested : null;
  const lens = params.get(LENS_PARAM) === LENS.business ? LENS.business : LENS.technical;
  const level = params.get(LEVEL_PARAM) === LEVEL.column ? LEVEL.column : LEVEL.entity;
  const tracedColumn =
    level === LEVEL.column ? (columns.byId.get(params.get(COLUMN_PARAM)) ?? null) : null;
  const wantsEndToEnd = params.get(TRACE_PARAM) === TRACE_ALL;

  const fresh = useMemo(() => freshState(focusId), [focusId]);
  const [stored, setStored] = useState(fresh);
  const state = stored.focusId === focusId ? stored : fresh;
  const update = (change) =>
    setStored((previous) => {
      const current = previous.focusId === focusId ? previous : freshState(focusId);
      return { ...current, ...change(current) };
    });
  const [hoveredId, setHoveredId] = useState(null);

  const visible = useMemo(
    () => (focusId ? visibleLineage(graph, focusId, state.expansion) : new Set(graph.byId.keys())),
    [graph, focusId, state.expansion],
  );
  // Nothing to lay out only while the catalog is still loading.
  const layout = useMemo(() => {
    if (visible.size === 0) return null;
    if (level === LEVEL.entity) return layoutLineage(graph, visible, focusId, { bands });
    return layoutColumns(graph, visible, focusId, {
      open: state.open,
      showAll: state.showAll,
      bands,
    });
  }, [graph, visible, focusId, level, state.open, state.showAll, bands]);
  const sides = useMemo(
    () =>
      focusId
        ? sidesFor(graph, focusId, state.expansion, visible)
        : new Map([...visible].map((id) => [id, NOTHING_TO_TOGGLE])),
    [graph, focusId, state.expansion, visible],
  );
  const reach = useMemo(
    () => (focusId ? tracePath(graph, focusId, graph.byId) : null),
    [graph, focusId],
  );

  // A column outside the tables in view (a link, or a pick from the details
  // drawer) has nothing in view to be confined to, so it is traced end to end.
  const trace = useMemo(() => {
    if (!tracedColumn) return null;
    const tables = wantsEndToEnd || !visible.has(tracedColumn.assetId) ? graph.byId : visible;
    const within = { has: (id) => tables.has(columns.byId.get(id)?.assetId) };
    const path = tracePath(columns, tracedColumn.id, within);
    const whole = tracePath(columns, tracedColumn.id, columns.byId);
    const beyond =
      whole.upstream.size + whole.downstream.size - path.upstream.size - path.downstream.size;
    return {
      column: tracedColumn,
      path,
      beyond,
      layout: layoutColumnTrace(graph, columns, tracedColumn.id, path, { bands }),
    };
  }, [graph, columns, tracedColumn, visible, wantsEndToEnd, bands]);

  // Hover wins over the selection, so you can look along another path without
  // losing the table you have open.
  const selectedId = visible.has(state.selectedId) ? state.selectedId : null;
  const activeId = visible.has(hoveredId) ? hoveredId : selectedId;
  const path = useMemo(() => {
    if (!activeId) return null;
    const trace = tracePath(graph, activeId, visible);
    return { ...trace, nodeIds: new Set([activeId, ...trace.upstream, ...trace.downstream]) };
  }, [graph, activeId, visible]);

  /** Set or clear several params in one history entry: `{ key: value | null }`. */
  const setParam = (changes) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    });

  const focusOn = (id) => {
    setHoveredId(null);
    setParam({ [LINEAGE_PARAM]: id, ...NO_TRACE });
  };

  /** Stop tracing one table and go back to the whole catalog. */
  const clearFocus = () => focusOn(null);

  const setLens = (next) => setParam({ [LENS_PARAM]: next === LENS.business ? next : null });

  /** Switch level, keeping the focus where it is on screen. */
  const setLevel = (next) => {
    update(() => ({ anchorId: focusId }));
    setParam({ [LEVEL_PARAM]: next === LEVEL.column ? next : null, ...NO_TRACE });
  };

  /** Trace one column — from a card's list, or from a column already on a trace. */
  const traceColumn = (id) => {
    setHoveredId(null);
    setParam({ [COLUMN_PARAM]: id });
  };

  /**
   * Go to a column found by the search: its table becomes the focus and the
   * column is traced within that table's lineage. Exiting the trace then
   * leaves you on the table it came from, with its columns open.
   */
  const goToColumn = (id) => {
    setHoveredId(null);
    setParam({
      [LINEAGE_PARAM]: columns.byId.get(id).assetId,
      [COLUMN_PARAM]: id,
      [TRACE_PARAM]: null,
    });
  };

  /** Back to the column-level canvas, as it was before the trace. */
  const exitTrace = () => setParam(NO_TRACE);

  /** Widen the trace from the tables in view to the whole catalog. */
  const traceEndToEnd = () => setParam({ [TRACE_PARAM]: TRACE_ALL });

  const select = (id) => update(() => ({ selectedId: id }));

  /** Open a side showing "+N", close one showing "−". */
  const toggle = (id, direction) =>
    update((current) => ({
      anchorId: id,
      expansion: withSide(current.expansion, id, direction, sides.get(id)[direction].hidden > 0),
    }));

  /** Open a neighbour from the details panel, bringing it onto the canvas first if it is off it. */
  const reveal = (id, direction, neighbourId) =>
    update((current) =>
      visible.has(neighbourId)
        ? { selectedId: neighbourId }
        : {
            selectedId: neighbourId,
            anchorId: id,
            expansion: withSide(current.expansion, id, direction, true),
          },
    );

  /** Open a card onto its columns, or close it. */
  const toggleColumns = (id) =>
    update((current) => ({ anchorId: id, open: toggled(current.open, id) }));

  /** List every column of an opened card, or fold them back. */
  const toggleAllColumns = (id) =>
    update((current) => ({ anchorId: id, showAll: toggled(current.showAll, id) }));

  return {
    graph,
    columns,
    lens,
    level,
    focus: graph.byId.get(focusId) ?? null,
    selected: graph.byId.get(selectedId) ?? null,
    reach,
    layout,
    sides,
    path,
    trace,
    anchorId: state.anchorId,
    focusOn,
    clearFocus,
    setLens,
    setLevel,
    select,
    hover: setHoveredId,
    toggle,
    reveal,
    toggleColumns,
    toggleAllColumns,
    traceColumn,
    goToColumn,
    exitTrace,
    traceEndToEnd,
  };
}
