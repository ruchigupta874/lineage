import { useEffect, useState } from 'react';

/**
 * How much of the column trace the details pane takes, as a share of the
 * width: from 80 : 20 to 70 : 30, canvas to details. It opens at 70 : 30, the
 * room a transformation's logic reads best in, and can be narrowed to give the
 * canvas more.
 */
export const DETAILS_SHARE = { min: 0.2, max: 0.3, step: 0.01 };

const STORAGE_KEY = 'entity-lineage.details-share';

const clampShare = (share) =>
  Math.round(Math.min(DETAILS_SHARE.max, Math.max(DETAILS_SHARE.min, share)) * 1000) / 1000;

function loadShare() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return stored ? clampShare(stored) : DETAILS_SHARE.max;
  } catch {
    return DETAILS_SHARE.max;
  }
}

/**
 * The details pane's share of the width, always within DETAILS_SHARE and
 * remembered in this browser, so a width someone settled on is the one they
 * get next time. A convenience only: without storage it opens at 70 : 30.
 */
export function useDetailsShare() {
  const [share, setShare] = useState(loadShare);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(share));
    } catch {
      // Storage blocked: the width just won't outlive the page.
    }
  }, [share]);
  return [share, (next) => setShare(clampShare(next))];
}
