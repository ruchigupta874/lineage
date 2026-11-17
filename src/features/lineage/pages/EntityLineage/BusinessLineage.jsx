import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { LEVEL, LINEAGE_COPY } from '@/features/lineage/constants';
import { assetShape } from './assetShape';
import styles from './EntityLineage.module.css';

/**
 * Where business lineage will be drawn. There is no business data yet, so
 * this says so plainly and offers the technical view, rather than drawing
 * the technical graph under a business heading.
 */
export default function BusinessLineage({ focus, level, onShowTechnical }) {
  return (
    <div className={styles.business}>
      <div className={styles.businessBody}>
        <span className={styles.businessIcon}>
          <Icon name="briefcase" size={20} />
        </span>
        <h2 className={styles.businessTitle}>{LINEAGE_COPY.businessTitle}</h2>
        <p className={styles.businessText}>{LINEAGE_COPY.businessBody(focus?.name, level)}</p>
        <Button iconRight="arrowRight" onClick={onShowTechnical}>
          {LINEAGE_COPY.businessAction}
        </Button>
      </div>
    </div>
  );
}

BusinessLineage.propTypes = {
  focus: assetShape,
  level: PropTypes.oneOf(Object.values(LEVEL)).isRequired,
  onShowTechnical: PropTypes.func.isRequired,
};
