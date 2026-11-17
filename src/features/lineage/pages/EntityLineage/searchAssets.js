import { ASSET_KIND_META, LAYER_META, LAYER_ORDER } from '@/features/lineage/constants';

/**
 * Table search for the entity level: what someone typed, matched against the
 * catalog and ranked so the table they meant is first.
 *
 * Every word has to land somewhere, so "silver sales" narrows to silver tables
 * about sales rather than widening to both. A word that lands in the name
 * counts for more than one that lands in the owner or the description, and
 * the start of the name or of a word in it (`rwe` in `silver_rwe_fact`) counts
 * for more than the middle.
 */

/** How well one word fits an asset, best first. */
const RANK = {
  namePrefix: 0,
  wordPrefix: 1,
  nameInside: 2,
  tag: 3,
  fact: 4,
  description: 5,
};

/** Facts worth matching on, in the order a match is reported. */
export const SEARCH_FACTS = ['owner', 'source', 'job'];

/**
 * The query as lower-case words. A dot splits too, so a pasted
 * `silver_rwe_fact.age_band` searches for the table and the column.
 */
export const searchTerms = (query) =>
  query
    .trim()
    .toLowerCase()
    .split(/[\s.]+/)
    .filter(Boolean);

function fit(asset, term) {
  const name = asset.name.toLowerCase();
  if (name.startsWith(term)) return { rank: RANK.namePrefix };
  if (name.split(/[_.]/).some((word) => word.startsWith(term))) return { rank: RANK.wordPrefix };
  if (name.includes(term)) return { rank: RANK.nameInside };

  const tags = [LAYER_META[asset.layer].label, ASSET_KIND_META[asset.kind].label];
  if (tags.some((tag) => tag.toLowerCase().startsWith(term))) return { rank: RANK.tag };

  const fact = SEARCH_FACTS.find((key) => asset[key]?.toLowerCase().includes(term));
  if (fact) return { rank: RANK.fact, field: fact };
  if (asset.description?.toLowerCase().includes(term)) {
    return { rank: RANK.description, field: 'description' };
  }
  return null;
}

/**
 * Every asset that fits all the words, best first, each with `field`: the
 * first fact or description a word was found in, when it was not the name —
 * so the suggestion can show why it matched.
 */
export function searchAssets(assets, query) {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const hits = [];
  for (const asset of assets) {
    let score = 0;
    let field = null;
    const fitsAll = terms.every((term) => {
      const match = fit(asset, term);
      if (!match) return false;
      score += match.rank;
      field ??= match.field ?? null;
      return true;
    });
    if (fitsAll) hits.push({ asset, score, field });
  }

  return hits.sort(
    (a, b) =>
      a.score - b.score ||
      a.asset.name.length - b.asset.name.length ||
      a.asset.name.localeCompare(b.asset.name),
  );
}

/** How well one word fits a column, best first. */
const COLUMN_RANK = {
  namePrefix: 0,
  wordPrefix: 1,
  nameInside: 2,
  table: 3,
  tag: 3,
  type: 4,
};

const MIN_INSIDE = 4;

function columnFit(column, asset, term) {
  const name = column.name.toLowerCase();
  if (name.startsWith(term)) return { rank: COLUMN_RANK.namePrefix, onColumn: true };
  if (name.split('_').some((word) => word.startsWith(term))) {
    return { rank: COLUMN_RANK.wordPrefix, onColumn: true };
  }
  // Mid-word only for longer words: "age" inside "engaged" is noise, "sales"
  // inside "presales" is not. Column names are short, so short words collide.
  if (term.length >= MIN_INSIDE && name.includes(term)) {
    return { rank: COLUMN_RANK.nameInside, onColumn: true };
  }
  if (asset.name.toLowerCase().includes(term)) return { rank: COLUMN_RANK.table };
  if (LAYER_META[asset.layer].label.toLowerCase().startsWith(term)) {
    return { rank: COLUMN_RANK.tag };
  }
  if (column.type.toLowerCase().startsWith(term)) return { rank: COLUMN_RANK.type };
  return null;
}

const layerIndex = (asset) => LAYER_ORDER.indexOf(asset.layer);

/**
 * Column search for the column level: every column whose name fits, with the
 * table it lives in. Words can also name the table, the layer or the type —
 * "silver age" is the age columns of silver tables — but at least one has to
 * land on the column's own name, or a table's name would bring back every
 * column it has.
 *
 * Best first; a column found in several tables is listed once per table, in
 * medallion order, the way the canvas reads.
 */
export function searchColumns(columns, graph, query) {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const hits = [];
  for (const column of columns.byId.values()) {
    const asset = graph.byId.get(column.assetId);
    let score = 0;
    let onColumn = false;
    const fitsAll = terms.every((term) => {
      const match = columnFit(column, asset, term);
      if (!match) return false;
      score += match.rank;
      onColumn ||= Boolean(match.onColumn);
      return true;
    });
    if (fitsAll && onColumn) hits.push({ column, asset, score });
  }

  return hits.sort(
    (a, b) =>
      a.score - b.score ||
      a.column.name.length - b.column.name.length ||
      a.column.name.localeCompare(b.column.name) ||
      layerIndex(a.asset) - layerIndex(b.asset) ||
      a.asset.name.localeCompare(b.asset.name),
  );
}

/** Where the words fall in `text`, as `{ text, hit }` runs to draw with the hits marked. */
export function markMatches(text, terms) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
      ranges.push([at, at + term.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const runs = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) runs.push({ text: text.slice(cursor, from), hit: false });
    runs.push({ text: text.slice(from, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), hit: false });
  return runs;
}
