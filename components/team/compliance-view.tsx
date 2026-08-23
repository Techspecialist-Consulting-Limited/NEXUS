"use client";

import { m } from "motion/react";
import { CheckCircle2, Clock, CircleDashed, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer, staggerItem, heroItem } from "@/lib/motion-tokens";
import { weekCode, weekRange } from "@/lib/cycle";
import type { ComplianceRow } from "@/lib/team";

/*
 * HR's screen — PRD F18.
 *
 * Ordered by who still needs chasing, because that is the only action this
 * page supports. People who reported on time sit at the bottom and are not
 * the point.
 *
 * There is deliberately no way to read what anybody wrote. The view behind
 * this page (migration 0009) returns the envelope only, so the interface could
 * not show it even if a future change asked it to.
 */
export function ComplianceView({
  cycleLabel,
  rows,
}: {
  cycleLabel: string;
  rows: ComplianceRow[];
}) {
  const missing = rows.filter((r) => !r.submitted);
  const late = rows.filter((r) => r.submitted && r.late);
  const onTime = rows.filter((r) => r.submitted && !r.late);
  const rate = rows.length ? Math.round((rows.length - missing.length) * 100 / rows.length) : null;

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Reporting</h1>
          <p className="mt-0.5 text-xs text-tertiary">{weekRange(cycleLabel)}</p>
        </div>
        <span className="metric shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/70">
          {weekCode(cycleLabel)}
        </span>
      </div>

      <m.div variants={staggerContainer} initial="hidden" animate="visible" className="mt-4">
        <m.div variants={heroItem}>
          <GlassCard level={2} className="p-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="text-xs text-tertiary">Submitted</p>
                <p
                  className="metric mt-1 text-[2.5rem] font-medium leading-none"
                  style={{
                    color:
                      rate === null
                        ? "var(--color-neutral)"
                        : rate >= 90
                          ? "var(--color-healthy)"
                          : rate >= 70
                            ? "var(--color-warning)"
                            : "var(--color-critical)",
                  }}
                >
                  {rate === null ? "—" : rate}
                  <span className="text-2xl text-white/40">%</span>
                </p>
              </div>
              <div className="ml-auto grid grid-cols-3 gap-5 text-right">
                <Figure label="On time" value={onTime.length} tone="var(--color-healthy)" />
                <Figure label="Late" value={late.length} tone="var(--color-warning)" />
                <Figure label="Missing" value={missing.length} tone="var(--color-critical)" />
              </div>
            </div>

            <p className="mt-5 border-t border-white/[0.07] pt-4 text-2xs leading-relaxed text-tertiary">
              This page shows whether a report arrived, not what it said. Nobody
              here — including you — can read another person&rsquo;s check-in
              text; that is what keeps the reports honest enough to be worth
              chasing.
            </p>
          </GlassCard>
        </m.div>
      </m.div>

      {missing.length > 0 && (
        <Group
          title="Not submitted"
          hint="Worth a nudge before the deadline passes."
          icon={CircleDashed}
          tone="var(--color-critical)"
          rows={missing}
        />
      )}

      {late.length > 0 && (
        <Group
          title="Submitted late"
          hint="Accepted and recorded — late is flagged, never blocked."
          icon={Clock}
          tone="var(--color-warning)"
          rows={late}
        />
      )}

      {onTime.length > 0 && (
        <Group
          title="On time"
          hint={`${onTime.length} of ${rows.length}`}
          icon={CheckCircle2}
          tone="var(--color-healthy)"
          rows={onTime}
        />
      )}

      {rows.length === 0 && (
        <GlassCard level={1} className="mt-5">
          <EmptyState
            icon={ShieldCheck}
            title="Nobody is due to report yet"
            body="Team members and unit leads appear here once they are placed in the organisation."
          />
        </GlassCard>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="text-2xs text-tertiary">{label}</p>
      <p className="metric mt-0.5 text-xl leading-none" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}

function Group({
  title,
  hint,
  icon: Icon,
  tone,
  rows,
}: {
  title: string;
  hint: string;
  icon: typeof CheckCircle2;
  tone: string;
  rows: ComplianceRow[];
}) {
  return (
    <section className="mt-7">
      <SectionHeader title={title} hint={hint} />
      <m.ul
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        {rows.map((r) => (
          <m.li key={r.profile_id} variants={staggerItem}>
            <GlassCard level={1} className="p-3.5">
              <div className="flex items-center gap-3">
                <Icon size={15} style={{ color: tone }} className="shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/90">{r.full_name}</p>
                  <p className="truncate text-2xs text-tertiary">
                    {r.department_name ?? "No unit"}
                    {r.responded_at
                      ? ` · reported ${new Date(r.responded_at).toLocaleDateString(undefined, {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                </div>
                {r.submitted && (
                  <span className="metric shrink-0 text-2xs text-white/35">
                    {r.characters_written} chars
                  </span>
                )}
              </div>
            </GlassCard>
          </m.li>
        ))}
      </m.ul>
    </section>
  );
}
