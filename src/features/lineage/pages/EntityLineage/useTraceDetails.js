import { useState } from 'react';
import { PROVENANCE_TAB } from '@/features/lineage/constants';

/** A traced column's details open with it, on its technical provenance. */
const freshFor = (columnId) => ({ columnId, isOpen: true, tab: PROVENANCE_TAB.technical });

/**
 * Whether a traced column's details pane is open, and on which tab. It belongs
 * to the column it was opened for: tracing another column starts it afresh —
 * open, on technical provenance — without an effect to notice the change.
 */
export function useTraceDetails(columnId) {
  const [stored, setStored] = useState(() => freshFor(columnId));
  const details = stored.columnId === columnId ? stored : freshFor(columnId);
  const update = (change) => setStored({ ...details, ...change });
  return {
    isOpen: details.isOpen,
    tab: details.tab,
    open: () => update({ isOpen: true }),
    close: () => update({ isOpen: false }),
    setTab: (tab) => update({ tab }),
  };
}
