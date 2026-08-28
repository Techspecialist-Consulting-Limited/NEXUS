import Link from "next/link";
import { ArrowRight, ChevronRight, RefreshCw } from "lucide-react";
import type { LiveCommitment } from "@/lib/queries";
import { statusBadge } from "@/lib/design-tokens";
import { weekLabel } from "@/lib/cycle";

/*
 * "What you're working on" — everything still open, whichever week it was
 * promised for.
 *
 * NOT the week being reported on. The two-cycle model puts a check-in's output
 * in the FOLLOWING week — file in W34 and the commitments target W35 — so a
 * card fed from the displayed week's promises was empty for precisely the
 * person who had just filed. See `liveCommitments` in lib/queries.ts.
 *
 * NOTHING IS HIDDEN. An earlier pass capped the list at four and printed
 * "1 more open" underneath, which was wrong twice over: the line was clipped by
 * the card's own height, and once the list scrolled the count described rows
 * that were merely out of view rather than omitted. A number about a list is
 * one more thing that can disagree with the list.
 *
 * So the list scrolls instead — bounded by the card on desktop and by a height
 * on mobile, where the page is not viewport-locked. The whole set is there, in
 * order, and the header says how many there are.
 *
 * EVERY ROW IS A LINK. It reads as a list of things you are doing and it was
 * inert: five commitments, a status apiece, and no way to ask about any one of
 * them. Each row now goes to /commitments?task=<id>, which is the Tasks page
 * with that commitment's detail open — the same panel a row on that page
 * opens, reached by an address rather than by finding it again in a list.
 */

export function WorkingOnCard({
  commitments,
  hasReported,
}: {
  commitments: LiveCommitment[];
  /** Whether they have filed for the week on screen. Decides the empty state. */
  hasReported: boolean;
}) {
  return (
    <section
      aria-label="What you're working on"
      className="nx-card flex min-h-0 flex-col overflow-hidden p-5 sm:p-6"
    >
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]">
            What you&rsquo;re working on
          </h2>
          <p className="mt-0.5 text-sm text-[var(--nx-text-secondary)]">
            {commitments.length === 0
              ? "Everything you have promised, still open"
              : `${commitments.length} open`}
          </p>
        </div>
        <Link
          href="/commitments"
          className="nx-focus-ring -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm text-[var(--nx-primary-light)] transition-opacity hover:opacity-80"
        >
          View all tasks
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {commitments.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-4">
          {/*
            Which of the two empty weeks this is.

            "Complete your check-in and your weekly focus will appear here" was
            shown to everybody — including somebody who had filed twenty minutes
            earlier, on a page whose own header said so. Telling a person who
            has just reported to go and report is the same failure as a success
            message over an empty screen: the interface describing a situation
            the reader is not in.
          */}
          {hasReported ? (
            <>
              <p className="text-[15px] font-medium text-white/90">
                Nothing open right now.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
                You have filed for this week and everything you promised is
                closed. New commitments appear here as soon as you make them.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-white/90">
                Nothing here yet.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
                Check in and whatever you say you are working on appears here.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/*
            The list flexes and scrolls; the count below it does not.

            Both were in normal flow inside a card with a fixed height on
            desktop, so four rows pushed the "1 more open" line past the
            bottom edge and overflow-hidden ate it — the overflow indicator
            was itself overflowing, which is the one thing it must never do.
          */}
          <ul
            className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1
                       max-h-[26rem] lg:max-h-none lg:space-y-2.5"
          >
            {commitments.map((c) => {
              const s = statusBadge(c.status);
              return (
                <li key={c.id}>
                  <Link
                    href={`/commitments?task=${encodeURIComponent(c.id)}`}
                    aria-label={`${c.title} — ${s.label}`}
                    className="nx-focus-ring group flex items-center gap-3 rounded-xl border border-white/[0.07]
                               bg-white/[0.02] px-3.5 py-2.5 transition-colors
                               hover:border-white/[0.14] hover:bg-white/[0.05]"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: s.tone }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] leading-snug text-white/90">
                        {c.title}
                      </p>
                      <p className="truncate text-xs text-[var(--nx-text-muted)]">
                        {s.label}
                        {/*
                          Which week this was promised for, but only when it is
                          not the current one. A commitment carried from three
                          weeks ago is a different fact from one made for today,
                          and a list that flattens the two makes a week look
                          fuller than it is. Saying it on every row would be
                          noise; saying it on the ones that need it is the point.
                        */}
                        {!c.is_current_week && ` · for ${weekLabel(c.target_label)}`}
                      </p>
                    </div>
                    {/*
                      Renewed rather than finished. Counted from the weeks this
                      same promise has been open — see `liveCommitments`, which
                      cannot use carried_from_commitment_id because nothing in
                      the application has ever written to it.
                    */}
                    {c.carry_weeks > 1 && (
                      <span
                        title={`Open for ${c.carry_weeks} weeks`}
                        className="shrink-0 whitespace-nowrap rounded-md bg-[var(--nx-warning)]/12 px-2 py-1
                                   text-2xs font-medium text-[var(--nx-warning)]"
                      >
                        <RefreshCw size={11} className="mr-1 inline align-[-1px]" aria-hidden="true" />
                        {c.carry_weeks}w
                      </span>
                    )}
                    {/*
                      The affordance, not decoration: without it the rows look
                      exactly as inert as they used to be.
                    */}
                    <ChevronRight
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--nx-text-muted)] transition-transform duration-150
                                 group-hover:translate-x-0.5 group-hover:text-[var(--nx-text-secondary)]"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

        </>
      )}
    </section>
  );
}
