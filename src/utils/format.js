export const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const DATE_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** A moment to the minute: `Jul 18, 2026, 8:21 AM`. */
export const formatDateTime = (date) => DATE_TIME.format(date);

/** Joins the parts that are present with a middle dot: `joinMeta('9 cols', null, '2m rows')`. */
export const joinMeta = (...parts) => parts.filter(Boolean).join(' · ');
