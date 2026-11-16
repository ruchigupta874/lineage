import PropTypes from 'prop-types';
import styles from './LineageCanvas.module.css';

/** At rest with nothing traced; on the traced path; or off it while something is. */
const edgeState = (path, id) => {
  if (!path) return 'rest';
  return path.edgeIds.has(id) ? 'active' : 'dimmed';
};

/**
 * The lines between tables, in the drawing's own coordinates. A traced path
 * is drawn last so it sits on top of the lines it crosses rather than under
 * them. Two arrowheads, because a marker cannot take its line's colour.
 */
export default function LineageEdges({ layout, path }) {
  const isActive = (edge) => edgeState(path, edge.id) === 'active';
  const edges = [...layout.edges].sort((a, b) => isActive(a) - isActive(b));

  return (
    <svg
      className={styles.edges}
      width={layout.width}
      height={layout.height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {['rest', 'active'].map((state) => (
          <marker
            key={state}
            id={`lineage-arrow-${state}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M1.5 1.2 7 4l-5.5 2.8" className={styles.arrow} data-state={state} />
          </marker>
        ))}
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.d}
          className={styles.edge}
          data-state={edgeState(path, edge.id)}
          markerEnd={`url(#lineage-arrow-${isActive(edge) ? 'active' : 'rest'})`}
        />
      ))}
    </svg>
  );
}

LineageEdges.propTypes = {
  layout: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    edges: PropTypes.arrayOf(
      PropTypes.shape({ id: PropTypes.string.isRequired, d: PropTypes.string.isRequired }),
    ).isRequired,
  }).isRequired,
  path: PropTypes.shape({ edgeIds: PropTypes.instanceOf(Set).isRequired }),
};
