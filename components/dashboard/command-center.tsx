"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { m } from "motion/react";
import { ChevronDown, Clock, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { heroItem, staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { cn } from "@/lib/cn";
import { healthTone } from "@/lib/status";
import { weekLabel } from "@/lib/cycle";
import type { CoursePoint, PendingReview } from "@/lib/queries";
import type { AIInsight, ExecutiveBrief } from "@/lib/insights";
import { unitTone, unitWash } from "@/lib/unit-tone";

const CoursePlot = dynamic(() => import("./course-plot").then((m) => m.CoursePlot), {
  loading: () => <div className="h-32 w-full animate-pulse rounded-lg bg-white/[0.04]" />,
});

/*
 * The Chairman's command view — GUIDE Corrective Brief, "Executive Screen Must
 * Fit One Page".
 *
 * The previous version answered the question correctly and made him scroll
 * through five sections to get there. This one puts the whole answer in one
 * desktop viewport, in the order the brief specifies:
 *
 *   health  ·  AI brief  ·  reporting pulse
 *   department strip
 *   top risks  |  leadership actions
 *   compact trend
 *
 * Risks and actions sit in parallel numbered columns rather than stacked
 * cards. They correspond one-to-one — risk 2's action is action 2 — and the
 * numbering makes that readable without a line drawn between them.
 *
 * Phones stack the same content in the same order. This is the desktop layout
 * the brief asked for, not a different product.
 */

export function CommandCenter({
  viewerRole,
  cycleLabel,
  brief,
  course,
  pending,
}: {
  viewerRole: string;
  cycleLabel: string;
  brief: ExecutiveBrief;
  course: CoursePoint[];
  pending: PendingReview | null;
}) {
  const { headline, insights, departments, attention } = brief;

  const avg = (pick: (d: (typeof departments)[number]) => number | null) => {
    const rows = departments.filter((d) => pick(d) !== null);
    return rows.length ? rows.reduce((s, d) => s + (pick(d) ?? 0), 0) / rows.length : null;
  };
  const orgDelivery = avg((d) => d.delivery_rate);
  const orgSignal = avg((d) => d.signal_integrity);

  const reported = departments.reduce((s, d) => s + d.people_responded, 0);
  const people = departments.reduce((s, d) => s + d.people_reporting, 0);
  const held = departments.reduce((s, d) => s + d.protected_count, 0);
  const silent = departments.reduce((s, d) => s + d.silent_drop_count, 0);

  const isChairman = viewerRole === "executive" || viewerRole === "admin";
  const top = insights.slice(0, 3);

  return (
    <div className="mx-auto max-w-[1280px] pt-1">
      {/* ---- masthead --------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-medium tracking-tight lg:text-2xl">
          {isChairman ? "Command" : "Organisation"}
        </h1>
        <p className="text-xs text-tertiary">
          <span className="metric text-white/70">{weekLabel(cycleLabel)}</span>
        </p>
      </div>

      <m.div variants={staggerContainer} initial="hidden" animate="visible">
        {/* ---- row 1: health · brief · pulse --------------------------- */}
        <m.div
          variants={heroItem}
          className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]"
        >
          {/*
            Ordered for the phone, not for the grid.

            Stacked in source order these put two bare percentages above the
            sentence that explains them. The narrative is the one thing this
            page exists to deliver, so it leads; the scores follow as the
            supporting figures they are. `lg:order-none` restores the designed
            left-to-right arrangement on desktop.
          */}
          <GlassCard level={2} className="order-3 p-3.5 lg:order-none">
            <p className="eyebrow">Execution</p>
            <div className="mt-2 flex items-end gap-5">
              <Metric label="Delivered" value={orgDelivery} tone={healthTone(orgDelivery)} />
              <Metric label="Signal" value={orgSignal} tone={healthTone(orgSignal)} />
            </div>
            <p className="mt-3 text-2xs leading-snug text-tertiary">
              Delivery is whether work landed. Signal is whether you were told
              in time.
            </p>
          </GlassCard>

          {/* The one sentence the whole page exists to deliver. */}
          <GlassCard level={2} className="order-1 border-l-2 border-l-[var(--priority-high)] p-3.5 lg:order-none">
            <p className="mb-1.5 flex items-center gap-1.5 text-2xs uppercase tracking-wide text-[var(--priority-high)]">
              <Sparkles size={12} aria-hidden="true" /> This week
            </p>
            <p className="text-base leading-relaxed text-white/90">{headline}</p>
            <p className="mt-2 text-2xs leading-snug text-tertiary">
              Every figure is counted in the database, not written by a model.
              Work blocked by another team is excluded from delivery
              {held > 0 && (
                <>
                  {" "}
                  — <span className="metric text-white/60">{held}</span> items this week
                </>
              )}
              .
            </p>
          </GlassCard>

          <GlassCard level={2} className="order-2 p-3.5 lg:order-none">
            <p className="eyebrow">Reporting</p>
            <p className="metric mt-2 text-3xl leading-none text-white/90">
              {reported}
              <span className="text-lg text-white/40">/{people}</span>
            </p>
            <dl className="mt-3 space-y-1 text-2xs">
              <Row label="Went quiet" value={silent} tone={silent ? "var(--color-critical)" : undefined} />
              <Row label="Held elsewhere" value={held} tone={held ? "var(--color-healthy)" : undefined} />
              {pending && (
                <Row
                  label={`${weekLabel(pending.label)} confirming`}
                  value={pending.pending}
                  tone="var(--color-warning)"
                />
              )}
            </dl>
          </GlassCard>
        </m.div>

        {/* ---- row 2: department strip --------------------------------- */}
        <m.div variants={staggerItem} className="mt-2.5">
          <GlassCard level={1} className="p-2.5">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {departments.map((d) => (
                <li key={d.department_id}>
                  <Link
                    href={`/departments/${d.department_id}`}
                    className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: unitTone(d.department_id) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">
                        {d.department_name}
                      </span>
                      <span
                        className="metric shrink-0 text-xs"
                        style={{ color: healthTone(d.delivery_rate) }}
                      >
                        {d.delivery_rate === null ? "—" : `${Math.round(d.delivery_rate)}%`}
                      </span>
                    </div>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <m.span
                        className="block h-full rounded-full"
                        style={{ backgroundColor: healthTone(d.delivery_rate), originX: 0 }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: (d.delivery_rate ?? 0) / 100 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-2xs text-white/40">
                      <span className="metric">
                        {d.people_responded}/{d.people_reporting}
                      </span>
                      {d.silent_drop_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[var(--color-critical)]">
                          <TriangleAlert size={9} aria-hidden="true" />
                          {d.silent_drop_count}
                        </span>
                      )}
                      {d.protected_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[var(--color-healthy)]">
                          <ShieldCheck size={9} aria-hidden="true" />
                          {d.protected_count}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </GlassCard>
        </m.div>

        {/* ---- row 3: risks | actions ---------------------------------- */}
        <m.div variants={staggerItem} className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
          <GlassCard level={1} className="p-3.5">
            <h2 className="mb-2.5 text-2xs uppercase tracking-wide text-white/40">
              Top risks
            </h2>
            {top.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Nothing escalated"
                body="No cross-team blockers, no repeated slippage, and everyone reported."
              />
            ) : (
              <ol className="space-y-2.5">
                {top.map((insight, i) => (
                  <RiskRow key={insight.id} index={i + 1} insight={insight} />
                ))}
              </ol>
            )}
          </GlassCard>

          <GlassCard level={1} className="p-3.5">
            <h2 className="mb-2.5 text-2xs uppercase tracking-wide text-white/40">
              Leadership actions
            </h2>
            {top.length === 0 ? (
              <p className="py-6 text-center text-xs text-tertiary">
                Nothing needs a decision from you this week.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {top.map((insight, i) => (
                  <li key={insight.id} className="flex gap-2.5">
                    <span className="metric mt-0.5 shrink-0 text-xs text-white/30">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-white/85">
                      {insight.recommendedAction}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </GlassCard>
        </m.div>

        {/*
          ---- row 4: compact trend + people ---------------------------

          Hidden behind a summary on a phone, always open from `lg`.

          Stacked in full these added roughly 900px to a page already 2,292px
          tall — a wall nobody scrolls to the bottom of. Neither is acted on
          directly: the trend is context, the roster is a drill-down. The
          desktop layout is untouched.
        */}
        <m.div variants={staggerItem} className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <GlassCard level={1} className="p-3.5 pr-2">
            <TailSection title="Promised against delivered">
              <CoursePlot points={course} compact />
            </TailSection>
          </GlassCard>

          <GlassCard level={1} className="p-3.5">
            <TailSection
              title="Worth a conversation"
              note="Ordered by whether we were told, not by output."
            >

            {attention.length === 0 ? (
              <p className="py-4 text-center text-xs text-tertiary">
                Nobody needs chasing this week.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {attention.slice(0, 4).map((a) => (
                  <li key={a.profile_id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-full text-2xs font-medium"
                      style={{
                        backgroundColor: unitWash(a.department_name, 20),
                        color: unitTone(a.department_name),
                      }}
                    >
                      {a.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-white/85">
                        {a.full_name}
                      </span>
                      <span className="block truncate text-2xs text-tertiary">
                        {!a.responded
                          ? "did not report"
                          : a.silent_drop_count > 0
                            ? `${a.silent_drop_count} dropped without notice`
                            : "below the line, but flagged it"}
                      </span>
                    </span>
                    <span
                      className="metric shrink-0 text-xs"
                      style={{ color: healthTone(a.delivery_rate) }}
                    >
                      {a.delivery_rate === null ? "—" : `${Math.round(a.delivery_rate)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            </TailSection>
          </GlassCard>
        </m.div>
      </m.div>

      <p className="mt-4 flex items-start gap-1.5 text-2xs leading-relaxed text-tertiary">
        <Clock size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Reconciliations still awaiting an employee&rsquo;s confirmation are not
          included. They appear once that person has seen them — which is why
          these numbers can be trusted.
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: string;
}) {
  return (
    <div>
      <p className="text-2xs text-tertiary">{label}</p>
      <p className="metric mt-0.5 text-[2rem] font-medium leading-none" style={{ color: tone }}>
        {value === null ? "—" : Math.round(value)}
        <span className="text-lg text-white/40">%</span>
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-tertiary">{label}</dt>
      <dd className="metric shrink-0" style={{ color: tone ?? "var(--text-secondary)" }}>
        {value}
      </dd>
    </div>
  );
}

const SEVERITY_TONE: Record<AIInsight["severity"], string> = {
  critical: "var(--color-critical)",
  warning: "var(--color-warning)",
  normal: "var(--color-neutral)",
};

function RiskRow({ index, insight }: { index: number; insight: AIInsight }) {
  return (
    <li className="flex gap-2.5">
      <span className="metric mt-0.5 shrink-0 text-xs" style={{ color: SEVERITY_TONE[insight.severity] }}>
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-white/90">
          {insight.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-secondary">
          {insight.summary}
        </p>
        <p className="mt-1 text-2xs uppercase tracking-wide text-white/30">
          {insight.type} · {insight.confidence} confidence
        </p>
      </div>
    </li>
  );
}

/*
 * A section that is collapsed on a phone and always open from `lg`.
 *
 * These two sections added roughly 900px to a page already 2,292px tall — a
 * wall nobody scrolls to the bottom of. Neither is acted on directly: the trend
 * is context and the roster is a drill-down, so both are things an admin opens
 * when they want them rather than scrolls past every time.
 *
 * Not <details>: its open state cannot be driven by a breakpoint without
 * fighting user-agent styles. An explicit toggle plus `lg:block` is predictable
 * in every browser, and the desktop rendering is byte-identical to before.
 */
function TailSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left lg:hidden"
      >
        <span className="min-w-0">
          <span className="eyebrow block">{title}</span>
          {note && <span className="note mt-0.5 block">{note}</span>}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-white/30 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <div className="hidden lg:block">
        <h2 className="eyebrow">{title}</h2>
        {note && <p className="note mt-0.5">{note}</p>}
      </div>

      <div className={cn("mt-2.5", open ? "block" : "hidden", "lg:mt-2 lg:block")}>
        {children}
      </div>
    </>
  );
}
