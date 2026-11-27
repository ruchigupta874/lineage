import { useEffect, useRef, useState } from 'react';
import { resolveCatalog } from '@/features/lineage/catalog';
import { LINEAGE_WORKSPACES } from '@/features/lineage/mocks';

/**
 * Stands in for the catalog's lineage endpoint, for one workspace. Same shape
 * and reasoning as the Sources and registry hooks: the fixtures are
 * synchronous, so without a delay the loading state would never render and
 * would quietly rot. Switching workspace loads afresh.
 *
 * The assets come back resolved (`resolveCatalog`): each with its layer
 * worked out, and what lineage names outside the catalog added as assets of
 * its own.
 *
 * `layerBands` says whether the workspace's lineage page draws its layers as
 * bands rather than naming them over each column.
 *
 * `sync` stands in for asking the catalog to re-read lineage from the
 * pipelines: it takes a moment, then moves `syncedAt` to now. The assets stay
 * as they are, since the fixtures have nothing new to find.
 *
 * When the API lands: fetch the workspace's assets, externals, layer list and
 * last sync time; make `sync` call the sync endpoint and refetch; delete
 * these constants; and add `error` so the page can say what broke.
 */
const MOCK_LATENCY_MS = 600;
const MOCK_SYNC_MS = 1200;
const NO_ASSETS = [];

export function useLineageData(workspaceId) {
  const [state, setState] = useState({
    workspaceId: null,
    assets: NO_ASSETS,
    layerBands: false,
    syncedAt: null,
    isSyncing: false,
  });
  const syncTimer = useRef(null);

  useEffect(() => {
    const workspace = LINEAGE_WORKSPACES.find((candidate) => candidate.id === workspaceId);
    const timer = window.setTimeout(
      () =>
        setState({
          workspaceId,
          assets: resolveCatalog(workspace),
          layerBands: Boolean(workspace.layerBands),
          syncedAt: new Date(workspace.syncedAt),
          isSyncing: false,
        }),
      MOCK_LATENCY_MS,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(syncTimer.current);
      syncTimer.current = null;
    };
  }, [workspaceId]);

  const sync = () => {
    if (syncTimer.current) return;
    setState((previous) => ({ ...previous, isSyncing: true }));
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null;
      setState((previous) => ({ ...previous, isSyncing: false, syncedAt: new Date() }));
    }, MOCK_SYNC_MS);
  };

  // Until the requested workspace has loaded, nothing of the last one shows.
  const isLoading = state.workspaceId !== workspaceId;
  return {
    assets: isLoading ? NO_ASSETS : state.assets,
    layerBands: !isLoading && state.layerBands,
    syncedAt: isLoading ? null : state.syncedAt,
    isSyncing: !isLoading && state.isSyncing,
    isLoading,
    sync,
  };
}
