import { LUCIDE_PATHS } from './lucidePaths';

/**
 * Stroke-based icon set on a 16px grid, plus the Lucide glyph in lucidePaths.
 *
 * Only the icons this app draws, copied path for path from the context_platform
 * icon map so the two stay one visual style. Paths live in one map rather than
 * one file each: they are small, and keeping them together is what stops the
 * style drifting. Everything inherits `currentColor`, so an icon is coloured by
 * its parent.
 */
export const PATHS = {
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.7" />
      <path d="m10.7 10.7 3 3" />
    </>
  ),
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  minus: <path d="M3.2 8h9.6" />,
  close: <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />,
  chevronDown: <path d="m3.8 6.2 4.2 4.2 4.2-4.2" />,
  arrowRight: <path d="M2.8 8h10.4M9.2 4l4 4-4 4" />,
  arrowLeft: <path d="M13.2 8H2.8M6.8 4l-4 4 4 4" />,
  check: <path d="m3.4 8.4 3 3 6.2-6.6" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.4v3.6M8 5.2h.01" />
    </>
  ),
  table: (
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1.4" />
      <path d="M2.2 6.2h11.6M2.2 9.8h11.6M6.4 6.2v7.2" />
    </>
  ),
  /* One column of a table, its cells marked: a column, not the whole table. */
  column: (
    <>
      <rect x="4.8" y="2.4" width="6.4" height="11.2" rx="1.4" />
      <path d="M4.8 6.2h6.4M4.8 9.8h6.4" />
    </>
  ),
  expand: <path d="M9.6 2.4h4v4M6.4 13.6h-4v-4M13.6 2.4 9.2 6.8M2.4 13.6l4.4-4.4" />,
  code: (
    <>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.6" />
      <path d="m4.8 6.4 2 1.6-2 1.6M8.6 10.2h2.6" />
    </>
  ),
  ...LUCIDE_PATHS,
};

export const ICON_NAMES = Object.keys(PATHS);

/**
 * The grid an icon is drawn on. Ours are 16; the Lucide ones keep their own 24
 * rather than being redrawn, so whatever draws an icon reads its grid from here.
 */
const LUCIDE_NAMES = new Set(Object.keys(LUCIDE_PATHS));
export const gridOf = (name) => (LUCIDE_NAMES.has(name) ? 24 : 16);

/**
 * A stroke width given in 16px-grid units, on the icon's own grid — so a Lucide
 * glyph and one of ours carry the same line weight side by side.
 */
export const strokeOf = (name, width) => Math.round(((width * gridOf(name)) / 16) * 100) / 100;
