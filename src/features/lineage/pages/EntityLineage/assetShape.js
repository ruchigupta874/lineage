import PropTypes from 'prop-types';
import { ASSET_KIND, HEALTH, LAYER } from '@/features/lineage/constants';

/** One catalog asset as the page's components read it. */
export const assetShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  fqn: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  layer: PropTypes.oneOf(Object.values(LAYER)).isRequired,
  kind: PropTypes.oneOf(Object.values(ASSET_KIND)).isRequired,
  health: PropTypes.oneOf(Object.values(HEALTH)).isRequired,
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
