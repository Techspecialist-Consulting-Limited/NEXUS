import { Sparkles } from "lucide-react";

/*
 * "NEXUS noticed" — the AI insight that sits directly under the check-in.
 *
 * Premium purple/indigo gradient treatment with a subtle ribbon-like AI visual
 * on the right. The glow and the gradient are meant to read as intelligence and
 * discovery, NOT as a generic notification. Words stay legible on top of it.
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

export function NexusNoticedCard({
  title,
  body,
  basedOn,
  hasInsight,
  blockedCount,
  carriedCount,
  waitingOn,
  openCount,
  hasReported,
}: {
  title: string | null;
  body: string | null;
  basedOn?: string | null;
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
      {/* subtle ribbon visual — decorative */}
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-full w-40 opacity-60">
        <svg viewBox="0 0 160 220" fill="none" className="h-full w-full">
          <path
            d="M160 0C90 30 40 90 60 160C80 230 150 180 180 140"
            stroke="url(#nxRibbon)"
            strokeWidth="18"
            strokeLinecap="round"
            opacity="0.20"
          />
          <path
            d="M160 40C100 60 60 110 80 170C100 230 160 190 190 160"
            stroke="url(#nxRibbon)"
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.14"
          />
          <defs>
            <linearGradient id="nxRibbon" x1="0" y1="0" x2="160" y2="220" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A78BFA" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>
      </div>

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
            {basedOn && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-white/60">
                {basedOn}
              </p>
            )}
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
