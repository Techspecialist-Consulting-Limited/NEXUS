/*
 * Cycle labels are precomputed in the database as "W33 · 10 Aug–16 Aug"
 * (migration 0001, generate_cycles). One string carries two facts, so these
 * split it rather than each screen re-deriving dates from starts_on/ends_on
 * and risking a different answer than the digest email gives.
 *
 * WHY THE WEEK NUMBER IS NOT SHOWN.
 *
 * Every surface used to badge the period as "W33". It is precise, it sorts,
 * and almost nobody can place it — a Chairman reading "W33" has to work out
 * which week that was before the sentence next to it means anything, and a
 * label that needs decoding is a label that gets skipped.
 *
 * "10 Aug–16 Aug" is the same fact in a form somebody can locate against
 * their own memory of the week. The week number stays in the database, where
 * ordering actually needs it.
 */

/** "W33 · 10 Aug–16 Aug" -> "10 Aug–16 Aug" */
export function weekRange(label: string): string {
  const parts = label.split("·");
  return parts.length > 1 ? parts.slice(1).join("·").trim() : label.trim();
}

/**
 * How a period is named on screen. The dates, not the week number.
 *
 * Falls back to the whole label rather than to an empty string: a cycle whose
 * label does not carry a range at all should still be identifiable, and a
 * blank period heading reads as a rendering fault.
 */
export function weekLabel(label: string): string {
  return weekRange(label) || label.trim();
}
