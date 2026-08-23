/*
 * Cycle labels are precomputed in the database as "W33 · 10 Aug–16 Aug"
 * (migration 0001, generate_cycles). One string carries two facts, so these
 * split it rather than each screen re-deriving dates from starts_on/ends_on
 * and risking a different answer than the digest email gives.
 */

/** "W33 · 10 Aug–16 Aug" -> "W33" */
export function weekCode(label: string): string {
  return label.split("·")[0]?.trim() || label;
}

/** "W33 · 10 Aug–16 Aug" -> "10 Aug–16 Aug" */
export function weekRange(label: string): string {
  const parts = label.split("·");
  return parts.length > 1 ? parts.slice(1).join("·").trim() : "";
}
