/** Locale handling for API responses.
 *
 *  Content is stored as parallel En/Ar columns, and the API resolves the
 *  requested locale on the server so a response only ever carries the language
 *  the UI is showing. `?locale=` is a view preference, not a permission: it
 *  never changes which rows are visible, only which column is returned. */
export const LOCALES = ['EN', 'AR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'EN';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value.toUpperCase()) && value.toUpperCase() === value;
}

/** Accepts the query value case-insensitively and falls back to the default,
 *  so a malformed `?locale=xx` can never break a page. */
export function resolveLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (typeof value !== 'string') return fallback;
  const upper = value.toUpperCase();
  return (LOCALES as readonly string[]).includes(upper) ? (upper as Locale) : fallback;
}
