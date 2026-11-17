const STEP = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * Arrow keys, Home and End on a tab strip: which tab a key press moves to, or
 * null for a key the strip ignores. The caller selects that tab and focuses
 * it, the way the ARIA tabs pattern asks.
 */
export function nextTabIndex(key, index, count) {
  if (STEP[key]) return (index + STEP[key] + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
