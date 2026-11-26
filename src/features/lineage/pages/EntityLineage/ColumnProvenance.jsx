import { useId } from 'react';
import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import Skeleton from '@/components/ui/Skeleton';
import {
  LINEAGE_COPY,
  PROVENANCE_TAB,
  PROVENANCE_TABS,
  PROVENANCE_TAB_META,
  TRANSFORM,
  TRANSFORM_META,
} from '@/features/lineage/constants';
import { assetShape, graphShape } from './assetShape';
import { firstStatement, sqlTokens } from './sqlTokens';
import { nextTabIndex } from './tabKeys';
import styles from './ColumnProvenance.module.css';

/** Past this many steps back a derivation is listed no further; real ones stop at bronze. */
const MAX_DEPTH = 5;

const columnShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  assetId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  derivation: PropTypes.shape({
    kind: PropTypes.oneOf(Object.values(TRANSFORM)).isRequired,
    logic: PropTypes.string.isRequired,
    from: PropTypes.arrayOf(PropTypes.string).isRequired,
    /** Where a value comes from when that is outside the catalog, so no column feeds it. */
    outside: PropTypes.string,
  }),
});

const columnsShape = PropTypes.shape({
  byId: PropTypes.instanceOf(Map).isRequired,
  parents: PropTypes.instanceOf(Map).isRequired,
  children: PropTypes.instanceOf(Map).isRequired,
});

const kindOf = (column) => column.derivation?.kind ?? TRANSFORM.raw;

function KindChip({ kind }) {
  const meta = TRANSFORM_META[kind];
  return (
    <span className={styles.kind} data-tone={meta.tone}>
      {meta.label}
    </span>
  );
}

KindChip.propTypes = { kind: PropTypes.oneOf(Object.values(TRANSFORM)).isRequired };

function SqlCode({ code }) {
  return (
    <pre className={styles.code}>
      <code>
        {sqlTokens(code).map((run, index) =>
          run.type ? (
            <span key={index} data-token={run.type}>
              {run.text}
            </span>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )}
      </code>
    </pre>
  );
}

SqlCode.propTypes = { code: PropTypes.string.isRequired };

/**
 * One column as a row in a list: its table and name, how it was made, and that
 * step's logic on one line. Clicking it traces that column instead.
 */
function ColumnRow({ column, graph, isRepeat, onTrace }) {
  const asset = graph.byId.get(column.assetId);
  let detail = asset.source ? LINEAGE_COPY.rawFrom(asset.source) : LINEAGE_COPY.noValue;
  if (isRepeat) detail = LINEAGE_COPY.shownAbove;
  else if (column.derivation) detail = firstStatement(column.derivation.logic);

  return (
    <button
      type="button"
      className={styles.row}
      data-hue={asset.layer.hue}
      title={column.derivation?.logic ?? `${asset.fqn}.${column.name}`}
      onClick={() => onTrace(column.id)}
    >
      <span className={styles.rowDot} />
      <span className={styles.rowName}>
        <span className={styles.rowTable}>{asset.name}.</span>
        {column.name}
      </span>
      <KindChip kind={kindOf(column)} />
      <span className={styles.rowDetail} data-code={Boolean(column.derivation && !isRepeat)}>
        {detail}
      </span>
    </button>
  );
}

ColumnRow.propTypes = {
  column: columnShape.isRequired,
  graph: graphShape.isRequired,
  isRepeat: PropTypes.bool,
  onTrace: PropTypes.func.isRequired,
};

/**
 * Everything a column was made from, as a tree: its inputs, their inputs, and
 * so on back to bronze. A column reached a second way is listed again but not
 * expanded, so a shared input never doubles the tree.
 */
function derivationTree(columns, rootId) {
  const seen = new Set([rootId]);
  const walk = (id, depth) =>
    columns.parents.get(id).map((parentId) => {
      const isRepeat = seen.has(parentId);
      seen.add(parentId);
      const children = isRepeat || depth >= MAX_DEPTH ? [] : walk(parentId, depth + 1);
      return { id: parentId, isRepeat, children };
    });
  return walk(rootId, 1);
}

function TreeLevel({ nodes, columns, graph, onTrace }) {
  return (
    <ul className={styles.tree}>
      {nodes.map((node) => (
        <li key={node.id} className={styles.treeItem}>
          <ColumnRow
            column={columns.byId.get(node.id)}
            graph={graph}
            isRepeat={node.isRepeat}
            onTrace={onTrace}
          />
          {node.children.length > 0 && (
            <TreeLevel nodes={node.children} columns={columns} graph={graph} onTrace={onTrace} />
          )}
        </li>
      ))}
    </ul>
  );
}

TreeLevel.propTypes = {
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  columns: columnsShape.isRequired,
  graph: graphShape.isRequired,
  onTrace: PropTypes.func.isRequired,
};

function SectionHead({ children, count }) {
  return (
    <h3 className={styles.sectionHead}>
      {children}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </h3>
  );
}

SectionHead.propTypes = { children: PropTypes.node.isRequired, count: PropTypes.number };

/** How the column is made, what it is made from all the way back, and what reads it. */
function TechnicalProvenance({ column, asset, columns, graph, onTrace }) {
  const inputs = columns.parents.get(column.id);
  const readers = columns.children.get(column.id);
  const builtBy = asset.source
    ? LINEAGE_COPY.rawFrom(asset.source)
    : `${LINEAGE_COPY.builtBy} ${asset.job}`;

  let derivedFrom;
  if (inputs.length > 0) {
    derivedFrom = (
      <TreeLevel
        nodes={derivationTree(columns, column.id)}
        columns={columns}
        graph={graph}
        onTrace={onTrace}
      />
    );
  } else {
    let entry = LINEAGE_COPY.noInputs;
    if (column.derivation?.outside) entry = LINEAGE_COPY.fromOutside(column.derivation.outside);
    else if (asset.source) entry = LINEAGE_COPY.enteredHere(asset.source);
    derivedFrom = <p className={styles.empty}>{entry}</p>;
  }

  return (
    <>
      <section>
        <SectionHead>{LINEAGE_COPY.transformation}</SectionHead>
        <div className={styles.transformMeta}>
          <KindChip kind={kindOf(column)} />
          <span>{builtBy}</span>
        </div>
        {column.derivation && <SqlCode code={column.derivation.logic} />}
      </section>

      <section>
        <SectionHead count={inputs.length}>{LINEAGE_COPY.derivedFrom}</SectionHead>
        {derivedFrom}
      </section>

      <section>
        <SectionHead count={readers.length}>{LINEAGE_COPY.usedBy}</SectionHead>
        {readers.length > 0 ? (
          <ul className={styles.tree}>
            {readers.map((id) => (
              <li key={id} className={styles.treeItem}>
                <ColumnRow column={columns.byId.get(id)} graph={graph} onTrace={onTrace} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{LINEAGE_COPY.notUsed}</p>
        )}
      </section>
    </>
  );
}

TechnicalProvenance.propTypes = {
  column: columnShape.isRequired,
  asset: assetShape.isRequired,
  columns: columnsShape.isRequired,
  graph: graphShape.isRequired,
  onTrace: PropTypes.func.isRequired,
};

/** Held for the AI summary: says what will come, and shows its shape. */
function AiGovernance({ column }) {
  return (
    <section className={styles.ai}>
      <div className={styles.aiHead}>
        <Icon name="sparkles" size={15} />
        <h3 className={styles.aiTitle}>{LINEAGE_COPY.governanceTitle}</h3>
        <span className={styles.soon}>{LINEAGE_COPY.governanceSoon}</span>
      </div>
      <p className={styles.aiBody}>{LINEAGE_COPY.governanceBody(column.name)}</p>
      <div className={styles.aiLines} aria-hidden="true">
        <Skeleton width="78%" height={9} />
        <Skeleton width="100%" height={9} />
        <Skeleton width="64%" height={9} />
        <Skeleton width="92%" height={9} />
        <Skeleton width="48%" height={9} />
      </div>
      <button type="button" className={styles.aiAction} disabled>
        <Icon name="sparkles" size={14} />
        {LINEAGE_COPY.governanceAction}
      </button>
    </section>
  );
}

AiGovernance.propTypes = { column: columnShape.isRequired };

/**
 * The traced column's drawer: how it was made. Opens with the column, on the
 * technical provenance; AI governance is the second tab. Its foot widens the
 * trace on the canvas to the whole catalog, or says it already is.
 */
export default function ColumnProvenance({
  column,
  asset,
  columns,
  graph,
  beyond,
  tab,
  onTab,
  onClose,
  onTrace,
  onEndToEnd,
}) {
  const baseId = useId();
  const tabId = (id) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  const title = LINEAGE_COPY.provenanceTitle(column.name);

  const onKeyDown = (event, index) => {
    const next = nextTabIndex(event.key, index, PROVENANCE_TABS.length);
    if (next === null) return;
    event.preventDefault();
    onTab(PROVENANCE_TABS[next]);
    event.currentTarget.parentElement.children[next]?.focus();
  };

  return (
    <aside className={styles.drawer} aria-label={title}>
      <header className={styles.head}>
        <span className={styles.headIcon}>
          <Icon name="sparkles" size={18} />
        </span>
        <div className={styles.headText}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.path}>
            {asset.fqn}
            <Icon name="arrowRight" size={11} className={styles.pathArrow} />
            <strong>{column.name}</strong>
          </p>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={LINEAGE_COPY.provenanceClose}
          title={LINEAGE_COPY.provenanceClose}
        >
          <Icon name="close" size={14} />
        </button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={LINEAGE_COPY.provenanceTabs}>
        {PROVENANCE_TABS.map((id, index) => {
          const isActive = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={styles.tab}
              onClick={() => onTab(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <Icon name={PROVENANCE_TAB_META[id].icon} size={14} />
              {PROVENANCE_TAB_META[id].label}
            </button>
          );
        })}
      </div>

      <div
        className={styles.body}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        tabIndex={0}
      >
        {tab === PROVENANCE_TAB.technical ? (
          <TechnicalProvenance
            column={column}
            asset={asset}
            columns={columns}
            graph={graph}
            onTrace={onTrace}
          />
        ) : (
          <AiGovernance column={column} />
        )}
      </div>

      <footer className={styles.foot}>
        {beyond > 0 && <p className={styles.beyond}>{LINEAGE_COPY.beyondView(beyond)}</p>}
        <Button
          block
          iconLeft={beyond > 0 ? 'workflow' : 'check'}
          disabled={beyond === 0}
          onClick={onEndToEnd}
        >
          {beyond > 0 ? LINEAGE_COPY.endToEnd : LINEAGE_COPY.endToEndDone}
        </Button>
      </footer>
    </aside>
  );
}

ColumnProvenance.propTypes = {
  column: columnShape.isRequired,
  asset: assetShape.isRequired,
  columns: columnsShape.isRequired,
  graph: graphShape.isRequired,
  /** Columns on the full path that the canvas's trace leaves out. */
  beyond: PropTypes.number.isRequired,
  tab: PropTypes.oneOf(PROVENANCE_TABS).isRequired,
  onTab: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onTrace: PropTypes.func.isRequired,
  onEndToEnd: PropTypes.func.isRequired,
};
