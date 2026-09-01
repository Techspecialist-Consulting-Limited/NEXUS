"use client";

import { useMemo, useState } from "react";
import type { LiveCommitment } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { TaskRow } from "@/components/tasks/task-row";
import { cn } from "@/lib/cn";

/*
 * Everything still open, longest-carried first.
 *
 * WHY ONE LIST AND NOT TWO CARDS.
 *
 * This replaces `[ Current week ] [ Needs attention ]`. "Needs attention" was
 * never a second set — it was the blocked rows out of the first one, rendered
 * again in their own card, so a blocked commitment appeared twice on one
 * screen and the reader had to work out that it was the same thing. Here it is
 * a filter over the rows, which is what it always was.
 *
 * WHY CARRY SETS THE ORDER.
 *
 * Every other ordering the product could use — priority, week, status — is a
 * claim somebody made when they filed. Carry is the only one the record
 * produces on its own: nobody types "this is my eighth week saying this". It
 * is also the fact most likely to need a decision, and the one a weekly rhythm
 * is worst at surfacing, because each week on its own looks like a small slip.
 *
 * It is a fact about WORK, never about a person. There is no ranking of
 * people here and there must never be one — rejected-patterns.md #9.
 */

type Filter = "all" | "blocked" | "carried";

/** Carried this long or more and it is not a slip, it is a pattern. */
const CARRY_THRESHOLD = 3;

export function OpenWork({
  commitments,
  currentWeekLabel,
  hasRecord,
  onOpen,
}: {
  commitments: LiveCommitment[];
  /** The week containing today, for the empty state. Null before any exists. */
  currentWeekLabel: string | null;
  /** Whether there are earlier weeks below. Decides which empty state is true. */
  hasRecord: boolean;
  onOpen: (c: LiveCommitment) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const ordered = useMemo(
    () =>
      [...commitments].sort(
        (a, b) =>
          b.carry_weeks - a.carry_weeks ||
          Number(b.status === "blocked") - Number(a.status === "blocked") ||
          /*
           * Then oldest first. Without this the tie-break was alphabetical,
           * which put a promise made for 06 July below one made for 24
           * August — the list said it was ordered by how long things had
           * been outstanding and then ordered three of five rows by their
           * first letter.
           *
           * THROUGH new Date, NOT localeCompare. A `date` column is typed as
           * string on Cycle and LiveCommitment, and arrives as a Date object
           * — so string methods typecheck, pass every unit test, and throw on
           * the first real row. The rest of the codebase reads these the same
           * way; see tasks-workspace.tsx, which wraps every comparison.
           */
          new Date(a.starts_on).getTime() - new Date(b.starts_on).getTime() ||
          a.title.localeCompare(b.title),
      ),
    [commitments],
  );

  const blocked = ordered.filter((c) => c.status === "blocked");
  const carried = ordered.filter((c) => c.carry_weeks >= CARRY_THRESHOLD);

  const shown =
    filter === "blocked" ? blocked : filter === "carried" ? carried : ordered;

  /*
   * The filters are only offered when they would change what is on screen.
   * A "Blocked (0)" tab is a control that can only disappoint, and a tab
   * selecting the same rows as the one beside it is noise.
   */
  const tabs = ([
    { id: "all", label: "All", count: ordered.length },
    { id: "blocked", label: "Blocked", count: blocked.length },
    { id: "carried", label: `Carried ${CARRY_THRESHOLD}+ weeks`, count: carried.length },
  ] as { id: Filter; label: string; count: number }[]).filter(
    (t) => t.id === "all" || (t.count > 0 && t.count < ordered.length),
  );

  return (
    <section aria-label="Open work" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="card-title text-[var(--nx-text-primary)]">Open work</h2>

        {tabs.length > 1 && (
          <div role="tablist" aria-label="Filter open work" className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                onClick={() => setFilter(t.id)}
                className={cn(
                  "nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors",
                  filter === t.id
                    ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]"
                    : "border border-white/[0.09] text-[var(--nx-text-secondary)] hover:bg-white/[0.06]",
                )}
              >
                {t.label}
                <span className="metric opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty currentWeekLabel={currentWeekLabel} hasRecord={hasRecord} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id}>
              {/*
                The week is stated only when it is not this one. A promise
                carried from three weeks ago and one made for today are
                different facts, and a list that flattens them makes a week
                look fuller than it is.
              */}
              <TaskRow
                commitment={c}
                onClick={() => onOpen(c)}
                trailing={
                  c.is_current_week ? null : `for ${weekLabel(c.target_label)}`
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/*
 * WHAT AN EMPTY LIST ACTUALLY MEANS HERE, which is two different things.
 *
 * Nothing open and nothing on record is a new account: the sentence is an
 * invitation. Nothing open with weeks behind it is a cleared board, which is
 * worth saying plainly rather than dressing up — and it is the only claim of
 * the two the rows actually support. rejected-patterns.md #15.
 */
function Empty({
  currentWeekLabel,
  hasRecord,
}: {
  currentWeekLabel: string | null;
  hasRecord: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-[var(--nx-text-primary)]">
        {hasRecord ? "Nothing is open" : "No commitments yet"}
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-[var(--nx-text-secondary)]">
        {hasRecord ? (
          <>
            Everything promised has been closed out. What you take on for{" "}
            {currentWeekLabel ?? "this week"} appears here once you check in.
          </>
        ) : (
          <>
            Check in and say what you are taking on. NEXUS turns what you write
            into commitments and they show up here.
          </>
        )}
      </p>
    </div>
  );
}
