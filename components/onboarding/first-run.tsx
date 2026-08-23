"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { ArrowRight, Check, Loader2, Mic, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/*
 * The first thing a new person sees, and it is over in about forty seconds.
 *
 * NOT A PRODUCT TOUR. Three sentences about what NEXUS does with what you tell
 * it, and then out. A tour with coach marks over eight controls is a tour
 * people click through without reading, and it teaches them that the product
 * will interrupt them.
 *
 * The three cards are the three things somebody has to believe for the rest to
 * work: that telling it is easy, that it remembers, and that nothing is filed
 * without them seeing it first. Everything else they can discover.
 *
 * IT DOES NOT BLOCK. Dismissing it is one tap, "Skip" is right there, and the
 * workspace is behind it rather than after it. Somebody who wants to get on
 * with their week should be able to.
 */

const STEPS = [
  {
    icon: Mic,
    title: "Tell NEXUS what happened.",
    body: "Speak it or type it, in plain sentences. There is no form to fill in and nothing to remember.",
  },
  {
    icon: RefreshCw,
    title: "NEXUS remembers.",
    body: "What you committed to stays connected to what you report next week, so nothing has to be re-explained.",
  },
  {
    icon: ShieldCheck,
    title: "You see it before anyone else.",
    body: "NEXUS shows you what it understood and waits for you to confirm. Your lead sees the figures, never your raw words.",
  },
];

export function FirstRun({ firstName }: { firstName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState(false);
  const [gone, setGone] = useState(false);

  async function finish() {
    setDismissing(true);
    /*
     * Hidden immediately, recorded afterwards. The panel is an introduction,
     * not a transaction — making somebody watch a spinner to close a welcome
     * screen is a bad first thirty seconds, and if the write fails the worst
     * case is they see it once more.
     */
    setGone(true);
    try {
      const res = await fetch("/api/onboarding/welcome", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      toast({
        variant: "warning",
        title: "Shown again next time",
        description: "NEXUS could not record that you have seen this. Nothing else is affected.",
      });
    } finally {
      setDismissing(false);
    }
  }

  if (gone) return null;

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      aria-labelledby="first-run-heading"
      className="rounded-lg border border-[var(--dept-techspecialist)]/25
                 bg-[var(--dept-techspecialist)]/[0.05] p-5"
    >
      <p className="eyebrow" style={{ color: "var(--dept-techspecialist)" }}>
        Welcome
      </p>
      <h2 id="first-run-heading" className="mt-2 text-xl font-medium tracking-tight text-white/95">
        Welcome to NEXUS, {firstName}.
      </h2>
      <p className="body-sm mt-1.5 max-w-lg">
        It keeps track of what you committed to and makes the weekly update
        take about thirty seconds. Three things worth knowing:
      </p>

      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.title}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3.5"
          >
            <step.icon
              size={16}
              className="text-[var(--dept-techspecialist)]"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-medium text-white/90">{step.title}</p>
            <p className="note mt-1">{step.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={dismissing}
          className="inline-flex min-h-11 items-center gap-2 rounded-full
                     bg-[var(--dept-techspecialist)] px-5 text-sm font-medium text-white
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {dismissing ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={14} aria-hidden="true" />
          )}
          Got it
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={dismissing}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border
                     border-white/[0.12] px-4 text-sm text-white/70
                     transition-colors hover:bg-white/[0.06] hover:text-white/90"
        >
          Skip <ArrowRight size={13} aria-hidden="true" />
        </button>
        {/*
          Said here rather than nowhere. Somebody who skips an introduction and
          then wants it back should not have to guess whether that is possible.
        */}
        <p className="note ml-1">You can read this again from Settings.</p>
      </div>
    </m.section>
  );
}
