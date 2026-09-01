"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Clock } from "lucide-react";
import type { Cycle, CommitmentRow } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/tasks/status-badge";

/*
 * Previous weeks — history, summarised.
 *
 * The old page showed every historical week as another full card full of
 * tasks, which is why it became a long archive. Here an older week is one
 * compact row: its dates and a quiet delivered count. Pressing a row opens a
 * dialog with that week's commitments, so history stays reachable without
 * consuming the one-view workspace.
 */

type Week = { cycle: Cycle; commitments: CommitmentRow[] };

export function PreviousWeeks({
  weeks,
  onOpenCommitment,
}: {
  weeks: Week[];
  onOpenCommitment: (c: CommitmentRow) => void;
}) {
  const [open, setOpen] = useState<Week | null>(null);

  const ordered = useMemo(
    () => [...weeks].sort((a, b) => (b.cycle.starts_on > a.cycle.starts_on ? 1 : -1)),
    [weeks],
  );

  if (weeks.length === 0) return null;

  return (
    <section aria-label="Previous weeks" className="shrink-0">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <h2 className="card-title text-[var(--nx-text-primary)]">The record</h2>
        <span className="text-xs text-[var(--nx-text-muted)]">
          <span className="metric">{ordered.length}</span>{" "}
          {ordered.length === 1 ? "week" : "weeks"}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {ordered.map((w) => {
          const delivered = w.commitments.filter((c) => c.status === "delivered").length;
          const total = w.commitments.length;
          const pct = total === 0 ? 0 : delivered / total;
          return (
            <li key={w.cycle.id}>
              <button
                type="button"
                onClick={() => setOpen(w)}
                className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2 text-left transition-colors duration-150 hover:border-white/[0.13] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              >
                <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--nx-text-primary)]">
                  <Clock size={15} className="shrink-0 text-[var(--nx-text-muted)]" aria-hidden="true" />
                  <span className="truncate">{weekLabel(w.cycle.label)}</span>
                </span>

                <span className="flex min-w-0 shrink-0 items-center gap-3">
                  <span className="hidden items-center gap-2 sm:flex">
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(pct * 100, delivered > 0 ? 6 : 0)}%`,
                          background: "var(--color-delivered)",
                        }}
                      />
                    </span>
                    <span className="metric text-xs text-[var(--nx-text-secondary)]">
                      {delivered}/{total} delivered
                    </span>
                  </span>
                  <ChevronRight
                    size={15}
                    className="text-[var(--nx-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--nx-text-secondary)]"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open && (
        <WeekDetailsDialog
          week={open}
          onClose={() => setOpen(null)}
          onOpenCommitment={onOpenCommitment}
        />
      )}
    </section>
  );
}

function WeekDetailsDialog({
  week,
  onClose,
  onOpenCommitment,
}: {
  week: Week;
  onClose: () => void;
  onOpenCommitment: (c: CommitmentRow) => void;
}) {
  const delivered = week.commitments.filter((c) => c.status === "delivered").length;

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="week-detail-title"
      closeLabel="Close previous week"
    >
      <div className="p-6">
        <p className="eyebrow">Previous week</p>
        <div className="mt-2 flex items-baseline justify-between gap-4 pr-8">
          <h2 id="week-detail-title" className="card-title text-lg">
            {weekLabel(week.cycle.label)}
          </h2>
          <span className="metric shrink-0 text-sm text-[var(--nx-text-secondary)]">
            {delivered} of {week.commitments.length} delivered
          </span>
        </div>

        {week.commitments.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--nx-text-muted)]">
            Nothing on record for this week.
          </p>
        ) : (
          <ul className="mt-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1">
            {week.commitments.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenCommitment(c)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-white/[0.13] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-[var(--nx-text-primary)]">
                    {c.title}
                  </span>
                  <StatusBadge status={c.status} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
