"use client";

import { useState } from "react";
import { Mic, PenLine } from "lucide-react";
import { m } from "motion/react";
import { InlineCheckIn } from "@/components/staff/inline-checkin";

/*
 * The check-in section — the primary action on the page.
 *
 * Present the two ways in as large, equally-prominent buttons — voice sets the
 * microphone going, type reveals the composer — then hand either off to the
 * real capture/sort/confirm/save flow in InlineCheckIn.
 *
 * `mode` decides which, via autoStart. It used to be stored and never read, so
 * both buttons opened the same idle composer and neither started the
 * microphone: two doorways, one of them mislabelled.
 *
 * The prologue (voice || type) only shows while the person has not started.
 * Once they pick a path the card behaves like the existing inline check-in
 * (capture -> sort -> confirm -> save; only the final step writes). A person
 * who chooses one path can switch to the other; they are two doorways into
 * the same room, not two different reports.
 */

export function CheckInCard({
  cycleId,
  alreadyReported,
  openCount,
}: {
  cycleId: string;
  alreadyReported: boolean;
  openCount: number;
}) {
  const [mode, setMode] = useState<"choose" | "voice" | "type">("choose");

  if (mode === "choose") {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-h-0"
      >
        <div className="nx-card flex min-h-0 w-full flex-col overflow-hidden p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--nx-text-primary)]">
            How would you like to check-in?
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--nx-text-secondary)]">
            Share what you achieved last week and what you&rsquo;ll focus on
            this week. NEXUS will format it for you.
          </p>

          <div className="mt-5 grid shrink-0 gap-3 sm:grid-cols-2 sm:flex-1 sm:content-center">
            <button
              type="button"
              onClick={() => setMode("voice")}
              className="nx-checkin-btn nx-focus-ring flex min-h-11 flex-col items-center justify-center gap-2 px-6 py-4 text-center"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-2xl bg-[var(--nx-primary)]/15 text-[var(--nx-primary-light)] transition-transform duration-180"
              >
                <Mic size={24} strokeWidth={1.75} />
              </span>
              <span className="text-base font-semibold text-white/95">Voice check-in</span>
              <span className="text-sm text-[var(--nx-text-secondary)]">Speak to NEXUS</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("type")}
              className="nx-checkin-btn nx-focus-ring flex min-h-11 flex-col items-center justify-center gap-2 px-6 py-4 text-center"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-2xl bg-[var(--nx-primary)]/15 text-[var(--nx-primary-light)]"
              >
                <PenLine size={24} strokeWidth={1.75} />
              </span>
              <span className="text-base font-semibold text-white/95">Type check-in</span>
              <span className="text-sm text-[var(--nx-text-secondary)]">Write your update</span>
            </button>
          </div>
        </div>
      </m.div>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="nx-card flex min-h-0 flex-1 flex-col overflow-hidden p-6 sm:p-8">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="mb-2 -ml-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm text-[var(--nx-text-secondary)] transition-colors hover:text-white/90 nx-focus-ring"
        >
          <span aria-hidden="true">←</span> Choose another way
        </button>
        <InlineCheckIn
          cycleId={cycleId}
          alreadyReported={alreadyReported}
          openCount={openCount}
          autoStart={mode === "voice"}
        />
      </div>
    </m.div>
  );
}
