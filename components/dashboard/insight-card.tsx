"use client";

import { useState } from "react";
import { m } from "motion/react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleSlash,
  EarOff,
  Lightbulb,
  Link2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { springDefault } from "@/lib/motion-tokens";
import type { AIInsight } from "@/lib/insights";

/*
 * GUIDE "AI Insight Center is done when": every insight carries a type, a
 * confidence, evidence, and an action.
 *
 * It also carries reason, impact and next step in its body — the guide's
 * worked example rejects "Creative Hub has 3 blockers" as an insight and
 * requires the sentence that tells the Chairman what to do about it.
 *
 * Feedback is not decoration. `advice.feedback` and `pattern_key` exist in
 * migration 0005 precisely so that dismissing something suppresses that
 * pattern rather than that one card — this is the learning loop's input.
 */

const TYPE_META: Record<
  AIInsight["type"],
  { icon: LucideIcon; label: string }
> = {
  dependency: { icon: Link2, label: "Dependency" },
  blocker: { icon: Ban, label: "Blocker" },
  mismatch: { icon: CircleSlash, label: "Mismatch" },
  silence: { icon: EarOff, label: "Silence" },
  risk: { icon: TriangleAlert, label: "Risk" },
  coaching: { icon: Lightbulb, label: "Coaching" },
};

const SEVERITY_COLOR: Record<AIInsight["severity"], string> = {
  critical: "var(--color-critical)",
  warning: "var(--color-warning)",
  normal: "var(--color-neutral)",
};

const CONFIDENCE_LABEL: Record<AIInsight["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function InsightCard({ insight }: { insight: AIInsight }) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<"accepted" | "dismissed" | null>(null);

  const meta = TYPE_META[insight.type];
  const Icon = meta.icon;
  const tone = SEVERITY_COLOR[insight.severity];

  if (resolved) {
    return (
      <m.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.55 }}
        transition={springDefault}
      >
        <GlassCard level={1} className="px-4 py-3">
          <p className="text-xs text-tertiary">
            {resolved === "accepted"
              ? "Noted — this will inform what gets raised next week."
              : "Dismissed. Similar findings will be raised less often."}
          </p>
        </GlassCard>
      </m.div>
    );
  }

  return (
    <GlassCard
      level={1}
      className="p-4"
      // Severity is carried on the left edge, so a scan down the column reads
      // as a severity gutter rather than four differently-coloured cards.
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 w-0.5 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: tone }}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wide"
              style={{ color: tone }}
            >
              <Icon size={12} aria-hidden="true" />
              {meta.label}
            </span>
            <span className="text-2xs text-white/35">
              {CONFIDENCE_LABEL[insight.confidence]}
            </span>
          </div>

          <h3 className="text-sm font-medium leading-snug text-white/90">
            {insight.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            {insight.summary}
          </p>

          {/* The next action — the part that makes this an insight, not a stat. */}
          <div className="mt-3 rounded-lg bg-white/[0.05] px-3 py-2.5">
            <p className="eyebrow">
              Suggested action
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              {insight.recommendedAction}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2.5 inline-flex min-h-11 items-center gap-1 text-xs text-white/50 hover:text-white/80"
          >
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
            {open ? "Hide evidence" : `Evidence (${insight.evidence.length})`}
          </button>

          {open && (
            <ul className="mt-1 space-y-1.5">
              {insight.evidence.map((e, i) => (
                <li
                  key={i}
                  className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5"
                >
                  <p className="text-xs text-white/75">{e.label}</p>
                  {e.quote && (
                    <p className="mt-1 text-2xs italic text-tertiary">
                      &ldquo;{e.quote}&rdquo;
                    </p>
                  )}
                  <p className="mt-0.5 text-2xs uppercase tracking-wide text-white/25">
                    from {e.source.replace("_", " ")}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => setResolved("accepted")}
            >
              <Check size={13} aria-hidden="true" /> Useful
            </GlassButton>
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={() => setResolved("dismissed")}
            >
              <X size={13} aria-hidden="true" /> Not useful
            </GlassButton>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
