import { ASSET_KIND, HEALTH, TRANSFORM } from '../constants';
import { cols, columnsOf, made, withDerivations } from './helpers';

/**
 * The Finance workspace: a catalog that classifies nothing. No layers are
 * set anywhere, so the canvas has only the flow to go on — ledger and rates
 * in, through conversion and reconciliation, to the month-end reports — plus
 * one input outside the catalog, the bank's daily statement files.
 */
const CATALOG = 'ledger';

const asset = (name, fields) => ({
  id: `finance.${name}`,
  fqn: `${CATALOG}.finance.${name}`,
  name,
  layer: null,
  kind: ASSET_KIND.table,
  health: HEALTH.healthy,
  upstream: [],
  ...fields,
});

const T = {
  journal: 'finance.gl_journal_lines',
  fx: 'finance.fx_rates',
  accounts: 'finance.coa_accounts',
  bankLines: 'finance.bank_statement_lines',
  journalUsd: 'finance.journal_usd',
  recon: 'finance.cash_reconciliation',
  trialBalance: 'finance.trial_balance',
  pnl: 'finance.pnl_monthly',
  checklist: 'finance.close_checklist',
};

const BANK_FILES = 'sftp://bank-feeds/statements_*.csv';

const ASSETS = [
  asset('gl_journal_lines', {
    description: 'Journal lines posted in the general ledger.',
    owner: 'Finance Systems',
    rows: '22.7m',
    updatedAt: '4h ago',
    source: 'Oracle EBS',
    columns: cols(
      'line_id string',
      'entity string',
      'account_code string',
      'amount decimal(18,2)',
      'currency string',
      'posted_on date',
    ),
  }),
  asset('fx_rates', {
    description: 'Daily exchange rates to US dollars.',
    owner: 'Treasury',
    rows: '96k',
    updatedAt: '1d ago',
    source: 'ECB reference rates',
    columns: cols('currency string', 'rate_date date', 'rate_to_usd decimal(18,8)'),
  }),
  asset('coa_accounts', {
    description: 'The chart of accounts.',
    owner: 'Finance Systems',
    rows: '3.9k',
    updatedAt: '7d ago',
    source: 'Oracle EBS',
    columns: cols('account_code string', 'account_name string', 'account_type string'),
  }),
  asset('bank_statement_lines', {
    description: 'Bank statement lines from the daily bank files.',
    owner: 'Treasury',
    rows: '4.1m',
    updatedAt: '6h ago',
    source: 'Bank SFTP feed',
    upstream: [BANK_FILES],
    columns: cols(
      'stmt_line_id string',
      'account_no string',
      'amount decimal(18,2)',
      'value_date date',
      'reference string',
    ),
  }),
  asset('journal_usd', {
    description: 'Journal lines converted to US dollars at the posting date’s rate.',
    owner: 'Finance Data Eng',
    rows: '22.7m',
    updatedAt: '3h ago',
    job: 'journal_usd (dbt model)',
    upstream: [T.journal, T.fx],
    columns: cols(
      'line_id string',
      'entity string',
      'account_code string',
      'amount_usd decimal(18,2)',
      'posted_on date',
    ),
  }),
  asset('cash_reconciliation', {
    description: 'Bank lines matched to cash journal lines.',
    owner: 'Treasury',
    rows: '4.0m',
    updatedAt: '1d ago',
    health: HEALTH.stale,
    healthNote: 'Last run 31h ago; expected daily',
    job: 'cash_recon (Python job)',
    upstream: [T.journalUsd, T.bankLines],
    columns: cols(
      'stmt_line_id string',
      'line_id string',
      'amount_usd decimal(18,2)',
      'matched boolean',
      'variance_usd decimal(18,2)',
    ),
  }),
  asset('trial_balance', {
    description: 'Month-end balance per entity and account.',
    owner: 'Financial Reporting',
    rows: '210k',
    updatedAt: '3h ago',
    job: 'trial_balance (dbt model)',
    upstream: [T.journalUsd, T.accounts],
    columns: cols(
      'entity string',
      'account_code string',
      'account_type string',
      'period string',
      'balance_usd decimal(18,2)',
    ),
  }),
  asset('pnl_monthly', {
    description: 'Profit and loss by entity and month.',
    owner: 'Financial Reporting',
    rows: '1.8k',
    updatedAt: '3h ago',
    job: 'pnl_monthly (dbt model)',
    upstream: [T.trialBalance],
    columns: cols(
      'entity string',
      'period string',
      'revenue_usd decimal(18,2)',
      'expense_usd decimal(18,2)',
      'net_income_usd decimal(18,2)',
    ),
  }),
  asset('close_checklist', {
    kind: ASSET_KIND.view,
    description: 'Month-end close: reconciliations and balances still waiting for sign-off.',
    owner: 'Financial Reporting',
    rows: null,
    updatedAt: '3h ago',
    job: 'close_checklist (view)',
    upstream: [T.recon, T.trialBalance],
    columns: cols('period string', 'unmatched_lines int', 'accounts_out_of_balance int'),
  }),
];

const EXTERNALS = [
  { id: BANK_FILES, name: 'statements_*.csv', kind: ASSET_KIND.file, location: BANK_FILES },
];

/* ---- column lineage ---- */
const K = TRANSFORM;
const journal = columnsOf(T.journal);
const fx = columnsOf(T.fx);
const accounts = columnsOf(T.accounts);
const bankLines = columnsOf(T.bankLines);
const journalUsd = columnsOf(T.journalUsd);
const recon = columnsOf(T.recon);
const trialBalance = columnsOf(T.trialBalance);

const FX_JOIN = '\n-- JOIN fx_rates fx ON fx.currency = j.currency AND fx.rate_date = j.posted_on';
const MATCH_JOIN =
  '\n-- LEFT JOIN journal_usd j ON j.amount_usd = b.amount AND j.posted_on = b.value_date';
const BY_TYPE = (type) => `SUM(CASE WHEN tb.account_type = '${type}' THEN tb.balance_usd END)`;

const COLUMN_LINEAGE = {
  [T.journalUsd]: {
    line_id: made(K.direct, 'j.line_id', journal('line_id')),
    entity: made(K.direct, 'j.entity', journal('entity')),
    account_code: made(K.direct, 'j.account_code', journal('account_code')),
    amount_usd: made(
      K.derived,
      `j.amount * fx.rate_to_usd${FX_JOIN}`,
      journal('amount'),
      journal('currency'),
      fx('rate_to_usd'),
    ),
    posted_on: made(K.direct, 'j.posted_on', journal('posted_on')),
  },
  [T.recon]: {
    stmt_line_id: made(K.direct, 'b.stmt_line_id', bankLines('stmt_line_id')),
    line_id: made(K.lookup, `j.line_id${MATCH_JOIN}`, journalUsd('line_id'), bankLines('amount')),
    amount_usd: made(K.direct, 'j.amount_usd', journalUsd('amount_usd')),
    matched: made(K.derived, 'j.line_id IS NOT NULL', journalUsd('line_id')),
    variance_usd: made(
      K.derived,
      'b.amount - COALESCE(j.amount_usd, 0)',
      bankLines('amount'),
      journalUsd('amount_usd'),
    ),
  },
  [T.trialBalance]: {
    entity: made(K.direct, 'j.entity', journalUsd('entity')),
    account_code: made(K.direct, 'j.account_code', journalUsd('account_code')),
    account_type: made(
      K.lookup,
      'a.account_type\n-- JOIN coa_accounts a ON a.account_code = j.account_code',
      accounts('account_type'),
    ),
    period: made(K.derived, "date_format(j.posted_on, 'yyyy-MM')", journalUsd('posted_on')),
    balance_usd: made(K.aggregated, 'SUM(j.amount_usd)', journalUsd('amount_usd')),
  },
  [T.pnl]: {
    entity: made(K.direct, 'tb.entity', trialBalance('entity')),
    period: made(K.direct, 'tb.period', trialBalance('period')),
    revenue_usd: made(
      K.aggregated,
      BY_TYPE('revenue'),
      trialBalance('account_type'),
      trialBalance('balance_usd'),
    ),
    expense_usd: made(
      K.aggregated,
      BY_TYPE('expense'),
      trialBalance('account_type'),
      trialBalance('balance_usd'),
    ),
    net_income_usd: made(
      K.aggregated,
      `${BY_TYPE('revenue')} - ${BY_TYPE('expense')}`,
      trialBalance('account_type'),
      trialBalance('balance_usd'),
    ),
  },
  [T.checklist]: {
    period: made(K.direct, 'tb.period', trialBalance('period')),
    unmatched_lines: made(K.aggregated, 'COUNT_IF(NOT r.matched)', recon('matched')),
    accounts_out_of_balance: made(
      K.aggregated,
      "COUNT_IF(tb.account_type = 'suspense' AND tb.balance_usd <> 0)",
      trialBalance('account_type'),
      trialBalance('balance_usd'),
    ),
  },
};

export const FINANCE_WORKSPACE = {
  id: 'finance',
  label: 'Finance',
  syncedAt: '2026-11-26T06:05:00',
  layers: [],
  lineage: { assets: withDerivations(ASSETS, COLUMN_LINEAGE), externals: EXTERNALS },
};
