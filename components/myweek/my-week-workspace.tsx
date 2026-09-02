"use client";

import type { LedgerWeek, LiveCommitment, Person } from "@/lib/queries";
import { WeekLedger } from "@/components/ui/week-ledger";
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
  ledger,
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
  /** Every week with work in it, for the strip under the check-in. */
  ledger: LedgerWeek[];
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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 lg:gap-6">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-center justify-between gap-6 pt-1">
        <div className="min-w-0">
          {/*
            A greeting, at greeting size.

            This was 32px with a waving hand, over "Here's what's happening at
            NEXUS this week" — the largest element on the screen, and the only
            one carrying no information. What a person came here to do is
            directly below it and now outranks it.
          */}
          <h1 className="text-xl font-medium tracking-tight text-[var(--nx-text-primary)]">
            {partOfDay()}, {first}
          </h1>
        </div>
        {/*
          The bell and the avatar moved to the shell's own header, which every
          page now has — see components/layout/page-header.tsx. They were built
          here and in Tasks and nowhere else, which is why Settings, Coaching
          and Check-in had no chrome at all.
        */}
      </header>

      {/*
        CONTENT SETS THE HEIGHT. NOTHING HERE IS PINNED TO THE VIEWPORT.

        This row used to be `lg:h-[calc(100dvh-3rem)]` with fractional rows, so
        every card was sized before anything was in it. One decision produced
        three separate defects at once: the composer, which had nothing to fill
        a 700px cell with, became a void; the task list, which had more than
        its 1.4fr share, was sliced through a row by its own bottom edge; and
        the right column was narrowed to make the fractions add up, so titles
        were `truncate`d to "Ship the commitment reconciliation en…".

        A card with nothing to say is allowed to be short. `items-start` is
        what lets it be — the columns no longer stretch to match each other.

        The right column has a 26rem floor because that is what a task title
        needs to be read rather than guessed at.

        On mobile it collapses to a stack in the order somebody actually needs
        it — check in, see what is open, read what NEXUS made of it, then
        coaching.
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(26rem,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5 lg:gap-6">
          <CheckInCard
            cycleId={cycleId}
            cycleLabel={cycleLabel}
            alreadyReported={Boolean(reportedAt)}
            openCount={openCount}
          />

          {/*
            UNDER THE COMPOSER, BECAUSE IT IS ABOUT THE COMPOSER.

            This sat bottom-right, as far from the check-in box as the layout
            allowed, while saying "say so in your check-in and it reaches the
            people who can clear it". Advice about a control belongs beside the
            control; from the opposite corner it is a remark.

            It also balances the row. With the chooser gone the left column
            ends around 440px against a right column near 900, and a column
            two-thirds empty is the same defect the chooser was.
          */}
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

        <div className="flex flex-col gap-5 lg:gap-6">
          {/*
            The record, above what is open in it. Small, quiet, and the only
            place on this page that shows more than one week — a person filing
            an update can see the shape of what they are adding to.
          */}
          <WeekLedger weeks={ledger} currentCycleId={cycleId} className="px-0.5" />

          <WorkingOnCard commitments={live} hasReported={Boolean(reportedAt)} />
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
