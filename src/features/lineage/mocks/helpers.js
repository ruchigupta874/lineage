/** Shorthand the workspace fixtures share, so each reads as data rather than plumbing. */

/** `name type` pairs, so a schema reads as one line per column. */
export const cols = (...specs) =>
  specs.map((spec) => {
    const [name, type] = spec.split(' ');
    return { name, type };
  });

/** Columns of one asset, by name: `bronzeSales('quantity')`. */
export const columnsOf = (assetId) => (name) => `${assetId}.${name}`;

/** One column's derivation: how it was made, the logic, and the columns it read. */
export const made = (kind, logic, ...from) => ({ kind, logic, from });

/** Each asset with its columns' derivations attached, as the catalog sends them. */
export const withDerivations = (assets, lineage) =>
  assets.map((entry) => ({ ...entry, derivations: lineage[entry.id] ?? {} }));
