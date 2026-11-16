import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LEVEL, LEVEL_PARAM, LINEAGE_PARAM } from '@/features/lineage/constants';
import {
  EMPTY_EXPANSION,
  defaultFocusId,
  indexLineage,
  sidesFor,
  tracePath,
  visibleLineage,
  withSide,
} from '@/features/lineage/lineageGraph';
import { layoutColumns } from './columnLayout';
import { layoutLineage } from './lineageLayout';

const NOTHING = new Set();

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
 * The focus and the level live in the URL (`?asset=…&level=column`), so a view
 * can be linked to and Back returns to the previous one. Everything else —
 * expansion, selection, which cards are open — belongs to a focus: it is
 * stored with the focus it was made under, and reads as fresh once the URL
 * moves on, so no effect has to notice and reset it.
 *
 * `anchorId` is the table whose card or side was last opened or closed, which
 * the canvas keeps still on screen while the layout reflows around it.
 */
export function useLineageView(assets) {
  const graph = useMemo(() => indexLineage(assets), [assets]);
  const [params, setParams] = useSearchParams();
  const requested = params.get(LINEAGE_PARAM);
  const focusId = graph.byId.has(requested) ? requested : defaultFocusId(assets);
  const level = params.get(LEVEL_PARAM) === LEVEL.column ? LEVEL.column : LEVEL.entity;

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
    () => (focusId ? visibleLineage(graph, focusId, state.expansion) : new Set()),
    [graph, focusId, state.expansion],
  );
  const layout = useMemo(() => {
    if (!focusId) return null;
    if (level === LEVEL.entity) return layoutLineage(graph, visible, focusId);
    return layoutColumns(graph, visible, focusId, { open: state.open, showAll: state.showAll });
  }, [graph, visible, focusId, level, state.open, state.showAll]);
  const sides = useMemo(
    () => (focusId ? sidesFor(graph, focusId, state.expansion, visible) : new Map()),
    [graph, focusId, state.expansion, visible],
  );
  const reach = useMemo(
    () => (focusId ? tracePath(graph, focusId, graph.byId) : null),
    [graph, focusId],
  );

  // Hover wins over the selection, so you can look along another path without
  // losing the table you have open.
  const selectedId = visible.has(state.selectedId) ? state.selectedId : null;
  const activeId = visible.has(hoveredId) ? hoveredId : selectedId;
  const path = useMemo(() => {
    if (!activeId) return null;
    const trace = tracePath(graph, activeId, visible);
    return { ...trace, nodeIds: new Set([activeId, ...trace.upstream, ...trace.downstream]) };
  }, [graph, activeId, visible]);

  const setParam = (key, value) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  const focusOn = (id) => {
    setHoveredId(null);
    setParam(LINEAGE_PARAM, id);
  };

  /** Switch level, keeping the focus where it is on screen. */
  const setLevel = (next) => {
    update(() => ({ anchorId: focusId }));
    setParam(LEVEL_PARAM, next === LEVEL.column ? next : null);
  };

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
    level,
    focus: graph.byId.get(focusId) ?? null,
    selected: graph.byId.get(selectedId) ?? null,
    reach,
    layout,
    sides,
    path,
    anchorId: state.anchorId,
    focusOn,
    setLevel,
    select,
    hover: setHoveredId,
    toggle,
    reveal,
    toggleColumns,
    toggleAllColumns,
  };
}
