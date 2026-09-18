"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { VoiceConsole } from "@/components/assistant/voice-console";

/*
 * The assistant, as a floating entry point rather than the lede.
 *
 * WHY IT MOVED. `ExecutiveHome` used to open on `VoiceConsole` because the
 * Chairman had nowhere else to ask a question — the console WAS the page's
 * top band. Now the board is what he opens the page to see, so the console
 * is one press away instead of the first thing in his eyeline: a floating
 * launcher, the desktop counterpart to the one already in the phone bar
 * (`app-nav.tsx`), opening the same `VoiceConsole` unchanged inside the
 * product's one modal primitive rather than a hand-rolled sheet.
 *
 * DESKTOP ONLY. Phone already has this exact affordance in the bottom nav —
 * a second one stacked on top would be the two-entry-points-to-one-act
 * problem `visual-system.md` already rejects for the launcher itself.
 */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <div className="hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask NEXUS"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-7 right-7 z-40 grid size-14 place-items-center rounded-full
                   bg-[var(--dept-techspecialist)] text-[var(--on-accent)]
                   shadow-lg shadow-[var(--dept-techspecialist)]/30
                   transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="assistant-dialog-title">
        <div className="p-5 pt-4">
          <h2 id="assistant-dialog-title" className="sr-only">
            Ask NEXUS
          </h2>
          <VoiceConsole
            greeting="Ask NEXUS"
            subtitle="Ask about the week, a unit or a person."
            suggestions={[
              "How are we doing this week?",
              "What is blocked between teams?",
              "Who needs support?",
            ]}
          />
        </div>
      </Dialog>
    </div>
  );
}
