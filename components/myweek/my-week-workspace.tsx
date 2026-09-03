"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { weekLabel } from "@/lib/cycle";
import type {
  ActivityEntry,
  LedgerWeek,
  LiveCommitment,
  Person,
} from "@/lib/queries";
import { WeekLedger } from "@/components/ui/week-ledger";
import { NexusNoticedCard } from "@/components/myweek/nexus-noticed-card";
import { WorkGrid } from "@/components/myweek/work-grid";
import { CoachingHighlightCard } from "@/components/myweek/coaching-highlight-card";

/*
 * "My Week" — the record of what this person has been doing.
 *
 * IT USED TO BE THE PLACE YOU REPORTED FROM, AND IT NO LONGER IS.
 *
 * Reporting is now one place. /check-in owns it end to end. This page owns
 * the other half of the loop and answers one question — "what have I been
 * doing" — in a form that fits a single viewport.
 *
 * SO THE THREE STAFF SCREENS NOW ASK THREE DIFFERENT THINGS:
 *
 *   /check-in     what happened, and what is next        (report)
 *   /my-week      what have I been doing recently         (review)
 *   /commitments  what do I still need to move            (manage)
 *
 * INFORMATION ARCHITECTURE (desktop):
 *
 *   +--------------------------------------------------------------+
 *   |  Good afternoon, Chidi                      24 Aug–30 Aug   |
 *   |                                          [ Check in → ]     |
 *   +--------------------------------------------------------------+
 *   |  [4 Active]  [2 Completed]  [2 Blocked]                     |
 *   |                                                              |
 *   |  The record                                                  |
 *   |  [W1] [W2] [W3] [W4] [W5] [W6] [W7]                       |
 *   +--------------------------------------------------------------+
 *   |  YOUR WORK THIS WEEK                                         |
 *   |                                                              |
 *   |  ┌──────────────────┐  ┌──────────────────┐                 |
 *   |  │ ● Task title     │  │ ● Task title     │                 |
 *   |  │ Description...   │  │ Description...   │                 |
 *   |  │ Blocked          │  │ Completed        │                 |
 *   |  │ Updated 26 Aug   │  │ Updated 30 Aug   │                 |
 *   |  └──────────────────┘  └──────────────────┘                 |
 *   +--------------------------------------------------------------+
 *   |  NEXUS noticed                                               |
 *   +--------------------------------------------------------------+
 *   |  Coaching highlight (mobile only)                            |
 *   +--------------------------------------------------------------+
 *
 * ONE UNIFIED WORK GRID, not two competing lists.
 *
 * The old layout had "Recent activity" in a wide left column and "What
 * you're working on" in a narrower right column. The same commitments
 * appeared in both — open work that had moved showed up as both an
 * activity entry and a working-on row. The page was longer than it needed
 * to be and told the same story twice.
 *
 * The new layout has one grid: "Your work this week". Activity entries
 * lead; any live commitment not already represented is appended. One
 * source of truth, two cards per row on desktop, one on a phone.
 *
 * WEEKLY SUMMARY + RECORD at the top give the shape of the week at a
 * glance. The grid shows what actually happened. The insight card at the
 * bottom is what NEXUS made of it. Content sets the height — nothing is
 * pinned to the viewport.
 */

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12
    ? "Good morning"
    : h < 18
  live: LiveCommitment[];
  /** Reports filed and commitments that moved, merged and newest first. */
  activity: ActivityEntry[];
  coaching: { title: string; body: string; based_on: string }[];
  /** When they last filed, or null if this week is still open. */
  reportedAt: string | null;
  /** Every week with work in it, for the strip beside the activity. */
  ledger: LedgerWeek[];
}) {
  const first = person.full_name.split(/\s+/)[0];
  const hasReported = Boolean(reportedAt);

  const openCount = live.length;

  const top = coaching[0];
  const coachTip = coaching[1] ?? null;

  /*
   * WHAT THE ROWS SAY, counted here rather than asked of a model.
   *
   * These are real facts about the data, not model output.
   * rejected-patterns.md #15 says to derive the empty-state sentence from
   * the rows, so these are the rows.
   */
  const blocked = live.filter((c) => c.status === "blocked");
  const carried = live.filter((c) => c.carry_depth > 1);
  const waitingOn = [
    ...new Set(blocked.map((c) => c.depends_on_department).filter(Boolean)),
  ] as string[];

  /*
   * WEEKLY SUMMARY COUNTS, derived from real data.
   *
   * Active: open commitments that are in progress or promised.
   * Completed: commitments that moved to delivered this week.
   * Blocked: open commitments that cannot proceed.
   *
   * None of these are model output. Every figure traces to a row.
   */
  const activeCount = live.filter(
    (c) => c.status === "in_progress" || c.status === "promised",
  ).length;
  const completedCount = activity.filter(
    (e) => e.kind === "commitment" && e.status === "delivered",
  ).length;
  const blockedCount = blocked.length;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:gap-5">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.75rem,3vw,2.4rem)] font-medium tracking-[-0.04em] text-[var(--nx-text-primary)]">
            {partOfDay()}, {first}
          </h1>
          <p className="metric mt-1 text-sm text-[var(--nx-text-secondary)]">
            {weekLabel(cycleLabel)}
          </p>
        </div>

        <Link
          href="/check-in"
          className="nx-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl
                     border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-[var(--nx-text-primary)]
                     transition-colors hover:border-white/[0.14] hover:bg-white/[0.06]"
        >
          {hasReported ? "Add to this week" : "Check in"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>

      {/* ---- Weekly summary + record ----------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-5">
        <div className="flex min-h-24 items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 shadow-[0_1px_0_rgba(255,255,255,0.02)] sm:px-6">
          <div className="flex w-full items-center justify-around gap-4">
            <Stat count={activeCount} label="Active" />
            <Stat count={completedCount} label="Completed" />
            <Stat count={blockedCount} label="Blocked" />
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.02)] sm:px-5">
          <WeekLedger
            weeks={ledger}
            currentCycleId={cycleId}
            className="px-0.5"
          />
        </div>
      </div>

      {/* ---- Work + insight -------------------------------------------- */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] lg:gap-5">
        <WorkGrid activity={activity} live={live} hasReported={hasReported} />

        <NexusNoticedCard
          title={top?.title ?? null}
          body={top?.body ?? null}
          hasInsight={Boolean(top)}
          blockedCount={blockedCount}
          carriedCount={carried.length}
          waitingOn={waitingOn}
          openCount={openCount}
          hasReported={hasReported}
        />
      </div>

      {/*
        Coaching, for everybody without a rail to put it in. The rail
        version lives in the app shell and is lg: only; this is the same
        idea in the space a phone actually has.
      */}
      <div className="lg:hidden">
        <CoachingHighlightCard
          title={coachTip?.title ?? null}
          body={coachTip?.body ?? null}
          hasCoaching={Boolean(coachTip)}
          hasReported={hasReported}
        />
      </div>
    </div>
  );
}

/**
 * A single summary figure: number above, label below.
 *
 * The number uses the mono face (`.metric`) so columns do not wobble when
 * counts change. The label is the smallest readable text — this is glance
 * data, not a dashboard.
 */
function Stat({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="metric text-[1.55rem] font-semibold leading-none text-[var(--nx-text-primary)]">
        {count}
      </span>
      <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--nx-text-secondary)]">
        {label}
      </span>
    </div>
  );
}
