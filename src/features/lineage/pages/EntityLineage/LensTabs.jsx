import PropTypes from 'prop-types';
import Icon from '@/components/ui/Icon';
import { LENS, LENSES, LENS_META, LINEAGE_COPY } from '@/features/lineage/constants';
import { nextTabIndex } from './tabKeys';
import styles from './EntityLineage.module.css';

/**
 * Technical or business lineage: the page's top-level choice, with the level
 * (entity or column) chosen inside whichever is open.
 *
 * Real tabs, unlike the level switch: choosing one swaps the stage below for a
 * different view, which is what a tab panel is. So the arrow keys move between
 * them, and only the open one is in the Tab order.
 */
export default function LensTabs({ value, onChange, idFor, panelId }) {
  const onKeyDown = (event, index) => {
    const next = nextTabIndex(event.key, index, LENSES.length);
    if (next === null) return;
    event.preventDefault();
    onChange(LENSES[next]);
    event.currentTarget.parentElement.children[next]?.focus();
  };

  return (
    <div className={styles.lensTabs} role="tablist" aria-label={LINEAGE_COPY.lens}>
      {LENSES.map((id, index) => {
        const isActive = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={idFor(id)}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            className={styles.lensTab}
            data-lens={id}
            title={LENS_META[id].blurb}
            onClick={() => onChange(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.lensIcon}>
              <Icon name={LENS_META[id].icon} size={15} strokeWidth={1.6} />
            </span>
            <span className={styles.lensText}>
              <span className={styles.lensLabel}>{LENS_META[id].label}</span>
              <span className={styles.lensCaption}>{LENS_META[id].caption}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

LensTabs.propTypes = {
  value: PropTypes.oneOf(Object.values(LENS)).isRequired,
  onChange: PropTypes.func.isRequired,
  idFor: PropTypes.func.isRequired,
  panelId: PropTypes.string.isRequired,
};
