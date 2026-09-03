"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, ListTodo, Repeat2, Timer } from "lucide-react";
import type { Cycle, CommitmentRow, LiveCommitment } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { OpenWork, type TaskFilter } from "@/components/tasks/open-work";
import { PreviousWeeks } from "@/components/tasks/previous-weeks";
import { TaskUpdateDialog } from "@/components/tasks/task-update-dialog";
import { cn } from "@/lib/cn";

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
  const [filter, setFilter] = useState<TaskFilter>("all");

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
      carried: open.filter((c) => c.carry_weeks >= 3).length,
      inProgress: open.filter(
        (c) => c.status === "in_progress" || c.status === "partial",
      ).length,
      longestCarry: longest,
    };
  }, [open]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:gap-5">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.8rem,2.8vw,2.5rem)] font-medium tracking-[-0.04em] text-[var(--nx-text-primary)]">
            Pending Tasks
          </h1>
          <p className="standfirst mt-1 text-[13px] text-[var(--nx-text-secondary)]">
            Keep the work you have promised visible, and move what needs a decision.
          </p>
        </div>
        <TaskFilters filter={filter} onFilter={setFilter} counts={counts} />
      </header>

      {/* ---- What is still open --------------------------------------- */}
      <SummaryGrid counts={counts} />

      <div className="h-px bg-gradient-to-r from-[var(--nx-border-strong)] via-[var(--nx-border)] to-transparent" />

      <OpenWork
        commitments={open}
        currentWeekLabel={current ? weekLabel(current.cycle.label) : null}
        hasRecord={previous.length > 0}
        onOpen={openTask}
        filter={filter}
      />

      {/* ---- The record ------------------------------------------------ */}
      <PreviousWeeks weeks={previous} onOpenCommitment={openTask} />

      {/*
        The detail is where a task is MOVED, not only read. See
        task-update-dialog.tsx: status and a comment, saved from here, so
        managing a task never means filing a whole week to say one thing
        changed.
      */}
      <TaskUpdateDialog
        commitment={detail}
        open={Boolean(detail)}
        onClose={closeTask}
      />
    </div>
  );
}

function TaskFilters({
  filter,
  onFilter,
  counts,
}: {
  filter: TaskFilter;
  onFilter: (filter: TaskFilter) => void;
  counts: { total: number; blocked: number; carried: number };
}) {
  const tabs = [
    { id: "all" as const, label: "All", count: counts.total },
    { id: "blocked" as const, label: "Blocked", count: counts.blocked },
    { id: "carried" as const, label: "Carried 3+ wks", count: counts.carried },
  ];

  return (
    <div
      role="tablist"
      aria-label="Filter pending tasks"
      className="flex max-w-full flex-wrap gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={filter === tab.id}
          onClick={() => onFilter(tab.id)}
          className={cn(
            "nx-focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
            filter === tab.id
              ? "bg-[var(--nx-text-primary)] text-[var(--nx-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              : "text-[var(--nx-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--nx-text-primary)]",
          )}
        >
          {tab.label}
          <span className="metric rounded-sm border border-white/[0.08] bg-black/20 px-1 py-0.5 text-[10px] opacity-80">
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function SummaryGrid({
  counts,
}: {
  counts: {
    total: number;
    blocked: number;
    inProgress: number;
    longestCarry: number;
  };
}) {
  const cards = [
    {
      label: "Open",
      count: counts.total,
      detail: "still to move",
      icon: ListTodo,
      tone: "var(--nx-text-secondary)",
    },
    {
      label: "In progress",
      count: counts.inProgress,
      detail: "being worked on",
      icon: Timer,
      tone: "var(--color-in-progress)",
    },
    {
      label: "Blocked",
      count: counts.blocked,
      detail: "need attention",
      icon: CircleAlert,
      tone: "var(--color-blocked)",
    },
    {
      label: "Longest carry",
      count: counts.longestCarry,
      detail: counts.longestCarry === 1 ? "week" : "weeks",
      icon: Repeat2,
      tone: "var(--color-partial)",
    },
  ];

  return (
    <section aria-label="Pending task summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] p-3.5 transition-colors hover:border-[var(--nx-border-strong)] hover:bg-[var(--glass-fill-2)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--nx-text-secondary)]">
                {card.label}
              </span>
              <Icon size={14} style={{ color: card.tone }} aria-hidden="true" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="metric text-[1.65rem] font-semibold leading-none text-[var(--nx-text-primary)]">
                {card.count}
              </span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--nx-text-muted)]">
                {card.detail}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
