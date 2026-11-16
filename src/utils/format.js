export const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/** Joins the parts that are present with a middle dot: `joinMeta('9 cols', null, '2m rows')`. */
export const joinMeta = (...parts) => parts.filter(Boolean).join(' · ');
