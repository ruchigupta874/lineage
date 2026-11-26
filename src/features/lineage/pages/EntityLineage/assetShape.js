import PropTypes from 'prop-types';
import { ASSET_KIND, HEALTH } from '@/features/lineage/constants';

/**
 * An asset's layer, resolved by `resolveCatalog`: what it is called, the
 * colour it wears (`hue`, see layers.css), and its place in the workspace's
 * flow order — null when it has none, as Unclassified and Not in catalog
 * never do.
 */
export const layerShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  blurb: PropTypes.string,
  hue: PropTypes.string.isRequired,
  order: PropTypes.number,
  index: PropTypes.number.isRequired,
});

/**
 * One asset as the page's components read it. `catalogued` is false for one
 * seen only in lineage, which has no columns, owner or health of its own.
 */
export const assetShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  fqn: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  layer: layerShape.isRequired,
  kind: PropTypes.oneOf(Object.values(ASSET_KIND)).isRequired,
  health: PropTypes.oneOf(Object.values(HEALTH)).isRequired,
  catalogued: PropTypes.bool.isRequired,
  layerConflict: PropTypes.bool,
  rows: PropTypes.string,
  columns: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string.isRequired, type: PropTypes.string.isRequired }),
  ).isRequired,
});

/** The indexed lineage from `indexLineage`. */
export const graphShape = PropTypes.shape({
  byId: PropTypes.instanceOf(Map).isRequired,
  parents: PropTypes.instanceOf(Map).isRequired,
  children: PropTypes.instanceOf(Map).isRequired,
});
