/*
 * The colour a unit is drawn in.
 *
 * WHY THIS IS NOT `departments.color`.
 *
 * That column exists, and nothing in the application has ever written to it.
 * It carries a database default of #7C8CF8 — a blue-purple — so every unit in
 * every organisation created through onboarding is that one colour, and the
 * only rows that differ are the seeded demo ones. On screen that read as a
 * designed palette; it was an unset default showing through, and after the
 * warm re-palette it was the only thing left on the page still tinted blue.
 *
 * So the tone comes from the token set instead. Five warm neutrals, chosen by
 * a stable hash of the unit's id, which means:
 *
 *   - the same unit is always the same colour, on every screen and reload
 *   - the colours follow the theme, because they are `var(--dept-*)`
 *   - a new organisation looks deliberate on its first day
 *
 * They are neutrals rather than hues on purpose. A unit is an identity, not a
 * state — give one the teal that means "delivered" and a roster reads as a
 * verdict. See the Color section of design/visual-system.md.
 */

const TONES = [
  "var(--dept-techspecialist)",
  "var(--dept-media-hub)",
  "var(--dept-creative-hub)",
  "var(--dept-operations)",
  "var(--dept-growth)",
] as const;

/** A stable index for a key. Not cryptographic — it only has to be repeatable. */
function bucket(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % TONES.length;
}

/**
 * `key` should be the unit's id. A name works, but renaming a unit then
 * recolours it, which is a small surprise for no gain.
 *
 * Null — somebody in no unit — gets the mid neutral rather than a sixth
 * colour, because "unassigned" is not a unit and must not look like one.
 */
export function unitTone(key: string | null | undefined): string {
  return key ? TONES[bucket(key)] : "var(--dept-media-hub)";
}

/**
 * The same tone at low alpha, for a puck or chip behind an icon.
 *
 * `color-mix` rather than appending hex alpha: the tone is a custom property,
 * and `${tone}60` produces the string "var(--dept-growth)60", which is not a
 * colour and silently renders as nothing.
 */
export function unitWash(key: string | null | undefined, percent = 22): string {
  return `color-mix(in oklab, ${unitTone(key)} ${percent}%, transparent)`;
}
