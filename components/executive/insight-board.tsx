"use client";

import { m } from "motion/react";
import {
  CircleCheck,
  CircleSlash,
  Rocket,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { EvidenceChip } from "@/components/ui/evidence-chip";
import { PageHead } from "@/components/executive/page-head";
import { weekCode } from "@/lib/cycle";
import type { AIInsight } from "@/lib/insights";

/*
 * Insights, in one view.
 *
 * Every finding the week produced, most urgent first, each one carrying the
 * rows it came from. No tabs, no filters, no split between "risks" and
 * "opportunities" — an executive with eight findings does not need to navigate
 * them, they need to read them.
 *
 * THE EVIDENCE IS THE POINT. Each card ends in chips that expand to the exact
 * commitment or quote behind the claim. That single feature does more for
 * whether this product is believed than anything else on the screen: a finding
 * you can check is a finding you can act on, and one you cannot is an opinion
 * from software.
 *
 * Every word here was assembled from counted facts in lib/insights.ts. Nothing
 * on this page came from a model, which is why each claim resolves to a row.
 */

const TONE = {
  critical: { ring: "var(--color-critical)", wash: "rgba(242,120,159,0.09)" },
  warning: { ring: "var(--color-warning)", wash: "rgba(245,185,66,0.09)" },
  normal: { ring: "var(--color-healthy)", wash: "rgba(72,201,169,0.09)" },
} as const;

const TYPE_ICON = {
  blocker: ShieldAlert,
  dependency: ShieldAlert,
  risk: TriangleAlert,
  /*
   * A rocket on "commitments went quiet" reads as good news at a glance,
   * which is precisely the wrong first impression for the finding this
   * product exists to surface. CircleSlash says absence.
   */
  mismatch: CircleSlash,
  silence: CircleSlash,
  coaching: Rocket,
} as const;

export function InsightBoard({
  cycleLabel,
  insights,
}: {
  cycleLabel: string;
  insights: AIInsight[];
}) {
  const urgent = insights.filter((i) => i.severity !== "normal").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Insights"
        cycleLabel={weekCode(cycleLabel)}
        standfirst={
          insights.length === 0 ? (
            "Nothing needs your attention this week."
          ) : urgent === 0 ? (
            <>
              {insights.length} {insights.length === 1 ? "finding" : "findings"}, none
              urgent. Each one is traceable to the records behind it.
            </>
          ) : (
            <>
              {urgent} of {insights.length}{" "}
              {insights.length === 1 ? "finding needs" : "findings need"} a decision.
              Each one carries the records it came from.
            </>
          )
        }
      />

      {insights.length === 0 ? (
        <GlassCard level={2} className="p-8">
          <div className="mx-auto max-w-md text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-11 place-items-center rounded-full
                         bg-[var(--color-healthy)]/12 text-[var(--color-healthy)]"
            >
              <CircleCheck size={20} />
            </span>
            <p className="mt-3 text-sm font-medium text-white/90">
              Nothing needs your attention
            </p>
            <p className="mt-1 text-sm leading-relaxed text-tertiary">
              Every unit reported for {cycleLabel} and no commitment slipped without
              being declared. This page stays empty when the week is clean — it does
              not manufacture a concern to look useful.
            </p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight, i) => {
            const tone = TONE[insight.severity];
            const Icon = TYPE_ICON[insight.type] ?? CircleCheck;

            return (
              <m.div
                key={insight.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i, 6) * 0.04, ease: [0.32, 0.72, 0, 1] }}
              >
                <GlassCard level={2} className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-full"
                      style={{ background: tone.wash, color: tone.ring }}
                    >
                      <Icon size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-white/90">
                        {insight.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-secondary">
                        {insight.summary}
                      </p>
                    </div>
                  </div>

                  {/*
                    The action, set apart from the finding.

                    A finding without a next step is a status update, and people
                    learn to scroll past those. Giving it its own tinted block
                    means the eye can go straight to what to do without reading
                    the explanation twice.
                  */}
                  <div
                    className="mt-3 rounded-lg border px-3.5 py-2.5"
                    style={{
                      borderColor: `color-mix(in oklab, ${tone.ring} 22%, transparent)`,
                      background: tone.wash,
                    }}
                  >
                    <p className="text-sm leading-relaxed text-white/85">
                      {insight.recommendedAction}
                    </p>
                  </div>

                  {insight.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {insight.evidence.map((e, n) => (
                        <EvidenceChip
                          key={`${insight.id}-${n}`}
                          label={e.label}
                          quote={e.quote}
                          source={e.source}
                        />
                      ))}
                    </div>
                  )}

                  <p className="mt-3 flex items-center gap-1.5 text-2xs text-white/25">
                    <Sparkles size={11} aria-hidden="true" />
                    Counted from records · {insight.confidence} confidence
                  </p>
                </GlassCard>
              </m.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
