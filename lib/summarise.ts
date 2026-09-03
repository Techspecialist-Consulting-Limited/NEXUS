/*
 * The one line under a card's title.
 *
 * Shared by the activity stream and "what you're working on" so the two lists
 * on My Week summarise the same way. A card that summarises differently from
 * the card above it reads as two components, not one page.
 *
 * NOTHING HERE IS GENERATED. Every candidate is a column somebody or something
 * already wrote — an update the person saved, the sentence they said, or the
 * description extraction produced. This function only chooses between them and
 * shortens the result; it never composes a sentence, because a summary the
 * browser invented is a claim nobody can check (rejected-patterns.md #11).
 */

/** Longer than this and it stops reading as a summary and starts being the thing. */
const SUMMARY_CHARS = 120;

/** Words alone, for comparing two sentences without punctuation getting in the way. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Does this candidate tell the reader anything the title did not?
 *
 * Extraction tends to produce a description that is the title as a sentence —
 * "Wait on Finance to licence the RPA platform" becomes "Still stuck on wait
 * on finance to licence the rpa platform". Rendering that under the title sets
 * the same fact twice, in a fainter colour, and costs a line on every card.
 *
 * So a candidate containing the whole title has to earn its place with what is
 * LEFT once the title is removed. Two or three words of framing is not enough;
 * a real clause is.
 */
function addsSomething(title: string, candidate: string): boolean {
  const t = normalise(title);
  const c = normalise(candidate);
  if (!c) return false;
  if (!c.includes(t)) return true;
  return c.replace(t, " ").replace(/\s+/g, " ").trim().length >= 24;
}

/** Cut to a whole word or a sentence end. Never mid-word. */
function shorten(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= SUMMARY_CHARS) return clean;

  const window = clean.slice(0, SUMMARY_CHARS);
  const stop = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (stop > 40) return window.slice(0, stop + 1);
  const space = window.lastIndexOf(" ");
  return `${window.slice(0, space > 40 ? space : SUMMARY_CHARS)}…`;
}

/**
 * The best available line about a commitment, or null when there is none.
 *
 * ORDER IS BY WHO WROTE IT. `outcome_reason` is an update the person saved
 * about this specific thing and is the most current; `source_quote` is their
 * own sentence from the check-in that created it; `description` is the
 * extractor's, and goes last because it is the only one nobody said out loud.
 *
 * Null rather than a placeholder. A card with nothing to add shows a title and
 * a status, which is a complete card — "No description" is a line that exists
 * only to say a line is missing.
 */
export function commitmentSummary(c: {
  title: string;
  outcome_reason: string | null;
  source_quote: string | null;
  description: string | null;
}): string | null {
  for (const candidate of [c.outcome_reason, c.source_quote, c.description]) {
    if (candidate && addsSomething(c.title, candidate)) return shorten(candidate);
  }
  return null;
}

/** A filed report summarises to its own opening words — the person's, verbatim. */
export function reportSummary(rawText: string): string {
  return shorten(rawText);
}
