import Link from "next/link";
import { Target } from "lucide-react";

/*
 * "Coaching highlight" — the positive, personalised card at the foot of the
 * page. The artwork is /images/coach-highlit-bg.png, drawn for this card.
 *
 * Decorative and aria-hidden, behind a scrim so the copy keeps its contrast.
 * Dimmed harder than the purple card: the target is a busy, high-contrast
 * shape and the source is 168x99, so at card size it was a soft blob with an
 * arrow crossing the headline.
 *
 * Positive in intent, never a performance score. When there is no coaching yet
 * it says so plainly (rejected-patterns #15) rather than asserting a clean week.
 *
 * WHICH KIND OF "not yet" MATTERS. The empty state read "Coaching comes once
 * you've checked in" for everybody, including somebody who had filed that
 * morning — on a page whose own card above said "Based on your latest
 * check-in". Telling a person who has just reported to go and report is the
 * same failure as a success message over an empty screen: the interface
 * describing a situation the reader is not in. So it branches on whether they
 * actually filed.
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

export function CoachingHighlightCard({
  title,
  body,
  hasCoaching,
  hasReported,
}: {
  title: string | null;
  body: string | null;
  hasCoaching: boolean;
  /** Whether they have filed for the week on screen. Decides the empty state. */
  hasReported: boolean;
}) {
  return (
    <section
      aria-label="Coaching highlight"
      className="nx-card-gradient-green relative flex min-h-0 flex-col overflow-hidden rounded-2xl p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat grayscale"
        /* Opacity follows the theme — see --card-art-opacity in globals.css. */
        style={{
          backgroundImage: "url('/images/coach-highlit-bg.png')",
          opacity: "var(--card-art-opacity)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        /* Follows the theme — see --card-scrim in app/globals.css. */
        style={{ background: "var(--card-scrim)" }}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Target size={16} aria-hidden="true" />
          Coaching highlight
        </p>
        <p className="mt-0.5 text-xs text-white/55">Just for you</p>

        {hasCoaching && title ? (
          <>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/85">
              {body}
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {hasReported
                ? "Your coaching is still being written"
                : "Coaching comes once you\u2019ve checked in"}
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/85">
              {hasReported
                ? "NEXUS reads your week after it settles and writes a focus for the next one. It will appear here."
                : "File your weekly update and NEXUS will share a focus for the week ahead."}
            </p>
          </>
        )}

        <Link
          href="/advice"
          className="nx-focus-ring mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-[var(--nav-active-bg)] px-4 text-sm font-medium text-[var(--nav-active-fg)] transition-opacity hover:opacity-90"
        >
          View coaching tips
        </Link>
      </div>
    </section>
  );
}
