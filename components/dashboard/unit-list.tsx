"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import { healthTone } from "@/lib/status";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";
import type { DepartmentHealth } from "@/lib/queries";
import { unitTone, unitWash } from "@/lib/unit-tone";

/**
 * The unit strip.
 *
 * Two shapes from one component, because it serves two jobs.
 *
 *   rail    a narrow column beside the Chairman's decisions. Stays one card
 *           wide at every width and stays terse: it is peripheral vision.
 *   grid    the Units page, where this IS the content. Fills the width —
 *           1 / 2 / 3 columns — and carries the secondary figures, because a
 *           1100px card holding a name and a percentage reads as an
 *           unfinished page rather than a calm one.
 */
export function UnitList({
  departments,
  variant = "rail",
}: {
  departments: DepartmentHealth[];
  variant?: "rail" | "grid";
}) {
  const grid = variant === "grid";

  return (
    <m.ul
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={cn(
        grid ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2",
      )}
    >
      {departments.map((d) => (
        <m.li key={d.department_id} variants={staggerItem}>
          <Link href={`/departments/${d.department_id}`} className="block h-full">
            <GlassCard
              level={1}
              className={cn(
                "h-full transition-colors hover:bg-white/[0.07]",
                grid ? "p-4" : "p-3.5",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: unitTone(d.department_id),
                    boxShadow: `0 0 10px 0 ${unitWash(d.department_id, 38)}`,
                  }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-medium text-white/90",
                    grid ? "text-base" : "text-sm",
                  )}
                >
                  {d.department_name}
                </span>
                <span
                  className={cn("metric shrink-0", grid ? "text-lg" : "text-sm")}
                  style={{ color: healthTone(d.delivery_rate) }}
                >
                  {d.delivery_rate === null ? "—" : `${Math.round(d.delivery_rate)}%`}
                </span>
                <ArrowRight size={14} className="shrink-0 text-white/25" aria-hidden="true" />
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <m.span
                    className="block h-full rounded-full"
                    style={{ backgroundColor: healthTone(d.delivery_rate), originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: (d.delivery_rate ?? 0) / 100 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
                <span className="metric w-16 shrink-0 text-right text-2xs text-white/45">
                  {d.people_responded}/{d.people_reporting} in
                </span>
              </div>

              {/*
                The grid has room for the second and third numbers; the rail
                does not, and padding them in would make it compete with the
                decisions beside it.
              */}
              {grid && (
                <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3">
                  <Stat
                    label="Signal"
                    value={d.signal_integrity === null ? "—" : `${Math.round(d.signal_integrity)}%`}
                    tone={healthTone(d.signal_integrity)}
                  />
                  <Stat
                    label="Focus"
                    value={d.focus_ratio === null ? "—" : `${Math.round(d.focus_ratio)}%`}
                    tone="var(--text-secondary)"
                  />
                  <Stat
                    label="Carried"
                    value={String(d.carryover_count)}
                    tone={d.carryover_count > 0 ? "var(--color-warning)" : "var(--text-secondary)"}
                  />
                </dl>
              )}

              {(d.silent_drop_count > 0 || d.protected_count > 0 || (grid && d.unplanned_count > 0)) && (
                <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-tertiary">
                  {d.silent_drop_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <TriangleAlert size={11} style={{ color: "var(--color-critical)" }} aria-hidden="true" />
                      <span className="metric">{d.silent_drop_count}</span> went quiet
                    </span>
                  )}
                  {d.protected_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={11} style={{ color: "var(--color-healthy)" }} aria-hidden="true" />
                      <span className="metric">{d.protected_count}</span> held elsewhere
                    </span>
                  )}
                  {grid && d.unplanned_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Zap size={11} style={{ color: "var(--color-warning)" }} aria-hidden="true" />
                      <span className="metric">{d.unplanned_count}</span> unplanned
                    </span>
                  )}
                </p>
              )}
            </GlassCard>
          </Link>
        </m.li>
      ))}
    </m.ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-white/35">{label}</dt>
      <dd className="metric mt-0.5 text-sm" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}
