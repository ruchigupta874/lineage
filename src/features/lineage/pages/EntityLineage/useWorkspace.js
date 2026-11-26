import { useSearchParams } from 'react-router-dom';
import { WORKSPACE_PARAM } from '@/features/lineage/constants';
import { LINEAGE_WORKSPACES } from '@/features/lineage/mocks';

/** The workspaces lineage can be read for, as the picker lists them. */
export const WORKSPACES = LINEAGE_WORKSPACES.map(({ id, label }) => ({ id, label }));

const DEFAULT_WORKSPACE = WORKSPACES[0].id;

/**
 * Search params that keep `workspaceId` across a link, merged into `params`.
 * The default workspace is left out, so its links stay as short as before
 * there was more than one.
 */
export const withWorkspace = (workspaceId, params = {}) =>
  workspaceId === DEFAULT_WORKSPACE ? params : { [WORKSPACE_PARAM]: workspaceId, ...params };

/**
 * Which workspace the page is showing, kept in the URL (`?workspace=retail`)
 * so it carries from the enterprise page to an asset's lineage and back, and
 * a link opens on the right one. Anything unknown falls back to the default.
 */
export function useWorkspace() {
  const [params, setParams] = useSearchParams();
  const requested = params.get(WORKSPACE_PARAM);
  const workspaceId = WORKSPACES.some((workspace) => workspace.id === requested)
    ? requested
    : DEFAULT_WORKSPACE;

  const setWorkspace = (id) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id === DEFAULT_WORKSPACE) next.delete(WORKSPACE_PARAM);
      else next.set(WORKSPACE_PARAM, id);
      return next;
    });

  return [workspaceId, setWorkspace];
}
