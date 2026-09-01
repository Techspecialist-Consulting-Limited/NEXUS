"use client";

import { m } from "motion/react";
import { InlineCheckIn } from "@/components/staff/inline-checkin";
import { weekLabel } from "@/lib/cycle";

/*
 * The check-in — the first thing on the week, not a door to it.
 *
 * WHAT THIS USED TO BE.
 *
 * A chooser: "How would you like to check-in?" over two large tiles, Voice and
 * Type, which set a mode and then handed off to InlineCheckIn. Two problems,
 * and the second is the one that mattered.
 *
 * It was a doorway in front of a door. InlineCheckIn already carries its own
 * microphone button — gated on whether dictation is actually available, with
 * the reason shown when it is not — and a textarea whose placeholder is a
 * worked example. Everything the chooser offered was one layer further in,
 * unchanged. Pressing "Type check-in" navigated nowhere and revealed a box
 * that could have been on screen from the start.
 *
 * And it was mostly air. The card is the whole left column of My Week; the
 * chooser filled it with two 100px tiles and roughly 550px of nothing. That is
 * rejected-patterns.md #6 on the highest-priority screen in the product, and
 * it made the primary action of NEXUS look like the emptiest thing on it.
 *
 * WHAT THE HEADING SAYS NOW.
 *
 * The week, because that is what is being reported on and because the header
 * pill that used to say it was a control-shaped label that did nothing.
 *
 * The line under it is derived from the rows, never asserted: how much is
 * still open, or that they have already filed. rejected-patterns.md #15 —
 * an empty state that claims a clean week when the model simply did not run
 * is worse than one that says nothing.
 */

function subline(openCount: number, alreadyReported: boolean): string {
  if (alreadyReported) {
    return "Filed for this week. Add anything that has changed since.";
  }
  if (openCount > 0) {
    return `${openCount} ${openCount === 1 ? "thing is" : "things are"} still open. Say what happened to them and what is next.`;
  }
  return "Say what you got done and what you are taking on. NEXUS sorts it out and shows you before anything is filed.";
}

export function CheckInCard({
  cycleId,
  cycleLabel,
  alreadyReported,
  openCount,
}: {
  cycleId: string;
  /** The raw cycle label, "W35 · 24 Aug–30 Aug". Shown as the range. */
  cycleLabel: string;
  alreadyReported: boolean;
  openCount: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="nx-card flex flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]">
            Your week
          </h2>
          {/*
            The dates, in the figure face, because this is the one label on the
            page that has to be located against a person's own memory of the
            week rather than read as prose. See lib/cycle.ts for why the week
            number is not shown.
          */}
          <span className="metric text-sm text-[var(--nx-text-secondary)]">
            {weekLabel(cycleLabel)}
          </span>
        </div>

        <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--nx-text-secondary)]">
          {subline(openCount, alreadyReported)}
        </p>

        <div className="mt-5">
          {/*
            hideIntro: this card has already said what this is and what it is
            for. The composer's own eyebrow and two prompt lines under that
            would be a third and fourth statement of the same thing between the
            reader and the box.
          */}
          <InlineCheckIn
            cycleId={cycleId}
            alreadyReported={alreadyReported}
            openCount={openCount}
            hideIntro
          />
        </div>
      </div>
    </m.div>
  );
}
