import { useEffect, useState } from 'react';
import { LINEAGE_ASSETS } from '@/features/lineage/mocks';

/**
 * Stands in for the catalog's lineage endpoint. Same shape and reasoning as
 * the Sources and registry hooks: the fixture is synchronous, so without a
 * delay the loading state would never render and would quietly rot.
 *
 * When the API lands: fetch the assets with their upstream ids, delete this
 * constant, and add `error` so the page can say what broke.
 */
const MOCK_LATENCY_MS = 600;

export function useLineageData() {
  const [state, setState] = useState({ assets: [], isLoading: true });

  useEffect(() => {
    const timer = window.setTimeout(
      () => setState({ assets: LINEAGE_ASSETS, isLoading: false }),
      MOCK_LATENCY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return state;
}
