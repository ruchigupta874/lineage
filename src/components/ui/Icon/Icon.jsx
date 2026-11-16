import PropTypes from 'prop-types';
import { ICON_NAMES, PATHS, gridOf, strokeOf } from './paths';

/**
 * Renders one path from the icon set. Inherits `currentColor` from its parent.
 * `strokeWidth` is in 16px-grid units whatever grid the icon is drawn on.
 */
export default function Icon({ name, size = 16, strokeWidth = 1.4, className, style }) {
  const path = PATHS[name];
  if (!path) return null;
  const grid = gridOf(name);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeOf(name, strokeWidth)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: 'none', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

Icon.propTypes = {
  name: PropTypes.oneOf(ICON_NAMES).isRequired,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
  style: PropTypes.object,
};
