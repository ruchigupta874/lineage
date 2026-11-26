import Skeleton from '@/components/ui/Skeleton';
import { LINEAGE_GEOMETRY } from './lineageLayout';
import styles from './EntityLineage.module.css';

/** Cards per column while loading, narrowing downstream the way most lineage does. */
const SKELETON_COLUMNS = [
  { key: 'sources', rows: ['a', 'b', 'c', 'd', 'e'] },
  { key: 'middle', rows: ['a', 'b', 'c'] },
  { key: 'end', rows: ['a'] },
];

/** The canvas's shape while the catalog loads: a heading and a stack of cards per column. */
export default function LineageSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {SKELETON_COLUMNS.map((column) => (
        <div key={column.key} className={styles.skeletonBand}>
          <Skeleton width={72} height={11} />
          <div className={styles.skeletonRows}>
            {column.rows.map((row) => (
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
