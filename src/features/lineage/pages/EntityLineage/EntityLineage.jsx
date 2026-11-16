import AssetDetail from './AssetDetail';
import AssetRail from './AssetRail';
import LineageCanvas from './LineageCanvas';
import LineageSkeleton from './LineageSkeleton';
import StageHead from './StageHead';
import { useLineageData } from './useLineageData';
import { useLineageView } from './useLineageView';
import styles from './EntityLineage.module.css';

/**
 * Entity-level lineage: where a table's data came from, bronze to gold.
 *
 * One asset is the focus, and the canvas shows its lineage both ways — inputs
 * to the left, readers to the right — with each layer in its own columns. The rail
 * picks the focus; the canvas traces, expands and opens; the panel says what
 * an asset is and lets you move the focus to it.
 *
 * This is the whole screen: it fills whatever it is placed in.
 */
export default function EntityLineage() {
  const { assets, isLoading } = useLineageData();
  const lineage = useLineageView(assets);
  const { focus, selected } = lineage;

  return (
    <main className={styles.layout}>
      <AssetRail
        assets={assets}
        focusId={focus?.id ?? null}
        onPick={lineage.focusOn}
        isLoading={isLoading}
      />

      <section className={styles.stage} aria-busy={isLoading}>
        <StageHead
          focus={focus}
          reach={lineage.reach}
          level={lineage.level}
          onLevelChange={lineage.setLevel}
        />
        <div className={styles.canvasArea}>
          {lineage.layout ? <LineageCanvas lineage={lineage} /> : <LineageSkeleton />}
          {selected && (
            <AssetDetail
              key={selected.id}
              asset={selected}
              graph={lineage.graph}
              isFocus={selected.id === focus.id}
              onClose={() => lineage.select(null)}
              onReveal={lineage.reveal}
              onFocusHere={lineage.focusOn}
            />
          )}
        </div>
      </section>
    </main>
  );
}
