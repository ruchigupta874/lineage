import { useRef } from 'react';
import { LENS, LINEAGE_COPY } from '@/features/lineage/constants';
import AssetDetail from './AssetDetail';
import AssetSearch from './AssetSearch';
import BusinessLineage from './BusinessLineage';
import ColumnProvenance from './ColumnProvenance';
import ColumnTrace from './ColumnTrace';
import LensTabs from './LensTabs';
import LineageCanvas from './LineageCanvas';
import LineageNode from './LineageNode';
import LineageSkeleton from './LineageSkeleton';
import PaneSplitter from './PaneSplitter';
import StageHead from './StageHead';
import { useDetailsShare } from './useDetailsShare';
import { useLineageData } from './useLineageData';
import { useLineageView } from './useLineageView';
import { useTraceDetails } from './useTraceDetails';
import styles from './EntityLineage.module.css';

const STAGE_ID = 'lineage-stage';
const lensTabId = (lens) => `lineage-lens-${lens}`;

/**
 * Lineage: where a table's data came from, bronze to gold.
 *
 * The top bar holds the two things that apply to the whole page — technical or
 * business lineage, and the search that picks which table to trace. Below it,
 * the stage is the lens that is open: what is being traced, the level it is
 * read at, and the canvas. With nothing picked the canvas is the whole
 * catalog; with a table picked it is that table's lineage, inputs to the left
 * and readers to the right. The panel says what an asset is and lets you move
 * the focus to it.
 *
 * A traced column's details are a column of the page of their own, beside the
 * whole stage — heading, level switch and canvas — from the top bar down, so
 * they are plainly not part of the drawing. The rule between moves the split
 * from 70 : 30 to 80 : 20.
 *
 * This is the whole screen: it fills whatever it is placed in.
 */
export default function EntityLineage() {
  const { assets, isLoading } = useLineageData();
  const lineage = useLineageView(assets);
  const { focus, selected, lens, trace } = lineage;
  const details = useTraceDetails(trace?.column.id ?? null);
  const [detailsShare, setDetailsShare] = useDetailsShare();
  const workspaceRef = useRef(null);
  const hasDetails = lens === LENS.technical && trace && details.isOpen;

  // What the stage shows under its heading: business lineage, a traced
  // column, the canvas — or, while the catalog loads, the canvas's skeleton.
  let stage;
  if (lens === LENS.business) {
    stage = (
      <BusinessLineage
        focus={focus}
        level={lineage.level}
        onShowTechnical={() => lineage.setLens(LENS.technical)}
      />
    );
  } else if (trace) {
    stage = <ColumnTrace lineage={lineage} onOpenDetails={details.open} />;
  } else if (!lineage.layout) {
    stage = <LineageSkeleton />;
  } else {
    stage = (
      <>
        <LineageCanvas
          layout={lineage.layout}
          path={lineage.path}
          label={focus ? LINEAGE_COPY.canvas(focus.name) : LINEAGE_COPY.canvasAll}
          frameOn={focus?.id}
          anchorId={lineage.anchorId}
          renderNode={(node) => <LineageNode key={node.id} node={node} lineage={lineage} />}
          onBackgroundClick={() => lineage.select(null)}
        />
        {selected && (
          <AssetDetail
            key={selected.id}
            asset={selected}
            graph={lineage.graph}
            isFocus={selected.id === focus?.id}
            onClose={() => lineage.select(null)}
            onReveal={lineage.reveal}
            onFocusHere={lineage.focusOn}
          />
        )}
      </>
    );
  }

  return (
    <main className={styles.layout}>
      <div className={styles.topBar}>
        <LensTabs value={lens} onChange={lineage.setLens} idFor={lensTabId} panelId={STAGE_ID} />
        <AssetSearch
          assets={assets}
          columns={lineage.columns}
          level={lineage.level}
          focusId={focus?.id ?? null}
          tracedColumnId={lineage.trace?.column.id ?? null}
          onPickTable={lineage.focusOn}
          onPickColumn={lineage.goToColumn}
          onClearTable={lineage.clearFocus}
          onClearColumn={lineage.exitTrace}
          isLoading={isLoading}
        />
      </div>

      <div ref={workspaceRef} className={styles.workspace}>
        <section
          id={STAGE_ID}
          role="tabpanel"
          aria-labelledby={lensTabId(lens)}
          className={styles.stage}
          aria-busy={isLoading}
        >
          <StageHead
            focus={focus}
            reach={lineage.reach}
            assets={assets}
            isLoading={isLoading}
            lens={lens}
            level={lineage.level}
            onLevelChange={lineage.setLevel}
          />
          <div className={styles.canvasArea}>{stage}</div>
        </section>

        {hasDetails && (
          <>
            <PaneSplitter
              share={detailsShare}
              onChange={setDetailsShare}
              containerRef={workspaceRef}
            />
            <div className={styles.detailsPane} style={{ width: `${detailsShare * 100}%` }}>
              <ColumnProvenance
                column={trace.column}
                asset={lineage.graph.byId.get(trace.column.assetId)}
                columns={lineage.columns}
                graph={lineage.graph}
                beyond={trace.beyond}
                tab={details.tab}
                onTab={details.setTab}
                onClose={details.close}
                onTrace={lineage.traceColumn}
                onEndToEnd={lineage.traceEndToEnd}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
