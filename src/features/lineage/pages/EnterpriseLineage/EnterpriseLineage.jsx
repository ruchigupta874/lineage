import { useMemo, useState } from 'react';
import { createSearchParams, useNavigate } from 'react-router-dom';
import Skeleton from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/constants/routes';
import { ENTERPRISE_COPY, LEVEL, LINEAGE_PARAM } from '@/features/lineage/constants';
import { indexLineage, tracePath } from '@/features/lineage/lineageGraph';
import AssetSearch from '../EntityLineage/AssetSearch';
import LineageCanvas from '../EntityLineage/LineageCanvas';
import { COMPACT_GEOMETRY, layoutLineage } from '../EntityLineage/lineageLayout';
import { useLineageData } from '../EntityLineage/useLineageData';
import { WORKSPACES, useWorkspace, withWorkspace } from '../EntityLineage/useWorkspace';
import EnterpriseHead from './EnterpriseHead';
import EnterpriseNode from './EnterpriseNode';
import styles from './EnterpriseLineage.module.css';

/**
 * The search here finds tables only, and nothing is ever traced on this page,
 * so it has no columns to search and no chips to clear.
 */
const NO_COLUMNS = { byId: new Map() };
const ignore = () => {};

/** Cards per column while loading, narrowing downstream the way most lineage does. */
const SKELETON_COLUMNS = [6, 4, 2];

function EnterpriseSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {SKELETON_COLUMNS.map((count) => (
        <div key={count} className={styles.skeletonColumn}>
          {Array.from({ length: count }, (_, row) => (
            <Skeleton
              key={row}
              width={COMPACT_GEOMETRY.nodeWidth}
              height={COMPACT_GEOMETRY.nodeHeight}
              radius="var(--radius-lg)"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Enterprise lineage: every asset in the workspace and how data flows between
 * them, on one canvas. The app opens here.
 *
 * It is the way in to one asset's lineage. Pick a table in the search — the
 * same search the lineage page has, at entity level — or click a card, and
 * the lineage page opens with that asset as its focus, in the same
 * workspace.
 *
 * Left to right is the flow. Each card wears its layer's colour — whatever
 * the workspace calls its layers — or plain white when the catalog sets none,
 * or a dashed outline when it is not in the catalog at all. The legend in
 * the header counts them by layer; clicking one highlights its assets, so
 * the gaps in a catalog's classification are easy to find. Hovering a card
 * traces its path.
 */
export default function EnterpriseLineage() {
  const [workspaceId, setWorkspace] = useWorkspace();
  const { assets, isLoading, syncedAt, isSyncing, sync } = useLineageData(workspaceId);
  const [hoveredId, setHoveredId] = useState(null);
  // A highlight belongs to the workspace it was made in.
  const [highlight, setHighlight] = useState({ workspaceId, key: null });
  const spotlight = highlight.workspaceId === workspaceId ? highlight.key : null;
  const navigate = useNavigate();

  const graph = useMemo(() => indexLineage(assets), [assets]);
  const layout = useMemo(
    () =>
      graph.byId.size > 0
        ? layoutLineage(graph, new Set(graph.byId.keys()), null, { geometry: COMPACT_GEOMETRY })
        : null,
    [graph],
  );
  const path = useMemo(() => {
    if (!graph.byId.has(hoveredId)) return null;
    const trace = tracePath(graph, hoveredId, graph.byId);
    return { ...trace, nodeIds: new Set([hoveredId, ...trace.upstream, ...trace.downstream]) };
  }, [graph, hoveredId]);

  // A hovered path wins over a highlighted layer, as it does over a selection
  // on the lineage page: it is what the pointer is asking about right now.
  const isDimmed = (node) => {
    if (path) return !path.nodeIds.has(node.id);
    return spotlight !== null && node.layer.key !== spotlight;
  };

  const openAsset = (id) =>
    navigate({
      pathname: ROUTES.lineage,
      search: `?${createSearchParams(withWorkspace(workspaceId, { [LINEAGE_PARAM]: id }))}`,
    });

  return (
    <main className={styles.page}>
      <EnterpriseHead
        assets={assets}
        isLoading={isLoading}
        workspaces={WORKSPACES}
        workspaceId={workspaceId}
        onWorkspaceChange={setWorkspace}
        spotlight={spotlight}
        onSpotlight={(key) => setHighlight({ workspaceId, key })}
        syncedAt={syncedAt}
        isSyncing={isSyncing}
        onSync={sync}
        search={
          <AssetSearch
            assets={assets}
            columns={NO_COLUMNS}
            level={LEVEL.entity}
            focusId={null}
            tracedColumnId={null}
            onPickTable={openAsset}
            onPickColumn={ignore}
            onClearTable={ignore}
            onClearColumn={ignore}
            isLoading={isLoading}
          />
        }
      />

      <div className={styles.canvasArea} aria-busy={isLoading}>
        {layout ? (
          <LineageCanvas
            layout={layout}
            path={path}
            label={ENTERPRISE_COPY.canvas}
            showHeads={false}
            zoomCorner="right"
            renderNode={(node) => (
              <EnterpriseNode
                key={node.id}
                node={node}
                isDimmed={isDimmed(node)}
                onHover={setHoveredId}
                onOpen={openAsset}
              />
            )}
          />
        ) : (
          <EnterpriseSkeleton />
        )}
      </div>
    </main>
  );
}
