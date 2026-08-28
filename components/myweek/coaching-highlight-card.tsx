import Link from "next/link";
import { Target } from "lucide-react";

/*
 * "Coaching highlight" — the positive, personalised card at the foot of the
 * page. Deep teal/green gradient with a subtle target-and-arrow visual on the
 * right communicating focus and progress.
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

export function CoachingHighlightCard({
  title,
  body,
  basedOn,
  hasCoaching,
  hasReported,
}: {
  title: string | null;
  body: string | null;
  basedOn?: string | null;
  hasCoaching: boolean;
  /** Whether they have filed for the week on screen. Decides the empty state. */
  hasReported: boolean;
}) {
  return (
    <section
      aria-label="Coaching highlight"
      className="nx-card-gradient-green relative flex min-h-0 flex-col overflow-hidden rounded-2xl p-5 sm:p-6"
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--nx-success-light)]">
          <Target size={16} aria-hidden="true" />
          Coaching highlight
        </p>
        <p className="mt-0.5 text-xs text-[var(--nx-success)]/70">Just for you</p>

        {hasCoaching && title ? (
          <>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/85">
              {body}
            </p>
            {basedOn && (
              <p className="mt-4 inline-flex items-center rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-white/60">
                {basedOn}
              </p>
            )}
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
          className="nx-focus-ring mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--nx-success)] to-[var(--nx-success-light)] px-4 text-sm font-medium text-[#062D2A] transition-all hover:brightness-110"
        >
          View coaching tips
        </Link>
      </div>
    </section>
  );
}
