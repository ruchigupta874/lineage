import { useEffect, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import {
  ASSET_KIND_META,
  HEALTH,
  HEALTH_META,
  LEVEL,
  LINEAGE_COPY,
  TRANSFORM,
  TRANSFORM_META,
} from '@/features/lineage/constants';
import { assetShape, layerShape } from './assetShape';
import { shortType } from './columnLayout';
import { markMatches, searchAssets, searchColumns, searchTerms } from './searchAssets';
import { useRecentAssets } from './useRecentAssets';
import styles from './AssetSearch.module.css';

/** Enough to scan at a glance; past this, another word narrows faster than scrolling. */
const MAX_RESULTS = 8;
const MAX_RECENT = 5;

/**
 * At column level the two kinds share the list: columns lead, since they are
 * what that level is for, and a few tables follow. Either takes the whole
 * list when the other has nothing.
 */
const SHARED_COLUMNS = 6;
const SHARED_TABLES = 3;

const OPTION = { table: 'table', column: 'column' };

/** What a fact match is called on its suggestion's second line. */
const FACT_LABEL = {
  owner: LINEAGE_COPY.owner,
  source: LINEAGE_COPY.source,
  job: LINEAGE_COPY.job,
  location: LINEAGE_COPY.location,
};

/** True when a key press belongs to a field, so "/" types a slash there instead. */
const isTyping = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function Marked({ text, terms }) {
  return markMatches(text, terms).map((run, index) =>
    run.hit ? (
      <mark key={index} className={styles.hit}>
        {run.text}
      </mark>
    ) : (
      <span key={index}>{run.text}</span>
    ),
  );
}

Marked.propTypes = {
  text: PropTypes.string.isRequired,
  terms: PropTypes.arrayOf(PropTypes.string).isRequired,
};

/** A table's second line: why it matched if that wasn't the name, otherwise what it holds. */
function TableDetail({ asset, field, terms }) {
  if (FACT_LABEL[field]) {
    return (
      <>
        {FACT_LABEL[field]} · <Marked text={asset[field]} terms={terms} />
      </>
    );
  }
  return asset.description ? <Marked text={asset.description} terms={terms} /> : asset.fqn;
}

TableDetail.propTypes = {
  asset: assetShape.isRequired,
  field: PropTypes.string,
  terms: PropTypes.arrayOf(PropTypes.string).isRequired,
};

function LayerChip({ layer }) {
  return (
    <span className={styles.layerChip}>
      <span className={styles.layerDot} />
      {layer.label}
    </span>
  );
}

LayerChip.propTypes = { layer: layerShape.isRequired };

/** One option's face: a table, or a column with the table it lives in. */
function OptionFace({ option, terms, isCurrent }) {
  const { asset } = option;
  if (option.type === OPTION.column) {
    const { column } = option;
    const kind = column.derivation?.kind ?? TRANSFORM.raw;
    return (
      <>
        <span className={styles.optionIcon}>
          <Icon name="column" size={14} />
        </span>
        <span className={styles.optionBody}>
          <span className={styles.optionName} data-mono>
            <Marked text={column.name} terms={terms} />
          </span>
          <span className={styles.optionDetail}>
            {LINEAGE_COPY.searchColumnIn} <Marked text={asset.name} terms={terms} /> ·{' '}
            {TRANSFORM_META[kind].label}
          </span>
        </span>
        <span className={styles.optionAside}>
          {isCurrent && <span className={styles.viewing}>{LINEAGE_COPY.searchViewing}</span>}
          <span className={styles.typeTag}>{shortType(column.type)}</span>
          <LayerChip layer={asset.layer} />
          <kbd className={styles.enterKey} aria-hidden="true">
            ↵
          </kbd>
        </span>
      </>
    );
  }

  return (
    <>
      <span className={styles.optionIcon}>
        <Icon name={ASSET_KIND_META[asset.kind].icon} size={14} />
      </span>
      <span className={styles.optionBody}>
        <span className={styles.optionName}>
          <Marked text={asset.name} terms={terms} />
        </span>
        <span className={styles.optionDetail}>
          <TableDetail asset={asset} field={option.field} terms={terms} />
        </span>
      </span>
      <span className={styles.optionAside}>
        {isCurrent && <span className={styles.viewing}>{LINEAGE_COPY.searchViewing}</span>}
        {asset.health !== HEALTH.healthy && (
          <span
            className={styles.health}
            data-tone={HEALTH_META[asset.health].tone}
            title={HEALTH_META[asset.health].label}
          />
        )}
        <LayerChip layer={asset.layer} />
        <kbd className={styles.enterKey} aria-hidden="true">
          ↵
        </kbd>
      </span>
    </>
  );
}

OptionFace.propTypes = {
  option: PropTypes.shape({
    type: PropTypes.oneOf(Object.values(OPTION)).isRequired,
    asset: assetShape.isRequired,
    column: PropTypes.object,
    field: PropTypes.string,
  }).isRequired,
  terms: PropTypes.arrayOf(PropTypes.string).isRequired,
  isCurrent: PropTypes.bool.isRequired,
};

/** What is being traced, as a chip in the field, with its own way to stop. */
function Token({ kind, hue, icon, label, title, removeLabel, onRemove }) {
  return (
    <span className={styles.token} data-kind={kind} data-hue={hue} title={title}>
      <Icon name={icon} size={13} className={styles.tokenIcon} />
      <span className={styles.tokenName}>{label}</span>
      <button
        type="button"
        className={styles.tokenRemove}
        aria-label={removeLabel}
        title={removeLabel}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
      >
        <Icon name="close" size={11} strokeWidth={1.9} />
      </button>
    </span>
  );
}

Token.propTypes = {
  kind: PropTypes.oneOf(Object.values(OPTION)).isRequired,
  hue: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  removeLabel: PropTypes.string.isRequired,
  onRemove: PropTypes.func.isRequired,
};

const tableOption = (asset, field = null) => ({ type: OPTION.table, id: asset.id, asset, field });
const columnOption = (column, asset) => ({ type: OPTION.column, id: column.id, asset, column });

/**
 * Find what to trace. The search works at the grain the page is drawn at:
 *
 * - Entity level finds tables, by name, layer, owner or source.
 * - Column level finds columns — every table holding a column by that name —
 *   and tables after them. Picking a column goes to its table and traces it.
 *
 * A combobox, not a list of everything. Nothing is suggested until something
 * is typed, except what was traced most recently. Matches are ranked
 * (`searchAssets`, `searchColumns`) and the words that matched are marked.
 * Arrow keys move, Enter traces, Escape backs out; "/" or Ctrl+K reaches it
 * from anywhere on the page.
 *
 * What is traced sits in the field as chips — the table, and at column level
 * the column — so the search always says what it last found. Each × steps
 * back one: the column's to its table, the table's to the whole catalog.
 */
export default function AssetSearch({
  assets,
  columns,
  level,
  focusId,
  tracedColumnId,
  onPickTable,
  onPickColumn,
  onClearTable,
  onClearColumn,
  isLoading,
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const recent = useRecentAssets(focusId, tracedColumnId);
  const isColumnLevel = level === LEVEL.column;

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const graph = useMemo(() => ({ byId }), [byId]);
  const tableHits = useMemo(() => searchAssets(assets, query), [assets, query]);
  const columnHits = useMemo(
    () => (isColumnLevel ? searchColumns(columns, graph, query) : []),
    [isColumnLevel, columns, graph, query],
  );
  const terms = searchTerms(query);
  const isSearching = terms.length > 0;

  let sections;
  if (!isSearching) {
    const options = recent
      .filter((id) => id !== focusId && id !== tracedColumnId)
      .map((id) => {
        if (byId.has(id)) return tableOption(byId.get(id));
        const column = isColumnLevel && columns.byId.get(id);
        return column ? columnOption(column, byId.get(column.assetId)) : null;
      })
      .filter(Boolean)
      .slice(0, MAX_RECENT);
    sections = [{ key: 'recent', label: LINEAGE_COPY.searchRecent, icon: 'history', options }];
  } else {
    const shared = columnHits.length > 0 && tableHits.length > 0;
    sections = [
      {
        key: OPTION.column,
        label: LINEAGE_COPY.searchSectionColumns,
        total: columnHits.length,
        options: columnHits
          .slice(0, shared ? SHARED_COLUMNS : MAX_RESULTS)
          .map((hit) => columnOption(hit.column, hit.asset)),
      },
      {
        key: OPTION.table,
        label: LINEAGE_COPY.searchSectionTables,
        total: tableHits.length,
        options: tableHits
          .slice(0, shared ? SHARED_TABLES : MAX_RESULTS)
          .map((hit) => tableOption(hit.asset, hit.field)),
      },
    ];
  }
  sections = sections.filter((section) => section.options.length > 0);

  const options = sections.flatMap((section) => section.options);
  const isTruncated = sections.some((section) => section.total > section.options.length);
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index) => `${listId}-${index}`;
  const isCurrent = (option) =>
    option.id === (option.type === OPTION.column ? tracedColumnId : focusId);

  useEffect(() => {
    const onKey = (event) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut && (event.key !== '/' || isTyping(event.target))) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    }
  });

  const pick = (option) => {
    if (option.type === OPTION.column) {
      if (option.id !== tracedColumnId) onPickColumn(option.id);
    } else if (option.id !== focusId || tracedColumnId) {
      // Picking the table already in focus still ends a column trace on it.
      onPickTable(option.id);
    }
    setQuery('');
    setActive(0);
    setOpen(false);
    inputRef.current?.blur();
  };

  const step = (by) => {
    if (!isOpen) setOpen(true);
    else if (options.length > 0) setActive((activeIndex + by + options.length) % options.length);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && isOpen && options[activeIndex]) {
      event.preventDefault();
      pick(options[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (isOpen) setOpen(false);
      else if (query) setQuery('');
      else inputRef.current?.blur();
    }
  };

  // Closes once focus has left the whole control, not when it moves within it.
  const onBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  /** A chip's ×. From the keyboard the button vanishes under focus; land back in the field. */
  const removing = (clear) => (event) => {
    clear();
    if (event.detail === 0) inputRef.current?.focus();
  };

  let body;
  if (isSearching && options.length === 0) {
    body = (
      <div className={styles.empty}>
        <Icon name="searchX" size={20} className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>
          {(isColumnLevel ? LINEAGE_COPY.noColumnMatches : LINEAGE_COPY.noMatches)(query.trim())}
        </p>
        <p className={styles.emptyHint}>
          {isColumnLevel ? LINEAGE_COPY.noColumnMatchesHint : LINEAGE_COPY.noMatchesHint}
        </p>
      </div>
    );
  } else if (options.length === 0) {
    body = (
      <p className={styles.hint}>
        <Icon name="info" size={14} className={styles.hintIcon} />
        {isColumnLevel
          ? LINEAGE_COPY.searchColumnsHint(columns.byId.size, assets.length)
          : LINEAGE_COPY.searchHint(assets.length)}
      </p>
    );
  } else {
    let index = -1;
    body = (
      <>
        <div id={listId} role="listbox" aria-label={LINEAGE_COPY.search} className={styles.list}>
          {sections.map((section) => {
            const headId = `${listId}-${section.key}`;
            return (
              <div key={section.key} role="group" aria-labelledby={headId}>
                <div id={headId} className={styles.sectionHead}>
                  {section.icon && <Icon name={section.icon} size={12} />}
                  {section.label}
                  {section.total !== undefined && (
                    <span className={styles.sectionCount}>{section.total}</span>
                  )}
                </div>
                {section.options.map((option) => {
                  index += 1;
                  const at = index;
                  const isActive = at === activeIndex;
                  return (
                    <div
                      key={option.id}
                      id={optionId(at)}
                      role="option"
                      aria-selected={isActive}
                      tabIndex={-1}
                      className={styles.option}
                      data-hue={option.asset.layer.hue}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => !isActive && setActive(at)}
                      onClick={() => pick(option)}
                      onKeyDown={onKeyDown}
                    >
                      <OptionFace option={option} terms={terms} isCurrent={isCurrent(option)} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={styles.popFoot} aria-hidden="true">
          <span className={styles.footKey}>
            <kbd className={styles.kbd}>↑</kbd>
            <kbd className={styles.kbd}>↓</kbd>
            {LINEAGE_COPY.keyMove}
          </span>
          <span className={styles.footKey}>
            <kbd className={styles.kbd}>↵</kbd>
            {LINEAGE_COPY.keyPick}
          </span>
          <span className={styles.footKey}>
            <kbd className={styles.kbd}>esc</kbd>
            {LINEAGE_COPY.keyClose}
          </span>
          {isTruncated && <span className={styles.footMore}>{LINEAGE_COPY.searchNarrow}</span>}
        </div>
      </>
    );
  }

  const isListShown = isOpen && options.length > 0;
  const focus = byId.get(focusId);
  const traced = columns.byId.get(tracedColumnId);
  const tracedAsset = traced && byId.get(traced.assetId);

  const prompt = isColumnLevel ? LINEAGE_COPY.searchColumns : LINEAGE_COPY.search;
  let placeholder = prompt;
  if (isLoading) placeholder = LINEAGE_COPY.searchLoading;
  else if (focus || traced) {
    placeholder = isColumnLevel ? LINEAGE_COPY.searchAnotherColumn : LINEAGE_COPY.searchAnother;
  }

  return (
    <div className={styles.search} data-open={isOpen || undefined} onBlur={onBlur}>
      <div className={styles.field} data-tokens={[focus, traced].filter(Boolean).length}>
        <span className={styles.fieldIcon}>
          <Icon name="search" size={15} strokeWidth={1.8} />
        </span>
        {focus && (
          <Token
            kind={OPTION.table}
            hue={focus.layer.hue}
            icon={ASSET_KIND_META[focus.kind].icon}
            label={focus.name}
            title={LINEAGE_COPY.searchTracing(focus.fqn)}
            removeLabel={LINEAGE_COPY.searchRemove(focus.name)}
            onRemove={removing(onClearTable)}
          />
        )}
        {focus && traced && <Icon name="chevronDown" size={12} className={styles.tokenJoin} />}
        {traced && (
          <Token
            kind={OPTION.column}
            hue={tracedAsset.layer.hue}
            icon="column"
            // Beside its own table's chip the column needs no table name.
            label={tracedAsset.id === focusId ? traced.name : `${tracedAsset.name}.${traced.name}`}
            title={LINEAGE_COPY.searchTracing(`${tracedAsset.fqn}.${traced.name}`)}
            removeLabel={LINEAGE_COPY.searchRemoveColumn(traced.name)}
            onRemove={removing(onClearColumn)}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          className={styles.input}
          value={query}
          placeholder={placeholder}
          disabled={isLoading}
          aria-label={prompt}
          aria-expanded={isListShown}
          aria-controls={isListShown ? listId : undefined}
          aria-activedescendant={
            isListShown && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={LINEAGE_COPY.searchClear}
            title={LINEAGE_COPY.searchClear}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery('');
              setActive(0);
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size={12} />
          </button>
        ) : (
          <kbd className={styles.shortcut} aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      {isOpen && !isLoading && (
        <div className={styles.popover} role="presentation">
          {body}
        </div>
      )}
    </div>
  );
}

AssetSearch.propTypes = {
  assets: PropTypes.arrayOf(assetShape).isRequired,
  /** The column graph from `indexColumns`. */
  columns: PropTypes.shape({ byId: PropTypes.instanceOf(Map).isRequired }).isRequired,
  level: PropTypes.oneOf(Object.values(LEVEL)).isRequired,
  focusId: PropTypes.string,
  tracedColumnId: PropTypes.string,
  onPickTable: PropTypes.func.isRequired,
  onPickColumn: PropTypes.func.isRequired,
  onClearTable: PropTypes.func.isRequired,
  onClearColumn: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
};
