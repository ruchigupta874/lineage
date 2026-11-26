import {
  ASSET_KIND,
  HEALTH,
  LAYER_HUES,
  LAYER_META,
  MEDALLION_HUES,
  NO_LAYER,
  NO_LAYER_META,
} from './constants';
import { topologicalOrder } from './lineageGraph';

/**
 * One workspace's lineage, as the catalog sends it, turned into what the
 * pages draw. Three things a catalog leaves open are settled here, once:
 *
 * - **Which layer, and what it looks like.** A workspace lists its own
 *   layers in flow order — bronze, silver, gold, or raw, curated,
 *   consumption, or none at all. Each asset's `layer` becomes one shared
 *   entry: its label, its colour (`hue`), and its place in that order. A
 *   layer an asset names that the workspace doesn't list keeps its name and
 *   gets a colour, but no place in the order. No layer at all is
 *   Unclassified.
 *
 * - **What lineage names that the catalog doesn't hold.** An input a job
 *   reads that has no catalog record — a CSV on an SFTP drop, a Kafka topic
 *   — is still a hop in the flow. It becomes an asset that is not catalogued
 *   (`catalogued: false`), described by whatever the lineage said about it,
 *   rather than being dropped and leaving a gap.
 *
 * - **Labels that contradict the flow.** If a later layer feeds an earlier
 *   one (a consumption table read by a curated one), the edges are the facts
 *   and the labels are only metadata: both ends are marked `layerConflict`,
 *   and the layout places them by flow alone.
 */

const titleCase = (id) => {
  const words = id.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The last part of an id, as a name for an input nothing else describes. */
const nameFromId = (id) =>
  id
    .split(/[/.:]+/)
    .filter(Boolean)
    .pop() ?? id;

/** Something lineage names that the catalog holds no record of. */
const externalAsset = (id, record = {}) => ({
  id,
  fqn: record.location ?? id,
  location: record.location ?? null,
  name: record.name ?? nameFromId(id),
  kind: record.kind ?? ASSET_KIND.unknown,
  health: HEALTH.healthy,
  upstream: record.upstream ?? [],
  columns: [],
  derivations: {},
  layer: null,
  catalogued: false,
});

/**
 * Every layer the workspace's assets sit in, in display order: the
 * workspace's own, in flow order; then layers assets name that it doesn't
 * list; then Unclassified; then Not in catalog. Colours follow the
 * workspace's whole list, present or not, so a layer keeps its colour
 * whichever assets happen to be loaded.
 */
function layerEntries(scheme, assets) {
  const named = new Set(assets.map((asset) => asset.layer).filter(Boolean));
  const listed = new Set(scheme.map((layer) => layer.id));
  const unlisted = [...named].filter((id) => !listed.has(id)).sort();

  let nextHue = 0;
  const hueFor = (id) => MEDALLION_HUES[id] ?? LAYER_HUES[nextHue++ % LAYER_HUES.length];
  const describe = (id, given, order) => ({
    key: id,
    label: given.label ?? LAYER_META[id]?.label ?? titleCase(id),
    blurb: given.blurb ?? LAYER_META[id]?.blurb ?? null,
    hue: hueFor(id),
    order,
  });

  const entries = [
    ...scheme.map((layer, order) => describe(layer.id, layer, order)),
    ...unlisted.map((id) => describe(id, {}, null)),
  ].filter((entry) => named.has(entry.key));

  if (assets.some((asset) => asset.catalogued && !asset.layer)) {
    entries.push({
      key: NO_LAYER.unclassified,
      ...NO_LAYER_META[NO_LAYER.unclassified],
      order: null,
    });
  }
  if (assets.some((asset) => !asset.catalogued)) {
    entries.push({ key: NO_LAYER.external, ...NO_LAYER_META[NO_LAYER.external], order: null });
  }
  return new Map(entries.map((entry, index) => [entry.key, { ...entry, index }]));
}

const keyOf = (asset) => {
  if (!asset.catalogued) return NO_LAYER.external;
  return asset.layer ?? NO_LAYER.unclassified;
};

/**
 * The assets whose layer the flow contradicts: one with an input, however
 * far up, from a later layer, or a reader, however far down, in an earlier
 * one. Assets in no ordered layer pass the order along without having one.
 */
function layerConflicts(assets) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const parentsOf = (id) => byId.get(id).upstream.filter((parent) => byId.has(parent));
  const order = topologicalOrder([...byId.keys()], parentsOf);
  const children = new Map(order.map((id) => [id, []]));
  order.forEach((id) => parentsOf(id).forEach((parent) => children.get(parent).push(id)));
  const rankOf = (id) => byId.get(id).layer.order;
  // Unordered assets have none, and in a loop a neighbour may not be reached yet.
  const ranked = (values) => values.filter((value) => typeof value === 'number');

  const latestAbove = new Map();
  order.forEach((id) => {
    const above = parentsOf(id).flatMap((parent) => [rankOf(parent), latestAbove.get(parent)]);
    latestAbove.set(id, Math.max(-Infinity, ...ranked(above)));
  });
  const earliestBelow = new Map();
  [...order].reverse().forEach((id) => {
    const below = children.get(id).flatMap((child) => [rankOf(child), earliestBelow.get(child)]);
    earliestBelow.set(id, Math.min(Infinity, ...ranked(below)));
  });

  return new Set(
    order.filter((id) => {
      const rank = rankOf(id);
      return rank !== null && (latestAbove.get(id) > rank || earliestBelow.get(id) < rank);
    }),
  );
}

/**
 * `workspace.layers` is its layer list in flow order (`[{ id, label?,
 * blurb? }]`, possibly empty); `workspace.lineage` is `{ assets, externals }`
 * — the catalogued assets, and what the lineage says about inputs and
 * outputs outside the catalog.
 *
 * Returns the assets every page draws, each with `layer` resolved to its
 * entry, `catalogued`, and `layerConflict` where it applies.
 */
export function resolveCatalog(workspace) {
  const { assets: catalogued, externals = [] } = workspace.lineage;
  const known = new Map(catalogued.map((asset) => [asset.id, { ...asset, catalogued: true }]));
  externals.forEach((record) => known.set(record.id, externalAsset(record.id, record)));
  [...known.values()].forEach((asset) =>
    asset.upstream.forEach((id) => {
      if (!known.has(id)) known.set(id, externalAsset(id));
    }),
  );

  const raw = [...known.values()];
  const entries = layerEntries(workspace.layers ?? [], raw);
  const withLayers = raw.map((asset) => ({ ...asset, layer: entries.get(keyOf(asset)) }));
  const conflicts = layerConflicts(withLayers);
  return withLayers.map((asset) =>
    conflicts.has(asset.id) ? { ...asset, layerConflict: true } : asset,
  );
}

/**
 * Where an asset's layer puts it in the flow, for the layout: its layer's
 * place in the workspace's order, or null when it has none to keep — no
 * layer, a layer the workspace doesn't order, or a label the flow
 * contradicts.
 */
export const flowOrderOf = (asset) => (asset.layerConflict ? null : asset.layer.order);

/** The layers among `assets`, in display order, each with how many of them sit in it. */
export function legendOf(assets) {
  const counts = new Map();
  assets.forEach((asset) => {
    const entry = counts.get(asset.layer.key) ?? { ...asset.layer, count: 0 };
    entry.count += 1;
    counts.set(asset.layer.key, entry);
  });
  return [...counts.values()].sort((a, b) => a.index - b.index);
}
