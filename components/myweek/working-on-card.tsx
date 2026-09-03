"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { ActivityEntry, LiveCommitment } from "@/lib/queries";
import { statusBadge } from "@/lib/design-tokens";
import { weekLabel } from "@/lib/cycle";
import { commitmentSummary } from "@/lib/summarise";
import { ActivityDetailDialog } from "@/components/myweek/activity-detail-dialog";

/*
 * "What you're working on" — everything still open, whichever week it was
 * promised for.
 *
 * NOT the week being reported on. The two-cycle model puts a check-in's output
 * in the FOLLOWING week — file in W34 and the commitments target W35 — so a
 * card fed from the displayed week's promises was empty for precisely the
 * person who had just filed. See `liveCommitments` in lib/queries.ts.
 *
 * SUMMARY, THEN THE WHOLE THING — AND IT OPENS HERE.
 *
 * Every row used to navigate to /commitments?task=<id>, which was the right
 * answer when this card was the only way to reach a commitment's detail. It is
 * the wrong one now that the two pages have different jobs: My Week is for
 * reviewing and Pending Tasks is for managing, and sending somebody to the
 * management screen to READ one line is three navigations to answer a
 * question they asked from here.
 *
 * So a press opens the detail in place, over this page, using the same dialog
 * the activity stream above it uses. The link to Pending Tasks stays in the
 * header, where it says what it is for: changing something.
 *
 * NOTHING IS HIDDEN AND NOTHING SCROLLS INSIDE. An earlier pass capped the
 * list at four with "1 more open" underneath, inside a card bounded by the
 * viewport — so the line was clipped and the count described rows that were
 * merely out of view. The page scrolls; this does not have to.
 */

/**
 * A live commitment as a stream entry, so one dialog serves both lists.
 *
 * `LiveCommitment` is already `CommitmentRow & { target_label, ... }`, which
 * is exactly the commitment arm of `ActivityEntry`. `at` is when the row last
 * moved — the same value `recentActivity` computes in SQL, derived here from
 * the timestamps the row carries rather than invented.
 */
function asEntry(c: LiveCommitment): ActivityEntry {
  return {
    kind: "commitment",
    at: c.delivered_at ?? c.declared_at ?? c.created_at,
    ...c,
  };
}

export function WorkingOnCard({
  commitments,
  hasReported,
}: {
  commitments: LiveCommitment[];
  /** Whether they have filed for the week on screen. Decides the empty state. */
  hasReported: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = useMemo(() => {
    const found = commitments.find((c) => c.id === openId);
    return found ? asEntry(found) : null;
  }, [commitments, openId]);

  return (
    <section
      aria-label="What you're working on"
      className="nx-card flex flex-col p-5 sm:p-6"
    >
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]">
            What you&rsquo;re working on
          </h2>
          <p className="mt-0.5 text-sm text-[var(--nx-text-secondary)]">
            {commitments.length === 0 ? (
              "Everything you have promised, still open"
            ) : (
              <span className="metric">{commitments.length} open</span>
            )}
          </p>
        </div>
        {/*
          The link says what the other page is FOR, not just where it goes.
          "View all tasks" beside a list of tasks reads as "see this again";
          this page reviews and that one changes things.
        */}
        <Link
          href="/commitments"
          className="nx-focus-ring -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm text-[var(--nx-primary-light)] transition-opacity hover:opacity-80"
        >
          Update status
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {commitments.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-4">
          {/*
            Which of the two empty weeks this is. Telling somebody who filed
            twenty minutes ago to go and file is the interface describing a
            situation the reader is not in.
          */}
          {hasReported ? (
            <>
              <p className="text-[15px] font-medium text-[var(--nx-text-primary)]">
                Nothing open right now.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
                You have filed for this week and everything you promised is
                closed. New commitments appear here as soon as you make them.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-[var(--nx-text-primary)]">
                Nothing here yet.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
                Check in and whatever you say you are working on appears here.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {commitments.map((c) => {
            const s = statusBadge(c.status);
            const summary = commitmentSummary(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="nx-focus-ring group flex w-full items-start gap-3 rounded-xl
                             border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left
                             transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-2.5 shrink-0 rounded-full"
                    style={{ background: s.tone }}
                  />
                  <span className="min-w-0 flex-1">
                    {/*
                      NOT CLAMPED. A clamp is a truncation with a nicer name:
                      at 320px two lines cut these titles in exactly the place
                      `truncate` used to.
                    */}
                    <span className="block text-[15px] font-medium leading-snug text-[var(--nx-text-primary)]">
                      {c.title}
                    </span>
                    {summary && (
                      <span className="mt-1 block text-[13px] leading-relaxed text-[var(--nx-text-secondary)]">
                        {summary}
                      </span>
                    )}
                    <span className="mt-1 block text-2xs text-[var(--nx-text-secondary)]">
                      {s.label}
                      {/*
                        Which week this was promised for, but only when it is
                        not the current one. A commitment carried from three
                        weeks ago is a different fact from one made for today.
                      */}
                      {!c.is_current_week && ` · for ${weekLabel(c.target_label)}`}
                    </span>
                  </span>

                  {/*
                    Renewed rather than finished. Counted from the weeks this
                    same promise has been open — see `liveCommitments`.
                  */}
                  {c.carry_weeks > 1 && (
                    <span
                      title={`Open for ${c.carry_weeks} weeks`}
                      className="shrink-0 whitespace-nowrap rounded-md bg-[var(--nx-warning)]/12 px-2 py-1
                                 text-2xs font-medium text-[var(--nx-warning)]"
                    >
                      <RefreshCw
                        size={11}
                        className="mr-1 inline align-[-1px]"
                        aria-hidden="true"
                      />
                      {c.carry_weeks}w
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ActivityDetailDialog
        entry={selected}
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}
