import { TONE } from '@/config/constants/common';
import { pluralize } from '@/utils/format';

/**
 * The medallion layers. A workspace names its own layers, in its own order
 * (raw, curated, consumption…) and may name none; these three are only the
 * ones every data team knows, so they keep their metals and their words
 * wherever they turn up.
 */
export const LAYER = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
};

/** What a medallion layer is called and means, when a workspace doesn't say. */
export const LAYER_META = {
  [LAYER.bronze]: { label: 'Bronze', blurb: 'Raw, as ingested' },
  [LAYER.silver]: { label: 'Silver', blurb: 'Cleaned and conformed' },
  [LAYER.gold]: { label: 'Gold', blurb: 'Business-ready' },
};

/**
 * The two places an asset can be when it is in no layer: in the catalog with
 * no layer set, or not in the catalog at all — seen only because a job reads
 * or writes it. Prefixed so no catalog layer id can collide with them.
 */
export const NO_LAYER = {
  unclassified: '~unclassified',
  external: '~external',
};

export const NO_LAYER_META = {
  [NO_LAYER.unclassified]: {
    label: 'Unclassified',
    blurb: 'No layer set in the catalog',
    hue: 'plain',
  },
  [NO_LAYER.external]: {
    label: 'Not in catalog',
    blurb: 'Seen only in lineage',
    hue: 'external',
  },
};

/**
 * Colours for the layers a workspace names for itself, handed out in its
 * layer order (layers.css). Past five they come round again; the label
 * still tells two layers apart.
 */
export const LAYER_HUES = ['teal', 'violet', 'blue', 'rose', 'green'];

/** The metals, kept for the medallion layers in any workspace. */
export const MEDALLION_HUES = {
  [LAYER.bronze]: 'bronze',
  [LAYER.silver]: 'silver',
  [LAYER.gold]: 'gold',
};

/**
 * Tables and views are what a catalog holds. Files, streams and APIs turn up
 * mostly outside it — a CSV a job picks up, a topic it reads — and `unknown`
 * is an input lineage names that nothing else describes.
 */
export const ASSET_KIND = {
  table: 'table',
  view: 'view',
  file: 'file',
  stream: 'stream',
  api: 'api',
  unknown: 'unknown',
};

export const ASSET_KIND_META = {
  [ASSET_KIND.table]: { label: 'Table', icon: 'table' },
  [ASSET_KIND.view]: { label: 'View', icon: 'code' },
  [ASSET_KIND.file]: { label: 'File', icon: 'fileText' },
  [ASSET_KIND.stream]: { label: 'Stream', icon: 'activity' },
  [ASSET_KIND.api]: { label: 'API', icon: 'globe' },
  [ASSET_KIND.unknown]: { label: 'Unknown', icon: 'circleHelp' },
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
 * Which lineage the page shows. Technical is the physical picture — tables,
 * columns and the jobs between them. Business tells the same story in business
 * terms, and has no data behind it yet. Each is read at either level below.
 */
export const LENS = {
  technical: 'technical',
  business: 'business',
};

export const LENSES = [LENS.technical, LENS.business];

export const LENS_META = {
  [LENS.technical]: {
    label: 'Technical',
    caption: 'Tables, columns & jobs',
    icon: 'database',
    blurb: 'Tables, columns and the jobs between them',
  },
  [LENS.business]: {
    label: 'Business',
    caption: 'In business terms',
    icon: 'briefcase',
    blurb: 'The same lineage in business terms',
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
    hint: 'Open a table to see its columns · click a column to trace it',
  },
};

/**
 * How a column was made from its inputs. Raw is a bronze column, landed as the
 * source sent it; the rest describe one step of a pipeline.
 *
 * `tone` groups them by what they mean for trust: `kept` leaves the value as
 * it was, `changed` computes something new from it, `generated` has no input
 * column at all.
 */
export const TRANSFORM = {
  raw: 'raw',
  direct: 'direct',
  renamed: 'renamed',
  derived: 'derived',
  aggregated: 'aggregated',
  lookup: 'lookup',
  unioned: 'unioned',
  constant: 'constant',
  system: 'system',
};

export const TRANSFORM_META = {
  [TRANSFORM.raw]: { label: 'Raw', tone: 'kept' },
  [TRANSFORM.direct]: { label: 'Passed through', tone: 'kept' },
  [TRANSFORM.renamed]: { label: 'Renamed', tone: 'kept' },
  [TRANSFORM.derived]: { label: 'Calculated', tone: 'changed' },
  [TRANSFORM.aggregated]: { label: 'Aggregated', tone: 'changed' },
  [TRANSFORM.lookup]: { label: 'Looked up', tone: 'changed' },
  [TRANSFORM.unioned]: { label: 'Unioned', tone: 'changed' },
  [TRANSFORM.constant]: { label: 'Constant', tone: 'generated' },
  [TRANSFORM.system]: { label: 'Pipeline metadata', tone: 'generated' },
};

/** The two tabs of a traced column's drawer, in order: provenance opens first. */
export const PROVENANCE_TAB = {
  technical: 'technical',
  governance: 'governance',
};

export const PROVENANCE_TABS = [PROVENANCE_TAB.technical, PROVENANCE_TAB.governance];

export const PROVENANCE_TAB_META = {
  [PROVENANCE_TAB.technical]: { label: 'Technical Provenance', icon: 'code' },
  [PROVENANCE_TAB.governance]: { label: 'AI Governance', icon: 'sparkles' },
};

/**
 * The search params that name the focus asset, the lens, the level and a
 * traced column, so a view can be linked to. `trace=all` widens a column trace
 * from the tables in view to the whole catalog.
 */
export const LINEAGE_PARAM = 'asset';
export const WORKSPACE_PARAM = 'workspace';
export const LENS_PARAM = 'lens';
export const LEVEL_PARAM = 'level';
export const COLUMN_PARAM = 'column';
export const TRACE_PARAM = 'trace';
export const TRACE_ALL = 'all';

/**
 * The enterprise page, which the app opens on: every asset in a workspace at
 * once, and the way into any one asset's lineage.
 */
export const ENTERPRISE_COPY = {
  title: 'Enterprise Lineage',
  subtitle: 'Every asset in the workspace and how data flows between them',
  about:
    'Every table and view in the workspace, bronze to gold. Search for a table, or click one, to open its lineage.',
  assets: (count) => pluralize(count, 'asset'),
  workspace: 'Workspace',
  sync: 'Sync Lineage',
  syncing: 'Syncing…',
  lastSync: 'Last Sync:',
  neverSynced: 'Not yet',
  insights: 'Lineage insights · coming soon',
  canvas: 'Lineage of every asset in the workspace',
  openAsset: (name) => `Open the lineage of ${name}`,
  legend: 'Assets by layer',
  spotlight: (label) => `Highlight ${label} on the canvas`,
  spotlightOff: (label) => `Stop highlighting ${label}`,
};

export const LINEAGE_COPY = {
  backHome: 'Back to enterprise lineage',
  lens: 'Lineage type',
  businessTitle: 'Business lineage isn’t set up yet',
  businessBody: (name, level) =>
    `Business lineage will describe ${name ?? 'your tables'} in business terms rather than tables and jobs. ` +
    `Until then, technical lineage traces ${name ? 'it' : 'them'} ${level === LEVEL.column ? 'column by column' : 'table by table'}.`,
  businessAction: 'Open technical lineage',

  search: 'Search for a table to trace its lineage',
  searchColumns: 'Search for a column or a table',
  searchLoading: 'Loading tables…',
  searchAnother: 'Search for another table',
  searchAnotherColumn: 'Search for another column or table',
  searchClear: 'Clear search',
  searchTracing: (name) => `Tracing ${name}`,
  searchRemove: (name) => `Stop tracing ${name} and show all lineage`,
  searchRemoveColumn: (name) => `Stop tracing ${name}`,
  searchRecent: 'Recent',
  searchHint: (count) => `Find any of the ${count} assets by name, layer, owner or source system.`,
  searchColumnsHint: (columns, tables) =>
    `Find any of the ${columns} columns across ${tables} tables by name. Add a table or a layer to narrow it, as in “silver age”.`,
  searchSectionColumns: 'Columns',
  searchSectionTables: 'Tables',
  searchColumnIn: 'in',
  searchNarrow: 'More results · keep typing to narrow',
  searchViewing: 'Viewing',
  noMatches: (query) => `No tables match “${query}”`,
  noMatchesHint: 'Try part of a name, a layer such as “silver”, or an owner.',
  noColumnMatches: (query) => `No columns or tables match “${query}”`,
  noColumnMatchesHint: 'Try part of a column name, or a table and a column, as in “sales units”.',
  keyMove: 'to move',
  keyPick: 'to trace',
  keyClose: 'to close',

  level: 'Lineage level',
  reach: (upstream, downstream) =>
    `${pluralize(upstream, 'table')} upstream · ${downstream} downstream`,
  canvas: (name) => `Lineage of ${name}`,
  canvasAll: 'Lineage of every table',

  overviewTitle: 'All lineage',
  overviewCount: (count) => pluralize(count, 'asset'),

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
  location: 'Location',
  noRows: 'n/a',
  noValue: '—',
  unclassifiedNote: 'No layer is set for this asset in the catalog.',
  externalNote:
    'Seen only in lineage: a job reads or writes it, but the catalog has no record of it, so there is no schema, owner or health to show.',
  layerConflict:
    'Its layer doesn’t match where its data flows — it reads from a later layer or feeds an earlier one — so it is placed by the flow.',

  openColumns: (name) => `Show columns of ${name}`,
  closeColumns: (name) => `Hide columns of ${name}`,
  moreColumns: (count) => `+${pluralize(count, 'more column')}`,
  fewerColumns: 'Show fewer columns',
  traceColumn: (name) => `Trace ${name}`,

  traceTitle: 'Tracing column lineage for',
  traceCounts: (upstream, downstream, tables) =>
    `${pluralize(upstream, 'column')} upstream · ${downstream} downstream · across ${pluralize(tables, 'table')}`,
  traceExit: 'Exit focus',
  traceHint: 'Click any highlighted column to trace it instead',
  traceOnPath: (count, total) => `${count} of ${total} columns on the path`,
  traceOthers: (count) => `+${pluralize(count, 'other column')}`,
  traceDetails: (name) => `Show transformations for ${name}`,

  splitter: 'Resize the lineage and details panes',
  splitterHint: 'Drag to resize · double-click to switch between 80 : 20 and 70 : 30',
  splitRatio: (canvas, details) => `${canvas} : ${details}`,

  provenanceTitle: (name) => `Transformations for ${name}`,
  provenanceTabs: 'Column details',
  provenanceClose: 'Close transformations',
  transformation: 'Transformation',
  builtBy: 'Built by',
  rawFrom: (source) => `Landed as is from ${source}`,
  derivedFrom: 'Derived from',
  usedBy: 'Used by',
  noInputs: 'No input column: the pipeline sets this as rows load.',
  fromOutside: (source) => `Comes from ${source}, which is outside the catalog.`,
  enteredHere: (source) => `This is where the data enters, from ${source}.`,
  notUsed: 'Nothing reads this column yet.',
  shownAbove: 'shown above',
  endToEnd: 'Trace end-to-end lineage',
  endToEndDone: 'Showing end-to-end lineage',
  beyondView: (count) =>
    `${pluralize(count, 'more column')} on this path ${count === 1 ? 'sits' : 'sit'} outside the tables in view.`,

  governanceTitle: 'AI governance',
  governanceSoon: 'Coming soon',
  governanceBody: (name) =>
    `A plain-language summary of ${name} will appear here: how it is calculated, what it means, who may use it and the policies that apply.`,
  governanceAction: 'Generate summary',
};
