"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { LedgerWeek } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";

/*
 * The record, as a shape.
 *
 * NEXUS's atom is the week. Every commitment is promised IN one and FOR
 * another, every reconciliation closes one, every digest covers one. The
 * product knew this everywhere in its data model and said it nowhere on
 * screen: the week appeared as a grey pill in the page header, shaped like a
 * control, doing nothing, and labelled well enough that somebody had to ask
 * what "W35 · 24 Aug–30 Aug" meant.
 *
 * This is that fact given a form. One column per week, oldest on the left
 * because that is the direction time is read in, each column carrying the two
 * numbers the week is actually judged on. A person filing an update can see
 * the record they are adding to.
 *
 * IT IS NOT A CHART. rejected-patterns.md #2 rules out analytics you cannot
 * read a value from, and the bar here is a second encoding of a figure that is
 * printed directly underneath it — remove the bar and nothing is lost except
 * the ability to see the shape at a glance, which is the entire job. Every
 * number comes from a row: see `weekLedger` in lib/queries.ts. Nothing on this
 * component has been near a model.
 *
 * THE CURRENT WEEK IS SHOWN EVEN WHEN IT IS EMPTY, and marked. A week with
 * nothing promised in it is a fact, and it is the week the reader is standing
 * in.
 */

export function WeekLedger({
  weeks,
  currentCycleId,
  href = () => "/commitments",
  className,
}: {
  weeks: LedgerWeek[];
  currentCycleId: string | null;
  /** Where a week goes. Defaults to the tasks board. */
  href?: (w: LedgerWeek) => string;
  className?: string;
}) {
  /*
   * OPENED AT THE NEWEST END.
   *
   * The strip runs oldest to newest, which is the direction time is read
   * in and is not negotiable. But a scroller opens at its start, so on any
   * width too narrow for the whole run — 320px fits five of seven — the
   * column scrolled out of sight was the current week, which is the one
   * the reader is standing in.
   *
   * Set directly rather than through scrollIntoView, which would also
   * scroll the page.
   */
  const strip = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  if (weeks.length === 0) return null;

  /*
   * SORTED BY DATE, NOT REVERSED.
   *
   * This was `[...weeks].reverse()`, which only produces oldest-first if the
   * caller hands over a strictly newest-first list. The My Week page does
   * not: it prepends the current week when that week has nothing promised
   * in it, on the assumption that the current week is the newest one.
   *
   * Under the two-cycle model it frequently is not. A check-in filed this
   * week creates commitments targeting NEXT week, so the ledger legitimately
   * holds a week ahead of today — and the strip then rendered 07 Sep to the
   * left of 31 Aug, with the current-week marker on the wrong end of a run
   * that is supposed to read as time.
   *
   * Through `new Date`: a `date` column is typed as string here and arrives
   * as a Date object, so string comparison typechecks and then misbehaves.
   */
  const ordered = [...weeks].sort(
    (a, b) => new Date(a.starts_on).getTime() - new Date(b.starts_on).getTime(),
  );

  /*
   * WHERE "NOT YET" STARTS.
   *
   * Taken from the current week's own start date rather than from the
   * clock: the server and the browser would answer `Date.now()` at
   * different instants and could disagree across a week boundary, which is
   * a hydration mismatch on the one element that is meant to say where you
   * are. Null when no week is marked current, in which case nothing is
   * treated as future and every column reads as a settled one.
   */
  const nowStart = ordered.find((w) => w.id === currentCycleId)?.starts_on;
  const nowTime = nowStart ? new Date(nowStart).getTime() : null;

  return (
    <section
      aria-label="Weeks on record"
      className={className}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">The record</h2>
        <span className="text-2xs text-[var(--nx-text-muted)]">
          <span className="metric">{ordered.length}</span>{" "}
          {ordered.length === 1 ? "week" : "weeks"}
        </span>
      </div>

      {/*
        Scrolls rather than wraps. Eight weeks wrapping onto two rows on a
        phone puts August under September and breaks the one thing the strip
        is for, which is left-to-right time.
      */}
      <ul ref={strip} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {ordered.map((w) => {
          const now = w.id === currentCycleId;
          /*
           * A WEEK THAT HAS NOT STARTED HAS NOT FAILED.
           *
           * The two-cycle model puts a check-in's plans in the FOLLOWING
           * week, so the ledger routinely holds a week ahead of today. Drawn
           * like any other it read "0/3" over an empty bar — three
           * commitments, none delivered — which is a statement about a week
           * nobody has had the chance to work yet.
           *
           * It states what is actually known instead: how many are due.
           */
          const ahead =
            nowTime !== null && new Date(w.starts_on).getTime() > nowTime;
          const share = ahead || w.promised === 0 ? 0 : w.delivered / w.promised;

          return (
            /*
              min-w, not basis. `flex-1` is `flex: 1 1 0%`, so it overwrote the
              basis and let eight columns share 320px at 16px each — wide
              enough for the bar, four short of "0/3". The column shrank
              instead of the strip scrolling, so overflow-x-auto never
              engaged and the figure was clipped in silence. A floor makes
              the overflow real, which is what the scroller is there for.
            */
            <li key={w.id} className="min-w-14 flex-1">
              <Link
                href={href(w)}
                prefetch={false}
                aria-label={
                  w.promised === 0
                    ? `${weekLabel(w.label)} — nothing promised`
                    : ahead
                      ? `${weekLabel(w.label)} — ${w.promised} due, not started`
                      : `${weekLabel(w.label)} — ${w.delivered} of ${w.promised} delivered`
                }
                className="nx-focus-ring group flex flex-col gap-1.5 rounded-lg border px-1.5 py-2 transition-colors"
                style={{
                  borderColor: now
                    ? "var(--nx-border-strong)"
                    : "transparent",
                }}
              >
                {/*
                  The bar fills from the bottom, like a level rather than a
                  progress track: these weeks are finished, not loading.
                */}
                <span
                  aria-hidden="true"
                  className={
                    ahead
                      ? "flex h-9 w-full items-end overflow-hidden rounded-[3px] border border-dashed"
                      : "flex h-9 w-full items-end overflow-hidden rounded-[3px] bg-white/[0.06] transition-colors group-hover:bg-white/[0.11]"
                  }
                  style={ahead ? { borderColor: "var(--nx-border-strong)" } : undefined}
                >
                  {!ahead && (
                    <span
                      className="block w-full rounded-[3px]"
                      style={{
                        height: `${Math.max(share * 100, w.delivered > 0 ? 8 : 0)}%`,
                        background: "var(--color-delivered)",
                      }}
                    />
                  )}
                </span>

                {/*
                  "3 due" for a week ahead, not "0/3". The denominator is
                  known and the numerator is not yet a fact.
                */}
                <span className="metric block text-center text-[11px] leading-none text-[var(--nx-text-secondary)]">
                  {w.promised === 0
                    ? "–"
                    : ahead
                      ? `${w.promised} due`
                      : `${w.delivered}/${w.promised}`}
                </span>

                <span
                  className={
                    now
                      ? "block truncate text-center text-[10px] leading-none text-[var(--nx-text-primary)]"
                      : "block truncate text-center text-[10px] leading-none text-[var(--nx-text-muted)]"
                  }
                >
                  {shortWeek(w.label)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "W35 · 24 Aug–30 Aug" -> "24 Aug".
 *
 * A column is roughly 56px wide, so it gets the start date and nothing else.
 * The full range is in the link's accessible name and in the record below,
 * where there is room to read it.
 */
function shortWeek(label: string): string {
  return weekLabel(label).split(/[–—-]/)[0].trim();
}
