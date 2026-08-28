"use client";

import { Bell, ChevronDown } from "lucide-react";
import type { LiveCommitment, Person } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { CheckInCard } from "@/components/myweek/check-in-card";
import { NexusNoticedCard } from "@/components/myweek/nexus-noticed-card";
import { WorkingOnCard } from "@/components/myweek/working-on-card";
import { CoachingHighlightCard } from "@/components/myweek/coaching-highlight-card";

/*
 * The redesigned "My Week" — a premium asymmetric two-column workspace.
 *
 * INFORMATION ARCHITECTURE (desktop):
 *
 *   ┌────────────────────────────┬──────────────────────┐
 *   │  Good morning, Chidi 👋    │  Bell  Week  User    │
 *   │  Here's what's happening…  │                      │
 *   ├────────────────────────────┼──────────────────────┤
 *   │  HOW WOULD YOU LIKE TO     │   NEXUS NOTICED      │
 *   │  CHECK-IN?                 │   (AI insight)       │
 *   │  [ Voice ]  [ Type ]       │                      │
 *   ├────────────────────────────┼──────────────────────┤
 *   │  WHAT YOU'RE WORKING ON    │  COACHING HIGHLIGHT  │
 *   │  task rows                 │  (personalised tip)  │
 *   └────────────────────────────┴──────────────────────┘
 *
 * Grid is 1.6fr : 1fr — the left column (check-in, working-on) carries the
 * work; the right (noticed, coaching) carries the intelligence. NOT a generic
 * KPI dashboard: no Where-You-Stand, no delivery rate, no performance scores.
 *
 * The desktop layout is designed to fit one viewport, by design rather than by
 * overflow tricks: a dvh-bounded grid whose two rows share the available
 * height, compact paddings, and capped task rows.
 */

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function MyWeekWorkspace({
  person,
  cycleId,
  cycleLabel,
  live,
  coaching,
  reportedAt,
}: {
  person: Person;
  cycleId: string;
  cycleLabel: string;
  /**
   * Still open, whichever week they were promised for.
   *
   * Deliberately not the week's promised set: see `liveCommitments`. That list
   * answers "what was promised FOR this week", which the two-cycle model puts
   * in a different week from the one on screen.
   */
  live: LiveCommitment[];
  coaching: { title: string; body: string; based_on: string }[];
  /** When they last filed, or null if this week is still open. */
  reportedAt: string | null;
}) {
  const first = person.full_name.split(/\s+/)[0];

  const openCount = live.length;

  const top = coaching[0];
  const coachTip = coaching[1] ?? null;

  /*
   * WHAT THE ROWS SAY, counted here rather than asked of a model.
   *
   * The two intelligence cards used to fall back on "Nothing needs flagging
   * this week" whenever coaching was absent. Absent coaching is not a clean
   * week — the model may have been slow, mocked, or failed — and on a page
   * showing two blocked commitments directly below, the claim was visibly
   * untrue. rejected-patterns.md #15 says to derive the empty-state sentence
   * from the rows, so these are the rows.
   */
  const blocked = live.filter((c) => c.status === "blocked");
  const carried = live.filter((c) => c.carry_depth > 1);
  const waitingOn = [
    ...new Set(blocked.map((c) => c.depends_on_department).filter(Boolean)),
  ] as string[];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 lg:h-[calc(100dvh-3rem)] lg:gap-6">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-center justify-between gap-6 pt-1">
        <div className="min-w-0">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--nx-text-primary)]">
            {partOfDay()}, {first}
            <span aria-hidden="true" className="ml-1">{'\u{1F44B}'}</span>
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--nx-text-secondary)]">
            Here&rsquo;s what&rsquo;s happening at NEXUS this week.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="nx-focus-ring grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[var(--nx-text-secondary)] transition-colors hover:text-white/90"
          >
            <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="nx-focus-ring hidden min-h-11 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 text-sm text-[var(--nx-text-secondary)] transition-colors hover:text-white/90 sm:inline-flex"
          >
            {weekLabel(cycleLabel)}
            <ChevronDown size={14} aria-hidden="true" />
          </button>

          <span
            title={person.full_name}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--nx-primary)]/20 text-sm font-semibold text-[var(--nx-primary-light)] ring-1 ring-white/10"
            aria-label={`Signed in as ${person.full_name}`}
          >
            {first.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/*
        Two-row asymmetric grid.

        Each row is `lg:grid-cols-[1.6fr_1fr]`. Both rows are `1fr` of the
        remaining height on desktop so the whole workspace fills the viewport
        without scrolling. Row 1 / Row 2 become the grid columns' sibling
        cells; on mobile everything collapses into a single stacked column in
        the order the spec mandates: check-in, noticed, working on, coaching.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-rows-[1fr_1fr] lg:gap-6">
        {/* Row 1 — check-in (left) + noticed (right) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr] lg:grid-rows-1 lg:gap-6">
          <CheckInCard
            cycleId={cycleId}
            alreadyReported={Boolean(reportedAt)}
            openCount={openCount}
          />
          <NexusNoticedCard
            title={top?.title ?? null}
            body={top?.body ?? null}
            basedOn={top?.based_on ?? null}
            hasInsight={Boolean(top)}
            blockedCount={blocked.length}
            carriedCount={carried.length}
            waitingOn={waitingOn}
            openCount={openCount}
            hasReported={Boolean(reportedAt)}
          />
        </div>

        {/* Row 2 — working on (left) + coaching (right) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr] lg:grid-rows-1 lg:gap-6">
          <WorkingOnCard commitments={live} hasReported={Boolean(reportedAt)} />
          <CoachingHighlightCard
            title={coachTip?.title ?? null}
            body={coachTip?.body ?? null}
            basedOn={coachTip?.based_on ?? null}
            hasCoaching={Boolean(coachTip)}
            hasReported={Boolean(reportedAt)}
          />
        </div>
      </div>
    </div>
  );
}
