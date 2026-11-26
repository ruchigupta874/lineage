import { ASSET_KIND, HEALTH, LAYER, TRANSFORM } from '../constants';
import { cols, columnsOf, made, withDerivations } from './helpers';

/**
 * The Retail workspace: a catalog with layers of its own — landing, raw,
 * curated, consumption — and every way a real one falls short of tidy:
 *
 * - staging tables (`stg_*`) and a generated calendar with no layer at all;
 * - one table already moved to the new medallion platform and labelled
 *   `silver`, a layer this workspace doesn't list;
 * - inputs and outputs outside the catalog: a CSV drop on SFTP, a Kafka
 *   topic, a weather API, a partner's S3 share — and one input, the legacy
 *   loyalty export, that lineage names but nothing describes;
 * - a consumption table (`dim_product`) that a curated one reads, so the
 *   labels say one order and the flow another;
 * - a mart column filled from the weather API, so a column trace ends at the
 *   edge of the catalog.
 */
const CATALOG = 'shopco';

const asset = (schema, name, fields) => ({
  id: `${schema}.${name}`,
  fqn: `${CATALOG}.${schema}.${name}`,
  name,
  layer: null,
  kind: ASSET_KIND.table,
  health: HEALTH.healthy,
  upstream: [],
  ...fields,
});

const T = {
  posDrop: 'landing.landing_pos_daily_drop',
  rawPos: 'raw.raw_pos_sales',
  rawClicks: 'raw.raw_clickstream',
  rawLoyalty: 'raw.raw_loyalty_members',
  rawStores: 'raw.raw_store_master',
  stgPos: 'staging.stg_pos_sales_clean',
  stgSessions: 'staging.stg_web_sessions',
  refCalendar: 'reference.ref_calendar',
  dimProduct: 'consumption.dim_product',
  curSales: 'curated.cur_sales',
  curCustomer: 'curated.cur_customer',
  customer360: 'lakehouse.silver_customer_360',
  martSales: 'consumption.mart_sales_daily',
  martCustomer: 'consumption.mart_customer_value',
  execExtract: 'bi.exec_dashboard_extract',
};

/** What lineage reaches outside the catalog, by the ids the jobs record. */
const X = {
  posFiles: 'sftp://pos-exports/daily_sales_*.csv',
  clickstream: 'kafka://web.clickstream.v2',
  weather: 'https://api.weatherhub.io/v3/daily',
  loyaltyExport: 'legacy.loyalty_export',
  partnerShare: 's3://partner-share/shopco/weekly_sales.parquet',
};

const LAYERS = [
  { id: 'landing', label: 'Landing', blurb: 'Files as they arrive' },
  { id: 'raw', label: 'Raw', blurb: 'Loaded as is' },
  { id: 'curated', label: 'Curated', blurb: 'Cleaned, joined and checked' },
  { id: 'consumption', label: 'Consumption', blurb: 'Ready for reports and apps' },
];

const ASSETS = [
  /* ---- landing ---- */
  asset('landing', 'landing_pos_daily_drop', {
    layer: 'landing',
    kind: ASSET_KIND.file,
    description: 'Store sales files as the POS system drops them, one CSV per store per day.',
    owner: 'Retail Data Platform',
    rows: '1.2m',
    updatedAt: '2h ago',
    source: 'POS exports (SFTP)',
    upstream: [X.posFiles],
    columns: cols(
      'store_id string',
      'txn_id string',
      'sku string',
      'qty string',
      'amount string',
      'txn_ts string',
      '_file_name string',
    ),
  }),

  /* ---- raw ---- */
  asset('raw', 'raw_pos_sales', {
    layer: 'raw',
    description: 'POS lines from the landing files, typed and loaded.',
    owner: 'Retail Data Platform',
    rows: '48.6m',
    updatedAt: '2h ago',
    job: 'pos_raw_load (Auto Loader)',
    upstream: [T.posDrop],
    columns: cols(
      'store_id string',
      'txn_id string',
      'sku string',
      'qty int',
      'amount decimal(12,2)',
      'txn_ts timestamp',
      '_loaded_at timestamp',
    ),
  }),
  asset('raw', 'raw_clickstream', {
    layer: 'raw',
    description: 'Web and app events read off the clickstream topic.',
    owner: 'Digital Analytics Eng',
    rows: '1.9b',
    updatedAt: '5m ago',
    source: 'Web clickstream (Kafka)',
    upstream: [X.clickstream],
    columns: cols(
      'event_id string',
      'session_id string',
      'customer_id string',
      'sku string',
      'event_type string',
      'event_ts timestamp',
    ),
  }),
  asset('raw', 'raw_loyalty_members', {
    layer: 'raw',
    description: 'Loyalty members from the legacy loyalty system’s nightly export.',
    owner: 'CRM Data',
    rows: '3.1m',
    updatedAt: '9h ago',
    source: 'Legacy loyalty system',
    upstream: [X.loyaltyExport],
    columns: cols(
      'member_id string',
      'email_hash string',
      'tier string',
      'joined_on date',
      'home_store_id string',
    ),
  }),
  asset('raw', 'raw_store_master', {
    layer: 'raw',
    description: 'Stores, regions and opening dates, uploaded by store operations.',
    owner: 'Store Ops',
    rows: '412',
    updatedAt: '3d ago',
    source: 'Store ops (manual upload)',
    columns: cols('store_id string', 'store_name string', 'region string', 'opened_on date'),
  }),

  /* ---- no layer set ---- */
  asset('staging', 'stg_pos_sales_clean', {
    description: 'POS lines deduplicated, with voids and test stores removed.',
    owner: 'Retail Data Eng',
    rows: '47.9m',
    updatedAt: '2h ago',
    health: HEALTH.failing,
    healthNote: '1 of 6 tests failing: negative quantities after returns',
    job: 'stg_pos_sales_clean (dbt model)',
    upstream: [T.rawPos],
    columns: cols(
      'txn_id string',
      'store_id string',
      'sku string',
      'qty int',
      'net_amount decimal(12,2)',
      'sold_on date',
    ),
  }),
  asset('staging', 'stg_web_sessions', {
    description: 'Click events rolled up into browsing sessions.',
    owner: 'Digital Analytics Eng',
    rows: '212m',
    updatedAt: '20m ago',
    job: 'stg_web_sessions (dbt model)',
    upstream: [T.rawClicks],
    columns: cols(
      'session_id string',
      'customer_id string',
      'started_at timestamp',
      'page_views int',
      'viewed_skus array<string>',
    ),
  }),
  asset('reference', 'ref_calendar', {
    description:
      'One row per day with its retail week and fiscal period, generated in the warehouse.',
    owner: 'Retail Data Eng',
    rows: '7.3k',
    updatedAt: '30d ago',
    job: 'ref_calendar (dbt seed)',
    columns: cols('calendar_date date', 'retail_week string', 'fiscal_period string'),
  }),

  /* ---- curated ---- */
  asset('curated', 'cur_sales', {
    layer: 'curated',
    description: 'Sales lines with their store, region, product category and retail week.',
    owner: 'Retail Data Eng',
    rows: '47.9m',
    updatedAt: '1h ago',
    job: 'cur_sales (dbt model)',
    upstream: [T.stgPos, T.rawStores, T.refCalendar, T.dimProduct],
    columns: cols(
      'txn_id string',
      'sold_on date',
      'retail_week string',
      'store_id string',
      'region string',
      'sku string',
      'category string',
      'qty int',
      'net_amount decimal(12,2)',
    ),
  }),
  asset('curated', 'cur_customer', {
    layer: 'curated',
    description: 'One record per customer: loyalty membership joined to web sessions.',
    owner: 'CRM Data',
    rows: '3.4m',
    updatedAt: '1h ago',
    job: 'cur_customer (dbt model)',
    upstream: [T.rawLoyalty, T.stgSessions],
    columns: cols(
      'customer_id string',
      'tier string',
      'home_store_id string',
      'joined_on date',
      'sessions_90d int',
      'last_seen_at timestamp',
    ),
  }),

  /* ---- a medallion layer this workspace doesn't list ---- */
  asset('lakehouse', 'silver_customer_360', {
    layer: LAYER.silver,
    description:
      'The customer profile rebuilt on the new medallion platform; migration in progress.',
    owner: 'CRM Data',
    rows: '3.4m',
    updatedAt: '1h ago',
    job: 'customer_360 (Lakeflow pipeline)',
    upstream: [T.curCustomer, T.stgSessions],
    columns: cols('customer_id string', 'tier string', 'sessions_90d int', 'top_viewed_sku string'),
  }),

  /* ---- consumption ---- */
  asset('consumption', 'dim_product', {
    layer: 'consumption',
    description: 'Products as the sales marts know them: SKU, name and category.',
    owner: 'Merchandising Analytics',
    rows: '86k',
    updatedAt: '6h ago',
    job: 'dim_product (dbt model)',
    upstream: [T.rawPos],
    columns: cols('sku string', 'product_name string', 'category string'),
  }),
  asset('consumption', 'mart_sales_daily', {
    layer: 'consumption',
    description: 'Daily sales by store and category, with the day’s weather.',
    owner: 'Merchandising Analytics',
    rows: '1.4m',
    updatedAt: '1h ago',
    job: 'mart_sales_daily (dbt model)',
    upstream: [T.curSales, X.weather],
    columns: cols(
      'sold_on date',
      'retail_week string',
      'store_id string',
      'region string',
      'category string',
      'units int',
      'net_sales decimal(14,2)',
      'avg_temp_c double',
    ),
  }),
  asset('consumption', 'mart_customer_value', {
    layer: 'consumption',
    description: 'Engagement and value segment per customer, for CRM targeting.',
    owner: 'CRM Data',
    rows: '3.4m',
    updatedAt: '1h ago',
    job: 'mart_customer_value (dbt model)',
    upstream: [T.customer360],
    columns: cols('customer_id string', 'tier string', 'sessions_90d int', 'value_segment string'),
  }),

  /* ---- no layer set, past the end ---- */
  asset('bi', 'exec_dashboard_extract', {
    kind: ASSET_KIND.view,
    description: 'The extract behind the executive dashboard.',
    owner: 'BI Team',
    rows: null,
    updatedAt: '1h ago',
    job: 'exec_dashboard (Tableau extract)',
    upstream: [T.martSales, T.martCustomer],
    columns: cols(
      'retail_week string',
      'region string',
      'net_sales decimal(14,2)',
      'high_value_customers int',
    ),
  }),
];

/**
 * What the lineage says about assets outside the catalog. The loyalty export
 * is missing on purpose: lineage names it as an input and nothing more.
 */
const EXTERNALS = [
  { id: X.posFiles, name: 'daily_sales_*.csv', kind: ASSET_KIND.file, location: X.posFiles },
  {
    id: X.clickstream,
    name: 'web.clickstream.v2',
    kind: ASSET_KIND.stream,
    location: X.clickstream,
  },
  { id: X.weather, name: 'WeatherHub daily API', kind: ASSET_KIND.api, location: X.weather },
  {
    id: X.partnerShare,
    name: 'weekly_sales.parquet',
    kind: ASSET_KIND.file,
    location: X.partnerShare,
    upstream: [T.martSales],
  },
];

/* ---- column lineage ---- */
const K = TRANSFORM;
const posDrop = columnsOf(T.posDrop);
const rawPos = columnsOf(T.rawPos);
const rawClicks = columnsOf(T.rawClicks);
const rawLoyalty = columnsOf(T.rawLoyalty);
const rawStores = columnsOf(T.rawStores);
const stgPos = columnsOf(T.stgPos);
const stgSessions = columnsOf(T.stgSessions);
const refCalendar = columnsOf(T.refCalendar);
const dimProduct = columnsOf(T.dimProduct);
const curSales = columnsOf(T.curSales);
const curCustomer = columnsOf(T.curCustomer);
const customer360 = columnsOf(T.customer360);
const martSales = columnsOf(T.martSales);
const martCustomer = columnsOf(T.martCustomer);

const PIM_JOIN = '\n-- JOIN pim_products pim ON pim.sku = p.sku';
const CALENDAR_JOIN = '\n-- JOIN ref_calendar c ON c.calendar_date = s.sold_on';
const STORE_JOIN = '\n-- JOIN raw_store_master st ON st.store_id = s.store_id';
const LAST_90_DAYS = 's.started_at >= current_date() - INTERVAL 90 DAYS';

const COLUMN_LINEAGE = {
  [T.rawPos]: {
    store_id: made(K.direct, 'f.store_id', posDrop('store_id')),
    txn_id: made(K.direct, 'f.txn_id', posDrop('txn_id')),
    sku: made(K.direct, 'f.sku', posDrop('sku')),
    qty: made(K.derived, 'CAST(f.qty AS INT)', posDrop('qty')),
    amount: made(K.derived, 'CAST(f.amount AS DECIMAL(12,2))', posDrop('amount')),
    txn_ts: made(K.derived, "to_timestamp(f.txn_ts, 'yyyy-MM-dd HH:mm:ss')", posDrop('txn_ts')),
    _loaded_at: made(K.system, 'current_timestamp()  -- when this batch was written'),
  },
  [T.stgPos]: {
    txn_id: made(K.direct, 'p.txn_id', rawPos('txn_id')),
    store_id: made(K.direct, 'p.store_id', rawPos('store_id')),
    sku: made(K.direct, 'p.sku', rawPos('sku')),
    qty: made(K.derived, 'ABS(p.qty)', rawPos('qty')),
    net_amount: made(
      K.derived,
      'CASE WHEN p.qty < 0 THEN -p.amount ELSE p.amount END',
      rawPos('amount'),
      rawPos('qty'),
    ),
    sold_on: made(K.derived, 'CAST(p.txn_ts AS DATE)', rawPos('txn_ts')),
  },
  [T.stgSessions]: {
    session_id: made(K.direct, 'c.session_id', rawClicks('session_id')),
    customer_id: made(K.aggregated, 'FIRST(c.customer_id, true)', rawClicks('customer_id')),
    started_at: made(K.aggregated, 'MIN(c.event_ts)', rawClicks('event_ts')),
    page_views: made(K.aggregated, "COUNT_IF(c.event_type = 'page_view')", rawClicks('event_type')),
    viewed_skus: made(K.aggregated, 'COLLECT_SET(c.sku)', rawClicks('sku')),
  },
  [T.refCalendar]: {
    calendar_date: made(K.constant, "explode(sequence(DATE'2010-01-01', DATE'2029-12-31'))"),
    retail_week: made(K.constant, "date_format(calendar_date, 'YYYY-ww')  -- 4-5-4 retail weeks"),
    fiscal_period: made(K.constant, "concat('FY', year(add_months(calendar_date, 11)))"),
  },
  [T.dimProduct]: {
    sku: made(K.aggregated, 'DISTINCT p.sku', rawPos('sku')),
    product_name: made(K.lookup, `pim.product_name${PIM_JOIN}`, rawPos('sku')),
    category: made(K.lookup, `pim.category${PIM_JOIN}`, rawPos('sku')),
  },
  [T.curSales]: {
    txn_id: made(K.direct, 's.txn_id', stgPos('txn_id')),
    sold_on: made(K.direct, 's.sold_on', stgPos('sold_on')),
    retail_week: made(
      K.lookup,
      `c.retail_week${CALENDAR_JOIN}`,
      refCalendar('retail_week'),
      stgPos('sold_on'),
    ),
    store_id: made(K.direct, 's.store_id', stgPos('store_id')),
    region: made(K.lookup, `st.region${STORE_JOIN}`, rawStores('region'), stgPos('store_id')),
    sku: made(K.direct, 's.sku', stgPos('sku')),
    category: made(
      K.lookup,
      'd.category\n-- JOIN dim_product d ON d.sku = s.sku',
      dimProduct('category'),
      stgPos('sku'),
    ),
    qty: made(K.direct, 's.qty', stgPos('qty')),
    net_amount: made(K.direct, 's.net_amount', stgPos('net_amount')),
  },
  [T.curCustomer]: {
    customer_id: made(K.renamed, 'm.member_id AS customer_id', rawLoyalty('member_id')),
    tier: made(K.direct, 'm.tier', rawLoyalty('tier')),
    home_store_id: made(K.direct, 'm.home_store_id', rawLoyalty('home_store_id')),
    joined_on: made(K.direct, 'm.joined_on', rawLoyalty('joined_on')),
    sessions_90d: made(
      K.aggregated,
      `COUNT(s.session_id) FILTER (WHERE ${LAST_90_DAYS})`,
      stgSessions('session_id'),
      stgSessions('started_at'),
    ),
    last_seen_at: made(K.aggregated, 'MAX(s.started_at)', stgSessions('started_at')),
  },
  [T.customer360]: {
    customer_id: made(K.direct, 'c.customer_id', curCustomer('customer_id')),
    tier: made(K.direct, 'c.tier', curCustomer('tier')),
    sessions_90d: made(K.direct, 'c.sessions_90d', curCustomer('sessions_90d')),
    top_viewed_sku: made(K.aggregated, 'MODE(EXPLODE(s.viewed_skus))', stgSessions('viewed_skus')),
  },
  [T.martSales]: {
    sold_on: made(K.direct, 's.sold_on', curSales('sold_on')),
    retail_week: made(K.direct, 's.retail_week', curSales('retail_week')),
    store_id: made(K.direct, 's.store_id', curSales('store_id')),
    region: made(K.direct, 's.region', curSales('region')),
    category: made(K.direct, 's.category', curSales('category')),
    units: made(K.aggregated, 'SUM(s.qty)', curSales('qty')),
    net_sales: made(K.aggregated, 'SUM(s.net_amount)', curSales('net_amount')),
    avg_temp_c: {
      ...made(
        K.lookup,
        'w.avg_temp_c\n-- JOIN weatherhub_daily w ON w.region = s.region AND w.day = s.sold_on',
      ),
      outside: 'the WeatherHub daily API',
    },
  },
  [T.martCustomer]: {
    customer_id: made(K.direct, 'c.customer_id', customer360('customer_id')),
    tier: made(K.direct, 'c.tier', customer360('tier')),
    sessions_90d: made(K.direct, 'c.sessions_90d', customer360('sessions_90d')),
    value_segment: made(
      K.derived,
      "CASE WHEN c.sessions_90d >= 20 THEN 'high' WHEN c.sessions_90d >= 5 THEN 'mid' ELSE 'low' END",
      customer360('sessions_90d'),
    ),
  },
  [T.execExtract]: {
    retail_week: made(K.direct, 'm.retail_week', martSales('retail_week')),
    region: made(K.direct, 'm.region', martSales('region')),
    net_sales: made(K.aggregated, 'SUM(m.net_sales)', martSales('net_sales')),
    high_value_customers: made(
      K.aggregated,
      "COUNT_IF(v.value_segment = 'high')",
      martCustomer('value_segment'),
    ),
  },
};

export const RETAIL_WORKSPACE = {
  id: 'retail',
  label: 'Retail',
  syncedAt: '2026-11-25T23:40:00',
  layers: LAYERS,
  lineage: { assets: withDerivations(ASSETS, COLUMN_LINEAGE), externals: EXTERNALS },
};
