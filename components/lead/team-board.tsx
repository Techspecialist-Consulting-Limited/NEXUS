"use client";

import Link from "next/link";
import { m } from "motion/react";
import {
  ArrowRight,
  CircleDashed,
  HeartHandshake,
  Repeat2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { PageHead } from "@/components/executive/page-head";
import { weekLabel } from "@/lib/cycle";
import type { CriticalItem, DepartmentHealth, TeamMember } from "@/lib/queries";

/*
 * My team — the unit lead's view of the people they are responsible for.
 *
 * This view existed at /departments/[id] with nothing in the product linking to
 * it: a unit lead had no route to their own team. That is why it is a tab now.
 *
 * GUIDE "Manager UX: Support, Not Policing". The frame is not negotiable and it
 * shows up in three concrete decisions:
 *
 *   ORDERED BY WHO NEEDS HELP, NOT BY WHO SCORED LOWEST. Somebody blocked by
 *   another team is at the top because they need unblocking, not because they
 *   are behind.
 *
 *   NOT REPORTING OUTRANKS NOT DELIVERING. Silence is the only state a lead
 *   can actually do something about today, and it is the one the whole product
 *   exists to catch.
 *
 *   NO RANK NUMBERS AND NO LEAGUE TABLE. The moment a lead can read this as an
 *   ordering of their people, they manage the ordering instead of the work.
 */

function tone(rate: number | null): string {
  if (rate === null) return "var(--color-neutral)";
  if (rate >= 75) return "var(--color-healthy)";
  if (rate >= 55) return "var(--color-warning)";
  return "var(--color-critical)";
}

/** The one thing worth saying about this person this week. */
function state(member: TeamMember): { text: string; tone: string; urgent: boolean } {
  if (!member.responded) {
    return { text: "Has not reported", tone: "var(--color-critical)", urgent: true };
  }
  if (member.silent_drop_count > 0) {
    return {
      text: `${member.silent_drop_count} dropped without saying so`,
      tone: "var(--color-warning)",
      urgent: true,
    };
  }
  if (member.protected_count > 0) {
    return {
      text: `${member.protected_count} blocked by another team`,
      tone: "var(--color-blocked)",
      urgent: true,
    };
  }
  if (member.carryover_count > 0) {
    return {
      text: `${member.carryover_count} carried from last week`,
      tone: "var(--color-partial)",
      urgent: false,
    };
  }
  if (member.unplanned_count > 0) {
    return {
      text: `${member.unplanned_count} unplanned this week`,
      tone: "var(--color-in-progress)",
      urgent: false,
    };
  }
  return { text: "Reported, nothing outstanding", tone: "var(--color-healthy)", urgent: false };
}

export function TeamBoard({
  unitName,
  cycleLabel,
  health,
  team,
  critical,
}: {
  unitName: string;
  cycleLabel: string;
  health: DepartmentHealth | null;
  team: TeamMember[];
  critical: CriticalItem[];
}) {
  const silent = team.filter((x) => !x.responded).length;
  const blocked = team.filter((x) => x.protected_count > 0).length;

  const ordered = [...team].sort((a, b) => {
    const rank = (x: TeamMember) =>
      !x.responded ? 0 : x.silent_drop_count > 0 ? 1 : x.protected_count > 0 ? 2 : 3;
    return rank(a) - rank(b) || a.full_name.localeCompare(b.full_name);
  });

  const needHelp = ordered.filter((x) => state(x).urgent);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title={unitName}
        cycleLabel={weekLabel(cycleLabel)}
        standfirst={
          team.length === 0 ? (
            "Nobody is assigned to this unit yet."
          ) : needHelp.length === 0 ? (
            <>
              All {team.length} reported and nothing is outstanding. Nobody needs
              unblocking this week.
            </>
          ) : (
            <>
              {needHelp.length} of {team.length}{" "}
              {needHelp.length === 1 ? "person needs" : "people need"} something from
              you
              {silent > 0 ? `, and ${silent} have not reported.` : "."}
            </>
          )
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
        <GlassCard level={2} className="p-5">
          <p className="eyebrow">
            The unit
          </p>
          <div className="mt-3 flex items-center gap-5">
            <ProgressRing
              value={health?.delivery_rate ?? null}
              size={104}
              strokeWidth={8}
              sublabel="delivery"
              color={tone(health?.delivery_rate ?? null)}
            />
            <div className="min-w-0 flex-1">
              <Stat
                label="Reported"
                value={`${health?.people_responded ?? 0}/${health?.people_reporting ?? team.length}`}
              />
              <Stat
                label="Told in time"
                value={
                  health?.signal_integrity == null
                    ? "—"
                    : `${Math.round(health.signal_integrity)}%`
                }
              />
              <Stat label="Blocked elsewhere" value={health?.protected_count ?? 0} />
            </div>
          </div>

          {blocked > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-2xs leading-snug text-white/30">
              <ShieldCheck size={12} className="mt-px shrink-0" aria-hidden="true" />
              Work blocked by another team is excluded from this delivery figure. It
              is not counted against your people.
            </p>
          )}
        </GlassCard>

        <GlassCard level={2} className="p-5">
          <div className="flex items-center gap-2.5">
            <HeartHandshake
              size={16}
              className="text-[var(--dept-techspecialist)]"
              aria-hidden="true"
            />
            <h2 className="eyebrow">
              Worth a conversation
            </h2>
          </div>

          {critical.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              Nothing is stuck. No commitment in this unit is blocked, carried, or
              waiting on somebody else.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {critical.slice(0, 4).map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5"
                >
                  <p className="text-sm leading-snug text-white/90">{c.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs">
                    <span className="text-tertiary">{c.owner}</span>
                    {c.depends_on_department && (
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ color: c.depends_on_color ?? "var(--color-blocked)" }}
                      >
                        <TriangleAlert size={10} aria-hidden="true" />
                        waiting on {c.depends_on_department}
                      </span>
                    )}
                    {c.carry_depth > 1 && (
                      <span className="inline-flex items-center gap-1 text-[var(--color-partial)]">
                        <Repeat2 size={10} aria-hidden="true" />
                        carried {c.carry_depth}×
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard level={2} className="p-2 md:p-3">
        {team.length === 0 ? (
          <p className="p-4 text-sm text-tertiary">Nobody is assigned to this unit.</p>
        ) : (
          <ul className="flex flex-col">
            {ordered.map((member, i) => {
              const s = state(member);
              return (
                <m.li
                  key={member.profile_id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 10) * 0.025 }}
                  className="border-t border-white/[0.06] first:border-t-0"
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full
                                 text-2xs font-semibold"
                      style={{
                        background: `color-mix(in oklab, ${s.tone} 18%, transparent)`,
                        color: s.tone,
                      }}
                    >
                      {member.full_name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white/90">
                        {member.full_name}
                      </p>
                      <p
                        className="truncate text-2xs"
                        style={{ color: s.urgent ? s.tone : undefined }}
                      >
                        <span className={s.urgent ? "" : "text-tertiary"}>{s.text}</span>
                      </p>
                    </div>

                    {/*
                      The figure is shown, but it is never the sort key and it
                      is never the loudest thing in the row. What a lead acts on
                      is the sentence to its left.
                    */}
                    <div className="shrink-0 text-right">
                      <p className="metric text-sm" style={{ color: tone(member.delivery_rate) }}>
                        {member.delivery_rate === null ? "—" : `${Math.round(member.delivery_rate)}%`}
                      </p>
                      <p className="text-2xs text-white/25">
                        {member.delivered_count}/{member.promised_count}
                      </p>
                    </div>
                  </div>
                </m.li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Link
          href="/departments"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border
                     border-white/[0.12] bg-white/[0.04] px-4 text-sm text-white/85
                     transition-colors hover:bg-white/[0.09]"
        >
          Other units <ArrowRight size={14} aria-hidden="true" />
        </Link>
        {silent > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-tertiary">
            <CircleDashed size={13} aria-hidden="true" />
            Reminders have already gone out to anyone who has not reported.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <span className="text-xs text-tertiary">{label}</span>
      <span className="metric text-base text-white/90">{value}</span>
    </div>
  );
}
