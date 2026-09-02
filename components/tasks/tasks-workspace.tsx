"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Cycle, CommitmentRow, LiveCommitment } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { OpenWork } from "@/components/tasks/open-work";
import { PreviousWeeks } from "@/components/tasks/previous-weeks";
import { TaskDetailsDialog } from "@/components/tasks/task-details-dialog";

/*
 * Tasks — what is still yours to move, then the record of what was.
 *
 *   HEADER    Tasks
 *   SUMMARY   5 open · 2 blocked · 1 carried 8 weeks
 *   MAIN      Open work — every unclosed promise, longest-carried first
 *   HISTORY   The record — one row per week, detail on demand
 *
 * IT USED TO ASK A DIFFERENT QUESTION THAN ITS OWN NAME.
 *
 * The main area was `[ Current week ] [ Needs attention ]`, both scoped to the
 * week containing today. That is a real question, but it is not "what am I
 * working on", and on a Monday it answers zero: a person whose My Week listed
 * five open commitments opened Tasks and read "No commitments yet" beside a
 * "0 of 0 delivered" chip, in two cards each over 400px tall and both empty.
 *
 * The five were real. They were promised for earlier weeks and never closed,
 * so under a per-week model they were filed under those weeks and shown
 * nowhere near the top. Carry is the normal state of unfinished work in this
 * product — `liveCommitments` exists precisely because the two-cycle model
 * puts a promise in a different week from the one you are in — so a task list
 * organised strictly by week is a task list that hides its own subject.
 *
 * Both cards fold into one list, because "needs attention" was never a second
 * set. It is blocked-or-long-carried, which is a filter over the same rows,
 * and rendering it as its own card meant every blocked commitment appeared
 * twice on one screen.
 *
 * NOTHING HERE IS PINNED TO THE VIEWPORT. The old comment on this spot
 * defended `lg:h-[calc(100dvh-3rem)]` as "real design". It is what sized both
 * cards before anything was in them.
 *
 * Component scope: staff, lead and admin — everyone who files a check-in.
 */

type Week = { cycle: Cycle; commitments: CommitmentRow[] };

export function TasksWorkspace({
  open,
  weeks,
  currentCycleId,
  openTaskId,
}: {
  /**
   * Still open, whichever week it was promised for — `liveCommitments`, the
   * same function My Week asks. Shared on purpose: two screens deriving "open"
   * separately is how this page came to contradict the one before it.
   */
  open: LiveCommitment[];
  weeks: Week[];
  /** The week containing today. The card headed "This week" must be this one. */
  currentCycleId: string | null;
  /** `?task=` from the URL — the commitment whose detail should be open. */
  openTaskId: string | null;
}) {
  /*
   * THE OPEN COMMITMENT LIVES IN THE URL.
   *
   * It was local state, which meant a commitment had no address: My Week's
   * "What you're working on" could list five rows and link to none of them,
   * because there was nowhere to link TO. Now every row on both pages resolves
   * to /commitments?task=<id>, and this is the page that answers it.
   *
   * Shallow, via the History API — the way Next 16 documents it
   * (01-getting-started/04-linking-and-navigating.md, "Native History API").
   * router.replace would re-run this force-dynamic page and refetch six weeks
   * of commitments to open a panel over data already on screen.
   */
  const [taskId, setTaskId] = useState<string | null>(openTaskId);

  // Back and forward move through opened commitments like any other navigation.
  useEffect(() => {
    const onPop = () =>
      setTaskId(new URLSearchParams(window.location.search).get("task"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /*
   * Searched across EVERY week handed to this page, not just the ones it
   * renders. A commitment made this week targets next week under the two-cycle
   * model, and a link to one must open whether or not its week has a list on
   * screen.
   */
  const detail = useMemo(() => {
    if (!taskId) return null;
    for (const w of weeks) {
      const found = w.commitments.find((c) => c.id === taskId);
      if (found) return found;
    }
    return null;
  }, [weeks, taskId]);

  const openTask = useCallback((c: CommitmentRow) => {
    setTaskId(c.id);
    window.history.pushState(null, "", `?task=${encodeURIComponent(c.id)}`);
  }, []);

  const closeTask = useCallback(() => {
    setTaskId(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  /*
   * By id, not by position.
   *
   * `weeks[0]` is the newest week the person has work in, which is only the
   * current week by coincidence — it was "17 Aug–23 Aug" under a heading
   * reading THIS WEEK on the 28th. It is also wrong in the other direction:
   * a check-in filed this week plans NEXT week, so the newest entry can be a
   * week that has not started.
   */
  const current =
    weeks.find((w) => w.cycle.id === currentCycleId) ?? weeks[0];
  const previous = weeks.filter(
    (w) =>
      w.cycle.id !== current?.cycle.id &&
      (!current || new Date(w.cycle.starts_on) < new Date(current.cycle.starts_on)),
  );
  /*
   * ONE SCOPE, AND IT IS THE LIST DIRECTLY BELOW.
   *
   * A figure means nothing without the set it was counted over, and this strip
   * has been wrong about that twice. It first mixed the current week with the
   * whole record, so it read `12 Blocked` above a card saying "2 commitments
   * are blocked this week". Corrected to the current week, it then described a
   * set the page no longer leads with.
   *
   * Every number here is counted over `open` — the rows underneath it. The
   * per-week counts are in the record below, attached to the week they belong
   * to, which is the only place they can be checked.
   *
   * `delivered` is deliberately absent: this is the open set, so it would read
   * zero on every screen forever.
   */
  const counts = useMemo(() => {
    const longest = open.reduce((n, c) => Math.max(n, c.carry_weeks), 0);
    return {
      total: open.length,
      blocked: open.filter((c) => c.status === "blocked").length,
      inProgress: open.filter(
        (c) => c.status === "in_progress" || c.status === "partial",
      ).length,
      longestCarry: longest,
    };
  }, [open]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:gap-5">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-center justify-between gap-6 pt-1">
        <div className="min-w-0">
          {/* Agrees with the rail. The page and the link to it must not
              have different names. */}
          <h1 className="page-title">Pending Tasks</h1>
        </div>
        {/* Bell and avatar are in the shell header now — one header, not three. */}
      </header>

      {/* ---- What is still open --------------------------------------- */}
      {counts.total > 0 && <SummaryStrip counts={counts} />}

      <OpenWork
        commitments={open}
        currentWeekLabel={current ? weekLabel(current.cycle.label) : null}
        hasRecord={previous.length > 0}
        onOpen={openTask}
      />

      {/* ---- The record ------------------------------------------------ */}
      <PreviousWeeks weeks={previous} onOpenCommitment={openTask} />

      <TaskDetailsDialog
        commitment={detail}
        open={Boolean(detail)}
        onClose={closeTask}
      />
    </div>
  );
}

/**
 * One sentence of counts over the list below it.
 *
 * It was a four-column grid of large figures. That is a KPI strip, and a KPI
 * strip directly above the list it counts asks the reader to hold four numbers
 * in order to read rows that state the same facts individually. The set is
 * small enough to say in a line.
 *
 * The carry figure is here rather than on the grid it replaces because it is
 * the only one that cannot be had by glancing down the rows: "blocked" is a
 * colour on every row carrying it, but the longest carry is a maximum over the
 * whole set, and eight weeks is the number somebody has to act on.
 */
function SummaryStrip({
  counts,
}: {
  counts: {
    total: number;
    blocked: number;
    inProgress: number;
    longestCarry: number;
  };
}) {
  /*
   * The FIGURE is set in the figure face, not the phrase around it. Setting
   * "3 in progress" whole in monospace puts the words in a face chosen for
   * digits, which reads as a code fragment rather than a sentence.
   */
  const parts: { n: number; label: string }[] = [
    { n: counts.total, label: "open" },
  ];
  if (counts.inProgress > 0) parts.push({ n: counts.inProgress, label: "in progress" });
  if (counts.blocked > 0) parts.push({ n: counts.blocked, label: "blocked" });

  return (
    <p className="text-[15px] leading-relaxed text-[var(--nx-text-secondary)]">
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && " · "}
          <span className="metric text-[var(--nx-text-primary)]">{p.n}</span>{" "}
          {p.label}
        </span>
      ))}
      {counts.longestCarry > 1 && (
        <>
          {". The oldest has been carried "}
          <span className="metric text-[var(--color-partial)]">
            {counts.longestCarry} weeks
          </span>
          .
        </>
      )}
    </p>
  );
}
