import Skeleton from '@/components/ui/Skeleton';
import { LAYER_ORDER } from '@/features/lineage/constants';
import { LINEAGE_GEOMETRY } from './lineageLayout';
import styles from './EntityLineage.module.css';

/** Cards per layer while loading, narrowing toward gold the way a medallion does. */
const SKELETON_ROWS = [['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c'], ['a']];

/** The canvas's shape while the catalog loads: a heading and a stack of cards per layer. */
export default function LineageSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {LAYER_ORDER.map((layer, index) => (
        <div key={layer} className={styles.skeletonBand}>
          <Skeleton width={72} height={11} />
          <div className={styles.skeletonRows}>
            {SKELETON_ROWS[index].map((row) => (
              <Skeleton
                key={row}
                width={LINEAGE_GEOMETRY.nodeWidth}
                height={LINEAGE_GEOMETRY.nodeHeight}
                radius="var(--radius-xl)"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
