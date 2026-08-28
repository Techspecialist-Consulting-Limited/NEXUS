import { Sparkles } from "lucide-react";

/*
 * "NEXUS noticed" — the AI insight that sits directly under the check-in.
 *
 * The artwork is /images/nexus-notice-bg.png, drawn for this card. It replaces
 * an inline SVG ribbon that approximated it — same intent, and now the design
 * is the design rather than a re-drawing of one.
 *
 * Held behind a scrim, dimmed, and aria-hidden. Two reasons, and both matter:
 * the words carry the meaning and rejected-patterns #5 forbids visual polish
 * implying confidence the data has not earned — and the source file is 173x101,
 * so at card size it is being enlarged roughly four times. As atmosphere that
 * softness reads as a wash; as a subject it reads as a blurred picture.
 *
 * WHEN THERE IS NO INSIGHT, THE ROWS SPEAK.
 *
 * This card used to fall back on "Nothing needs flagging this week" whenever
 * coaching was absent, and rendered it at 2xl on a glowing gradient. Absent
 * coaching is not a clean week: the model may have been slow, mocked, or failed
 * — and on a page listing two blocked commitments directly below, the card was
 * visibly contradicting the card beneath it.
 *
 * rejected-patterns.md #15 gives the rule and the remedy: "Derive the
 * empty-state sentence from the rows, or say plainly that there is nothing to
 * show." So the fallback is counted, not asserted. Blocked work is the flag,
 * and SQL already knows about it.
 */

/*
 * NO PROVENANCE CHIP HERE.
 *
 * This card used to print `based_on` — the model's own field, whose value is a
 * column name: "promised_count", "protected_count", "carryover_count". It was
 * rendered raw, so the reader got a database identifier in a rounded box under
 * a sentence about their week, and it read as debug output that had escaped.
 *
 * The intent was right and GUIDE §15 rule 1 still stands: interpretation must
 * be traceable to a counted figure. But a chip saying "protected_count" traces
 * nothing for the person reading it — the evidence has to be IN the sentence,
 * which is exactly what the prompt asks the model for and what the counted
 * fallback below already does. See design/ai-communication.md.
 */

export function NexusNoticedCard({
  title,
  body,
  hasInsight,
  blockedCount,
  carriedCount,
  waitingOn,
  openCount,
  hasReported,
}: {
  title: string | null;
  body: string | null;
  /** Whether the model produced anything. Never used to claim a clean week. */
  hasInsight: boolean;
  /** Counted in SQL, not written by a model — see the note above. */
  blockedCount: number;
  carriedCount: number;
  /** Units the blocked work is waiting on, when it names one. */
  waitingOn: string[];
  openCount: number;
  hasReported: boolean;
}) {
  const fallback = describe({
    blockedCount,
    carriedCount,
    waitingOn,
    openCount,
    hasReported,
  });

  return (
    <section
      aria-label="NEXUS noticed"
      className="nx-card-gradient-purple relative flex min-h-0 flex-col overflow-hidden rounded-2xl p-5 sm:p-6"
    >
      {/*
        Decorative only, and covered by a scrim so the copy above it keeps its
        contrast whatever the artwork is doing underneath.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
        style={{ backgroundImage: "url('/images/nexus-notice-bg.png')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#1B0B3A]/95 via-[#1B0B3A]/78 to-[#1B0B3A]/35"
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--nx-primary-light)]">
          <Sparkles size={16} aria-hidden="true" />
          NEXUS noticed
        </p>

        {hasInsight && title ? (
          <>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/80">
              {body}
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {fallback.title}
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/80">
              {fallback.body}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * What to say when the model has said nothing.
 *
 * Every branch is a statement about rows this component was handed. None of
 * them claims the week is clean unless the rows say so, and the one case the
 * old copy could not express — coaching simply has not been written yet — is
 * now said out loud rather than dressed up as good news.
 */
function describe({
  blockedCount,
  carriedCount,
  waitingOn,
  openCount,
  hasReported,
}: {
  blockedCount: number;
  carriedCount: number;
  waitingOn: string[];
  openCount: number;
  hasReported: boolean;
}): { title: string; body: string } {
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  if (blockedCount > 0) {
    const who = waitingOn.length
      ? ` Waiting on ${waitingOn.slice(0, 2).join(" and ")}.`
      : "";
    return {
      title: `${blockedCount} ${plural(blockedCount, "thing is", "things are")} blocked`,
      body:
        `${plural(blockedCount, "It is", "They are")} on your list and not moving.` +
        `${who} Say so in your check-in and it reaches the people who can clear it.`,
    };
  }

  if (carriedCount > 0) {
    return {
      title: `${carriedCount} ${plural(carriedCount, "item has", "items have")} carried over`,
      body:
        "Work that keeps moving to next week is usually work that needs a " +
        "different plan, not more time.",
    };
  }

  if (!hasReported) {
    return {
      title: "Your check-in is open",
      body:
        "Once you have filed, NEXUS reads what you wrote and anything worth " +
        "your attention appears here.",
    };
  }

  if (openCount === 0) {
    return {
      title: "Nothing open on your list",
      body:
        "Everything you promised is closed. This fills up again as soon as " +
        "you make a new commitment.",
    };
  }

  /*
   * Reported, work in flight, nothing blocked or carried — and still no
   * coaching. That is a fact about the model, not about the week, and saying
   * so is the honest version of the sentence this card used to invent.
   */
  return {
    title: "Nothing blocked or carrying",
    body:
      `All ${openCount} open ${plural(openCount, "item is", "items are")} moving. ` +
      "NEXUS writes its read of your week after the week settles.",
  };
}
