import PropTypes from 'prop-types';
import { LINEAGE_COPY } from '@/features/lineage/constants';
import { shortType } from './columnLayout';
import styles from './ColumnList.module.css';

/**
 * An opened card's columns: one compact row each, name and type, in schema
 * order. Past COLUMN_GEOMETRY.maxRows the rest fold into a "+N more" row at
 * the foot, which lists every column — and folds them back again.
 *
 * Each row traces its column: the canvas gives way to that column's lineage.
 */
export default function ColumnList({ card, onToggleAll, onTrace }) {
  const { rows, hidden, hasFooter } = card;
  return (
    <>
      <ul className={styles.list}>
        {rows.map((column) => (
          <li key={column.name}>
            <button
              type="button"
              className={styles.row}
              title={`${LINEAGE_COPY.traceColumn(column.name)} · ${column.type}`}
              onClick={() => onTrace(column.name)}
            >
              <span className={styles.name}>{column.name}</span>
              <span className={styles.type}>{shortType(column.type)}</span>
            </button>
          </li>
        ))}
      </ul>
      {hasFooter && (
        <button type="button" className={styles.more} onClick={onToggleAll}>
          {hidden > 0 ? LINEAGE_COPY.moreColumns(hidden) : LINEAGE_COPY.fewerColumns}
        </button>
      )}
    </>
  );
}

ColumnList.propTypes = {
  card: PropTypes.shape({
    rows: PropTypes.arrayOf(
      PropTypes.shape({ name: PropTypes.string.isRequired, type: PropTypes.string.isRequired }),
    ).isRequired,
    hidden: PropTypes.number.isRequired,
    hasFooter: PropTypes.bool.isRequired,
  }).isRequired,
  onToggleAll: PropTypes.func.isRequired,
  onTrace: PropTypes.func.isRequired,
};
