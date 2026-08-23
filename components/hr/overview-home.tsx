"use client";

import Link from "next/link";
import { m } from "motion/react";
import {
  ArrowRight,
  Bell,
  Building2,
  CircleDashed,
  Clock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekCode } from "@/lib/cycle";
import type { ComplianceRow } from "@/lib/team";
import type { DepartmentHealth } from "@/lib/queries";

/*
 * HR's landing view.
 *
 * PRD §5 makes HR the secondary consumer of the digest and the enforcement
 * partner, and those are two different jobs from the Chairman's. He asks "what
 * decisions do I need to make"; HR asks "is the organisation reporting, and
 * who do I need to chase". So this is not a smaller command centre — it leads
 * with the open week and the people in it, and the settled week's delivery
 * figures sit underneath as context.
 *
 * TWO WEEKS ARE ON THIS SCREEN, AND THE DISTINCTION MATTERS.
 *
 * Chasing works on the OPEN week — a reminder about a week that already closed
 * is useless. Delivery figures only exist for the SETTLED week, because the
 * current one is still inside the employees' correction window. Showing both
 * without labelling them is how somebody ends up chasing the wrong week, so
 * each band names which one it is about.
 *
 * WHAT IS NOT HERE: nothing an employee wrote. This page reads the submission
 * ENVELOPE — arrived, when, how long — never `raw_text`. Compliance needs to
 * know people reported; it does not need to read their week.
 */

export function HrOverview({
  openWeekLabel,
  settledWeekLabel,
  compliance,
  departments,
}: {
  /** The week still being reported on — what chasing acts on. */
  openWeekLabel: string;
  /** The last week whose reconciliations everyone has confirmed. */
  settledWeekLabel: string | null;
  compliance: ComplianceRow[];
  departments: DepartmentHealth[];
}) {
  const submitted = compliance.filter((r) => r.submitted);
  const late = submitted.filter((r) => r.late);
  const missing = compliance.filter((r) => !r.submitted);
  const rate = compliance.length
    ? Math.round((submitted.length / compliance.length) * 100)
    : null;

  const reporting = departments.filter((d) => d.delivery_rate !== null);
  const meanDelivery = reporting.length
    ? Math.round(reporting.reduce((s, d) => s + (d.delivery_rate ?? 0), 0) / reporting.length)
    : null;
  const meanSignal = reporting.length
    ? Math.round(
        reporting.reduce((s, d) => s + (d.signal_integrity ?? 0), 0) / reporting.length,
      )
    : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Overview"
        cycleLabel={weekCode(openWeekLabel)}
        standfirst={
          compliance.length === 0 ? (
            "Nobody is expected to report this week."
          ) : missing.length === 0 ? (
            <>
              Everyone has reported for {weekCode(openWeekLabel)}
              {late.length > 0 ? `, ${late.length} after the deadline.` : "."}
            </>
          ) : (
            <>
              {missing.length} of {compliance.length}{" "}
              {compliance.length === 1 ? "person has" : "people have"} not reported for{" "}
              {weekCode(openWeekLabel)}
              {late.length > 0 ? `, and ${late.length} filed late.` : "."}
            </>
          )
        }
      />

      {/* ---- 1: this week's reporting, and who to chase ------------------- */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
        <GlassCard level={2} className="p-5">
          <p className="eyebrow">
            Reporting · {weekCode(openWeekLabel)}
          </p>

          <p
            className="metric mt-1 text-3xl leading-none"
            style={{
              color:
                rate === null
                  ? "var(--color-neutral)"
                  : rate === 100
                    ? "var(--color-delivered)"
                    : rate >= 80
                      ? "var(--color-partial)"
                      : "var(--color-blocked)",
            }}
          >
            {rate === null ? "—" : `${rate}%`}
          </p>

          <div className="mt-4">
            <Stat
              label="On time"
              value={submitted.length - late.length}
              tone="var(--color-delivered)"
            />
            <Stat label="Late" value={late.length} tone="var(--color-partial)" />
            <Stat label="Not reported" value={missing.length} tone="var(--color-blocked)" />
          </div>
        </GlassCard>

        <GlassCard level={2} className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">
              Who to chase
            </h2>
            <Link
              href="/compliance"
              className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs
                         text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
            >
              Full list <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>

          {missing.length === 0 ? (
            <div className="mt-3 flex items-start gap-2.5">
              <ShieldCheck
                size={16}
                className="mt-px shrink-0 text-[var(--color-healthy)]"
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed text-secondary">
                Nobody to chase. Everyone expected to report for {weekCode(openWeekLabel)}{" "}
                has done so
                {late.length > 0
                  ? `, though ${late.length} arrived after the deadline. Late is still reported — worth knowing, not worth chasing.`
                  : "."}
              </p>
            </div>
          ) : (
            <>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {missing.slice(0, 6).map((r, i) => (
                  <m.li
                    key={r.profile_id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.03 }}
                  >
                    <div
                      className="flex items-center gap-2.5 rounded-lg border
                                 border-[var(--color-blocked)]/20
                                 bg-[var(--color-blocked)]/[0.06] px-3 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full
                                   text-2xs font-semibold"
                        style={{
                          background: `color-mix(in oklab, ${r.color ?? "var(--color-blocked)"} 22%, transparent)`,
                          color: r.color ?? "var(--color-blocked)",
                        }}
                      >
                        {r.full_name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/90">{r.full_name}</p>
                        <p className="truncate text-2xs text-tertiary">
                          {r.department_name ?? "Unassigned"}
                        </p>
                      </div>
                    </div>
                  </m.li>
                ))}
              </ul>

              {missing.length > 6 && (
                <p className="mt-2 text-xs text-tertiary">
                  and {missing.length - 6} more.
                </p>
              )}

              {/*
                Said here so nobody chases twice. The rhythm already sends
                reminders; HR's job starts where the automation stops.
              */}
              <p className="mt-3 flex items-start gap-1.5 text-2xs leading-snug text-white/30">
                <Clock size={12} className="mt-px shrink-0" aria-hidden="true" />
                Reminders have already gone out automatically. These are the ones a
                person needs to follow up.
              </p>
            </>
          )}
        </GlassCard>
      </div>

      {/* ---- 2: the settled week, as context ----------------------------- */}
      <GlassCard level={2} className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="eyebrow">
            Delivery · {settledWeekLabel ? weekCode(settledWeekLabel) : "—"}
          </h2>
          <Link
            href="/departments"
            className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs
                       text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
          >
            All units <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        {/*
          A different week from the band above, and it says so.

          Delivery figures only exist once employees have confirmed their
          reconciliations, so this is always one week behind the one being
          chased. Presenting them as the same week would have HR chasing people
          about numbers that do not exist yet.
        */}
        <p className="mt-1 text-sm text-secondary">
          {meanDelivery === null ? (
            "No week has settled yet."
          ) : (
            <>
              {meanDelivery}% delivered and {meanSignal}% told in time across{" "}
              {reporting.length} {reporting.length === 1 ? "unit" : "units"} — the last
              week everyone has confirmed.
            </>
          )}
        </p>

        {/*
          Figures, not bars.

          HR's decision on this page is who to chase; delivery is context they
          are told so the chase has a frame. Five bars turn that context into
          the loudest thing on the screen, and none of it is theirs to act on.
          The Units page draws the comparison properly for whoever needs it.
        */}
        {departments.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {[...departments]
              .sort((a, b) => (a.delivery_rate ?? 101) - (b.delivery_rate ?? 101))
              .map((d) => (
                <li key={d.department_id} className="min-w-0">
                  <p className="truncate text-sm text-white/80">{d.department_name}</p>
                  <p
                    className="metric text-base"
                    style={{
                      color:
                        d.delivery_rate === null
                          ? "var(--color-neutral)"
                          : d.delivery_rate >= 75
                            ? "var(--color-healthy)"
                            : d.delivery_rate >= 55
                              ? "var(--color-warning)"
                              : "var(--color-critical)",
                    }}
                  >
                    {d.delivery_rate === null ? "—" : `${Math.round(d.delivery_rate)}%`}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </GlassCard>

      {/* ---- 3: where to go ---------------------------------------------- */}
      <GlassCard level={2} className="p-5">
        <h2 className="eyebrow">
          Shortcuts
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              href: "/compliance",
              icon: Users,
              title: "Reporting",
              blurb: "Who submitted, who was late",
            },
            {
              href: "/departments",
              icon: Building2,
              title: "Units",
              blurb: "Delivery across the organisation",
            },
            { href: "/notifications", icon: Bell, title: "Alerts", blurb: "What needs you" },
          ].map(({ href, icon: Icon, title, blurb }) => (
            <Link
              key={title}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.08]
                         bg-white/[0.03] p-4 transition-colors hover:border-white/[0.16]
                         hover:bg-white/[0.06]"
            >
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl
                           bg-[var(--dept-techspecialist)]/12 text-[var(--dept-techspecialist)]"
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-white/90">{title}</p>
                <p className="mt-0.5 truncate text-xs text-tertiary">{blurb}</p>
              </div>
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="shrink-0 text-white/25 transition-colors group-hover:text-white/70"
              />
            </Link>
          ))}
        </div>
      </GlassCard>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-tertiary">
        <CircleDashed
          size={14}
          className="mt-px shrink-0 text-[var(--color-healthy)]"
          aria-hidden="true"
        />
        <span>
          Reporting shows whether a check-in arrived and when — never what it said.
        </span>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <span className="text-xs text-tertiary">{label}</span>
      <span className="metric text-base" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}
