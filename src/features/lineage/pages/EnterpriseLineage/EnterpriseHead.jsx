import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import Skeleton from '@/components/ui/Skeleton';
import { legendOf } from '@/features/lineage/catalog';
import { ENTERPRISE_COPY } from '@/features/lineage/constants';
import { formatDateTime } from '@/utils/format';
import { assetShape } from '../EntityLineage/assetShape';
import styles from './EnterpriseLineage.module.css';

/**
 * How many assets the workspace holds, and how many sit in each layer — the
 * workspace's own layers in flow order, then Unclassified and Not in catalog
 * when there are any. Each count is a toggle that highlights its assets on
 * the canvas.
 */
function LayerLegend({ assets, isLoading, spotlight, onSpotlight }) {
  if (isLoading) {
    return (
      <div className={styles.stats} aria-hidden="true">
        {[64, 68, 62, 54].map((width) => (
          <Skeleton key={width} width={width} height={22} radius="var(--radius-pill)" />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.stats} role="group" aria-label={ENTERPRISE_COPY.legend}>
      <span className={styles.total}>{ENTERPRISE_COPY.assets(assets.length)}</span>
      {legendOf(assets).map((layer) => {
        const isOn = layer.key === spotlight;
        const action = (isOn ? ENTERPRISE_COPY.spotlightOff : ENTERPRISE_COPY.spotlight)(
          layer.label,
        );
        return (
          <button
            key={layer.key}
            type="button"
            className={styles.layerStat}
            data-hue={layer.hue}
            aria-pressed={isOn}
            title={layer.blurb ? `${layer.blurb} · ${action}` : action}
            onClick={() => onSpotlight(isOn ? null : layer.key)}
          >
            <span className={styles.layerDot} />
            {layer.label}
            <span className={styles.layerCount}>{layer.count}</span>
          </button>
        );
      })}
    </div>
  );
}

LayerLegend.propTypes = {
  assets: PropTypes.arrayOf(assetShape).isRequired,
  isLoading: PropTypes.bool.isRequired,
  spotlight: PropTypes.string,
  onSpotlight: PropTypes.func.isRequired,
};

/**
 * The enterprise page's header. On the left, what the page is and what the
 * workspace holds, layer by layer; in the middle, the search, passed in as
 * `search` (the same one the lineage page has); on the right, which
 * workspace, the sync, and when lineage was last synced. `spotlight` is the
 * layer highlighted on the canvas, if any.
 */
export default function EnterpriseHead({
  assets,
  isLoading,
  search,
  workspaces,
  workspaceId,
  onWorkspaceChange,
  spotlight,
  onSpotlight,
  syncedAt,
  isSyncing,
  onSync,
}) {
  return (
    <header className={styles.head}>
      <div className={styles.intro}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{ENTERPRISE_COPY.title}</h1>
          <span
            className={styles.about}
            role="img"
            aria-label={ENTERPRISE_COPY.about}
            title={ENTERPRISE_COPY.about}
          >
            <Icon name="info" size={15} />
          </span>
        </div>
        <p className={styles.subtitle}>{ENTERPRISE_COPY.subtitle}</p>
      </div>

      <div className={styles.searchSlot}>{search}</div>

      <div className={styles.legendSlot}>
        <LayerLegend
          assets={assets}
          isLoading={isLoading}
          spotlight={spotlight}
          onSpotlight={onSpotlight}
        />
      </div>

      <div className={styles.controls}>
        <div className={styles.actions}>
          <label className={styles.workspace}>
            <span className={styles.workspaceLabel}>{ENTERPRISE_COPY.workspace}</span>
            <span className={styles.selectWrap}>
              <select
                className={styles.select}
                value={workspaceId}
                onChange={(event) => onWorkspaceChange(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.label}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={14} className={styles.selectIcon} />
            </span>
          </label>
          <span className={styles.divider} aria-hidden="true" />
          <Button
            variant="primary"
            size="lg"
            className={styles.sync}
            iconRight={isSyncing ? undefined : 'play'}
            disabled={isLoading}
            aria-busy={isSyncing}
            onClick={onSync}
          >
            {isSyncing ? ENTERPRISE_COPY.syncing : ENTERPRISE_COPY.sync}
          </Button>
          {/* What it opens isn't designed yet; it holds its place in the header. */}
          <Button
            variant="primary"
            size="icon"
            className={styles.insights}
            aria-label={ENTERPRISE_COPY.insights}
            aria-disabled="true"
            title={ENTERPRISE_COPY.insights}
          >
            <Icon name="chartColumn" size={16} strokeWidth={1.6} />
          </Button>
        </div>
        <p className={styles.lastSync} aria-live="polite">
          <strong>{ENTERPRISE_COPY.lastSync}</strong>{' '}
          {syncedAt ? formatDateTime(syncedAt) : ENTERPRISE_COPY.neverSynced}
        </p>
      </div>
    </header>
  );
}

EnterpriseHead.propTypes = {
  assets: PropTypes.arrayOf(assetShape).isRequired,
  isLoading: PropTypes.bool.isRequired,
  search: PropTypes.node.isRequired,
  workspaces: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string.isRequired }),
  ).isRequired,
  workspaceId: PropTypes.string.isRequired,
  onWorkspaceChange: PropTypes.func.isRequired,
  spotlight: PropTypes.string,
  onSpotlight: PropTypes.func.isRequired,
  syncedAt: PropTypes.instanceOf(Date),
  isSyncing: PropTypes.bool.isRequired,
  onSync: PropTypes.func.isRequired,
};
