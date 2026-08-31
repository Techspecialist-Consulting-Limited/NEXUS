"use client";

import { m } from "motion/react";
import {
  Hourglass,
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
import { weekLabel } from "@/lib/cycle";
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
  reporting,
}: {
  /** The settled week, or null when none has settled yet. */
  cycleLabel: string | null;
  insights: AIInsight[];
  /**
   * Who was expected to file this week, and who has.
   *
   * An empty finding list means the model found nothing IN WHAT IT WAS
   * GIVEN. On the day a Chairman is invited it was given nothing, and this
   * page told him every unit had reported and no commitment had slipped —
   * a green tick over a week nobody had filed for. These two numbers are
   * what separates a clean week from an empty one.
   */
  reporting: { expected: number; submitted: number };
}) {
  const urgent = insights.filter((i) => i.severity !== "normal").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Insights"
        cycleLabel={cycleLabel ? weekLabel(cycleLabel) : null}
        standfirst={
          insights.length === 0 ? (
            reporting.submitted === 0
              ? "Nothing has been reported yet."
              : "Nothing needs your attention this week."
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
          {/*
            A tick is a claim. It is only drawn when somebody actually
            reported and the week came back clean — the other two states are
            waiting, not good news, and a green circle over "nobody has filed"
            is the interface congratulating an organisation for silence.
          */}
          <div className="mx-auto max-w-md text-center">
            <span
              aria-hidden="true"
              className={
                reporting.submitted > 0
                  ? "mx-auto grid size-11 place-items-center rounded-full bg-[var(--color-healthy)]/12 text-[var(--color-healthy)]"
                  : "mx-auto grid size-11 place-items-center rounded-full bg-white/[0.06] text-white/55"
              }
            >
              {reporting.submitted > 0 ? <CircleCheck size={20} /> : <Hourglass size={20} />}
            </span>

            {reporting.expected === 0 ? (
              <>
                <p className="mt-3 text-sm font-medium text-white/90">
                  Nobody has been added yet
                </p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  Findings are read from what people report. Once the
                  organisation has people in it and they start filing, what is
                  blocked between units, what keeps carrying over and who needs
                  support all appear here — each one traceable to the records
                  behind it.
                </p>
              </>
            ) : reporting.submitted === 0 ? (
              <>
                <p className="mt-3 text-sm font-medium text-white/90">
                  {cycleLabel
                    ? `Nothing reported for ${cycleLabel} yet`
                    : "Nothing reported yet"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  {reporting.expected}{" "}
                  {reporting.expected === 1 ? "person is" : "people are"} expected
                  to file. This page fills in as they do — it reads what they
                  wrote rather than asking them anything extra.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium text-white/90">
                  Nothing needs your attention
                </p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  {reporting.submitted} of {reporting.expected} reported
                  {cycleLabel ? ` for ${cycleLabel}` : ""} and nothing came back
                  blocked between units,
                  carried without explanation, or dropped without being
                  declared. This page stays empty when the week is clean — it
                  does not manufacture a concern to look useful.
                </p>
              </>
            )}
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
