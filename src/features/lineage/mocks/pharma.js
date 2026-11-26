import { ASSET_KIND, HEALTH, LAYER, TRANSFORM } from '../constants';
import { cols, columnsOf, made, withDerivations } from './helpers';

/**
 * The Pharma workspace: the brand360 catalog, bronze to gold — every asset
 * in a medallion layer, nothing outside the catalog. The clean case, which
 * the other workspaces depart from.
 *
 * Each asset lists its own inputs (`upstream`), because that is how lineage is
 * captured — a job knows what it read, not who will read it. What reads an
 * asset is the same edges taken the other way, which `lineageGraph.js` builds.
 *
 * Shaped so the canvas has something to show in every direction: gold tables
 * that share silver inputs (focus a silver table and both appear downstream),
 * a silver table built from another silver table (a layer two columns wide),
 * a view built on a gold table, one stale and one failing branch, and raw
 * tables wide enough (15-18 columns) that an opened card has to fold some.
 *
 * Column lineage is in COLUMN_LINEAGE at the foot: for every silver and gold
 * column, the columns it was made from and the logic that made it.
 */
const CATALOG = 'brand360';

/** Asset ids, so an `upstream` list cannot point at a table by a typo. */
const T = {
  bronzeSales: 'bronze.bronze_sales',
  productMaster: 'bronze.product_master',
  rwePatient: 'bronze.bronze_rwe_patient',
  campaignEmail: 'bronze.bronze_campaign_email',
  smsEngagement: 'bronze.bronze_sms_engagement',
  contentUsage: 'bronze.bronze_content_usage',
  campaignCalendar: 'bronze.bronze_campaign_calendar',
  hcpProfile: 'bronze.bronze_hcp_profile',
  territoryAlignment: 'bronze.bronze_territory_alignment',
  salesFact: 'silver.silver_sales_fact',
  rweFact: 'silver.silver_rwe_fact',
  campaignFact: 'silver.silver_campaign_fact',
  brandCampaign: 'silver.silver_brand_campaign_master',
  hcpMaster: 'silver.silver_hcp_master',
  territoryDim: 'silver.silver_territory_dim',
  brand360: 'gold.gold_brand360',
  brand360Weekly: 'gold.gold_brand360_weekly',
  hcpEngagement: 'gold.gold_hcp_engagement',
  salesPerformance: 'gold.gold_sales_performance',
};

const asset = (layer, name, fields) => ({
  id: `${layer}.${name}`,
  fqn: `${CATALOG}.${layer}.${name}`,
  name,
  layer,
  kind: ASSET_KIND.table,
  health: HEALTH.healthy,
  upstream: [],
  ...fields,
});

const ASSETS = [
  /* ---- gold ---- */
  asset(LAYER.gold, 'gold_brand360', {
    description: 'Weekly brand scorecard: sales, patients on therapy and campaign reach.',
    owner: 'Commercial Analytics',
    rows: '52.4k',
    updatedAt: '40m ago',
    job: 'brand360_gold (dbt model)',
    upstream: [T.salesFact, T.rweFact, T.campaignFact, T.brandCampaign],
    columns: cols(
      'brand string',
      'week_start date',
      'net_sales_usd decimal(18,2)',
      'gross_sales_usd decimal(18,2)',
      'units int',
      'patients_on_therapy int',
      'new_patients int',
      'avg_persistence_days double',
      'campaign_touches bigint',
      'engaged_touches bigint',
      'engaged_hcps int',
      'engagement_rate double',
      'active_campaigns int',
      'spend_usd decimal(14,2)',
      'cost_per_engagement double',
      'sales_per_spend double',
    ),
  }),
  asset(LAYER.gold, 'gold_brand360_weekly', {
    kind: ASSET_KIND.view,
    description: 'Week-on-week change and return on spend, for the brand dashboard.',
    owner: 'Commercial Analytics',
    rows: null,
    updatedAt: '40m ago',
    job: 'brand360_weekly (view)',
    upstream: [T.brand360],
    columns: cols(
      'brand string',
      'week_start date',
      'net_sales_usd decimal(18,2)',
      'wow_sales_change double',
      'engaged_hcps int',
      'spend_usd decimal(14,2)',
      'sales_per_spend double',
    ),
  }),
  asset(LAYER.gold, 'gold_hcp_engagement', {
    description: 'Ninety-day engagement per healthcare professional, across every channel.',
    owner: 'Marketing Ops Data',
    rows: '398k',
    updatedAt: '35m ago',
    job: 'hcp_engagement_gold (dbt model)',
    upstream: [T.campaignFact, T.hcpMaster],
    columns: cols(
      'hcp_key string',
      'specialty string',
      'region string',
      'touches_90d int',
      'engaged_touches_90d int',
      'last_touch_at timestamp',
      'preferred_channel string',
    ),
  }),
  asset(LAYER.gold, 'gold_sales_performance', {
    description: 'Monthly sales against quota by territory and rep.',
    owner: 'Sales Operations',
    rows: '118k',
    updatedAt: '13h ago',
    health: HEALTH.stale,
    healthNote: 'Held back while silver_territory_dim fails its tests',
    job: 'sales_performance_gold (dbt model)',
    upstream: [T.salesFact, T.territoryDim],
    columns: cols(
      'territory_code string',
      'region string',
      'rep_id string',
      'month date',
      'net_sales_usd decimal(18,2)',
      'units int',
      'quota_usd decimal(18,2)',
      'attainment_pct double',
    ),
  }),

  /* ---- silver ---- */
  asset(LAYER.silver, 'silver_sales_fact', {
    description: 'One row per sale line, deduplicated, priced in USD and tied to a product.',
    owner: 'Commercial Data Eng',
    rows: '17.9m',
    updatedAt: '1h ago',
    job: 'commercial_silver (Lakeflow pipeline)',
    upstream: [T.bronzeSales, T.productMaster],
    columns: cols(
      'sale_id string',
      'sale_date date',
      'product_id string',
      'brand string',
      'therapeutic_area string',
      'customer_id string',
      'territory_code string',
      'units int',
      'gross_sales_usd decimal(18,2)',
      'discount_usd decimal(18,2)',
      'net_sales_usd decimal(18,2)',
      'is_return boolean',
      '_loaded_at timestamp',
      '_batch_id string',
    ),
  }),
  asset(LAYER.silver, 'silver_rwe_fact', {
    description: 'Real-world evidence per de-identified patient: therapy start and persistence.',
    owner: 'RWE Analytics',
    rows: '6.5m',
    updatedAt: '1d ago',
    health: HEALTH.stale,
    healthNote: 'Last load 26h ago; expected daily',
    job: 'rwe_silver (Lakeflow pipeline)',
    upstream: [T.rwePatient],
    columns: cols(
      'patient_key string',
      'age_band string',
      'gender string',
      'region string',
      'indication string',
      'product_id string',
      'therapy_start date',
      'persistence_days int',
      'is_persistent boolean',
      '_loaded_at timestamp',
    ),
  }),
  asset(LAYER.silver, 'silver_campaign_fact', {
    description: 'Every campaign touch, whichever channel it went out on.',
    owner: 'Marketing Ops Data',
    rows: '14.1m',
    updatedAt: '35m ago',
    job: 'campaign_silver (Lakeflow pipeline)',
    upstream: [T.campaignEmail, T.smsEngagement, T.contentUsage],
    columns: cols(
      'touch_id string',
      'campaign_code string',
      'hcp_key string',
      'channel string',
      'touched_at timestamp',
      'engaged boolean',
      'engagement_score double',
      '_loaded_at timestamp',
    ),
  }),
  asset(LAYER.silver, 'silver_brand_campaign_master', {
    description: 'Campaigns with the brand and product they promote, and what they cost.',
    owner: 'Marketing Ops Data',
    rows: '640',
    updatedAt: '1d ago',
    job: 'campaign_silver (Lakeflow pipeline)',
    upstream: [T.campaignCalendar, T.productMaster],
    columns: cols(
      'campaign_code string',
      'campaign_name string',
      'brand string',
      'product_id string',
      'channel string',
      'start_date date',
      'end_date date',
      'budget_usd decimal(14,2)',
    ),
  }),
  asset(LAYER.silver, 'silver_hcp_master', {
    description: 'One record per healthcare professional, matched across sources.',
    owner: 'Customer Data Eng',
    rows: '398k',
    updatedAt: '12h ago',
    job: 'hcp_silver (Lakeflow pipeline)',
    upstream: [T.hcpProfile],
    columns: cols(
      'hcp_key string',
      'npi string',
      'full_name string',
      'specialty string',
      'zip string',
      'is_active boolean',
    ),
  }),
  asset(LAYER.silver, 'silver_territory_dim', {
    description: 'Sales territories with their rep and the professionals they cover.',
    owner: 'Sales Operations',
    rows: '9.6k',
    updatedAt: '12h ago',
    health: HEALTH.failing,
    healthNote: '2 of 11 tests failing: duplicate territory codes',
    job: 'territory_silver (Lakeflow pipeline)',
    upstream: [T.territoryAlignment, T.hcpMaster],
    columns: cols(
      'territory_code string',
      'territory_name string',
      'region string',
      'rep_id string',
      'hcp_count int',
    ),
  }),

  /* ---- bronze ---- */
  asset(LAYER.bronze, 'bronze_sales', {
    description: 'Sales order lines exactly as the ERP exports them.',
    owner: 'Data Platform',
    rows: '18.4m',
    updatedAt: '1h ago',
    source: 'SAP S/4HANA',
    columns: cols(
      'sale_id string',
      'order_date date',
      'order_type string',
      'product_code string',
      'customer_code string',
      'territory_code string',
      'sales_org string',
      'distribution_channel string',
      'plant string',
      'quantity int',
      'uom string',
      'gross_amount decimal(18,2)',
      'discount_amount decimal(18,2)',
      'tax_amount decimal(18,2)',
      'net_amount decimal(18,2)',
      'currency string',
      '_ingested_at timestamp',
      '_source_file string',
    ),
  }),
  asset(LAYER.bronze, 'product_master', {
    description: 'Products, brands and therapeutic areas from the regulatory vault.',
    owner: 'Data Platform',
    rows: '2.1k',
    updatedAt: '6h ago',
    source: 'Veeva Vault',
    columns: cols(
      'product_code string',
      'product_name string',
      'brand string',
      'therapeutic_area string',
      'dosage_form string',
      'strength string',
      'launch_date date',
      'status string',
      '_ingested_at timestamp',
    ),
  }),
  asset(LAYER.bronze, 'bronze_rwe_patient', {
    description: 'De-identified patient journeys from the real-world data feed.',
    owner: 'RWE Analytics',
    rows: '6.7m',
    updatedAt: '1d ago',
    health: HEALTH.stale,
    healthNote: 'Feed delivered 26h ago; expected daily',
    source: 'IQVIA real-world data',
    columns: cols(
      'patient_token string',
      'birth_year int',
      'gender string',
      'region string',
      'zip3 string',
      'payer_type string',
      'diagnosis_code string',
      'diagnosis_date date',
      'product_code string',
      'therapy_start date',
      'last_fill_date date',
      'days_supply int',
      'prescriber_npi string',
      '_ingested_at timestamp',
      '_source_file string',
    ),
  }),
  asset(LAYER.bronze, 'bronze_campaign_email', {
    description: 'Email sends with opens, clicks and bounces.',
    owner: 'Data Platform',
    rows: '9.2m',
    updatedAt: '30m ago',
    source: 'Salesforce Marketing Cloud',
    columns: cols(
      'send_id string',
      'campaign_code string',
      'hcp_id string',
      'email_hash string',
      'subject_line string',
      'template_id string',
      'sent_at timestamp',
      'delivered boolean',
      'opened boolean',
      'clicked boolean',
      'bounced boolean',
      'unsubscribed boolean',
      '_ingested_at timestamp',
      '_source_file string',
    ),
  }),
  asset(LAYER.bronze, 'bronze_sms_engagement', {
    description: 'SMS messages with delivery status and replies.',
    owner: 'Data Platform',
    rows: '3.4m',
    updatedAt: '30m ago',
    source: 'Twilio',
    columns: cols(
      'message_sid string',
      'campaign_code string',
      'hcp_id string',
      'phone_hash string',
      'sent_at timestamp',
      'delivery_status string',
      'replied boolean',
      '_ingested_at timestamp',
    ),
  }),
  asset(LAYER.bronze, 'bronze_content_usage', {
    description: 'Field content opened by professionals during rep visits.',
    owner: 'Data Platform',
    rows: '1.8m',
    updatedAt: '3h ago',
    source: 'Veeva CRM',
    columns: cols(
      'view_id string',
      'content_id string',
      'content_title string',
      'campaign_code string',
      'hcp_id string',
      'rep_id string',
      'viewed_at timestamp',
      'duration_sec int',
      '_ingested_at timestamp',
    ),
  }),
  asset(LAYER.bronze, 'bronze_campaign_calendar', {
    description: 'Planned campaigns with channel, dates and budget.',
    owner: 'Data Platform',
    rows: '640',
    updatedAt: '1d ago',
    source: 'Workfront',
    columns: cols(
      'campaign_code string',
      'campaign_name string',
      'brand string',
      'channel string',
      'owner_email string',
      'start_date date',
      'end_date date',
      'budget decimal(14,2)',
      '_ingested_at timestamp',
    ),
  }),
  asset(LAYER.bronze, 'bronze_hcp_profile', {
    description: 'Healthcare professional reference data.',
    owner: 'Data Platform',
    rows: '412k',
    updatedAt: '12h ago',
    source: 'IQVIA OneKey',
    columns: cols(
      'onekey_id string',
      'npi string',
      'first_name string',
      'last_name string',
      'specialty string',
      'practice_name string',
      'practice_zip string',
      'status string',
      'last_verified date',
      '_ingested_at timestamp',
    ),
  }),
  asset(LAYER.bronze, 'bronze_territory_alignment', {
    description: 'Which rep covers which postcodes, by effective date.',
    owner: 'Data Platform',
    rows: '9.8k',
    updatedAt: '12h ago',
    source: 'Veeva CRM',
    columns: cols(
      'territory_code string',
      'territory_name string',
      'region string',
      'rep_id string',
      'rep_email string',
      'zip string',
      'effective_from date',
      'effective_to date',
    ),
  }),
];

/* ---- column lineage ----
   Every silver and gold column: the kind of step that made it, the logic as a
   pipeline would write it, and the columns it read. Bronze columns have none —
   they are where the data enters. Inputs are always columns of the asset's own
   `upstream` tables, so a column trace never leaves the table graph. */

const bronzeSales = columnsOf(T.bronzeSales);
const productMaster = columnsOf(T.productMaster);
const rwePatient = columnsOf(T.rwePatient);
const campaignEmail = columnsOf(T.campaignEmail);
const smsEngagement = columnsOf(T.smsEngagement);
const contentUsage = columnsOf(T.contentUsage);
const campaignCalendar = columnsOf(T.campaignCalendar);
const hcpProfile = columnsOf(T.hcpProfile);
const territoryAlignment = columnsOf(T.territoryAlignment);
const salesFact = columnsOf(T.salesFact);
const rweFact = columnsOf(T.rweFact);
const campaignFact = columnsOf(T.campaignFact);
const brandCampaign = columnsOf(T.brandCampaign);
const hcpMaster = columnsOf(T.hcpMaster);
const territoryDim = columnsOf(T.territoryDim);
const brand360 = columnsOf(T.brand360);

const K = TRANSFORM;
const LOADED_AT = made(K.system, 'current_timestamp()  -- when this batch was written');
const FX_JOIN = '\n-- JOIN fx_daily fx ON fx.currency = s.currency';
const PRODUCT_JOIN = '\n-- JOIN product_master p ON p.product_code = s.product_code';
const TERRITORY_JOIN = '\n-- JOIN silver_territory_dim t ON t.territory_code = sf.territory_code';
const LAST_90_DAYS = 'cf.touched_at >= current_date() - INTERVAL 90 DAYS';

const COLUMN_LINEAGE = {
  /* ---- silver ---- */
  [T.salesFact]: {
    sale_id: made(K.direct, 's.sale_id', bronzeSales('sale_id')),
    sale_date: made(K.renamed, 's.order_date AS sale_date', bronzeSales('order_date')),
    product_id: made(K.renamed, 's.product_code AS product_id', bronzeSales('product_code')),
    brand: made(K.lookup, `p.brand${PRODUCT_JOIN}`, productMaster('brand')),
    therapeutic_area: made(
      K.lookup,
      `p.therapeutic_area${PRODUCT_JOIN}`,
      productMaster('therapeutic_area'),
    ),
    customer_id: made(K.renamed, 's.customer_code AS customer_id', bronzeSales('customer_code')),
    territory_code: made(K.direct, 's.territory_code', bronzeSales('territory_code')),
    units: made(K.derived, 'ABS(s.quantity)', bronzeSales('quantity')),
    gross_sales_usd: made(
      K.derived,
      `s.gross_amount * fx.rate_to_usd${FX_JOIN}`,
      bronzeSales('gross_amount'),
      bronzeSales('currency'),
    ),
    discount_usd: made(
      K.derived,
      `s.discount_amount * fx.rate_to_usd${FX_JOIN}`,
      bronzeSales('discount_amount'),
      bronzeSales('currency'),
    ),
    net_sales_usd: made(
      K.derived,
      `(s.gross_amount - s.discount_amount) * fx.rate_to_usd${FX_JOIN}`,
      bronzeSales('gross_amount'),
      bronzeSales('discount_amount'),
      bronzeSales('currency'),
    ),
    is_return: made(K.derived, "s.order_type = 'RE'", bronzeSales('order_type')),
    _loaded_at: LOADED_AT,
    _batch_id: made(K.system, 'pipeline.batch_id()'),
  },
  [T.rweFact]: {
    patient_key: made(K.derived, 'sha2(r.patient_token, 256)', rwePatient('patient_token')),
    age_band: made(
      K.derived,
      [
        'CASE',
        "  WHEN year(current_date()) - r.birth_year < 40 THEN 'under 40'",
        "  WHEN year(current_date()) - r.birth_year < 65 THEN '40-64'",
        "  ELSE '65+'",
        'END',
      ].join('\n'),
      rwePatient('birth_year'),
    ),
    gender: made(K.derived, 'UPPER(r.gender)', rwePatient('gender')),
    region: made(K.direct, 'r.region', rwePatient('region')),
    indication: made(
      K.lookup,
      'icd.indication\n-- JOIN icd10_indication icd ON icd.code = r.diagnosis_code',
      rwePatient('diagnosis_code'),
    ),
    product_id: made(K.renamed, 'r.product_code AS product_id', rwePatient('product_code')),
    therapy_start: made(K.direct, 'r.therapy_start', rwePatient('therapy_start')),
    persistence_days: made(
      K.derived,
      'datediff(date_add(r.last_fill_date, r.days_supply), r.therapy_start)',
      rwePatient('last_fill_date'),
      rwePatient('days_supply'),
      rwePatient('therapy_start'),
    ),
    is_persistent: made(
      K.derived,
      'datediff(date_add(r.last_fill_date, r.days_supply), r.therapy_start) >= 180',
      rwePatient('last_fill_date'),
      rwePatient('days_supply'),
      rwePatient('therapy_start'),
    ),
    _loaded_at: LOADED_AT,
  },
  [T.campaignFact]: {
    touch_id: made(
      K.unioned,
      ['e.send_id', 'UNION ALL s.message_sid', 'UNION ALL c.view_id'].join('\n'),
      campaignEmail('send_id'),
      smsEngagement('message_sid'),
      contentUsage('view_id'),
    ),
    campaign_code: made(
      K.unioned,
      'UPPER(TRIM(campaign_code))\n-- one branch per channel (email, sms, content), UNION ALL',
      campaignEmail('campaign_code'),
      smsEngagement('campaign_code'),
      contentUsage('campaign_code'),
    ),
    hcp_key: made(
      K.lookup,
      'x.hcp_key\n-- JOIN hcp_xref x ON x.source_id = hcp_id, in each branch',
      campaignEmail('hcp_id'),
      smsEngagement('hcp_id'),
      contentUsage('hcp_id'),
    ),
    channel: made(K.constant, "'email' | 'sms' | 'content'  -- set by each branch"),
    touched_at: made(
      K.unioned,
      ['e.sent_at', 'UNION ALL s.sent_at', 'UNION ALL c.viewed_at'].join('\n'),
      campaignEmail('sent_at'),
      smsEngagement('sent_at'),
      contentUsage('viewed_at'),
    ),
    engaged: made(
      K.derived,
      [
        '-- email',
        'e.opened OR e.clicked',
        '-- sms',
        's.replied',
        '-- content',
        'c.duration_sec >= 30',
      ].join('\n'),
      campaignEmail('opened'),
      campaignEmail('clicked'),
      smsEngagement('replied'),
      contentUsage('duration_sec'),
    ),
    engagement_score: made(
      K.derived,
      [
        '-- email',
        '0.3 * e.opened + 0.7 * e.clicked',
        '-- sms',
        'IF(s.replied, 1.0, 0.2)',
        '-- content',
        'LEAST(c.duration_sec / 120, 1.0)',
      ].join('\n'),
      campaignEmail('opened'),
      campaignEmail('clicked'),
      smsEngagement('replied'),
      contentUsage('duration_sec'),
    ),
    _loaded_at: LOADED_AT,
  },
  [T.brandCampaign]: {
    campaign_code: made(
      K.derived,
      'UPPER(TRIM(k.campaign_code))',
      campaignCalendar('campaign_code'),
    ),
    campaign_name: made(K.direct, 'k.campaign_name', campaignCalendar('campaign_name')),
    brand: made(K.direct, 'k.brand', campaignCalendar('brand')),
    product_id: made(
      K.lookup,
      'p.product_code AS product_id\n-- JOIN product_master p ON p.brand = k.brand',
      productMaster('product_code'),
    ),
    channel: made(K.derived, 'LOWER(k.channel)', campaignCalendar('channel')),
    start_date: made(K.direct, 'k.start_date', campaignCalendar('start_date')),
    end_date: made(K.direct, 'k.end_date', campaignCalendar('end_date')),
    budget_usd: made(K.renamed, 'k.budget AS budget_usd', campaignCalendar('budget')),
  },
  [T.hcpMaster]: {
    hcp_key: made(K.derived, 'sha2(h.onekey_id, 256)', hcpProfile('onekey_id')),
    npi: made(K.direct, 'h.npi', hcpProfile('npi')),
    full_name: made(
      K.derived,
      "concat_ws(' ', initcap(h.first_name), initcap(h.last_name))",
      hcpProfile('first_name'),
      hcpProfile('last_name'),
    ),
    specialty: made(K.direct, 'h.specialty', hcpProfile('specialty')),
    zip: made(K.derived, 'left(h.practice_zip, 5)', hcpProfile('practice_zip')),
    is_active: made(K.derived, "h.status = 'ACTIVE'", hcpProfile('status')),
  },
  [T.territoryDim]: {
    territory_code: made(K.direct, 'a.territory_code', territoryAlignment('territory_code')),
    territory_name: made(K.direct, 'a.territory_name', territoryAlignment('territory_name')),
    region: made(K.direct, 'a.region', territoryAlignment('region')),
    rep_id: made(K.direct, 'a.rep_id', territoryAlignment('rep_id')),
    hcp_count: made(
      K.aggregated,
      'COUNT(DISTINCT m.hcp_key)\n-- JOIN silver_hcp_master m ON m.zip = a.zip',
      hcpMaster('hcp_key'),
      territoryAlignment('zip'),
    ),
  },

  /* ---- gold ---- */
  [T.brand360]: {
    brand: made(K.direct, 'sf.brand  -- grouping key', salesFact('brand')),
    week_start: made(K.derived, "date_trunc('week', sf.sale_date)", salesFact('sale_date')),
    net_sales_usd: made(K.aggregated, 'SUM(sf.net_sales_usd)', salesFact('net_sales_usd')),
    gross_sales_usd: made(K.aggregated, 'SUM(sf.gross_sales_usd)', salesFact('gross_sales_usd')),
    units: made(K.aggregated, 'SUM(sf.units)', salesFact('units')),
    patients_on_therapy: made(
      K.aggregated,
      'COUNT(DISTINCT rf.patient_key) FILTER (WHERE rf.is_persistent)',
      rweFact('patient_key'),
      rweFact('is_persistent'),
    ),
    new_patients: made(
      K.aggregated,
      "COUNT(DISTINCT rf.patient_key)\n  FILTER (WHERE date_trunc('week', rf.therapy_start) = week_start)",
      rweFact('patient_key'),
      rweFact('therapy_start'),
    ),
    avg_persistence_days: made(
      K.aggregated,
      'AVG(rf.persistence_days)',
      rweFact('persistence_days'),
    ),
    campaign_touches: made(K.aggregated, 'COUNT(cf.touch_id)', campaignFact('touch_id')),
    engaged_touches: made(K.aggregated, 'COUNT_IF(cf.engaged)', campaignFact('engaged')),
    engaged_hcps: made(
      K.aggregated,
      'COUNT(DISTINCT cf.hcp_key) FILTER (WHERE cf.engaged)',
      campaignFact('hcp_key'),
      campaignFact('engaged'),
    ),
    engagement_rate: made(
      K.derived,
      'COUNT_IF(cf.engaged) / NULLIF(COUNT(cf.touch_id), 0)',
      campaignFact('engaged'),
      campaignFact('touch_id'),
    ),
    active_campaigns: made(
      K.aggregated,
      'COUNT(DISTINCT cf.campaign_code)  -- campaigns with a touch that week',
      campaignFact('campaign_code'),
    ),
    spend_usd: made(
      K.aggregated,
      'SUM(bc.budget_usd / datediff(bc.end_date, bc.start_date) * 7)\n-- each budget spread evenly over its campaign; one week of it',
      brandCampaign('budget_usd'),
      brandCampaign('start_date'),
      brandCampaign('end_date'),
    ),
    cost_per_engagement: made(
      K.derived,
      'spend_usd / NULLIF(COUNT_IF(cf.engaged), 0)',
      brandCampaign('budget_usd'),
      campaignFact('engaged'),
    ),
    sales_per_spend: made(
      K.derived,
      'SUM(sf.net_sales_usd) / NULLIF(spend_usd, 0)',
      salesFact('net_sales_usd'),
      brandCampaign('budget_usd'),
    ),
  },
  [T.brand360Weekly]: {
    brand: made(K.direct, 'g.brand', brand360('brand')),
    week_start: made(K.direct, 'g.week_start', brand360('week_start')),
    net_sales_usd: made(K.direct, 'g.net_sales_usd', brand360('net_sales_usd')),
    wow_sales_change: made(
      K.derived,
      'g.net_sales_usd\n  / LAG(g.net_sales_usd) OVER (PARTITION BY g.brand ORDER BY g.week_start)\n  - 1',
      brand360('net_sales_usd'),
    ),
    engaged_hcps: made(K.direct, 'g.engaged_hcps', brand360('engaged_hcps')),
    spend_usd: made(K.direct, 'g.spend_usd', brand360('spend_usd')),
    sales_per_spend: made(K.direct, 'g.sales_per_spend', brand360('sales_per_spend')),
  },
  [T.hcpEngagement]: {
    hcp_key: made(K.direct, 'm.hcp_key  -- grouping key', hcpMaster('hcp_key')),
    specialty: made(K.direct, 'm.specialty', hcpMaster('specialty')),
    region: made(
      K.lookup,
      'geo.region\n-- JOIN zip_region geo ON geo.zip = m.zip',
      hcpMaster('zip'),
    ),
    touches_90d: made(
      K.aggregated,
      `COUNT(cf.touch_id)\n  FILTER (WHERE ${LAST_90_DAYS})`,
      campaignFact('touch_id'),
      campaignFact('touched_at'),
    ),
    engaged_touches_90d: made(
      K.aggregated,
      `COUNT_IF(cf.engaged AND ${LAST_90_DAYS})`,
      campaignFact('engaged'),
      campaignFact('touched_at'),
    ),
    last_touch_at: made(K.aggregated, 'MAX(cf.touched_at)', campaignFact('touched_at')),
    preferred_channel: made(
      K.aggregated,
      'max_by(cf.channel, cf.engagement_score)',
      campaignFact('channel'),
      campaignFact('engagement_score'),
    ),
  },
  [T.salesPerformance]: {
    territory_code: made(K.direct, 'sf.territory_code', salesFact('territory_code')),
    region: made(K.lookup, `t.region${TERRITORY_JOIN}`, territoryDim('region')),
    rep_id: made(K.lookup, `t.rep_id${TERRITORY_JOIN}`, territoryDim('rep_id')),
    month: made(K.derived, "date_trunc('month', sf.sale_date)", salesFact('sale_date')),
    net_sales_usd: made(K.aggregated, 'SUM(sf.net_sales_usd)', salesFact('net_sales_usd')),
    units: made(K.aggregated, 'SUM(sf.units)', salesFact('units')),
    quota_usd: made(
      K.lookup,
      'q.quota_usd\n-- JOIN sales_quota q ON q.rep_id = t.rep_id AND q.month = month',
      territoryDim('rep_id'),
    ),
    attainment_pct: made(
      K.derived,
      'SUM(sf.net_sales_usd) / NULLIF(q.quota_usd, 0) * 100',
      salesFact('net_sales_usd'),
      territoryDim('rep_id'),
    ),
  },
};

export const PHARMA_WORKSPACE = {
  id: 'pharma',
  label: 'Pharma',
  syncedAt: '2026-07-18T08:21:00',
  layers: [{ id: LAYER.bronze }, { id: LAYER.silver }, { id: LAYER.gold }],
  lineage: { assets: withDerivations(ASSETS, COLUMN_LINEAGE) },
};
