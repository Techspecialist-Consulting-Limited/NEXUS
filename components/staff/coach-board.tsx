"use client";

import { m } from "motion/react";
import { Brain, MessageCircleQuestion, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekLabel } from "@/lib/cycle";

/*
 * Coaching — the employee's own page about their own week.
 *
 * GUIDE is explicit that this must never be the same page a manager sees, and
 * the reason is not layout. A person reading about themselves needs the week
 * described, then help; a manager needs findings, ranked. Serving one page to
 * both produces something that reads as surveillance to the first and as
 * noise to the second.
 *
 * Written entirely in the second person, and never about anybody else. There
 * is no comparison to a teammate anywhere on this screen — the moment somebody
 * can see how they rank against a colleague, the honest inputs this whole
 * system depends on stop arriving.
 */

export function CoachBoard({
  cycleLabel,
  narrative,
  coaching,
  questions,
}: {
  cycleLabel: string;
  /** The week written up from figures that were already final. */
  narrative: string;
  coaching: { title: string; body: string; based_on: string }[];
  /** Things NEXUS wants to ask, which only they can answer. */
  questions: string[];
}) {
  const nothing = !narrative && coaching.length === 0 && questions.length === 0;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Coaching"
        cycleLabel={weekLabel(cycleLabel)}
        standfirst={
          nothing
            ? "Nothing to work through this week."
            : "Your week, and what might help. Only you and your lead see this."
        }
      />

      {narrative && (
        <GlassCard level={2} className="p-5 md:p-6">
          <h2 className="eyebrow">
            How the week went
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-white/85">
            {narrative}
          </p>
          {/*
            Stated because it is the thing that makes the paragraph
            trustworthy: the figures behind it were counted, and the model was
            handed them as finished facts to explain rather than asked what
            they were.
          */}
          <p className="mt-3 flex items-center gap-1.5 text-2xs text-white/25">
            <Sparkles size={11} aria-hidden="true" />
            Written from your own figures — none of the numbers were guessed.
          </p>
        </GlassCard>
      )}

      {questions.length > 0 && (
        <GlassCard level={2} className="p-5">
          <div className="flex items-center gap-2.5">
            <MessageCircleQuestion
              size={16}
              className="text-[var(--color-partial)]"
              aria-hidden="true"
            />
            <h2 className="text-sm font-medium tracking-tight text-white/90">
              {questions.length === 1 ? "One thing to confirm" : "A few things to confirm"}
            </h2>
          </div>

          {/*
            These come first in importance, if not in order: each one is a gap
            NEXUS noticed, and answering it is what stops a silent drop being
            recorded as one. The employee sees it before anybody above them —
            that ordering is the product's central promise.
          */}
          <ul className="mt-3 flex flex-col gap-2">
            {questions.map((q, i) => (
              <li
                key={q}
                className="rounded-lg border border-[var(--color-partial)]/20
                           bg-[var(--color-partial)]/[0.07] px-3.5 py-3"
              >
                <p className="text-sm leading-relaxed text-white/85">
                  <span className="metric mr-2 text-white/30">{i + 1}</span>
                  {q}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-2xs leading-snug text-white/30">
            Answer these in your next check-in. Nothing is recorded as dropped
            while you still have a question open about it.
          </p>
        </GlassCard>
      )}

      {coaching.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {coaching.map((c, i) => (
            <m.div
              key={c.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: Math.min(i, 4) * 0.05, ease: [0.32, 0.72, 0, 1] }}
            >
              <GlassCard level={2} className="flex h-full gap-3.5 p-5">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-xl
                             bg-[var(--dept-techspecialist)]/12 text-[var(--dept-techspecialist)]"
                >
                  <Brain size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/90">{c.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-secondary">{c.body}</p>
                  <p className="mt-2 text-2xs text-white/25">Based on {c.based_on}</p>
                </div>
              </GlassCard>
            </m.div>
          ))}
        </div>
      )}

      {nothing && (
        <GlassCard level={2} className="p-8">
          <div className="mx-auto max-w-md text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-11 place-items-center rounded-full
                         bg-white/[0.06] text-white/40"
            >
              <Brain size={20} />
            </span>
            <p className="mt-3 text-sm font-medium text-white/90">
              Nothing to work through
            </p>
            <p className="mt-1 text-sm leading-relaxed text-tertiary">
              Coaching appears once there is a week to look at — a commitment that
              moved, something blocked, or a pattern worth naming. It is not
              generated for the sake of having something here.
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
