import { FINANCE_WORKSPACE } from './finance';
import { PHARMA_WORKSPACE } from './pharma';
import { RETAIL_WORKSPACE } from './retail';
import { TELECOM_WORKSPACE } from './telecom';
import { TELECOM_MEDALLION_WORKSPACE } from './telecomMedallion';

/**
 * Every workspace lineage can be read for, each as the catalog would send
 * it: its layers in flow order (possibly none), when it was last synced, and
 * its lineage — catalogued assets with their columns and column lineage,
 * plus what the lineage says about assets outside the catalog. A workspace
 * may also set `layerBands`, to draw its lineage page's layers as bands.
 *
 * One per shape a catalog comes in: Pharma is all medallion, Retail names
 * its own layers and leaves gaps, Finance classifies nothing, Telecom is
 * big — about 75 assets, 22 hops end to end, tables of 20 to 30 columns —
 * and Telecom (medallion) is the same catalog knowing only bronze, silver
 * and gold, drawn in bands. The first is the one the app opens on.
 */
export const LINEAGE_WORKSPACES = [
  PHARMA_WORKSPACE,
  RETAIL_WORKSPACE,
  FINANCE_WORKSPACE,
  TELECOM_WORKSPACE,
  TELECOM_MEDALLION_WORKSPACE,
];
