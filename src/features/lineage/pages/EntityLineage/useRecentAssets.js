import { useEffect, useState } from 'react';

const STORAGE_KEY = 'entity-lineage.recent';

/** More than are shown, because the current table and column are kept but never listed. */
const KEEP = 8;

function load() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The tables and columns most recently traced, newest first, so the search has
 * something to offer before anything is typed. One list of ids for both: a
 * column's id names its table too, so the caller tells them apart by which
 * graph knows the id. Kept in this browser only: it is a convenience, and the
 * page works the same without it.
 *
 * Recorded whenever the focus or the traced column changes, however it
 * changed — a pick from the search, a click on the canvas, or Back. When both
 * change at once (a column picked from the search), the column is newer.
 */
export function useRecentAssets(focusId, columnId) {
  const [state, setState] = useState(() => ({ list: load(), seen: [null, null] }));
  const current = [focusId, columnId];

  // Adjusted while rendering, not in an effect, so the list is never a render behind.
  if (current[0] !== state.seen[0] || current[1] !== state.seen[1]) {
    let list = state.list;
    current.forEach((id, index) => {
      if (id && id !== state.seen[index]) list = [id, ...list.filter((other) => other !== id)];
    });
    setState({ list: list.slice(0, KEEP), seen: current });
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.list));
    } catch {
      // Storage blocked or full: the list just won't outlive the page.
    }
  }, [state.list]);

  return state.list;
}
