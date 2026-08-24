"use client";

import { useState } from "react";
import { m } from "motion/react";
import { Lightbulb, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InsightCard } from "@/components/dashboard/insight-card";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { weekRange } from "@/lib/cycle";
import type { AIInsight } from "@/lib/insights";

/*
 * Advice, split by altitude.
 *
 * GUIDE "Manager UX: Support, Not Policing" — a lead's default view is "where
 * can I help", never "who failed". So organisation findings are framed as
 * things to unblock, and personal coaching is written in the second person.
 */
export function AdviceFeed({
  role,
  cycleLabel,
  insights,
  coaching,
  narrative,
}: {
  role: string;
  cycleLabel: string;
  insights: AIInsight[];
  coaching: { title: string; body: string; based_on: string }[];
  narrative: string;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const isStaff = role === "staff";
  const openCoaching = coaching.filter((c) => !dismissed.includes(c.title));
  const nothing = insights.length === 0 && openCoaching.length === 0 && !narrative;

  return (
    <div className="mx-auto max-w-2xl pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            {isStaff ? "Coaching" : "Insights"}
          </h1>
          <p className="mt-0.5 text-xs text-tertiary">{weekRange(cycleLabel)}</p>
        </div>
      </div>

      {nothing ? (
        <GlassCard level={1} className="mt-4">
          <EmptyState
            icon={Lightbulb}
            title="Nothing worth raising yet"
            body="Advice appears when there is something specific to act on — a repeated blocker, a commitment that keeps moving, or a week that went quiet. Silence here means none of those are happening."
          />
        </GlassCard>
      ) : (
        <m.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mt-4 space-y-6"
        >
          {narrative && (
            <m.div variants={staggerItem}>
              <GlassCard
                level={1}
                className="border-l-2 border-l-[var(--priority-high)] p-4"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles
                    size={13}
                    className="text-[var(--priority-high)]"
                    aria-hidden="true"
                  />
                  <span className="text-2xs font-medium uppercase tracking-wide text-[var(--priority-high)]">
                    Your week
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-secondary">{narrative}</p>
              </GlassCard>
            </m.div>
          )}

          {openCoaching.length > 0 && (
            <m.div variants={staggerItem}>
              <SectionHeader
                title="For you"
                hint="Drawn from your own history, not a template."
              />
              <div className="space-y-2.5">
                {openCoaching.map((c) => (
                  <GlassCard
                    key={c.title}
                    level={1}
                    className="border-l-2 border-l-[var(--priority-high)] p-4"
                  >
                    <h3 className="text-sm font-medium text-white/90">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-secondary">
                      {c.body}
                    </p>
                    <p className="mt-2 text-2xs text-white/35">
                      Based on <span className="metric">{c.based_on}</span>
                    </p>
                    <div className="mt-3 flex gap-2">
                      <GlassButton
                        size="sm"
                        variant="secondary"
                        onClick={() => setDismissed((d) => [...d, c.title])}
                      >
                        Helpful
                      </GlassButton>
                      <GlassButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed((d) => [...d, c.title])}
                      >
                        Not now
                      </GlassButton>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </m.div>
          )}

          {insights.length > 0 && (
            <m.div variants={staggerItem}>
              <SectionHeader
                title="Across the organisation"
                hint="Each one names what happened, what it costs, and what to do."
              />
              <div className="space-y-2.5">
                {insights.map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </div>
            </m.div>
          )}
        </m.div>
      )}
    </div>
  );
}
