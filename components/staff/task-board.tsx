"use client";

import Link from "next/link";

import { m } from "motion/react";
import { CornerDownRight, Quote, Repeat2, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekLabel } from "@/lib/cycle";
import type { Cycle, CommitmentRow } from "@/lib/queries";

/*
 * Tasks — everything this person has committed to, week by week.
 *
 * The current week first and open work at the top of it, because that is the
 * only part anybody can still act on. Older weeks are history, and history is
 * for checking, not for scanning.
 *
 * EVERY ROW CAN SHOW THE SENTENCE IT CAME FROM. A commitment here was
 * extracted from something the person actually wrote, and `source_quote` is a
 * verbatim slice of it. Being able to see that is what makes this a record of
 * what you said rather than a list somebody made about you — and it is the
 * difference between disputing a mis-extraction and being told you are wrong.
 */

/*
 * Two colours per status, because a dot and a word have different jobs.
 *
 * `tone` paints the dot. `text` paints the label. They differ for the muted
 * statuses on purpose: --color-dropped is white at 0.22 alpha, which is
 * legible as a 6px dot and completely unreadable as a word. Rendering the
 * label in the dot's colour put "Dropped" at roughly 2:1 against the surface
 * — below every contrast floor there is, on the one status a person most
 * needs to notice about their own week.
 */
const STATUS = {
  delivered: { label: "Done", tone: "var(--color-delivered)", text: "var(--color-delivered)" },
  partial: { label: "Partly", tone: "var(--color-partial)", text: "var(--color-partial)" },
  in_progress: { label: "Going", tone: "var(--color-in-progress)", text: "var(--color-in-progress)" },
  blocked: { label: "Blocked", tone: "var(--color-blocked)", text: "var(--color-blocked)" },
  deferred: { label: "Moved", tone: "var(--color-deferred)", text: "var(--text-secondary)" },
  dropped: { label: "Dropped", tone: "var(--color-dropped)", text: "var(--text-secondary)" },
  promised: { label: "To do", tone: "var(--color-promised)", text: "var(--text-secondary)" },
  superseded: { label: "Replaced", tone: "var(--color-superseded)", text: "var(--text-secondary)" },
} as const;

const OPEN = new Set(["promised", "in_progress", "partial", "blocked"]);

function statusOf(s: string) {
  return STATUS[s as keyof typeof STATUS] ?? STATUS.promised;
}

export function TaskBoard({
  weeks,
}: {
  weeks: { cycle: Cycle; commitments: CommitmentRow[] }[];
}) {
  const all = weeks.flatMap((w) => w.commitments);
  const open = all.filter((c) => OPEN.has(c.status)).length;
  const protectedCount = all.filter((c) => c.status === "blocked").length;
  const current = weeks[0];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Tasks"
        cycleLabel={current ? weekLabel(current.cycle.label) : "—"}
        standfirst={
          all.length === 0 ? (
            "You haven't given an update for this reporting week yet."
          ) : (
            <>
              {open} {open === 1 ? "commitment is" : "commitments are"} still open across{" "}
              {weeks.length} {weeks.length === 1 ? "week" : "weeks"}. Everything here came
              from something you wrote.
            </>
          )
        }
      />

      {weeks.length === 0 ? (
        /*
          An empty state has to say what is empty, why, and what to do about
          it. "No commitments on record yet" managed only the first, and gave
          somebody who had just filed a report nothing to check against.
        */
        <GlassCard level={2} className="p-8">
          <div className="mx-auto max-w-md text-center">
            <p className="text-sm text-white/85">
              Nothing here yet — you have not given an update for this
              reporting week.
            </p>
            <p className="note mt-2">
              Whatever you say you are working on becomes the list on this
              page, alongside the sentence it came from.
            </p>
            <Link
              href="/check-in"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg
                         bg-[var(--dept-techspecialist)] px-4 text-sm font-medium
                         text-white transition-opacity hover:opacity-90"
            >
              Give an update
            </Link>
          </div>
        </GlassCard>
      ) : (
        weeks.map(({ cycle, commitments }, wi) => {
          /* Open work first: it is the only part still worth doing something about. */
          const ordered = [...commitments].sort((a, b) => {
            const ao = OPEN.has(a.status) ? 0 : 1;
            const bo = OPEN.has(b.status) ? 0 : 1;
            return ao - bo || a.title.localeCompare(b.title);
          });

          return (
            <m.div
              key={cycle.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: Math.min(wi, 4) * 0.04, ease: [0.32, 0.72, 0, 1] }}
            >
              <GlassCard level={2} className="p-4 md:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium tracking-tight text-white/90">
                    {cycle.label}
                  </h2>
                  <span className="metric text-xs text-white/30">
                    {commitments.filter((c) => c.status === "delivered").length}/
                    {commitments.length} delivered
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {ordered.map((c) => {
                    const s = statusOf(c.status);
                    return (
                      <li
                        key={c.id}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className="mt-[7px] size-2 shrink-0 rounded-full"
                            style={{ background: s.tone }}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <p className="min-w-0 text-sm leading-snug text-white/90">
                                {c.title}
                              </p>
                              {/* Plain, right-aligned. The dot carries the colour. */}
                              <span
                                className="shrink-0 text-2xs"
                                style={{ color: s.text }}
                              >
                                {s.label}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
                              {c.category && (
                                <span className="capitalize text-white/35">{c.category}</span>
                              )}

                              {c.carry_depth > 1 && (
                                <span className="inline-flex items-center gap-1 text-[var(--color-partial)]">
                                  <Repeat2 size={11} aria-hidden="true" />
                                  carried {c.carry_depth}×
                                </span>
                              )}

                              {/*
                                Blocked work is EXCLUDED from the delivery
                                denominator, and saying so on the row is the
                                point. Somebody looking at a red dot beside
                                their own name needs to know it is not counted
                                against them, or they stop declaring
                                dependencies at all.
                              */}
                              {c.status === "blocked" && (
                                <span className="inline-flex items-center gap-1 text-[var(--color-healthy)]">
                                  <ShieldCheck size={11} aria-hidden="true" />
                                  not counted against you
                                  {c.depends_on_department && ` · waiting on ${c.depends_on_department}`}
                                </span>
                              )}

                              {!c.was_planned && (
                                <span className="text-white/35">unplanned</span>
                              )}
                            </div>

                            {c.source_quote && (
                              <p className="mt-1.5 flex items-start gap-1.5 text-2xs italic leading-snug text-white/30">
                                <Quote size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span className="min-w-0">{c.source_quote}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </GlassCard>
            </m.div>
          );
        })
      )}

      {protectedCount > 0 && (
        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-tertiary">
          <CornerDownRight
            size={14}
            className="mt-px shrink-0 text-[var(--color-healthy)]"
            aria-hidden="true"
          />
          <span>
            {protectedCount} of these {protectedCount === 1 ? "is" : "are"} waiting on
            another team. Work held up elsewhere never counts against your delivery.
          </span>
        </p>
      )}
    </div>
  );
}
