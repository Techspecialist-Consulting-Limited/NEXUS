"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Alert } from "@/lib/alerts";
import type { Cycle, CommitmentRow, Person } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { AlertBell } from "@/components/layout/alert-bell";
import { CurrentWeekList } from "@/components/tasks/current-week-list";
import { NeedsAttention } from "@/components/tasks/needs-attention";
import { PreviousWeeks } from "@/components/tasks/previous-weeks";
import { TaskDetailsDialog } from "@/components/tasks/task-details-dialog";

/*
 * Tasks — the redesigned workspace.
 *
 * Information hierarchy (desktop):
 *   HEADER   Tasks · “Your weekly commitments and what needs your attention.”
 *   SUMMARY  This week · In progress · Blocked · Delivered  (lightweight counts)
 *   MAIN     [ Current week            ] [ Needs attention ]
 *   HISTORY  Previous weeks — one compact row each, detail on demand
 *
 * The current week dominates; previous weeks are summarised, not expanded;
 * task details open on demand. The desktop layout is bounded to one viewport
 * by real design (a dvh-height column with an internally scrolling current
 * week), never overflow:hidden.
 *
 * Component scope: staff, lead and admin — everyone who files a check-in.
 */

type Week = { cycle: Cycle; commitments: CommitmentRow[] };

const OPEN = new Set(["promised", "in_progress", "partial", "blocked"]);

export function TasksWorkspace({
  person,
  weeks,
  currentCycleId,
  openTaskId,
  alerts,
}: {
  person: Person;
  weeks: Week[];
  /** The week containing today. The card headed "This week" must be this one. */
  currentCycleId: string | null;
  /** `?task=` from the URL — the commitment whose detail should be open. */
  openTaskId: string | null;
  /** Exactly what /notifications shows, for the bell. See lib/alerts.ts. */
  alerts: Alert[];
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
   * Memoised on `current` rather than derived inline. `current?.commitments ?? []`
   * builds a fresh array on every render when there is no current week, which
   * makes it an unstable dependency for the count below — the counts would
   * recompute on every keystroke elsewhere in the tree for no reason.
   */
  const currentCommitments = useMemo(
    () => current?.commitments ?? [],
    [current],
  );

  const blockedCurrent = currentCommitments.filter((c) => c.status === "blocked");

  /*
   * ONE SCOPE, AND IT IS THIS WEEK.
   *
   * These four counts used to mix two: "This week" was the current week's open
   * items while the other three spanned the entire record. Nothing on screen
   * said so, so the strip read `12 Blocked` directly above a card saying
   * "2 commitments are blocked this week", and `3 This week` beside a list
   * headed "1 of 4 delivered".
   *
   * The arithmetic was right in both cases and the screen was still wrong,
   * because a figure means nothing without the set it was counted over. Two
   * numbers on one screen that appear to disagree cost the reader more than
   * either was worth.
   *
   * So everything here is the current week — the same set the two cards below
   * describe. History is not lost: it is in Previous weeks, per week, where a
   * count can be attached to the week it belongs to.
   */
  const counts = useMemo(() => {
    const c = currentCommitments;
    return {
      total: c.length,
      open: c.filter((x) => OPEN.has(x.status)).length,
      inProgress: c.filter((x) => x.status === "in_progress" || x.status === "partial").length,
      blocked: c.filter((x) => x.status === "blocked").length,
      delivered: c.filter((x) => x.status === "delivered").length,
    };
  }, [currentCommitments]);

  const scrollToBlocked = () => {
    document.querySelector('[data-blocked-row="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:gap-5">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-center justify-between gap-6 pt-1">
        <div className="min-w-0">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--nx-text-primary)]">
            Tasks
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--nx-text-secondary)]">
            Your weekly commitments and what needs your attention.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AlertBell alerts={alerts} />

          {/* The week, stated. Not a picker — see my-week-workspace.tsx. */}
          <span className="hidden min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 text-sm text-[var(--nx-text-secondary)] sm:inline-flex">
            {current ? weekLabel(current.cycle.label) : "No week yet"}
          </span>

          <span
            title={person.full_name}
            aria-label={`Signed in as ${person.full_name}`}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--nx-primary)]/20 text-sm font-semibold text-[var(--nx-primary-light)] ring-1 ring-white/10"
          >
            {person.full_name.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* ---- Summary strip -------------------------------------------- */}
      {counts.total > 0 && <SummaryStrip counts={counts} />}

      {/* ---- Main workspace (fills remaining height) ------------------ */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[1.6fr_1fr] lg:gap-5">
        <CurrentWeekList
          label={current?.cycle.label ?? ""}
          commitments={currentCommitments}
          onOpen={openTask}
        />

        <NeedsAttention
          blocked={blockedCurrent}
          onOpen={openTask}
          onViewAll={scrollToBlocked}
        />
      </div>

      {/* ---- Previous weeks ------------------------------------------- */}
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
 * Four counts over one set: the week on screen.
 *
 * `Open` rather than `This week`, because every number here is this week and
 * repeating it four times says nothing. The set is named once, on the strip.
 */
function SummaryStrip({
  counts,
}: {
  counts: {
    total: number;
    open: number;
    inProgress: number;
    blocked: number;
    delivered: number;
  };
}) {
  const items = [
    { label: "Open", value: counts.open },
    { label: "In progress", value: counts.inProgress },
    { label: "Blocked", value: counts.blocked },
    { label: "Delivered", value: counts.delivered },
  ];
  return (
    <div
      aria-label={`This week: ${counts.total} commitments`}
      className="grid shrink-0 grid-cols-4 gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
    >
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-center gap-2">
          <span className="metric text-xl font-semibold text-[var(--nx-text-primary)]">
            {it.value}
          </span>
          <span className="text-[13px] text-[var(--nx-text-secondary)]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
