"use client";

import { useMemo } from "react";
import type { LiveCommitment } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { TaskRow } from "@/components/tasks/task-row";
import { MarkDone } from "@/components/tasks/mark-done";

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

export type TaskFilter = "all" | "blocked" | "carried";

/** Carried this long or more and it is not a slip, it is a pattern. */
const CARRY_THRESHOLD = 3;

export function OpenWork({
  commitments,
  currentWeekLabel,
  hasRecord,
  onOpen,
  filter,
}: {
  commitments: LiveCommitment[];
  /** The week containing today, for the empty state. Null before any exists. */
  currentWeekLabel: string | null;
  /** Whether there are earlier weeks below. Decides which empty state is true. */
  hasRecord: boolean;
  onOpen: (c: LiveCommitment) => void;
  filter: TaskFilter;
}) {
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

  return (
    <section aria-label="Open work" className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <Empty currentWeekLabel={currentWeekLabel} hasRecord={hasRecord} />
      ) : (
        <div className="flex flex-col gap-6">
          {blocked.length > 0 && filter !== "carried" && (
            <TaskGroup
              title="Attention needed"
              count={blocked.length}
              tone="var(--color-blocked)"
              commitments={filter === "blocked" ? shown : blocked}
              onOpen={onOpen}
            />
          )}
          {shown.filter((c) => c.status !== "blocked").length > 0 && (
            <TaskGroup
              title="In motion"
              count={shown.filter((c) => c.status !== "blocked").length}
              tone="var(--color-delivered)"
              commitments={shown.filter((c) => c.status !== "blocked")}
              onOpen={onOpen}
            />
          )}
        </div>
      )}
    </section>
  );
}

function TaskGroup({
  title,
  count,
  tone,
  commitments,
  onOpen,
}: {
  title: string;
  count: number;
  tone: string;
  commitments: LiveCommitment[];
  onOpen: (c: LiveCommitment) => void;
}) {
  return (
    <section aria-label={title} className="rounded-2xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] p-2.5 sm:p-3">
      <div className="mb-2.5 flex items-center gap-3 pl-1">
        <span className="h-4 w-[2px] rounded-full" style={{ background: tone }} />
        <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--nx-text-secondary)]">
          {title}
        </h2>
        <span className="metric text-[10px] uppercase tracking-[0.12em] text-[var(--nx-text-muted)]">
          {count}
        </span>
        <span className="h-px flex-1 bg-[var(--nx-border)]" />
      </div>
      <ul className="flex flex-col gap-2.5">
        {commitments.map((c) => (
          <li key={c.id}>
            <TaskRow
              commitment={c}
              onClick={() => onOpen(c)}
              trailing={c.is_current_week ? null : `for ${weekLabel(c.target_label)}`}
              action={<MarkDone commitmentId={c.id} title={c.title} />}
            />
          </li>
        ))}
      </ul>
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
    <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] px-5 py-8 text-center">
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
