"use client";

import type { Alert } from "@/lib/alerts";
import type { LiveCommitment, Person } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { AlertBell } from "@/components/layout/alert-bell";
import { CheckInCard } from "@/components/myweek/check-in-card";
import { NexusNoticedCard } from "@/components/myweek/nexus-noticed-card";
import { WorkingOnCard } from "@/components/myweek/working-on-card";
import { CoachingHighlightCard } from "@/components/myweek/coaching-highlight-card";

/*
 * The redesigned "My Week" — a premium asymmetric two-column workspace.
 *
 * INFORMATION ARCHITECTURE (desktop):
 *
 *   +----------------------------+----------------------+
 *   |  Good morning, Chidi       |  Bell  Week  User    |
 *   |  Here's what's happening.  |                      |
 *   +----------------------------+----------------------+
 *   |  HOW WOULD YOU LIKE TO     |  WHAT YOU'RE         |
 *   |  CHECK-IN?                 |  WORKING ON          |
 *   |                            |  task rows           |
 *   |  the whole left column,    +----------------------+
 *   |  top to bottom             |  NEXUS NOTICED       |
 *   |                            |  (AI insight)        |
 *   +----------------------------+----------------------+
 *
 * WHY THE CHECK-IN TAKES THE WHOLE COLUMN.
 *
 * It is the primary action on the highest-priority screen in the product, and
 * it is the only card here that is an INPUT. Sharing a column with the task
 * list left the composer around 280px once the prompt, the two mode buttons
 * and the send row had taken their share: the textarea was clipped mid-example
 * and the thing a person is meant to type into was the smallest element on the
 * screen. Everything else on this page is something to read.
 *
 * Coaching used to sit bottom-right. It moved to the sidebar rail on desktop
 * -- see components/myweek/coaching-rail-card.tsx -- because it is the one
 * card here that is not about this week, and moving it is what freed the space
 * above. Below `lg` there is no rail, so this page still renders the full card
 * at the foot of the stack.
 *
 * Grid is 1.6fr : 1fr: the left column carries the work you do, the right the
 * work you have and what NEXUS makes of it. NOT a generic KPI dashboard: no
 * Where-You-Stand, no delivery rate, no performance scores.
 *
 * The desktop layout is designed to fit one viewport, by design rather than by
 * overflow tricks: a dvh-bounded grid, compact paddings, and lists that scroll
 * inside their own card rather than pushing the page down.
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
  alerts,
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
  /** Exactly what /notifications shows, for the bell. See lib/alerts.ts. */
  alerts: Alert[];
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
          <AlertBell alerts={alerts} />

          {/*
            The week, stated. NOT a button.

            It was a <button> carrying a chevron and no handler — a control
            that looks like a week picker, takes the click and does nothing.
            There is one week on this page and it is the week you are in;
            saying so is the whole job, and a disclosure arrow that discloses
            nothing is the same lie the bell beside it used to tell.
          */}
          <span className="hidden min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 text-sm text-[var(--nx-text-secondary)] sm:inline-flex">
            {weekLabel(cycleLabel)}
          </span>

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
        One asymmetric row, and it is the right column that splits.

        The check-in is a single cell spanning the full height, so it can give
        the composer everything the column has. The right column is its own
        1.4fr / 1fr grid: the task list takes the larger share because it is a
        list, and the insight under it is a headline and a sentence.

        On mobile it collapses to a stack in the order somebody actually needs
        it — check in, see what is open, read what NEXUS made of it, then
        coaching.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-[1.6fr_1fr] lg:grid-rows-1 lg:gap-6">
        <CheckInCard
          cycleId={cycleId}
          alreadyReported={Boolean(reportedAt)}
          openCount={openCount}
        />

        <div className="flex min-h-0 flex-col gap-5 lg:grid lg:grid-rows-[1.4fr_1fr] lg:gap-6">
          <WorkingOnCard commitments={live} hasReported={Boolean(reportedAt)} />
          <NexusNoticedCard
            title={top?.title ?? null}
            body={top?.body ?? null}
            hasInsight={Boolean(top)}
            blockedCount={blocked.length}
            carriedCount={carried.length}
            waitingOn={waitingOn}
            openCount={openCount}
            hasReported={Boolean(reportedAt)}
          />
        </div>

        {/*
          Coaching, for everybody without a rail to put it in. The rail version
          lives in the app shell and is `lg:` only; this is the same idea in
          the space a phone actually has.
        */}
        <div className="lg:hidden">
          <CoachingHighlightCard
            title={coachTip?.title ?? null}
            body={coachTip?.body ?? null}
            hasCoaching={Boolean(coachTip)}
            hasReported={Boolean(reportedAt)}
          />
        </div>
      </div>

    </div>
  );
}
