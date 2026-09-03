/*
 * Timestamps, in the two forms this product shows them.
 *
 * WHY THIS TAKES `Date | string`.
 *
 * A `timestamptz` column is typed as `string` on every row type in
 * lib/queries.ts and arrives from postgres.js as a `Date` object. Both are
 * true at different moments — the type describes the JSON that crosses the
 * server/client boundary, the runtime value describes what the driver handed
 * back — and code that assumes either one alone typechecks, passes its tests
 * and throws on the first real row. `new Date()` accepts both, so every call
 * here goes through it rather than through a string method.
 *
 * British English and en-GB throughout, matching ui-content.md.
 */

type Instant = Date | string | null | undefined;

function parse(value: Instant): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How recent something is, in the shortest form that stays unambiguous.
 *
 * "Today", "Yesterday", then a weekday for the last week, then a date. A
 * stream of events is read by scanning down it, and "Thu" is located instantly
 * where "28 Aug" has to be worked out — but only for about a week, after which
 * "Thu" is the ambiguous one and the date is not.
 *
 * Returns null rather than a placeholder for a missing or unparseable value.
 * A caller can then leave the slot empty; "Unknown date" is a label that
 * carries no information and takes up a line saying so.
 */
export function whenLabel(value: Instant): string | null {
  const d = parse(value);
  if (!d) return null;

  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d);
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
}

/** The unabbreviated form, for a detail view where there is room to be exact. */
export function fullDate(value: Instant): string | null {
  const d = parse(value);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date and time, for the moment a report was filed. */
export function fullDateTime(value: Instant): string | null {
  const d = parse(value);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
