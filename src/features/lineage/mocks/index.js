import { FINANCE_WORKSPACE } from './finance';
import { PHARMA_WORKSPACE } from './pharma';
import { RETAIL_WORKSPACE } from './retail';
import { TELECOM_WORKSPACE } from './telecom';

/**
 * Every workspace lineage can be read for, each as the catalog would send
 * it: its layers in flow order (possibly none), when it was last synced, and
 * its lineage — catalogued assets with their columns and column lineage,
 * plus what the lineage says about assets outside the catalog.
 *
 * One per shape a catalog comes in: Pharma is all medallion, Retail names
 * its own layers and leaves gaps, Finance classifies nothing, and Telecom is
 * big — about 75 assets, 22 hops end to end, tables of 20 to 30 columns. The
 * first is the one the app opens on.
 */
export const LINEAGE_WORKSPACES = [
  PHARMA_WORKSPACE,
  RETAIL_WORKSPACE,
  FINANCE_WORKSPACE,
  TELECOM_WORKSPACE,
];
