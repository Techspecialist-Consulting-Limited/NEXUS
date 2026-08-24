"use client";

import { m } from "motion/react";
import { ListTodo, MessageSquareQuote } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { statusMeta } from "@/lib/status";
import { weekLabel } from "@/lib/cycle";
import type { CommitmentRow, Cycle } from "@/lib/queries";

/** Every commitment, newest week first, each with the sentence it came from. */
export function CommitmentList({
  weeks,
}: {
  weeks: { cycle: Cycle; commitments: CommitmentRow[] }[];
}) {
  return (
    <div className="mx-auto max-w-2xl pt-2">
      <h1 className="text-2xl font-medium tracking-tight">My commitments</h1>
      <p className="mt-0.5 text-xs text-tertiary">
        Picked up from your own words — never typed into a form.
      </p>

      {weeks.length === 0 ? (
        <GlassCard level={1} className="mt-4">
          <EmptyState
            icon={ListTodo}
            title="Nothing recorded yet"
            body="Once you check in, whatever you commit to appears here alongside the sentence it came from."
          />
        </GlassCard>
      ) : (
        <div className="mt-5 space-y-7">
          {weeks.map(({ cycle, commitments }) => (
            <section key={cycle.id}>
              <SectionHeader
                title={weekLabel(cycle.label)}
                hint={`${commitments.length} ${commitments.length === 1 ? "item" : "items"}`}
              />
              <m.ul
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-2"
              >
                {commitments.map((c) => (
                  <m.li key={c.id} variants={staggerItem}>
                    <GlassCard level={1} className="p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-white/90">{c.title}</p>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <StatusChip status={c.status} />
                            {c.carry_depth > 1 && (
                              <span className="metric rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/60">
                                carried ×{c.carry_depth}
                              </span>
                            )}
                            {!c.was_planned && (
                              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/60">
                                unplanned
                              </span>
                            )}
                            {c.depends_on_department && (
                              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/60">
                                waiting on {c.depends_on_department}
                              </span>
                            )}
                          </div>

                          {c.source_quote && (
                            <p className="mt-2.5 flex gap-1.5 text-2xs italic leading-snug text-tertiary">
                              <MessageSquareQuote
                                size={12}
                                className="mt-px shrink-0"
                                aria-hidden="true"
                              />
                              <span className="min-w-0">
                                &ldquo;{c.source_quote}&rdquo;
                              </span>
                            </p>
                          )}
                        </div>

                        <span
                          aria-hidden="true"
                          className={`mt-1 h-8 w-1 shrink-0 rounded-full ${statusMeta(c.status).fill}`}
                        />
                      </div>
                    </GlassCard>
                  </m.li>
                ))}
              </m.ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
