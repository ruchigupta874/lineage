import { LAYER } from '../constants';
import { TELECOM_WORKSPACE } from './telecom';

const MEDALLION = new Set(Object.values(LAYER));

/**
 * Telecom again — the same assets, columns and lineage — in a catalog that
 * only knows the medallion. An asset is bronze, silver or gold where the
 * catalog is sure of it, and unclassified everywhere else: the landing
 * files, staging, reference tables, features, the model's training and
 * scoring, serving and the BI extract.
 *
 * Its lineage page draws the layers as bands (`layerBands`), the way the
 * medallion canvas first looked: a bronze, a silver and a gold lane, and a
 * grey lane wherever unclassified or uncatalogued assets sit between them.
 * Its enterprise page is drawn like every other workspace's.
 */
export const TELECOM_MEDALLION_WORKSPACE = {
  id: 'telecom-medallion',
  label: 'Telecom (medallion)',
  syncedAt: TELECOM_WORKSPACE.syncedAt,
  layers: [{ id: LAYER.bronze }, { id: LAYER.silver }, { id: LAYER.gold }],
  layerBands: true,
  lineage: {
    ...TELECOM_WORKSPACE.lineage,
    assets: TELECOM_WORKSPACE.lineage.assets.map((asset) => ({
      ...asset,
      layer: MEDALLION.has(asset.layer) ? asset.layer : null,
    })),
  },
};
