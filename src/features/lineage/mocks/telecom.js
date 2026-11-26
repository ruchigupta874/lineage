import { ASSET_KIND, HEALTH, LAYER, TRANSFORM } from '../constants';
import { cols, columnsOf as of, made, withDerivations } from './helpers';

/**
 * The Telecom workspace: a big catalog, to see the canvas at scale.
 *
 * About 75 assets and a longest path of 22 hops: network records from the
 * mediation stream through parsing, de-duplication, rating, enrichment,
 * sessions and daily and monthly usage, into churn features, a model
 * trained outside the catalog, scores, retention targets, a weekly report
 * and the exports that leave the building. Billing, CRM, customer care,
 * network operations and roaming feed in along the way. Most tables carry
 * 20 to 30 columns, every one with its column lineage.
 *
 * Layers: landing, bronze, silver, gold, features and serving, with
 * unclassified staging (`int_*`), reference and ML steps between them, and a
 * dozen assets outside the catalog — streams, files, APIs, the model, a CRM
 * and an S3 share on the way out, and one feed lineage names but nothing
 * describes.
 *
 * Tables are written with three builders rather than column by column:
 * `source` spells out a table that arrives from outside, `derive` carries a
 * table's columns over from its main input and then drops, renames or adds,
 * and `rollup` groups an input by keys and aggregates measures. Each column
 * still gets its own derivation. A check at the foot throws if any column
 * reads something that isn't a column of one of its table's inputs, so a
 * slip here fails loudly rather than leaving a hole in a trace.
 */
const CATALOG = 'telco';
const K = TRANSFORM;

const registry = new Map();
const lineage = {};

const fail = (message) => {
  throw new Error(`Telecom fixture: ${message}`);
};
const tableOf = (columnId) => columnId.split('.').slice(0, 2).join('.');
const nameOf = (columnId) => columnId.split('.').slice(2).join('.');

/** The type of a column, given its id (`schema.table.column`). */
function typeOf(columnId) {
  const column = registry.get(tableOf(columnId))?.columns.find((c) => c.name === nameOf(columnId));
  if (!column) fail(`no column ${columnId}`);
  return column.type;
}

function register(asset, derivations) {
  const names = asset.columns.map((column) => column.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) fail(`${asset.id} has two columns called ${repeated}`);
  registry.set(asset.id, asset);
  if (derivations) lineage[asset.id] = derivations;
  return asset.id;
}

const tableMeta = (layer, schema, name, fields) => ({
  id: `${schema}.${name}`,
  fqn: `${CATALOG}.${schema}.${name}`,
  name,
  layer,
  kind: ASSET_KIND.table,
  health: HEALTH.healthy,
  upstream: [],
  ...fields,
});

/** A table loaded from outside the pipelines: its schema spelled out, its columns raw. */
function source(layer, schema, name, { columns, ...fields }) {
  return register({ ...tableMeta(layer, schema, name, fields), columns: cols(...columns) });
}

/** A table generated in the warehouse from nothing: every column a constant. */
function generated(layer, schema, name, { columns, logic, ...fields }) {
  const asset = { ...tableMeta(layer, schema, name, fields), columns: cols(...columns) };
  const derivations = Object.fromEntries(
    asset.columns.map((column) => [column.name, made(K.constant, logic)]),
  );
  return register(asset, derivations);
}

/**
 * One made column. `[type, kind, logic, ...inputs]`: a bare input is a column
 * of the main input `from`, anything else a column id; a null type is the
 * first input's. Or `{ type, kind, logic, outside }` for a value that comes
 * from outside the catalog, so no column feeds it.
 */
function resolve(from, entry) {
  if (!Array.isArray(entry)) {
    return {
      type: entry.type,
      derivation: { ...made(entry.kind, entry.logic), outside: entry.outside },
    };
  }
  const [type, kind, logic, ...inputs] = entry;
  const ids = inputs.map((input) => (input.includes('.') ? input : `${from}.${input}`));
  ids.forEach(typeOf);
  return { type: type ?? typeOf(ids[0]), derivation: made(kind, logic, ...ids) };
}

const checkNames = (from, names) => names.forEach((name) => typeOf(`${from}.${name}`));

/**
 * A table built from one main input, `from`, and maybe others (`also`).
 * Every column of `from` is carried over as it was — all of them, or only
 * `keep` — unless dropped or renamed; `add` makes new columns, or remakes one
 * of the same name.
 */
function derive(
  layer,
  schema,
  name,
  { from, also = [], keep = null, drop = [], rename = {}, add = {}, ...fields },
) {
  checkNames(from, [...(keep ?? []), ...drop, ...Object.keys(rename)]);
  const columns = [];
  const derivations = {};
  registry
    .get(from)
    .columns.filter((column) => (keep ? keep.includes(column.name) : !drop.includes(column.name)))
    .forEach((column) => {
      const to = rename[column.name] ?? column.name;
      columns.push({ name: to, type: column.type });
      derivations[to] =
        to === column.name
          ? made(K.direct, `p.${column.name}`, `${from}.${column.name}`)
          : made(K.renamed, `p.${column.name} AS ${to}`, `${from}.${column.name}`);
    });
  Object.entries(add).forEach(([to, entry]) => {
    const { type, derivation } = resolve(from, entry);
    const at = columns.findIndex((column) => column.name === to);
    if (at === -1) columns.push({ name: to, type });
    else columns[at] = { name: to, type };
    derivations[to] = derivation;
  });
  return register(
    { ...tableMeta(layer, schema, name, fields), upstream: [from, ...also], columns },
    derivations,
  );
}

/**
 * A table that rolls `from` up: derived `keys` first, then the columns named
 * in `by` kept as keys, then `measures`.
 */
function rollup(
  layer,
  schema,
  name,
  { from, also = [], keys = {}, by = [], measures = {}, ...fields },
) {
  const columns = [];
  const derivations = {};
  const put = (to, { type, derivation }) => {
    columns.push({ name: to, type });
    derivations[to] = derivation;
  };
  Object.entries(keys).forEach(([to, entry]) => put(to, resolve(from, entry)));
  by.forEach((key) =>
    put(key, {
      type: typeOf(`${from}.${key}`),
      derivation: made(K.direct, `p.${key}`, `${from}.${key}`),
    }),
  );
  Object.entries(measures).forEach(([to, entry]) => put(to, resolve(from, entry)));
  return register(
    { ...tableMeta(layer, schema, name, fields), upstream: [from, ...also], columns },
    derivations,
  );
}

/* ---- shorthand for the common measures ---- */
const sum = (column, type = 'decimal(14,2)') => [type, K.aggregated, `SUM(p.${column})`, column];
const avg = (column) => ['double', K.aggregated, `AVG(p.${column})`, column];
const max = (column) => [null, K.aggregated, `MAX(p.${column})`, column];
const min = (column) => [null, K.aggregated, `MIN(p.${column})`, column];
const count = (column) => ['int', K.aggregated, `COUNT(p.${column})`, column];
const distinct = (column) => ['int', K.aggregated, `COUNT(DISTINCT p.${column})`, column];
const countIf = (condition, ...columns) => [
  'int',
  K.aggregated,
  `COUNT_IF(${condition})`,
  ...columns,
];
const latest = (column, by) => [null, K.aggregated, `MAX_BY(p.${column}, p.${by})`, column, by];
/** A column looked up from another table: `alias.column`, the join on the first lookup of a table. */
const lookup = (table, alias, column, join = '', ...keys) => [
  null,
  K.lookup,
  `${alias}.${column}${join}`,
  of(table)(column),
  ...keys,
];
const LOADED = ['timestamp', K.system, 'current_timestamp()  -- when this batch was written'];

/* ---- outside the catalog ---- */
const X = {
  cdrStream: 'kafka://network.cdr.v3',
  kpiStream: 'kafka://network.kpi.v1',
  billingFiles: 'sftp://billing-exports/invoices_*.csv',
  paymentsApi: 'https://api.paygate.io/v2/settlements',
  crmApi: 'https://crm.telco.internal/api/v1/accounts',
  careStream: 'kafka://care.tickets.v1',
  ivrFiles: 'sftp://ivr-vendor/calls_*.json',
  npsApi: 'https://api.surveyly.com/v3/responses',
  roamingFeed: 'legacy.roaming_partner_feed',
  churnModel: 'mlflow://models/churn_xgb/Production',
  crmTargets: 'salesforce://Retention_Target__c',
  execShare: 's3://exec-share/telco/retention_weekly.parquet',
};

/* ================================================================ landing */

const cdrBatches = source('landing', 'landing', 'landing_cdr_batches', {
  kind: ASSET_KIND.file,
  description: 'Call, SMS and data records from network mediation, landed in 5-minute batches.',
  owner: 'Network Data Platform',
  rows: '2.4b',
  updatedAt: '4m ago',
  source: 'Network mediation (Kafka)',
  upstream: [X.cdrStream],
  columns: [
    'record_id string',
    'event_ts string',
    'msisdn string',
    'imsi string',
    'imei string',
    'other_party string',
    'call_type string',
    'direction string',
    'duration_sec string',
    'data_up_kb string',
    'data_down_kb string',
    'cell_id string',
    'lac string',
    'tac string',
    'rat string',
    'roaming_flag string',
    'partner_plmn string',
    'termination_cause string',
    'charge_code string',
    'service_code string',
    'apn string',
    'qos_class string',
    'record_seq string',
    'switch_id string',
    '_batch_id string',
    '_received_at string',
  ],
});

const billingExtract = source('landing', 'landing', 'landing_billing_extract', {
  kind: ASSET_KIND.file,
  description: 'Invoice lines the billing system exports every night.',
  owner: 'Finance Data Platform',
  rows: '96.2m',
  updatedAt: '7h ago',
  source: 'Billing system exports (SFTP)',
  upstream: [X.billingFiles],
  columns: [
    'invoice_no string',
    'account_no string',
    'msisdn string',
    'bill_cycle string',
    'issue_date string',
    'due_date string',
    'line_no string',
    'charge_type string',
    'charge_code string',
    'description string',
    'quantity string',
    'unit_price string',
    'amount string',
    'tax_amount string',
    'discount_amount string',
    'currency string',
    'plan_code string',
    'period_start string',
    'period_end string',
    'status string',
    '_file_name string',
    '_received_at string',
  ],
});

/* ================================================================ bronze */

const cdrEvents = derive(LAYER.bronze, 'bronze', 'bronze_cdr_events', {
  from: cdrBatches,
  description: 'Every network event record, typed and loaded as it came.',
  owner: 'Network Data Platform',
  rows: '2.4b',
  updatedAt: '5m ago',
  job: 'cdr_bronze_load (Auto Loader)',
  add: {
    event_ts: ['timestamp', K.derived, "to_timestamp(p.event_ts, 'yyyyMMddHHmmss')", 'event_ts'],
    duration_sec: ['int', K.derived, 'CAST(p.duration_sec AS INT)', 'duration_sec'],
    data_up_kb: ['bigint', K.derived, 'CAST(p.data_up_kb AS BIGINT)', 'data_up_kb'],
    data_down_kb: ['bigint', K.derived, 'CAST(p.data_down_kb AS BIGINT)', 'data_down_kb'],
    roaming_flag: ['boolean', K.derived, "p.roaming_flag = 'Y'", 'roaming_flag'],
    record_seq: ['bigint', K.derived, 'CAST(p.record_seq AS BIGINT)', 'record_seq'],
    _loaded_at: LOADED,
  },
});

const billingLines = derive(LAYER.bronze, 'bronze', 'bronze_billing_lines', {
  from: billingExtract,
  description: 'Invoice lines from the billing exports, typed.',
  owner: 'Finance Data Platform',
  rows: '96.2m',
  updatedAt: '7h ago',
  job: 'billing_bronze_load (Auto Loader)',
  add: {
    issue_date: ['date', K.derived, 'to_date(p.issue_date)', 'issue_date'],
    due_date: ['date', K.derived, 'to_date(p.due_date)', 'due_date'],
    line_no: ['int', K.derived, 'CAST(p.line_no AS INT)', 'line_no'],
    quantity: ['decimal(12,3)', K.derived, 'CAST(p.quantity AS DECIMAL(12,3))', 'quantity'],
    unit_price: ['decimal(12,4)', K.derived, 'CAST(p.unit_price AS DECIMAL(12,4))', 'unit_price'],
    amount: ['decimal(14,2)', K.derived, 'CAST(p.amount AS DECIMAL(14,2))', 'amount'],
    tax_amount: ['decimal(14,2)', K.derived, 'CAST(p.tax_amount AS DECIMAL(14,2))', 'tax_amount'],
    discount_amount: [
      'decimal(14,2)',
      K.derived,
      'CAST(p.discount_amount AS DECIMAL(14,2))',
      'discount_amount',
    ],
    period_start: ['date', K.derived, 'to_date(p.period_start)', 'period_start'],
    period_end: ['date', K.derived, 'to_date(p.period_end)', 'period_end'],
    _loaded_at: LOADED,
  },
});

const bronzePayments = source(LAYER.bronze, 'bronze', 'bronze_payments', {
  description: 'Card and direct-debit settlements from the payment gateway.',
  owner: 'Finance Data Platform',
  rows: '41.8m',
  updatedAt: '1h ago',
  source: 'PayGate settlements API',
  upstream: [X.paymentsApi],
  columns: [
    'payment_id string',
    'account_no string',
    'invoice_no string',
    'paid_at timestamp',
    'amount decimal(14,2)',
    'currency string',
    'method string',
    'card_brand string',
    'gateway_ref string',
    'status string',
    'failure_code string',
    'settlement_date date',
    'fee_amount decimal(10,2)',
    'chargeback_flag boolean',
    'refunded_amount decimal(14,2)',
    'channel string',
    'region_code string',
    'payer_country string',
    '_ingested_at timestamp',
    '_source_page int',
  ],
});

const crmAccounts = source(LAYER.bronze, 'bronze', 'bronze_crm_accounts', {
  description: 'Customer accounts as the CRM holds them.',
  owner: 'Customer Data Platform',
  rows: '8.9m',
  updatedAt: '2h ago',
  source: 'CRM accounts API',
  upstream: [X.crmApi],
  columns: [
    'account_no string',
    'customer_id string',
    'account_type string',
    'segment string',
    'status string',
    'created_at timestamp',
    'closed_at timestamp',
    'first_name string',
    'last_name string',
    'company_name string',
    'email string',
    'phone string',
    'date_of_birth date',
    'gender string',
    'street string',
    'city string',
    'postcode string',
    'region_code string',
    'country string',
    'credit_class string',
    'preferred_language string',
    'marketing_opt_in boolean',
    'owner_team string',
    '_ingested_at timestamp',
  ],
});

const bronzeSubscriptions = source(LAYER.bronze, 'bronze', 'bronze_subscriptions', {
  description: 'Every mobile line: plan, contract, device and how it was sold.',
  owner: 'Customer Data Platform',
  rows: '14.6m',
  updatedAt: '2h ago',
  source: 'CRM accounts API',
  upstream: [X.crmApi],
  columns: [
    'subscription_id string',
    'account_no string',
    'msisdn string',
    'imsi string',
    'plan_code string',
    'status string',
    'activated_at timestamp',
    'deactivated_at timestamp',
    'contract_start date',
    'contract_end date',
    'contract_months int',
    'device_model string',
    'device_financed boolean',
    'sim_type string',
    'port_in_flag boolean',
    'port_in_operator string',
    'sales_channel string',
    'dealer_code string',
    'monthly_fee decimal(10,2)',
    'discount_pct double',
    'addons string',
    '_ingested_at timestamp',
  ],
});

const planCatalog = source(LAYER.bronze, 'bronze', 'bronze_plan_catalog', {
  description: 'Every plan sold, past and present, with its allowances and price.',
  owner: 'Product Marketing',
  rows: '312',
  updatedAt: '5d ago',
  source: 'Product catalog (manual upload)',
  columns: [
    'plan_code string',
    'plan_name string',
    'plan_family string',
    'plan_type string',
    'data_allowance_gb double',
    'voice_minutes int',
    'sms_count int',
    'roaming_included boolean',
    'five_g_enabled boolean',
    'monthly_fee decimal(10,2)',
    'setup_fee decimal(10,2)',
    'contract_months int',
    'launched_on date',
    'retired_on date',
    'target_segment string',
    'speed_cap_mbps int',
    'fair_use_gb double',
    'bundle_code string',
    'currency string',
    '_uploaded_at timestamp',
  ],
});

const tariffs = source(LAYER.bronze, 'bronze', 'bronze_tariffs', {
  description: 'Rates per charge code, zone and time band, from the rating engine.',
  owner: 'Revenue Assurance',
  rows: '48.2k',
  updatedAt: '2d ago',
  health: HEALTH.stale,
  healthNote: 'Rating engine export 2 days old; rates may lag a price change',
  source: 'Rating engine export',
  columns: [
    'tariff_id string',
    'charge_code string',
    'service_code string',
    'tariff_zone string',
    'rat string',
    'peak_flag boolean',
    'rate_per_min decimal(10,4)',
    'rate_per_mb decimal(10,6)',
    'rate_per_sms decimal(10,4)',
    'setup_charge decimal(10,4)',
    'currency string',
    'roaming_zone string',
    'partner_plmn string',
    'valid_from date',
    'valid_to date',
    'plan_family string',
    'rounding_rule string',
    'min_charge decimal(10,4)',
    'tax_code string',
    '_ingested_at timestamp',
  ],
});

const bronzeCellSites = source(LAYER.bronze, 'bronze', 'bronze_cell_sites', {
  description: 'Every cell and the site it is on, from network inventory.',
  owner: 'Network Engineering',
  rows: '61.4k',
  updatedAt: '1d ago',
  source: 'Network inventory (Atoll)',
  columns: [
    'cell_id string',
    'site_id string',
    'site_name string',
    'lac string',
    'tac string',
    'rat string',
    'band string',
    'azimuth int',
    'latitude double',
    'longitude double',
    'region_code string',
    'city string',
    'postcode string',
    'vendor string',
    'sector int',
    'max_capacity_mbps int',
    'commissioned_on date',
    'status string',
    'backhaul_type string',
    'tower_owner string',
    'indoor_flag boolean',
    '_ingested_at timestamp',
  ],
});

const networkKpis = source(LAYER.bronze, 'bronze', 'bronze_network_kpis', {
  description: 'Per-cell performance counters, every 15 minutes.',
  owner: 'Network Engineering',
  rows: '1.1b',
  updatedAt: '15m ago',
  source: 'Network KPI stream (Kafka)',
  upstream: [X.kpiStream],
  columns: [
    'kpi_ts timestamp',
    'cell_id string',
    'rat string',
    'availability_pct double',
    'drop_rate_pct double',
    'setup_success_pct double',
    'handover_success_pct double',
    'prb_util_pct double',
    'throughput_dl_mbps double',
    'throughput_ul_mbps double',
    'latency_ms double',
    'jitter_ms double',
    'packet_loss_pct double',
    'active_users int',
    'rrc_attempts int',
    'rrc_failures int',
    'volte_drop_pct double',
    'cqi_avg double',
    'rsrp_avg double',
    'sinr_avg double',
    'alarm_count int',
    '_ingested_at timestamp',
  ],
});

const careTickets = source(LAYER.bronze, 'bronze', 'bronze_care_tickets', {
  description: 'Customer care tickets from every channel.',
  owner: 'Customer Care Analytics',
  rows: '22.3m',
  updatedAt: '10m ago',
  source: 'Care tickets (Kafka)',
  upstream: [X.careStream],
  columns: [
    'ticket_id string',
    'account_no string',
    'msisdn string',
    'opened_at timestamp',
    'closed_at timestamp',
    'channel string',
    'category string',
    'subcategory string',
    'priority string',
    'status string',
    'agent_id string',
    'team string',
    'first_response_min int',
    'resolution_min int',
    'reopened_count int',
    'escalated boolean',
    'sentiment_score double',
    'root_cause string',
    'compensation_amount decimal(10,2)',
    'related_cell_id string',
    'survey_sent boolean',
    '_ingested_at timestamp',
  ],
});

const ivrCalls = source(LAYER.bronze, 'bronze', 'bronze_ivr_calls', {
  description: 'Calls into the IVR: the menus taken, and whether they reached an agent.',
  owner: 'Customer Care Analytics',
  rows: '57.0m',
  updatedAt: '3h ago',
  source: 'IVR vendor (SFTP)',
  upstream: [X.ivrFiles],
  columns: [
    'call_id string',
    'msisdn string',
    'started_at timestamp',
    'ended_at timestamp',
    'duration_sec int',
    'entry_menu string',
    'exit_menu string',
    'intent string',
    'self_served boolean',
    'transferred_to_agent boolean',
    'queue_wait_sec int',
    'abandoned boolean',
    'language string',
    'authenticated boolean',
    'repeat_call_7d boolean',
    'dtmf_path string',
    'asr_confidence double',
    'outcome string',
    'ivr_version string',
    '_ingested_at timestamp',
  ],
});

const npsSurveys = source(LAYER.bronze, 'bronze', 'bronze_nps_surveys', {
  description: 'NPS survey responses, with what the customer wrote.',
  owner: 'Customer Care Analytics',
  rows: '3.2m',
  updatedAt: '6h ago',
  source: 'Surveyly NPS API',
  upstream: [X.npsApi],
  columns: [
    'response_id string',
    'account_no string',
    'msisdn string',
    'survey_type string',
    'sent_at timestamp',
    'responded_at timestamp',
    'score int',
    'category string',
    'verbatim string',
    'touchpoint string',
    'ticket_id string',
    'channel string',
    'language string',
    'sentiment string',
    'follow_up_requested boolean',
    'region_code string',
    'device_type string',
    'plan_code string',
    'campaign_code string',
    '_ingested_at timestamp',
  ],
});

const roamingPartners = source(LAYER.bronze, 'bronze', 'bronze_roaming_partners', {
  description: 'Roaming partners and the wholesale rates agreed with each.',
  owner: 'Wholesale & Roaming',
  rows: '684',
  updatedAt: '9d ago',
  source: 'Legacy roaming partner feed',
  upstream: [X.roamingFeed],
  columns: [
    'partner_plmn string',
    'partner_name string',
    'country string',
    'mcc string',
    'mnc string',
    'roaming_zone string',
    'agreement_id string',
    'agreement_start date',
    'agreement_end date',
    'rate_voice_per_min decimal(10,4)',
    'rate_data_per_mb decimal(10,6)',
    'rate_sms decimal(10,4)',
    'currency string',
    'tap_version string',
    'steering_priority int',
    'volte_supported boolean',
    'five_g_supported boolean',
    'settlement_cycle string',
    'status string',
    '_ingested_at timestamp',
  ],
});

/* ================================================================ reference (no layer) */

const calendar = generated(null, 'reference', 'ref_calendar', {
  description: 'One row per day: weeks, months, fiscal periods, holidays and bill cycles.',
  owner: 'Data Platform',
  rows: '11.0k',
  updatedAt: '30d ago',
  job: 'ref_calendar (dbt seed)',
  logic: "explode(sequence(DATE'2000-01-01', DATE'2029-12-31'))  -- ref_calendar seed",
  columns: [
    'calendar_date date',
    'day_of_week int',
    'day_name string',
    'is_weekend boolean',
    'is_holiday boolean',
    'holiday_name string',
    'week_start date',
    'week_of_year int',
    'month_start date',
    'month_name string',
    'quarter string',
    'year int',
    'fiscal_week int',
    'fiscal_month int',
    'fiscal_quarter string',
    'fiscal_year int',
    'bill_cycle_day int',
    'is_month_end boolean',
    'days_in_month int',
    'season string',
  ],
});

const geoRegions = generated(null, 'reference', 'ref_geo_regions', {
  description: 'Regions with their demographics, sales and network territories.',
  owner: 'Data Platform',
  rows: '214',
  updatedAt: '60d ago',
  job: 'ref_geo_regions (dbt seed)',
  logic: '-- ref_geo_regions seed, from the national statistics office release',
  columns: [
    'region_code string',
    'region_name string',
    'country string',
    'country_code string',
    'area string',
    'timezone string',
    'population bigint',
    'households bigint',
    'urban_pct double',
    'median_income decimal(12,2)',
    'sales_region string',
    'network_region string',
    'regulator_zone string',
    'latitude double',
    'longitude double',
    'coverage_target_pct double',
    'market_share_pct double',
    'competitor_count int',
    'priority_tier string',
    'valid_from date',
  ],
});

/* ================================================================ staging (no layer) */

const cdrParsed = derive(null, 'staging', 'int_cdr_parsed', {
  from: cdrEvents,
  description: 'Records parsed: event date, E.164 numbers, data volumes.',
  owner: 'Network Data Platform',
  rows: '2.4b',
  updatedAt: '6m ago',
  job: 'int_cdr_parsed (Spark job)',
  drop: ['_batch_id', '_received_at', '_loaded_at'],
  add: {
    event_date: ['date', K.derived, 'CAST(p.event_ts AS DATE)', 'event_ts'],
    msisdn_e164: [
      'string',
      K.derived,
      "concat('+', regexp_replace(p.msisdn, '^00', ''))",
      'msisdn',
    ],
    is_data: ['boolean', K.derived, "p.call_type = 'DATA'", 'call_type'],
    total_kb: ['bigint', K.derived, 'p.data_up_kb + p.data_down_kb', 'data_up_kb', 'data_down_kb'],
  },
});

const cdrDeduped = derive(null, 'staging', 'int_cdr_deduped', {
  from: cdrParsed,
  description: 'Duplicate records from mediation retries removed.',
  owner: 'Network Data Platform',
  rows: '2.3b',
  updatedAt: '7m ago',
  job: 'int_cdr_deduped (Spark job)',
  drop: ['record_seq', 'switch_id'],
  add: {
    dedup_key: [
      'string',
      K.derived,
      "sha2(concat_ws('|', p.record_id, p.event_ts, p.msisdn), 256)",
      'record_id',
      'event_ts',
      'msisdn',
    ],
    dup_count: ['int', K.aggregated, 'COUNT(*) OVER (PARTITION BY dedup_key)', 'record_id'],
  },
});

const billingClassified = derive(null, 'staging', 'int_billing_lines_classified', {
  from: billingLines,
  description: 'Invoice lines sorted into recurring, usage, one-off and adjustment charges.',
  owner: 'Finance Data Eng',
  rows: '96.2m',
  updatedAt: '6h ago',
  job: 'int_billing_lines_classified (dbt model)',
  drop: ['_file_name', '_received_at', '_loaded_at'],
  add: {
    charge_category: [
      'string',
      K.derived,
      "CASE WHEN p.charge_type IN ('RC', 'SUB') THEN 'RECURRING' WHEN p.charge_type = 'USG' THEN 'USAGE' WHEN p.charge_type = 'ADJ' THEN 'ADJUSTMENT' ELSE 'ONE_OFF' END",
      'charge_type',
    ],
    is_recurring: ['boolean', K.derived, "p.charge_type IN ('RC', 'SUB')", 'charge_type'],
    is_usage: ['boolean', K.derived, "p.charge_type = 'USG'", 'charge_type'],
    net_amount: [
      'decimal(14,2)',
      K.derived,
      'p.amount - p.discount_amount',
      'amount',
      'discount_amount',
    ],
  },
});

const accountMerge = derive(null, 'staging', 'int_account_merge', {
  from: crmAccounts,
  also: [bronzeSubscriptions],
  description: 'CRM accounts matched into one record per real customer.',
  owner: 'Customer Data Platform',
  rows: '8.4m',
  updatedAt: '2h ago',
  health: HEALTH.failing,
  healthNote: 'Match rate fell to 88% after the CRM migration; 3 of 9 tests failing',
  job: 'account_match (Python job)',
  drop: ['owner_team', '_ingested_at'],
  add: {
    golden_customer_id: [
      'string',
      K.derived,
      'COALESCE(m.cluster_id, p.customer_id)  -- probabilistic match on name, birth date and postcode',
      'customer_id',
      'first_name',
      'last_name',
      'date_of_birth',
      'postcode',
    ],
    match_confidence: ['double', K.derived, 'm.score', 'first_name', 'last_name', 'date_of_birth'],
    duplicate_of: [
      'string',
      K.derived,
      'CASE WHEN m.rank > 1 THEN m.cluster_id END',
      'customer_id',
    ],
    line_count: [
      'int',
      K.aggregated,
      'COUNT(s.subscription_id)\n-- JOIN bronze_subscriptions s ON s.account_no = p.account_no',
      of(bronzeSubscriptions)('subscription_id'),
    ],
  },
});

const careSessions = derive(null, 'staging', 'int_care_sessions', {
  from: careTickets,
  also: [ivrCalls],
  description: 'Tickets joined to the IVR call that led to them.',
  owner: 'Customer Care Analytics',
  rows: '22.3m',
  updatedAt: '12m ago',
  job: 'int_care_sessions (dbt model)',
  drop: ['survey_sent', '_ingested_at'],
  add: {
    ivr_call_id: lookup(
      ivrCalls,
      'i',
      'call_id',
      '\n-- LEFT JOIN bronze_ivr_calls i ON i.msisdn = p.msisdn\n--   AND i.ended_at BETWEEN p.opened_at - INTERVAL 30 MINUTES AND p.opened_at',
      'msisdn',
      'opened_at',
    ),
    ivr_intent: lookup(ivrCalls, 'i', 'intent'),
    ivr_self_served: lookup(ivrCalls, 'i', 'self_served'),
    queue_wait_sec: lookup(ivrCalls, 'i', 'queue_wait_sec'),
    repeat_call_7d: lookup(ivrCalls, 'i', 'repeat_call_7d'),
  },
});

/* ================================================================ silver */

const GEO_JOIN = '\n-- JOIN ref_geo_regions g ON g.region_code = p.region_code';
const PLAN_JOIN = '\n-- JOIN bronze_plan_catalog pc ON pc.plan_code = p.plan_code';

const cellSites = derive(LAYER.silver, 'silver', 'silver_cell_sites', {
  from: bronzeCellSites,
  also: [geoRegions],
  description: 'Cells and sites, cleaned, with their region.',
  owner: 'Network Engineering',
  rows: '58.9k',
  updatedAt: '1d ago',
  job: 'network_ref_silver (Lakeflow pipeline)',
  drop: ['azimuth', 'sector', '_ingested_at'],
  add: {
    region_name: lookup(geoRegions, 'g', 'region_name', GEO_JOIN, 'region_code'),
    network_region: lookup(geoRegions, 'g', 'network_region'),
    _loaded_at: LOADED,
  },
});

const subscriptions = derive(LAYER.silver, 'silver', 'silver_subscriptions', {
  from: bronzeSubscriptions,
  also: [planCatalog],
  description: 'Every line with its plan spelled out and where it stands on its contract.',
  owner: 'Customer Data Platform',
  rows: '14.6m',
  updatedAt: '2h ago',
  job: 'customer_silver (Lakeflow pipeline)',
  drop: ['dealer_code', '_ingested_at'],
  add: {
    plan_name: lookup(planCatalog, 'pc', 'plan_name', PLAN_JOIN, 'plan_code'),
    plan_family: lookup(planCatalog, 'pc', 'plan_family'),
    data_allowance_gb: lookup(planCatalog, 'pc', 'data_allowance_gb'),
    five_g_enabled: lookup(planCatalog, 'pc', 'five_g_enabled'),
    list_fee: [
      'decimal(10,2)',
      K.lookup,
      'pc.monthly_fee AS list_fee',
      of(planCatalog)('monthly_fee'),
    ],
    months_to_contract_end: [
      'int',
      K.derived,
      'months_between(p.contract_end, current_date())',
      'contract_end',
    ],
    is_active: [
      'boolean',
      K.derived,
      "p.status = 'ACTIVE' AND p.deactivated_at IS NULL",
      'status',
      'deactivated_at',
    ],
    _loaded_at: LOADED,
  },
});

const cdrStandardized = derive(LAYER.silver, 'silver', 'silver_cdr_standardized', {
  from: cdrDeduped,
  description: 'One row per network event, named and typed to the data standard.',
  owner: 'Network Data Eng',
  rows: '2.3b',
  updatedAt: '8m ago',
  job: 'cdr_silver (Lakeflow pipeline)',
  drop: ['msisdn', 'dup_count'],
  rename: {
    msisdn_e164: 'subscriber_msisdn',
    other_party: 'other_party_number',
    rat: 'radio_tech',
  },
  add: {
    duration_min: ['decimal(10,2)', K.derived, 'p.duration_sec / 60.0', 'duration_sec'],
    _loaded_at: LOADED,
  },
});

const TARIFF_JOIN =
  '\n-- JOIN bronze_tariffs t ON t.charge_code = p.charge_code\n--   AND p.event_ts BETWEEN t.valid_from AND t.valid_to';

const cdrRated = derive(LAYER.silver, 'silver', 'silver_cdr_rated', {
  from: cdrStandardized,
  also: [tariffs],
  description: 'Each event priced at the tariff that applied when it happened.',
  owner: 'Revenue Assurance',
  rows: '2.3b',
  updatedAt: '9m ago',
  job: 'cdr_rating (Lakeflow pipeline)',
  drop: ['apn', 'qos_class'],
  add: {
    tariff_id: lookup(tariffs, 't', 'tariff_id', TARIFF_JOIN, 'charge_code', 'event_ts'),
    tariff_zone: lookup(tariffs, 't', 'tariff_zone'),
    peak_flag: lookup(tariffs, 't', 'peak_flag'),
    rated_amount: [
      'decimal(12,4)',
      K.derived,
      'CASE WHEN p.is_data THEN p.total_kb / 1024.0 * t.rate_per_mb\n     ELSE p.duration_min * t.rate_per_min END + t.setup_charge',
      'is_data',
      'total_kb',
      'duration_min',
      of(tariffs)('rate_per_mb'),
      of(tariffs)('rate_per_min'),
      of(tariffs)('setup_charge'),
    ],
  },
});

const cdrEnriched = derive(LAYER.silver, 'silver', 'silver_cdr_enriched', {
  from: cdrRated,
  also: [cellSites, subscriptions],
  description: 'Rated events with the site they used and the account and plan behind the number.',
  owner: 'Network Data Eng',
  rows: '2.3b',
  updatedAt: '10m ago',
  job: 'cdr_silver (Lakeflow pipeline)',
  drop: ['imsi', 'imei', 'lac', 'tac', 'partner_plmn'],
  add: {
    site_id: lookup(
      cellSites,
      's',
      'site_id',
      '\n-- JOIN silver_cell_sites s ON s.cell_id = p.cell_id',
      'cell_id',
    ),
    region_code: lookup(cellSites, 's', 'region_code'),
    city: lookup(cellSites, 's', 'city'),
    account_no: lookup(
      subscriptions,
      'sub',
      'account_no',
      '\n-- JOIN silver_subscriptions sub ON sub.msisdn = p.subscriber_msisdn AND sub.is_active',
      'subscriber_msisdn',
    ),
    plan_code: lookup(subscriptions, 'sub', 'plan_code'),
  },
});

const roamingEvents = derive(LAYER.silver, 'silver', 'silver_roaming_events', {
  from: cdrRated,
  also: [roamingPartners],
  description: 'Events on partner networks, with the wholesale cost the partner will bill.',
  owner: 'Wholesale & Roaming',
  rows: '86.0m',
  updatedAt: '10m ago',
  job: 'roaming_silver (Lakeflow pipeline)',
  drop: ['lac', 'tac', 'service_code', 'termination_cause'],
  add: {
    partner_name: lookup(
      roamingPartners,
      'rp',
      'partner_name',
      '\n-- JOIN bronze_roaming_partners rp ON rp.partner_plmn = p.partner_plmn\n-- WHERE p.roaming_flag',
      'partner_plmn',
    ),
    roaming_zone: lookup(roamingPartners, 'rp', 'roaming_zone'),
    wholesale_cost: [
      'decimal(12,4)',
      K.derived,
      'CASE WHEN p.is_data THEN p.total_kb / 1024.0 * rp.rate_data_per_mb\n     ELSE p.duration_min * rp.rate_voice_per_min END',
      'is_data',
      'total_kb',
      'duration_min',
      of(roamingPartners)('rate_data_per_mb'),
      of(roamingPartners)('rate_voice_per_min'),
    ],
  },
});

const usageSessions = rollup(LAYER.silver, 'silver', 'silver_usage_sessions', {
  from: cdrEnriched,
  description: 'Events stitched into sessions: a call, or a data session on one site.',
  owner: 'Network Data Eng',
  rows: '610m',
  updatedAt: '12m ago',
  job: 'usage_sessions (Lakeflow pipeline)',
  keys: {
    session_id: [
      'string',
      K.derived,
      "sha2(concat_ws('|', p.subscriber_msisdn, p.cell_id, window(p.event_ts, '30 minutes')), 256)",
      'subscriber_msisdn',
      'cell_id',
      'event_ts',
    ],
    session_start: min('event_ts'),
  },
  by: [
    'subscriber_msisdn',
    'account_no',
    'plan_code',
    'region_code',
    'site_id',
    'radio_tech',
    'call_type',
    'direction',
    'is_data',
    'roaming_flag',
    'event_date',
  ],
  measures: {
    session_end: max('event_ts'),
    duration_min: sum('duration_min', 'decimal(12,2)'),
    total_kb: sum('total_kb', 'bigint'),
    data_up_kb: sum('data_up_kb', 'bigint'),
    data_down_kb: sum('data_down_kb', 'bigint'),
    rated_amount: sum('rated_amount', 'decimal(14,4)'),
    cdr_count: count('record_id'),
    cells_used: distinct('cell_id'),
    dropped: ['boolean', K.aggregated, "MAX(p.termination_cause = 'DROP')", 'termination_cause'],
    peak_share: ['double', K.aggregated, 'AVG(CAST(p.peak_flag AS INT))', 'peak_flag'],
  },
});

const usageDaily = rollup(LAYER.silver, 'silver', 'silver_usage_daily', {
  from: usageSessions,
  description: 'Each number’s day: minutes, data, roaming, drops and what it was rated at.',
  owner: 'Network Data Eng',
  rows: '388m',
  updatedAt: '40m ago',
  job: 'usage_daily (Lakeflow pipeline)',
  keys: { usage_date: ['date', K.renamed, 'p.event_date AS usage_date', 'event_date'] },
  by: ['subscriber_msisdn', 'account_no', 'plan_code', 'region_code'],
  measures: {
    voice_minutes: [
      'decimal(12,2)',
      K.aggregated,
      'SUM(p.duration_min) FILTER (WHERE NOT p.is_data)',
      'duration_min',
      'is_data',
    ],
    data_mb: ['decimal(14,2)', K.aggregated, 'SUM(p.total_kb) / 1024.0', 'total_kb'],
    data_up_mb: ['decimal(14,2)', K.aggregated, 'SUM(p.data_up_kb) / 1024.0', 'data_up_kb'],
    data_down_mb: ['decimal(14,2)', K.aggregated, 'SUM(p.data_down_kb) / 1024.0', 'data_down_kb'],
    sessions: count('session_id'),
    data_sessions: countIf('p.is_data', 'is_data'),
    voice_sessions: countIf("p.call_type = 'VOICE'", 'call_type'),
    roaming_minutes: [
      'decimal(12,2)',
      K.aggregated,
      'SUM(p.duration_min) FILTER (WHERE p.roaming_flag)',
      'duration_min',
      'roaming_flag',
    ],
    roaming_mb: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.total_kb) FILTER (WHERE p.roaming_flag) / 1024.0',
      'total_kb',
      'roaming_flag',
    ],
    dropped_sessions: countIf('p.dropped', 'dropped'),
    distinct_sites: distinct('site_id'),
    rated_amount: sum('rated_amount', 'decimal(14,4)'),
    five_g_share: ['double', K.aggregated, "AVG(CAST(p.radio_tech = 'NR' AS INT))", 'radio_tech'],
    longest_session_min: max('duration_min'),
    peak_share: avg('peak_share'),
    outgoing_share: ['double', K.aggregated, "AVG(CAST(p.direction = 'MO' AS INT))", 'direction'],
  },
});

const kpiHourly = rollup(LAYER.silver, 'silver', 'silver_network_kpi_hourly', {
  from: networkKpis,
  also: [cellSites],
  description: 'Cell counters rolled up to the hour, with the site and region they belong to.',
  owner: 'Network Engineering',
  rows: '274m',
  updatedAt: '3h ago',
  health: HEALTH.stale,
  healthNote: 'KPI stream 3h behind; the latest hours are incomplete',
  job: 'network_kpi_silver (Lakeflow pipeline)',
  keys: {
    kpi_hour: ['timestamp', K.derived, "date_trunc('hour', p.kpi_ts)", 'kpi_ts'],
    site_id: lookup(
      cellSites,
      's',
      'site_id',
      '\n-- JOIN silver_cell_sites s ON s.cell_id = p.cell_id',
      'cell_id',
    ),
    region_code: lookup(cellSites, 's', 'region_code'),
  },
  by: ['cell_id', 'rat'],
  measures: {
    availability_pct: avg('availability_pct'),
    drop_rate_pct: avg('drop_rate_pct'),
    setup_success_pct: avg('setup_success_pct'),
    handover_success_pct: avg('handover_success_pct'),
    prb_util_pct: max('prb_util_pct'),
    throughput_dl_mbps: avg('throughput_dl_mbps'),
    throughput_ul_mbps: avg('throughput_ul_mbps'),
    latency_ms: avg('latency_ms'),
    jitter_ms: avg('jitter_ms'),
    packet_loss_pct: avg('packet_loss_pct'),
    peak_active_users: max('active_users'),
    rrc_attempts: sum('rrc_attempts', 'bigint'),
    rrc_failures: sum('rrc_failures', 'bigint'),
    volte_drop_pct: avg('volte_drop_pct'),
    cqi_avg: avg('cqi_avg'),
    alarm_count: sum('alarm_count', 'int'),
  },
});

const invoiceLines = derive(LAYER.silver, 'silver', 'silver_invoice_lines', {
  from: billingClassified,
  also: [subscriptions],
  description: 'Invoice lines tied to the subscription they bill.',
  owner: 'Finance Data Eng',
  rows: '96.2m',
  updatedAt: '6h ago',
  job: 'billing_silver (Lakeflow pipeline)',
  drop: ['status'],
  rename: { description: 'line_description' },
  add: {
    subscription_id: lookup(
      subscriptions,
      'sub',
      'subscription_id',
      '\n-- JOIN silver_subscriptions sub ON sub.msisdn = p.msisdn',
      'msisdn',
    ),
    _loaded_at: LOADED,
  },
});

const invoices = rollup(LAYER.silver, 'silver', 'silver_invoices', {
  from: invoiceLines,
  description: 'One row per invoice, with its charges broken down.',
  owner: 'Finance Data Eng',
  rows: '24.1m',
  updatedAt: '6h ago',
  job: 'billing_silver (Lakeflow pipeline)',
  by: ['invoice_no', 'account_no', 'bill_cycle', 'issue_date', 'due_date', 'currency'],
  measures: {
    line_count: count('line_no'),
    recurring_amount: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.net_amount) FILTER (WHERE p.is_recurring)',
      'net_amount',
      'is_recurring',
    ],
    usage_amount: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.net_amount) FILTER (WHERE p.is_usage)',
      'net_amount',
      'is_usage',
    ],
    one_off_amount: [
      'decimal(14,2)',
      K.aggregated,
      "SUM(p.net_amount) FILTER (WHERE p.charge_category = 'ONE_OFF')",
      'net_amount',
      'charge_category',
    ],
    discount_amount: sum('discount_amount'),
    tax_amount: sum('tax_amount'),
    gross_amount: sum('amount'),
    net_amount: sum('net_amount'),
    total_due: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.net_amount + p.tax_amount)',
      'net_amount',
      'tax_amount',
    ],
    subscriptions_billed: distinct('subscription_id'),
    period_start: min('period_start'),
    period_end: max('period_end'),
    has_adjustment: [
      'boolean',
      K.aggregated,
      "MAX(p.charge_category = 'ADJUSTMENT')",
      'charge_category',
    ],
    plans_billed: distinct('plan_code'),
  },
});

const payments = derive(LAYER.silver, 'silver', 'silver_payments', {
  from: bronzePayments,
  description: 'Payments, with failures flagged and fees and refunds netted off.',
  owner: 'Finance Data Eng',
  rows: '41.8m',
  updatedAt: '1h ago',
  job: 'billing_silver (Lakeflow pipeline)',
  drop: ['card_brand', '_ingested_at', '_source_page'],
  add: {
    is_failed: ['boolean', K.derived, "p.status = 'FAILED'", 'status'],
    net_amount: [
      'decimal(14,2)',
      K.derived,
      'p.amount - p.refunded_amount - p.fee_amount',
      'amount',
      'refunded_amount',
      'fee_amount',
    ],
    _loaded_at: LOADED,
  },
});

const PAY_JOIN = '\n-- LEFT JOIN silver_payments pay ON pay.invoice_no = p.invoice_no';

const arLedger = derive(LAYER.silver, 'silver', 'silver_ar_ledger', {
  from: invoices,
  also: [payments],
  description: 'Each invoice against what has been paid on it, and how late it is.',
  owner: 'Finance Data Eng',
  rows: '24.1m',
  updatedAt: '1h ago',
  job: 'receivables_silver (Lakeflow pipeline)',
  drop: ['line_count', 'recurring_amount', 'one_off_amount', 'plans_billed'],
  add: {
    paid_amount: [
      'decimal(14,2)',
      K.aggregated,
      `SUM(pay.net_amount)${PAY_JOIN}`,
      of(payments)('net_amount'),
    ],
    last_paid_at: [null, K.aggregated, 'MAX(pay.paid_at)', of(payments)('paid_at')],
    payment_count: ['int', K.aggregated, 'COUNT(pay.payment_id)', of(payments)('payment_id')],
    failed_payment_count: [
      'int',
      K.aggregated,
      'COUNT_IF(pay.is_failed)',
      of(payments)('is_failed'),
    ],
    chargeback_flag: [
      null,
      K.aggregated,
      'MAX(pay.chargeback_flag)',
      of(payments)('chargeback_flag'),
    ],
    outstanding_amount: [
      'decimal(14,2)',
      K.derived,
      'p.total_due - COALESCE(SUM(pay.net_amount), 0)',
      'total_due',
      of(payments)('net_amount'),
    ],
    days_past_due: [
      'int',
      K.derived,
      'GREATEST(datediff(current_date(), p.due_date), 0)',
      'due_date',
    ],
  },
});

const subscribers = derive(LAYER.silver, 'silver', 'silver_subscribers', {
  from: accountMerge,
  also: [geoRegions],
  description: 'One record per customer, personal details hashed, with region and tenure.',
  owner: 'Customer Data Platform',
  rows: '8.4m',
  updatedAt: '2h ago',
  job: 'customer_silver (Lakeflow pipeline)',
  drop: ['first_name', 'last_name', 'email', 'phone', 'street', 'date_of_birth', 'duplicate_of'],
  add: {
    name_hash: [
      'string',
      K.derived,
      "sha2(concat(p.first_name, ' ', p.last_name), 256)",
      'first_name',
      'last_name',
    ],
    contact_hash: ['string', K.derived, 'sha2(lower(p.email), 256)', 'email'],
    age_band: [
      'string',
      K.derived,
      "CASE WHEN age < 25 THEN '18-24' WHEN age < 35 THEN '25-34' WHEN age < 50 THEN '35-49' ELSE '50+' END\n-- age = floor(months_between(current_date(), p.date_of_birth) / 12)",
      'date_of_birth',
    ],
    region_name: lookup(geoRegions, 'g', 'region_name', GEO_JOIN, 'region_code'),
    tenure_days: ['int', K.derived, 'datediff(current_date(), p.created_at)', 'created_at'],
    _loaded_at: LOADED,
  },
});

const SUBS_BY_ACCOUNT = '\n-- JOIN silver_subscriptions s ON s.account_no = p.account_no';

const subscriberProfile = derive(LAYER.silver, 'silver', 'silver_subscriber_profile', {
  from: subscribers,
  also: [subscriptions],
  description: 'Each customer with a summary of their lines, devices and contracts.',
  owner: 'Customer Data Platform',
  rows: '8.4m',
  updatedAt: '2h ago',
  job: 'customer_silver (Lakeflow pipeline)',
  drop: ['closed_at', 'match_confidence', 'preferred_language', '_loaded_at'],
  add: {
    active_lines: [
      'int',
      K.aggregated,
      `COUNT_IF(s.is_active)${SUBS_BY_ACCOUNT}`,
      of(subscriptions)('is_active'),
    ],
    five_g_lines: [
      'int',
      K.aggregated,
      'COUNT_IF(s.five_g_enabled)',
      of(subscriptions)('five_g_enabled'),
    ],
    financed_devices: [
      'int',
      K.aggregated,
      'COUNT_IF(s.device_financed)',
      of(subscriptions)('device_financed'),
    ],
    port_in_lines: [
      'int',
      K.aggregated,
      'COUNT_IF(s.port_in_flag)',
      of(subscriptions)('port_in_flag'),
    ],
    avg_monthly_fee: [
      'decimal(10,2)',
      K.aggregated,
      'AVG(s.monthly_fee)',
      of(subscriptions)('monthly_fee'),
    ],
    earliest_contract_end: [
      null,
      K.aggregated,
      'MIN(s.contract_end)',
      of(subscriptions)('contract_end'),
    ],
    primary_plan_family: [
      null,
      K.aggregated,
      'MODE(s.plan_family)',
      of(subscriptions)('plan_family'),
    ],
    _loaded_at: LOADED,
  },
});

const careInteractions = derive(LAYER.silver, 'silver', 'silver_care_interactions', {
  from: careSessions,
  description: 'Every care contact, how long it took and whether it was put right.',
  owner: 'Customer Care Analytics',
  rows: '22.3m',
  updatedAt: '15m ago',
  job: 'care_silver (Lakeflow pipeline)',
  drop: ['agent_id'],
  rename: { opened_at: 'contact_at' },
  add: {
    handle_min: [
      'int',
      K.derived,
      'COALESCE(p.resolution_min, timestampdiff(MINUTE, p.opened_at, current_timestamp()))',
      'resolution_min',
      'opened_at',
    ],
    is_resolved: ['boolean', K.derived, "p.status IN ('RESOLVED', 'CLOSED')", 'status'],
    is_network_issue: ['boolean', K.derived, "p.category = 'NETWORK'", 'category'],
    _loaded_at: LOADED,
  },
});

const nps = derive(LAYER.silver, 'silver', 'silver_nps_responses', {
  from: npsSurveys,
  description: 'NPS responses, bucketed, with what the comment was about.',
  owner: 'Customer Care Analytics',
  rows: '3.2m',
  updatedAt: '6h ago',
  job: 'care_silver (Lakeflow pipeline)',
  drop: ['verbatim', '_ingested_at'],
  add: {
    nps_bucket: [
      'string',
      K.derived,
      "CASE WHEN p.score >= 9 THEN 'PROMOTER' WHEN p.score >= 7 THEN 'PASSIVE' ELSE 'DETRACTOR' END",
      'score',
    ],
    is_detractor: ['boolean', K.derived, 'p.score <= 6', 'score'],
    verbatim_topic: [
      'string',
      K.derived,
      "ai_classify(p.verbatim, ARRAY('price', 'network', 'service', 'device', 'other'))",
      'verbatim',
    ],
    _loaded_at: LOADED,
  },
});

/* ================================================================ gold */

const usageDailySub = derive(LAYER.gold, 'gold', 'gold_usage_daily_subscriber', {
  from: usageDaily,
  also: [calendar],
  description: 'Daily usage per number, set against its own last week and the calendar.',
  owner: 'Commercial Analytics',
  rows: '388m',
  updatedAt: '45m ago',
  job: 'usage_gold (dbt model)',
  add: {
    day_of_week: lookup(
      calendar,
      'c',
      'day_of_week',
      '\n-- JOIN ref_calendar c ON c.calendar_date = p.usage_date',
      'usage_date',
    ),
    is_weekend: lookup(calendar, 'c', 'is_weekend'),
    is_holiday: lookup(calendar, 'c', 'is_holiday'),
    data_vs_7d_avg: [
      'double',
      K.derived,
      'p.data_mb / AVG(p.data_mb) OVER (PARTITION BY p.subscriber_msisdn ORDER BY p.usage_date ROWS 6 PRECEDING)',
      'data_mb',
    ],
    voice_vs_7d_avg: [
      'double',
      K.derived,
      'p.voice_minutes / AVG(p.voice_minutes) OVER (PARTITION BY p.subscriber_msisdn ORDER BY p.usage_date ROWS 6 PRECEDING)',
      'voice_minutes',
    ],
  },
});

const usageMonthly = rollup(LAYER.gold, 'gold', 'gold_usage_monthly_subscriber', {
  from: usageDailySub,
  description: 'Each number’s month of usage, with how its days varied.',
  owner: 'Commercial Analytics',
  rows: '41.0m',
  updatedAt: '1h ago',
  job: 'usage_gold (dbt model)',
  keys: { usage_month: ['date', K.derived, "date_trunc('month', p.usage_date)", 'usage_date'] },
  by: ['subscriber_msisdn', 'account_no', 'plan_code', 'region_code'],
  measures: {
    active_days: distinct('usage_date'),
    voice_minutes: sum('voice_minutes', 'decimal(12,2)'),
    data_mb: sum('data_mb'),
    roaming_minutes: sum('roaming_minutes', 'decimal(12,2)'),
    roaming_mb: sum('roaming_mb'),
    sessions: sum('sessions', 'int'),
    dropped_sessions: sum('dropped_sessions', 'int'),
    rated_amount: sum('rated_amount', 'decimal(14,4)'),
    weekend_data_share: [
      'double',
      K.aggregated,
      'SUM(p.data_mb) FILTER (WHERE p.is_weekend) / SUM(p.data_mb)',
      'data_mb',
      'is_weekend',
    ],
    holiday_data_mb: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.data_mb) FILTER (WHERE p.is_holiday)',
      'data_mb',
      'is_holiday',
    ],
    max_daily_data_mb: max('data_mb'),
    avg_daily_data_mb: avg('data_mb'),
    five_g_share: avg('five_g_share'),
    distinct_sites: max('distinct_sites'),
    data_spike_days: countIf('p.data_vs_7d_avg > 3', 'data_vs_7d_avg'),
    voice_drop_days: countIf('p.voice_vs_7d_avg < 0.3', 'voice_vs_7d_avg'),
  },
});

const networkQuality = rollup(LAYER.gold, 'gold', 'gold_network_quality_daily', {
  from: kpiHourly,
  also: [usageSessions],
  description: 'Daily quality per cell, with the sessions it served and dropped.',
  owner: 'Network Engineering',
  rows: '22.4m',
  updatedAt: '3h ago',
  job: 'network_gold (dbt model)',
  keys: { kpi_date: ['date', K.derived, 'CAST(p.kpi_hour AS DATE)', 'kpi_hour'] },
  by: ['cell_id', 'site_id', 'region_code', 'rat'],
  measures: {
    avg_availability_pct: avg('availability_pct'),
    avg_drop_rate_pct: avg('drop_rate_pct'),
    min_setup_success_pct: min('setup_success_pct'),
    avg_throughput_dl_mbps: avg('throughput_dl_mbps'),
    avg_throughput_ul_mbps: avg('throughput_ul_mbps'),
    p95_latency_ms: ['double', K.aggregated, 'PERCENTILE(p.latency_ms, 0.95)', 'latency_ms'],
    avg_packet_loss_pct: avg('packet_loss_pct'),
    peak_prb_util_pct: max('prb_util_pct'),
    peak_active_users: max('peak_active_users'),
    rrc_failure_rate: [
      'double',
      K.aggregated,
      'SUM(p.rrc_failures) / NULLIF(SUM(p.rrc_attempts), 0)',
      'rrc_failures',
      'rrc_attempts',
    ],
    alarm_count: sum('alarm_count', 'int'),
    avg_volte_drop_pct: avg('volte_drop_pct'),
    avg_cqi: avg('cqi_avg'),
    sessions_served: [
      'int',
      K.aggregated,
      'COUNT(u.session_id)\n-- JOIN silver_usage_sessions u ON u.site_id = p.site_id AND CAST(u.session_start AS DATE) = kpi_date',
      of(usageSessions)('session_id'),
    ],
    dropped_sessions: ['int', K.aggregated, 'COUNT_IF(u.dropped)', of(usageSessions)('dropped')],
    affected_subscribers: [
      'int',
      K.aggregated,
      'COUNT(DISTINCT u.subscriber_msisdn) FILTER (WHERE u.dropped)',
      of(usageSessions)('subscriber_msisdn'),
      of(usageSessions)('dropped'),
    ],
    quality_score: [
      'double',
      K.derived,
      '100 - 40 * AVG(p.drop_rate_pct) - 30 * AVG(p.packet_loss_pct) - 30 * LEAST(AVG(p.latency_ms) / 200, 1)',
      'drop_rate_pct',
      'packet_loss_pct',
      'latency_ms',
    ],
  },
});

const roamingSettlement = rollup(LAYER.gold, 'gold', 'gold_roaming_settlement_monthly', {
  from: roamingEvents,
  description: 'What each roaming partner owes and is owed, by month.',
  owner: 'Wholesale & Roaming',
  rows: '96.1k',
  updatedAt: '1d ago',
  job: 'roaming_gold (dbt model)',
  keys: { settlement_month: ['date', K.derived, "date_trunc('month', p.event_ts)", 'event_ts'] },
  by: ['partner_plmn', 'partner_name', 'roaming_zone', 'radio_tech'],
  measures: {
    events: count('record_id'),
    voice_minutes: [
      'decimal(12,2)',
      K.aggregated,
      'SUM(p.duration_min) FILTER (WHERE NOT p.is_data)',
      'duration_min',
      'is_data',
    ],
    data_mb: ['decimal(14,2)', K.aggregated, 'SUM(p.total_kb) / 1024.0', 'total_kb'],
    sms_count: countIf("p.call_type = 'SMS'", 'call_type'),
    retail_amount: sum('rated_amount'),
    wholesale_cost: sum('wholesale_cost'),
    margin: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.rated_amount) - SUM(p.wholesale_cost)',
      'rated_amount',
      'wholesale_cost',
    ],
    subscribers: distinct('subscriber_msisdn'),
    peak_events: countIf('p.peak_flag', 'peak_flag'),
    avg_duration_min: avg('duration_min'),
    five_g_events: countIf("p.radio_tech = 'NR'", 'radio_tech'),
    outgoing_events: countIf("p.direction = 'MO'", 'direction'),
    distinct_tariffs: distinct('tariff_id'),
    last_event_at: max('event_ts'),
  },
});

const USAGE_JOIN =
  '\n-- LEFT JOIN silver_usage_daily u ON u.plan_code = p.plan_code AND u.usage_date = p.issue_date';

const revenueDaily = rollup(LAYER.gold, 'gold', 'gold_revenue_daily', {
  from: invoiceLines,
  also: [usageDaily],
  description: 'Billed revenue by day, plan and charge type, set against what usage rated at.',
  owner: 'Finance Analytics',
  rows: '1.9m',
  updatedAt: '5h ago',
  job: 'revenue_gold (dbt model)',
  keys: { revenue_date: ['date', K.renamed, 'p.issue_date AS revenue_date', 'issue_date'] },
  by: ['plan_code', 'charge_category', 'currency'],
  measures: {
    gross_amount: sum('amount'),
    discount_amount: sum('discount_amount'),
    tax_amount: sum('tax_amount'),
    net_amount: sum('net_amount'),
    line_count: count('line_no'),
    accounts_billed: distinct('account_no'),
    subscriptions_billed: distinct('subscription_id'),
    recurring_amount: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.net_amount) FILTER (WHERE p.is_recurring)',
      'net_amount',
      'is_recurring',
    ],
    usage_amount: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(p.net_amount) FILTER (WHERE p.is_usage)',
      'net_amount',
      'is_usage',
    ],
    avg_line_amount: avg('net_amount'),
    usage_rated_amount: [
      'decimal(14,4)',
      K.aggregated,
      `SUM(u.rated_amount)${USAGE_JOIN}`,
      of(usageDaily)('rated_amount'),
    ],
    voice_minutes_rated: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(u.voice_minutes)',
      of(usageDaily)('voice_minutes'),
    ],
    data_mb_rated: ['decimal(14,2)', K.aggregated, 'SUM(u.data_mb)', of(usageDaily)('data_mb')],
    billed_vs_rated_gap: [
      'decimal(14,2)',
      K.derived,
      'SUM(p.net_amount) FILTER (WHERE p.is_usage) - SUM(u.rated_amount)',
      'net_amount',
      'is_usage',
      of(usageDaily)('rated_amount'),
    ],
  },
});

const SUBSCRIBER_JOIN = '\n-- JOIN silver_subscribers s ON s.account_no = p.account_no';
const OUTSTANDING_BY_AGE = (from, to) => [
  'decimal(14,2)',
  K.aggregated,
  `SUM(p.outstanding_amount) FILTER (WHERE p.days_past_due BETWEEN ${from} AND ${to})`,
  'outstanding_amount',
  'days_past_due',
];

const arAging = rollup(LAYER.gold, 'gold', 'gold_ar_aging', {
  from: arLedger,
  also: [subscribers],
  description: 'What each account owes, by how overdue it is.',
  owner: 'Finance Analytics',
  rows: '8.1m',
  updatedAt: '1h ago',
  job: 'receivables_gold (dbt model)',
  keys: {
    as_of_date: ['date', K.constant, 'current_date()'],
    segment: lookup(subscribers, 's', 'segment', SUBSCRIBER_JOIN, 'account_no'),
    credit_class: lookup(subscribers, 's', 'credit_class'),
    region_code: lookup(subscribers, 's', 'region_code'),
  },
  by: ['account_no'],
  measures: {
    open_invoices: countIf('p.outstanding_amount > 0', 'outstanding_amount'),
    outstanding_amount: sum('outstanding_amount'),
    outstanding_0_30: OUTSTANDING_BY_AGE(0, 30),
    outstanding_31_60: OUTSTANDING_BY_AGE(31, 60),
    outstanding_61_90: OUTSTANDING_BY_AGE(61, 90),
    outstanding_90_plus: OUTSTANDING_BY_AGE(91, 9999),
    max_days_past_due: max('days_past_due'),
    failed_payments_90d: sum('failed_payment_count', 'int'),
    chargebacks_12m: countIf('p.chargeback_flag', 'chargeback_flag'),
    last_paid_at: max('last_paid_at'),
    total_billed_12m: sum('total_due'),
    total_paid_12m: sum('paid_amount'),
    collection_risk: [
      'string',
      K.derived,
      "CASE WHEN MAX(p.days_past_due) > 90 THEN 'HIGH' WHEN MAX(p.days_past_due) > 30 THEN 'MEDIUM' ELSE 'LOW' END",
      'days_past_due',
      'outstanding_amount',
    ],
  },
});

const careMonthly = rollup(LAYER.gold, 'gold', 'gold_care_subscriber_monthly', {
  from: careInteractions,
  also: [nps],
  description: 'Each customer’s month with care: contacts, complaints and how they scored us.',
  owner: 'Customer Care Analytics',
  rows: '6.3m',
  updatedAt: '1h ago',
  job: 'care_gold (dbt model)',
  keys: { care_month: ['date', K.derived, "date_trunc('month', p.contact_at)", 'contact_at'] },
  by: ['account_no', 'msisdn'],
  measures: {
    contacts: count('ticket_id'),
    escalations: countIf('p.escalated', 'escalated'),
    reopened: sum('reopened_count', 'int'),
    avg_resolution_min: avg('resolution_min'),
    avg_first_response_min: avg('first_response_min'),
    network_complaints: countIf('p.is_network_issue', 'is_network_issue'),
    billing_complaints: countIf("p.category = 'BILLING'", 'category'),
    compensation_amount: sum('compensation_amount', 'decimal(12,2)'),
    avg_sentiment: avg('sentiment_score'),
    ivr_self_served: countIf('p.ivr_self_served', 'ivr_self_served'),
    repeat_contacts: countIf('p.repeat_call_7d', 'repeat_call_7d'),
    unresolved: countIf('NOT p.is_resolved', 'is_resolved'),
    nps_responses: [
      'int',
      K.aggregated,
      "COUNT(n.response_id)\n-- LEFT JOIN silver_nps_responses n ON n.account_no = p.account_no\n--   AND date_trunc('month', n.responded_at) = care_month",
      of(nps)('response_id'),
    ],
    avg_nps_score: ['double', K.aggregated, 'AVG(n.score)', of(nps)('score')],
    detractor_flag: [null, K.aggregated, 'MAX(n.is_detractor)', of(nps)('is_detractor')],
    last_verbatim_topic: [
      null,
      K.aggregated,
      'MAX_BY(n.verbatim_topic, n.responded_at)',
      of(nps)('verbatim_topic'),
      of(nps)('responded_at'),
    ],
  },
});

const arpu = rollup(LAYER.gold, 'gold', 'gold_arpu_monthly', {
  from: invoices,
  also: [usageMonthly],
  description: 'Revenue per account and per line each month, against the usage behind it.',
  owner: 'Finance Analytics',
  rows: '96.4m',
  updatedAt: '5h ago',
  job: 'revenue_gold (dbt model)',
  keys: { bill_month: ['date', K.derived, "date_trunc('month', p.issue_date)", 'issue_date'] },
  by: ['account_no', 'currency'],
  measures: {
    invoice_count: count('invoice_no'),
    gross_revenue: sum('gross_amount'),
    net_revenue: sum('net_amount'),
    recurring_revenue: sum('recurring_amount'),
    usage_revenue: sum('usage_amount'),
    discount_amount: sum('discount_amount'),
    tax_amount: sum('tax_amount'),
    lines_billed: max('subscriptions_billed'),
    arpu: [
      'decimal(12,2)',
      K.derived,
      'SUM(p.net_amount) / NULLIF(MAX(p.subscriptions_billed), 0)',
      'net_amount',
      'subscriptions_billed',
    ],
    data_mb: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(u.data_mb)\n-- JOIN gold_usage_monthly_subscriber u ON u.account_no = p.account_no AND u.usage_month = bill_month',
      of(usageMonthly)('data_mb'),
    ],
    voice_minutes: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(u.voice_minutes)',
      of(usageMonthly)('voice_minutes'),
    ],
    roaming_mb: [
      'decimal(14,2)',
      K.aggregated,
      'SUM(u.roaming_mb)',
      of(usageMonthly)('roaming_mb'),
    ],
    revenue_per_gb: [
      'double',
      K.derived,
      'SUM(p.net_amount) / NULLIF(SUM(u.data_mb) / 1024, 0)',
      'net_amount',
      of(usageMonthly)('data_mb'),
    ],
    arpu_change_3m: [
      'double',
      K.derived,
      'arpu / LAG(arpu, 3) OVER (PARTITION BY p.account_no ORDER BY bill_month) - 1',
      'net_amount',
      'subscriptions_billed',
    ],
    overage_share: [
      'double',
      K.derived,
      'SUM(p.usage_amount) / NULLIF(SUM(p.net_amount), 0)',
      'usage_amount',
      'net_amount',
    ],
  },
});

const ACCOUNT_JOIN = (table, alias) =>
  `\n-- LEFT JOIN ${table} ${alias} ON ${alias}.account_no = p.account_no  -- latest month`;

const subscriber360 = derive(LAYER.gold, 'gold', 'gold_subscriber_360', {
  from: subscriberProfile,
  also: [usageMonthly, arpu, arAging, careMonthly],
  description: 'Everything about a customer on one row: lines, usage, revenue, debt and care.',
  owner: 'Commercial Analytics',
  rows: '8.4m',
  updatedAt: '1h ago',
  job: 'subscriber_360 (dbt model)',
  drop: [
    'customer_id',
    'company_name',
    'gender',
    'postcode',
    'name_hash',
    'contact_hash',
    'line_count',
    '_loaded_at',
  ],
  add: {
    data_mb_last_month: lookup(
      usageMonthly,
      'um',
      'data_mb',
      ACCOUNT_JOIN('gold_usage_monthly_subscriber', 'um'),
      'account_no',
    ),
    voice_minutes_last_month: lookup(usageMonthly, 'um', 'voice_minutes'),
    dropped_sessions_last_month: lookup(usageMonthly, 'um', 'dropped_sessions'),
    arpu_last_month: lookup(arpu, 'ar', 'arpu', ACCOUNT_JOIN('gold_arpu_monthly', 'ar')),
    arpu_change_3m: lookup(arpu, 'ar', 'arpu_change_3m'),
    outstanding_amount: lookup(
      arAging,
      'ag',
      'outstanding_amount',
      ACCOUNT_JOIN('gold_ar_aging', 'ag'),
    ),
    collection_risk: lookup(arAging, 'ag', 'collection_risk'),
    care_contacts_last_month: lookup(
      careMonthly,
      'cm',
      'contacts',
      ACCOUNT_JOIN('gold_care_subscriber_monthly', 'cm'),
    ),
    last_nps_score: lookup(careMonthly, 'cm', 'avg_nps_score'),
  },
});

/* ================================================================ features */

const usageTrends = rollup(null, 'ml', 'int_usage_trend_features', {
  from: usageMonthly,
  also: [networkQuality],
  description: 'Three-month usage trends per number, with the network quality it lived with.',
  owner: 'Data Science',
  rows: '14.2m',
  updatedAt: '2h ago',
  job: 'usage_trends (Spark job)',
  keys: { as_of_month: max('usage_month') },
  by: ['subscriber_msisdn', 'account_no'],
  measures: {
    data_mb_3m_avg: ['double', K.aggregated, 'AVG(p.data_mb)  -- last 3 months', 'data_mb'],
    data_mb_trend: [
      'double',
      K.aggregated,
      'REGR_SLOPE(p.data_mb, months_ago(p.usage_month))',
      'data_mb',
      'usage_month',
    ],
    voice_min_3m_avg: [
      'double',
      K.aggregated,
      'AVG(p.voice_minutes)  -- last 3 months',
      'voice_minutes',
    ],
    voice_trend: [
      'double',
      K.aggregated,
      'REGR_SLOPE(p.voice_minutes, months_ago(p.usage_month))',
      'voice_minutes',
      'usage_month',
    ],
    active_days_3m_avg: avg('active_days'),
    dropped_sessions_3m: sum('dropped_sessions', 'int'),
    roaming_mb_3m: sum('roaming_mb'),
    rated_amount_3m: sum('rated_amount', 'decimal(14,4)'),
    five_g_share_3m: avg('five_g_share'),
    data_spike_days_3m: sum('data_spike_days', 'int'),
    network_quality_exposure: [
      'double',
      K.aggregated,
      'AVG(nq.quality_score)\n-- JOIN gold_network_quality_daily nq ON nq.region_code = p.region_code',
      of(networkQuality)('quality_score'),
    ],
    dropped_call_exposure: [
      'int',
      K.aggregated,
      'SUM(nq.dropped_sessions)',
      of(networkQuality)('dropped_sessions'),
    ],
    months_observed: count('usage_month'),
  },
});

const usageFeatures = derive('features', 'features', 'features_churn_usage', {
  from: usageTrends,
  description: 'Usage features for the churn model, one row per number.',
  owner: 'Data Science',
  rows: '14.2m',
  updatedAt: '2h ago',
  job: 'churn_features (Feature Engineering job)',
  add: {
    usage_decline_pct: [
      'double',
      K.derived,
      '1 - p.data_mb_3m_avg / NULLIF(p.data_mb_3m_avg - 3 * p.data_mb_trend, 0)',
      'data_mb_3m_avg',
      'data_mb_trend',
    ],
    low_engagement_flag: ['boolean', K.derived, 'p.active_days_3m_avg < 8', 'active_days_3m_avg'],
    network_pain_score: [
      'double',
      K.derived,
      'p.dropped_call_exposure / 10.0 + (100 - p.network_quality_exposure) / 20.0',
      'dropped_call_exposure',
      'network_quality_exposure',
    ],
    roamer_flag: ['boolean', K.derived, 'p.roaming_mb_3m > 500', 'roaming_mb_3m'],
    heavy_user_flag: ['boolean', K.derived, 'p.data_mb_3m_avg > 30000', 'data_mb_3m_avg'],
  },
});

const AGING_JOIN = '\n-- JOIN gold_ar_aging ag ON ag.account_no = p.account_no';

const billingFeatures = rollup('features', 'features', 'features_churn_billing', {
  from: arpu,
  also: [arAging],
  description: 'Billing and payment features for the churn model, one row per account.',
  owner: 'Data Science',
  rows: '8.1m',
  updatedAt: '5h ago',
  health: HEALTH.stale,
  healthNote: 'Waiting on gold_arpu_monthly, which runs after the nightly billing export',
  job: 'churn_features (Feature Engineering job)',
  keys: { as_of_month: max('bill_month') },
  by: ['account_no'],
  measures: {
    arpu_last: latest('arpu', 'bill_month'),
    arpu_3m_avg: avg('arpu'),
    arpu_change_3m: latest('arpu_change_3m', 'bill_month'),
    revenue_per_gb_last: latest('revenue_per_gb', 'bill_month'),
    overage_share_3m: avg('overage_share'),
    discount_share_3m: [
      'double',
      K.aggregated,
      'SUM(p.discount_amount) / NULLIF(SUM(p.gross_revenue), 0)',
      'discount_amount',
      'gross_revenue',
    ],
    outstanding_amount: lookup(arAging, 'ag', 'outstanding_amount', AGING_JOIN, 'account_no'),
    max_days_past_due: lookup(arAging, 'ag', 'max_days_past_due'),
    failed_payments_90d: lookup(arAging, 'ag', 'failed_payments_90d'),
    chargebacks_12m: lookup(arAging, 'ag', 'chargebacks_12m'),
    collection_risk: lookup(arAging, 'ag', 'collection_risk'),
    bill_shock_flag: [
      'boolean',
      K.derived,
      'MAX_BY(p.net_revenue, p.bill_month) > 1.5 * AVG(p.net_revenue)',
      'net_revenue',
      'bill_month',
    ],
    payment_stress_score: [
      'double',
      K.derived,
      'ag.max_days_past_due / 30.0 + ag.failed_payments_90d',
      of(arAging)('max_days_past_due'),
      of(arAging)('failed_payments_90d'),
    ],
  },
});

const profileFeatures = derive('features', 'features', 'features_churn_profile', {
  from: subscriber360,
  description: 'Who the customer is and where they stand on contract, for the churn model.',
  owner: 'Data Science',
  rows: '8.4m',
  updatedAt: '1h ago',
  job: 'churn_features (Feature Engineering job)',
  drop: [
    'status',
    'created_at',
    'city',
    'country',
    'golden_customer_id',
    'data_mb_last_month',
    'voice_minutes_last_month',
    'dropped_sessions_last_month',
    'arpu_last_month',
    'arpu_change_3m',
    'outstanding_amount',
    'collection_risk',
    'care_contacts_last_month',
    'last_nps_score',
  ],
  add: {
    tenure_band: [
      'string',
      K.derived,
      "CASE WHEN p.tenure_days < 365 THEN '<1y' WHEN p.tenure_days < 1095 THEN '1-3y' ELSE '3y+' END",
      'tenure_days',
    ],
    months_to_contract_end: [
      'int',
      K.derived,
      'months_between(p.earliest_contract_end, current_date())',
      'earliest_contract_end',
    ],
    out_of_contract_flag: [
      'boolean',
      K.derived,
      'p.earliest_contract_end < current_date()',
      'earliest_contract_end',
    ],
    multi_line_flag: ['boolean', K.derived, 'p.active_lines > 1', 'active_lines'],
    ported_in_flag: ['boolean', K.derived, 'p.port_in_lines > 0', 'port_in_lines'],
    device_lock_in_flag: ['boolean', K.derived, 'p.financed_devices > 0', 'financed_devices'],
    as_of_month: ['date', K.constant, "date_trunc('month', current_date())"],
  },
});

const careFeatures = rollup('features', 'features', 'features_churn_care', {
  from: careMonthly,
  description: 'Care and satisfaction features for the churn model, one row per account.',
  owner: 'Data Science',
  rows: '6.0m',
  updatedAt: '1h ago',
  job: 'churn_features (Feature Engineering job)',
  keys: { as_of_month: max('care_month') },
  by: ['account_no'],
  measures: {
    contacts_90d: sum('contacts', 'int'),
    escalations_90d: sum('escalations', 'int'),
    network_complaints_90d: sum('network_complaints', 'int'),
    billing_complaints_90d: sum('billing_complaints', 'int'),
    avg_resolution_min_90d: avg('avg_resolution_min'),
    avg_sentiment_90d: avg('avg_sentiment'),
    repeat_contact_flag: ['boolean', K.aggregated, 'SUM(p.repeat_contacts) > 0', 'repeat_contacts'],
    unresolved_90d: sum('unresolved', 'int'),
    last_nps_score: latest('avg_nps_score', 'care_month'),
    detractor_flag: max('detractor_flag'),
    compensation_90d: sum('compensation_amount', 'decimal(12,2)'),
    care_pain_score: [
      'double',
      K.derived,
      'SUM(p.escalations) * 2 + SUM(p.unresolved) * 3 + SUM(p.repeat_contacts)',
      'escalations',
      'unresolved',
      'repeat_contacts',
    ],
  },
});

const FEATURE_JOIN =
  '\n-- JOIN features_churn_usage fu ON fu.account_no = p.account_no\n-- JOIN features_churn_billing fb USING (account_no)\n-- JOIN features_churn_care fc USING (account_no)';

const combinedFeatures = derive('features', 'features', 'features_churn_combined', {
  from: profileFeatures,
  also: [usageFeatures, billingFeatures, careFeatures],
  description: 'Every churn feature on one row per account: what the model reads.',
  owner: 'Data Science',
  rows: '8.1m',
  updatedAt: '2h ago',
  job: 'churn_features (Feature Engineering job)',
  drop: ['region_name', 'marketing_opt_in', 'account_type', 'port_in_lines'],
  add: {
    data_mb_3m_avg: lookup(usageFeatures, 'fu', 'data_mb_3m_avg', FEATURE_JOIN, 'account_no'),
    usage_decline_pct: lookup(usageFeatures, 'fu', 'usage_decline_pct'),
    network_pain_score: lookup(usageFeatures, 'fu', 'network_pain_score'),
    low_engagement_flag: lookup(usageFeatures, 'fu', 'low_engagement_flag'),
    arpu_3m_avg: lookup(billingFeatures, 'fb', 'arpu_3m_avg'),
    payment_stress_score: lookup(billingFeatures, 'fb', 'payment_stress_score'),
    bill_shock_flag: lookup(billingFeatures, 'fb', 'bill_shock_flag'),
    care_pain_score: lookup(careFeatures, 'fc', 'care_pain_score'),
    detractor_flag: lookup(careFeatures, 'fc', 'detractor_flag'),
    contacts_90d: lookup(careFeatures, 'fc', 'contacts_90d'),
    feature_version: ['string', K.constant, "'churn-features-v7'"],
  },
});

/* ================================================================ model (no layer) */

const trainingSet = derive(null, 'ml', 'ml_churn_training_set', {
  from: combinedFeatures,
  also: [subscriptions],
  description:
    'Features labelled with whether the customer left within 90 days, split for training.',
  owner: 'Data Science',
  rows: '24.6m',
  updatedAt: '6d ago',
  job: 'churn_training_set (Spark job)',
  drop: ['feature_version'],
  add: {
    churned_next_90d: [
      'boolean',
      K.derived,
      `s.deactivated_at BETWEEN p.as_of_month AND p.as_of_month + INTERVAL 90 DAYS${SUBS_BY_ACCOUNT}`,
      of(subscriptions)('deactivated_at'),
      'as_of_month',
    ],
    split: [
      'string',
      K.derived,
      "CASE WHEN abs(hash(p.account_no)) % 10 < 8 THEN 'train' ELSE 'test' END",
      'account_no',
    ],
    sample_weight: [
      'double',
      K.derived,
      'CASE WHEN churned_next_90d THEN 4.0 ELSE 1.0 END',
      of(subscriptions)('deactivated_at'),
    ],
  },
});

/** What the churn model reads, of all the features — the score's own lineage. */
const MODEL_INPUTS = [
  'usage_decline_pct',
  'network_pain_score',
  'payment_stress_score',
  'care_pain_score',
  'months_to_contract_end',
  'detractor_flag',
];
const MODEL_NOTE = '\n-- model: mlflow://models/churn_xgb/Production';

const churnScores = derive(null, 'ml', 'ml_churn_scores', {
  from: combinedFeatures,
  also: [X.churnModel],
  description: 'Every account scored by the production churn model, with what drove the score.',
  owner: 'Data Science',
  rows: '8.1m',
  updatedAt: '2h ago',
  job: 'churn_scoring (batch inference job)',
  keep: ['account_no', 'segment', 'region_code', 'credit_class', 'tenure_band', 'as_of_month'],
  add: {
    churn_probability: [
      'double',
      K.derived,
      `churn_xgb.predict_proba(features)[1]${MODEL_NOTE}`,
      ...MODEL_INPUTS,
    ],
    risk_band: [
      'string',
      K.derived,
      "CASE WHEN churn_probability >= 0.6 THEN 'HIGH' WHEN churn_probability >= 0.3 THEN 'MEDIUM' ELSE 'LOW' END",
      ...MODEL_INPUTS,
    ],
    top_driver_1: ['string', K.derived, `shap_top(features, 1)${MODEL_NOTE}`, ...MODEL_INPUTS],
    top_driver_2: ['string', K.derived, `shap_top(features, 2)${MODEL_NOTE}`, ...MODEL_INPUTS],
    top_driver_3: ['string', K.derived, `shap_top(features, 3)${MODEL_NOTE}`, ...MODEL_INPUTS],
    model_version: {
      type: 'string',
      kind: K.lookup,
      logic: "model.metadata['version']",
      outside: 'the churn_xgb model in MLflow',
    },
    scored_at: ['timestamp', K.system, 'current_timestamp()  -- when this run scored'],
  },
});

/* ================================================================ serving */

const S360_JOIN = '\n-- JOIN gold_subscriber_360 s ON s.account_no = p.account_no';

const churnRisk = derive('serving', 'serving', 'serving_churn_risk', {
  from: churnScores,
  also: [subscriber360],
  description: 'Accounts at risk of leaving, ranked by the value that would leave with them.',
  owner: 'Retention Marketing',
  rows: '8.1m',
  updatedAt: '2h ago',
  job: 'churn_serving (dbt model)',
  add: {
    plan_family: [
      'string',
      K.lookup,
      `s.primary_plan_family${S360_JOIN}`,
      of(subscriber360)('primary_plan_family'),
      'account_no',
    ],
    region_name: lookup(subscriber360, 's', 'region_name'),
    arpu_last_month: lookup(subscriber360, 's', 'arpu_last_month'),
    active_lines: lookup(subscriber360, 's', 'active_lines'),
    earliest_contract_end: lookup(subscriber360, 's', 'earliest_contract_end'),
    retention_value: [
      'decimal(12,2)',
      K.derived,
      's.arpu_last_month * 24 * p.churn_probability',
      of(subscriber360)('arpu_last_month'),
      'churn_probability',
    ],
    action_priority: [
      'int',
      K.derived,
      'RANK() OVER (ORDER BY s.arpu_last_month * 24 * p.churn_probability DESC)',
      'churn_probability',
      of(subscriber360)('arpu_last_month'),
    ],
  },
});

const retentionTargets = derive('serving', 'serving', 'serving_retention_targets', {
  from: churnRisk,
  also: [planCatalog],
  description: 'Who to contact this week, with which offer and through which channel.',
  owner: 'Retention Marketing',
  rows: '412k',
  updatedAt: '2h ago',
  job: 'retention_targets (dbt model)',
  drop: ['scored_at'],
  add: {
    recommended_offer: [
      'string',
      K.derived,
      "CASE WHEN p.top_driver_1 = 'payment_stress_score' THEN 'BILL_RELIEF' WHEN p.top_driver_1 = 'network_pain_score' THEN 'NETWORK_CREDIT' ELSE 'LOYALTY_DISCOUNT' END",
      'top_driver_1',
    ],
    offer_plan_code: [
      'string',
      K.lookup,
      'pc.plan_code\n-- JOIN bronze_plan_catalog pc ON pc.plan_family = p.plan_family AND pc.retired_on IS NULL',
      of(planCatalog)('plan_code'),
      'plan_family',
    ],
    offer_monthly_fee: [
      'decimal(10,2)',
      K.lookup,
      'pc.monthly_fee',
      of(planCatalog)('monthly_fee'),
    ],
    contact_channel: [
      'string',
      K.derived,
      "CASE WHEN p.segment = 'BUSINESS' THEN 'ACCOUNT_MANAGER' ELSE 'APP_PUSH' END",
      'segment',
    ],
    target_date: ['date', K.constant, 'current_date() + INTERVAL 2 DAYS'],
    suppression_flag: [
      'boolean',
      K.derived,
      "p.risk_band = 'LOW' OR p.action_priority > 50000",
      'risk_band',
      'action_priority',
    ],
    campaign_code: ['string', K.constant, "concat('RET-', date_format(current_date(), 'yyyyww'))"],
  },
});

const retentionWeekly = rollup('serving', 'serving', 'serving_retention_weekly', {
  from: retentionTargets,
  kind: ASSET_KIND.view,
  description: 'The week’s retention plan by region, risk and offer, for the leadership pack.',
  owner: 'Retention Marketing',
  rows: null,
  updatedAt: '2h ago',
  job: 'retention_weekly (view)',
  keys: { week_start: ['date', K.derived, "date_trunc('week', p.target_date)", 'target_date'] },
  by: ['region_name', 'risk_band', 'recommended_offer'],
  measures: {
    targeted: count('account_no'),
    suppressed: countIf('p.suppression_flag', 'suppression_flag'),
    avg_churn_probability: avg('churn_probability'),
    value_at_risk: sum('retention_value'),
    high_priority: countIf('p.action_priority <= 1000', 'action_priority'),
    avg_arpu: avg('arpu_last_month'),
    multi_line_accounts: countIf('p.active_lines > 1', 'active_lines'),
    offer_cost_monthly: sum('offer_monthly_fee'),
  },
});

const financeRevenue = rollup('serving', 'serving', 'serving_finance_revenue', {
  from: revenueDaily,
  also: [arpu],
  kind: ASSET_KIND.view,
  description: 'Monthly revenue by plan and charge type, for the finance dashboard.',
  owner: 'Finance Analytics',
  rows: null,
  updatedAt: '5h ago',
  job: 'finance_revenue (view)',
  keys: {
    revenue_month: ['date', K.derived, "date_trunc('month', p.revenue_date)", 'revenue_date'],
  },
  by: ['plan_code', 'charge_category'],
  measures: {
    net_amount: sum('net_amount'),
    gross_amount: sum('gross_amount'),
    discount_amount: sum('discount_amount'),
    accounts_billed: max('accounts_billed'),
    usage_amount: sum('usage_amount'),
    billed_vs_rated_gap: sum('billed_vs_rated_gap'),
    avg_arpu: [
      'decimal(12,2)',
      K.aggregated,
      'AVG(a.arpu)\n-- JOIN gold_arpu_monthly a ON a.bill_month = revenue_month',
      of(arpu)('arpu'),
    ],
    arpu_change_3m: ['double', K.aggregated, 'AVG(a.arpu_change_3m)', of(arpu)('arpu_change_3m')],
    revenue_per_gb: ['double', K.aggregated, 'AVG(a.revenue_per_gb)', of(arpu)('revenue_per_gb')],
  },
});

const networkOps = rollup('serving', 'serving', 'serving_network_ops', {
  from: networkQuality,
  kind: ASSET_KIND.view,
  description: 'Daily network quality by region, for the network operations centre.',
  owner: 'Network Engineering',
  rows: null,
  updatedAt: '3h ago',
  job: 'network_ops (view)',
  by: ['kpi_date', 'region_code'],
  measures: {
    sites: distinct('site_id'),
    cells: count('cell_id'),
    avg_availability_pct: avg('avg_availability_pct'),
    worst_drop_rate_pct: max('avg_drop_rate_pct'),
    p95_latency_ms: max('p95_latency_ms'),
    sessions_served: sum('sessions_served', 'int'),
    dropped_sessions: sum('dropped_sessions', 'int'),
    affected_subscribers: sum('affected_subscribers', 'int'),
    alarm_count: sum('alarm_count', 'int'),
    avg_quality_score: avg('quality_score'),
    cells_below_target: countIf('p.quality_score < 70', 'quality_score'),
  },
});

derive('serving', 'serving', 'serving_roaming_partner_report', {
  from: roamingSettlement,
  description: 'Partner margins ranked, for the wholesale team’s monthly review.',
  owner: 'Wholesale & Roaming',
  rows: '96.1k',
  updatedAt: '1d ago',
  job: 'roaming_report (dbt model)',
  drop: ['radio_tech'],
  add: {
    margin_pct: [
      'double',
      K.derived,
      'p.margin / NULLIF(p.retail_amount, 0)',
      'margin',
      'retail_amount',
    ],
    partner_rank: [
      'int',
      K.derived,
      'RANK() OVER (PARTITION BY p.settlement_month ORDER BY p.margin DESC)',
      'margin',
      'settlement_month',
    ],
  },
});

/* ================================================================ past the end (no layer) */

rollup(null, 'bi', 'bi_exec_kpis', {
  from: financeRevenue,
  also: [retentionWeekly, networkOps],
  kind: ASSET_KIND.view,
  description: 'The extract behind the executive KPI dashboard.',
  owner: 'BI Team',
  rows: null,
  updatedAt: '2h ago',
  job: 'exec_kpis (Tableau extract)',
  keys: { kpi_month: ['date', K.renamed, 'p.revenue_month AS kpi_month', 'revenue_month'] },
  measures: {
    net_revenue: sum('net_amount'),
    usage_revenue: sum('usage_amount'),
    avg_arpu: avg('avg_arpu'),
    value_at_risk: [
      'decimal(14,2)',
      K.aggregated,
      "SUM(r.value_at_risk)\n-- JOIN serving_retention_weekly r ON date_trunc('month', r.week_start) = kpi_month",
      of(retentionWeekly)('value_at_risk'),
    ],
    accounts_targeted: ['int', K.aggregated, 'SUM(r.targeted)', of(retentionWeekly)('targeted')],
    avg_quality_score: [
      'double',
      K.aggregated,
      "AVG(n.avg_quality_score)\n-- JOIN serving_network_ops n ON date_trunc('month', n.kpi_date) = kpi_month",
      of(networkOps)('avg_quality_score'),
    ],
    dropped_sessions: [
      'int',
      K.aggregated,
      'SUM(n.dropped_sessions)',
      of(networkOps)('dropped_sessions'),
    ],
    affected_subscribers: [
      'int',
      K.aggregated,
      'SUM(n.affected_subscribers)',
      of(networkOps)('affected_subscribers'),
    ],
  },
});

/**
 * What the lineage says about assets outside the catalog. The roaming feed
 * is missing on purpose: lineage names it as an input and nothing more.
 */
const EXTERNALS = [
  { id: X.cdrStream, name: 'network.cdr.v3', kind: ASSET_KIND.stream, location: X.cdrStream },
  { id: X.kpiStream, name: 'network.kpi.v1', kind: ASSET_KIND.stream, location: X.kpiStream },
  { id: X.billingFiles, name: 'invoices_*.csv', kind: ASSET_KIND.file, location: X.billingFiles },
  {
    id: X.paymentsApi,
    name: 'PayGate settlements API',
    kind: ASSET_KIND.api,
    location: X.paymentsApi,
  },
  { id: X.crmApi, name: 'CRM accounts API', kind: ASSET_KIND.api, location: X.crmApi },
  { id: X.careStream, name: 'care.tickets.v1', kind: ASSET_KIND.stream, location: X.careStream },
  { id: X.ivrFiles, name: 'calls_*.json', kind: ASSET_KIND.file, location: X.ivrFiles },
  { id: X.npsApi, name: 'Surveyly NPS API', kind: ASSET_KIND.api, location: X.npsApi },
  {
    id: X.churnModel,
    name: 'churn_xgb (MLflow model)',
    kind: ASSET_KIND.file,
    location: X.churnModel,
    upstream: [trainingSet],
  },
  {
    id: X.crmTargets,
    name: 'Retention_Target__c (Salesforce)',
    kind: ASSET_KIND.api,
    location: X.crmTargets,
    upstream: [retentionTargets],
  },
  {
    id: X.execShare,
    name: 'retention_weekly.parquet',
    kind: ASSET_KIND.file,
    location: X.execShare,
    upstream: [retentionWeekly],
  },
];

/* ---- check: every column reads only columns of its own table's inputs ---- */
registry.forEach((asset) =>
  Object.entries(lineage[asset.id] ?? {}).forEach(([column, derivation]) =>
    derivation.from.forEach((input) => {
      typeOf(input);
      if (!asset.upstream.includes(tableOf(input))) {
        fail(`${asset.id}.${column} reads ${input}, which is not one of its inputs`);
      }
    }),
  ),
);

export const TELECOM_WORKSPACE = {
  id: 'telecom',
  label: 'Telecom',
  syncedAt: '2026-11-26T05:30:00',
  layers: [
    { id: 'landing', label: 'Landing', blurb: 'Files and feeds as they arrive' },
    { id: LAYER.bronze },
    { id: LAYER.silver },
    { id: LAYER.gold },
    { id: 'features', label: 'Features', blurb: 'Model inputs, one row per customer' },
    { id: 'serving', label: 'Serving', blurb: 'Scores, targets and reports in use' },
  ],
  lineage: {
    assets: withDerivations([...registry.values()], lineage),
    externals: EXTERNALS,
  },
};
