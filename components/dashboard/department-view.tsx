"use client";

import Link from "next/link";
import { m } from "motion/react";
import {
  ArrowLeft,
  Ban,
  EarOff,
  Repeat,
  ShieldCheck,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { heroItem, staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { healthTone } from "@/lib/status";
import { weekCode, weekRange } from "@/lib/cycle";
import type {
  BlockingEdge,
  CriticalItem,
  Department,
  DepartmentHealth,
  TeamMember,
} from "@/lib/queries";

/*
 * GUIDE §12 Department Drill-Down.
 *
 * "Support, not policing" is the whole framing of the manager view, so the
 * roster leads with who needs help rather than who scored highest, and people
 * who filed nothing are shown as "no update" rather than 0% — a missing
 * signal is not a failure, and rendering it as a zero would quietly libel
 * someone who was on leave.
 */

export function DepartmentView({
  department,
  health,
  team,
  critical,
  edges,
  cycleLabel,
}: {
  department: Department;
  health: DepartmentHealth | null;
  team: TeamMember[];
  critical: CriticalItem[];
  edges: BlockingEdge[];
  cycleLabel: string;
}) {
  return (
    <div className="pt-2">
      <Link
        href="/departments"
        className="inline-flex min-h-11 items-center gap-1.5 text-xs text-white/50 hover:text-white/90"
      >
        <ArrowLeft size={14} aria-hidden="true" /> All units
      </Link>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: department.color }}
            />
            <h1 className="truncate text-2xl font-medium tracking-tight">
              {department.name}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-tertiary">
            {department.lead_name ? `Led by ${department.lead_name} · ` : ""}
            {weekRange(cycleLabel)}
          </p>
        </div>
        <span className="metric shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/70">
          {weekCode(cycleLabel)}
        </span>
      </div>

      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mt-4 space-y-4"
      >
        {/* ---- unit health ---------------------------------------------- */}
        <m.div variants={heroItem}>
          <GlassCard level={2} className="p-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="text-xs text-tertiary">Delivered</p>
                <p
                  className="metric mt-1 text-4xl font-medium leading-none"
                  style={{ color: healthTone(health?.delivery_rate ?? null) }}
                >
                  {health?.delivery_rate == null ? "—" : Math.round(health.delivery_rate)}
                  <span className="text-xl text-white/40">%</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-tertiary">Told in time</p>
                <p
                  className="metric mt-1 text-4xl font-medium leading-none"
                  style={{ color: healthTone(health?.signal_integrity ?? null) }}
                >
                  {health?.signal_integrity == null ? "—" : Math.round(health.signal_integrity)}
                  <span className="text-xl text-white/40">%</span>
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-tertiary">Reported</p>
                <p className="metric mt-1 text-2xl leading-none text-white/90">
                  {health?.people_responded ?? 0}
                  <span className="text-base text-white/40">/{health?.people_reporting ?? team.length}</span>
                </p>
              </div>
            </div>

            {department.description && (
              <p className="mt-4 border-t border-white/[0.07] pt-3 text-xs leading-relaxed text-tertiary">
                {department.description}
              </p>
            )}
          </GlassCard>
        </m.div>

        {/* ---- who is waiting on whom ----------------------------------- */}
        {edges.length > 0 && (
          <m.div variants={staggerItem}>
            <SectionHeader
              title="Waiting on other units"
              hint="Nobody here is scored down for these."
            />
            <div className="space-y-2">
              {edges.map((e, i) => (
                <GlassCard key={i} level={1} className="p-3.5">
                  <div className="flex items-center gap-2">
                    <Ban size={14} style={{ color: "var(--color-blocked)" }} aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-sm text-white/90">
                      <span className="metric">{e.blocked_count}</span>{" "}
                      {e.blocked_count === 1 ? "item" : "items"} held by{" "}
                      <span style={{ color: e.to_color }}>{e.to_name}</span>
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
          </m.div>
        )}
      </m.div>

      {/*
       * Two columns from lg up.
       *
       * At 1440 a single column left each roster row over a thousand pixels
       * wide to hold a name and a percentage. The team and the work that is
       * stuck are also the two things a lead reads together — "who needs
       * help" and "what is holding them up" — so they belong side by side.
       */}
      <div className="mt-7 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="lg:col-span-6">
        {/* ---- the team ---------------------------------------------------- */}
        <Reveal className="">
          <SectionHeader
            title="The team"
            hint="Ordered by who may need support, not by who scored highest."
          />
          {team.length === 0 ? (
            <GlassCard level={1}>
              <EmptyState
                icon={Users}
                title="Nobody assigned"
                body="This unit has no active members this week."
              />
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {team.map((p) => (
                <li key={p.profile_id}>
                  <GlassCard level={1} className="p-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-9 shrink-0 place-items-center rounded-full text-2xs font-medium"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${department.color} 20%, transparent)`,
                          color: department.color,
                        }}
                      >
                        {p.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white/90">{p.full_name}</p>
                        <p className="truncate text-2xs text-tertiary">
                          {p.title ?? "—"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.responded ? (
                          <span
                            className="metric text-sm"
                            style={{ color: healthTone(p.delivery_rate) }}
                          >
                            {p.delivery_rate === null ? "—" : `${Math.round(p.delivery_rate)}%`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-2xs text-white/45">
                            <EarOff size={11} aria-hidden="true" /> no update
                          </span>
                        )}
                      </div>
                    </div>

                    {(p.silent_drop_count > 0 ||
                      p.protected_count > 0 ||
                      p.carryover_count > 0) && (
                      <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 pl-12 text-2xs text-tertiary">
                        {p.silent_drop_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <EarOff size={11} style={{ color: "var(--color-critical)" }} aria-hidden="true" />
                            <span className="metric">{p.silent_drop_count}</span> went quiet
                          </span>
                        )}
                        {p.carryover_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Repeat size={11} aria-hidden="true" />
                            <span className="metric">{p.carryover_count}</span> carried
                          </span>
                        )}
                        {p.protected_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck size={11} style={{ color: "var(--color-healthy)" }} aria-hidden="true" />
                            <span className="metric">{p.protected_count}</span> held elsewhere
                          </span>
                        )}
                      </p>
                    )}
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
        </div>

        <div className="mt-7 lg:col-span-6 lg:mt-0">
        {/* ---- critical path ----------------------------------------------- */}
        <Reveal className="">
          <SectionHeader
            title="Critical path"
            hint="Blocked first, then whatever has been carried longest."
          />
          {critical.length === 0 ? (
            <GlassCard level={1}>
              <EmptyState
                icon={ShieldCheck}
                title="Nothing stuck"
                body="No blocked or repeatedly-carried work in this unit this week."
              />
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {critical.map((c) => (
                <li key={c.id}>
                  <GlassCard level={1} className="p-3.5">
                    <p className="text-sm leading-snug text-white/90">{c.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusChip status={c.status} />
                      {c.carry_depth > 1 && (
                        <span className="metric rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/60">
                          carried ×{c.carry_depth}
                        </span>
                      )}
                      {c.depends_on_department && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-2xs"
                          style={{
                            color: c.depends_on_color ?? "rgba(255,255,255,0.6)",
                            backgroundColor: `color-mix(in srgb, ${c.depends_on_color ?? "#888"} 14%, transparent)`,
                          }}
                        >
                          waiting on {c.depends_on_department}
                        </span>
                      )}
                      <span className="ml-auto text-2xs text-tertiary">{c.owner}</span>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
        </div>
      </div>
    </div>
  );
}
