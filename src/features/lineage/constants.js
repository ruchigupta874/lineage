import { TONE } from '@/config/constants/common';
import { pluralize } from '@/utils/format';

/** The medallion layers, which are also the canvas's columns. */
export const LAYER = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
};

/** Left to right: the order data moves through them. */
export const LAYER_ORDER = [LAYER.bronze, LAYER.silver, LAYER.gold];

export const LAYER_META = {
  [LAYER.bronze]: { label: 'Bronze', blurb: 'Raw, as ingested' },
  [LAYER.silver]: { label: 'Silver', blurb: 'Cleaned and conformed' },
  [LAYER.gold]: { label: 'Gold', blurb: 'Business-ready' },
};

export const ASSET_KIND = {
  table: 'table',
  view: 'view',
};

export const ASSET_KIND_META = {
  [ASSET_KIND.table]: { label: 'Table', icon: 'table' },
  [ASSET_KIND.view]: { label: 'View', icon: 'code' },
};

/**
 * Whether an asset can be trusted right now. Only the two that want a person
 * are marked on the canvas — a dot on every healthy table would be noise that
 * hides the one that is not.
 */
export const HEALTH = {
  healthy: 'healthy',
  stale: 'stale',
  failing: 'failing',
};

export const HEALTH_META = {
  [HEALTH.healthy]: { label: 'Healthy', tone: TONE.ok },
  [HEALTH.stale]: { label: 'Stale', tone: TONE.warn },
  [HEALTH.failing]: { label: 'Tests failing', tone: TONE.danger },
};

/** The two ways lineage is read from an asset. */
export const DIRECTION = {
  upstream: 'upstream',
  downstream: 'downstream',
};

export const DIRECTIONS = [DIRECTION.upstream, DIRECTION.downstream];

export const DIRECTION_META = {
  [DIRECTION.upstream]: {
    label: 'Upstream',
    empty: 'Nothing upstream. This is where the data enters.',
  },
  [DIRECTION.downstream]: {
    label: 'Downstream',
    empty: 'Nothing reads from this yet.',
  },
};

/**
 * How finely lineage is drawn: table to table, or column to column. Column
 * level is the same graph with tables opened up, not a different screen.
 */
export const LEVEL = {
  entity: 'entity',
  column: 'column',
};

export const LEVELS = [LEVEL.entity, LEVEL.column];

export const LEVEL_META = {
  [LEVEL.entity]: {
    label: 'Entity level',
    hint: 'Scroll to zoom · drag to pan · double-click a table to focus on it',
  },
  [LEVEL.column]: {
    label: 'Column level',
    hint: 'Open a table to see its columns · double-click a table to focus on it',
  },
};

/** The search params that name the focus asset and the level, so a view can be linked to. */
export const LINEAGE_PARAM = 'asset';
export const LEVEL_PARAM = 'level';

export const LINEAGE_COPY = {
  railTitle: 'Assets',
  search: 'Search tables',
  noMatches: 'No tables match that search.',

  level: 'Lineage level',
  reach: (upstream, downstream) =>
    `${pluralize(upstream, 'table')} upstream · ${downstream} downstream`,
  canvas: (name) => `Lineage of ${name}`,

  focusTag: 'Focus',
  focusHere: 'Focus lineage here',
  showMore: (count, direction) => `Show ${count} more ${direction.toLowerCase()}`,
  hide: (direction) => `Hide ${direction.toLowerCase()}`,

  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to screen',

  close: 'Close details',
  rows: 'Rows',
  columns: 'Columns',
  updated: 'Updated',
  owner: 'Owner',
  health: 'Health',
  source: 'Ingested from',
  job: 'Built by',
  noRows: 'n/a',

  openColumns: (name) => `Show columns of ${name}`,
  closeColumns: (name) => `Hide columns of ${name}`,
  moreColumns: (count) => `+${pluralize(count, 'more column')}`,
  fewerColumns: 'Show fewer columns',
};
