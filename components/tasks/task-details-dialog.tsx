"use client";

import { Quote, Repeat2, ShieldCheck } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/tasks/status-badge";
import { cn } from "@/lib/cn";

/*
 * The on-demand detail for one commitment.
 *
 * The main Tasks page never shows all of this — it answers "what matters
 * now?" in one view. Everything else is here, opened only when a row is
 * pressed. Only fields the schema actually holds are rendered; nothing about
 * a commitment is invented (rejected-patterns.md #11).
 */

export function TaskDetailsDialog({
  commitment: c,
  open,
  onClose,
}: {
  commitment: CommitmentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!c) return null;

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (c.category) rows.push({ label: "Department", value: c.category });
  if (c.depends_on_department)
    rows.push({ label: "Waiting on", value: c.depends_on_department });
  if (c.priority && c.priority !== "none")
    rows.push({ label: "Priority", value: c.priority });
  rows.push({ label: "Planned", value: c.was_planned ? "Yes" : "No — unplanned" });
  if (c.estimated_effort_hours != null)
    rows.push({ label: "Estimated effort", value: `${c.estimated_effort_hours} hrs` });
  if (c.actual_effort_hours != null)
    rows.push({ label: "Actual effort", value: `${c.actual_effort_hours} hrs` });

  return (
    <Dialog open={open} onClose={onClose} labelledBy="task-detail-title">
      <div className="p-6">
        <p className="eyebrow">
          {c.status === "blocked" ? "Commitment · blocked" : "Commitment"}
        </p>
        <h2 id="task-detail-title" className="card-title mt-2 pr-8 text-lg">
          {c.title}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={c.status} />
          {c.carry_depth > 1 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-partial)]">
              <Repeat2 size={13} aria-hidden="true" />
              carried {c.carry_depth}×
            </span>
          )}
        </div>

        {c.status === "blocked" && (
          <p className={cn("mt-4 flex items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm")}>
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-[var(--color-blocked)]"
              aria-hidden="true"
            />
            <span className="leading-relaxed text-secondary">
              {c.depends_on_department
                ? `This is waiting on ${c.depends_on_department}. Work held up elsewhere is not counted against your delivery.`
                : "This is being held up. Work you cannot move is not counted against your delivery."}
            </span>
          </p>
        )}

        {rows.length > 0 && (
          <dl className="mt-5 divide-y divide-white/[0.06]">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-6 py-2.5">
                <dt className="text-[13px] text-[var(--nx-text-muted)]">{r.label}</dt>
                <dd className="text-right text-sm font-medium capitalize text-[var(--nx-text-primary)]">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {c.source_quote && (
          <blockquote className="mt-5 flex items-start gap-2 rounded-lg border-l-2 border-[var(--nx-primary)] bg-white/[0.03] p-3">
            <Quote size={14} className="mt-0.5 shrink-0 text-[var(--nx-text-muted)]" aria-hidden="true" />
            <p className="text-sm italic leading-relaxed text-[var(--nx-text-secondary)]">
              &ldquo;{c.source_quote}&rdquo;
            </p>
          </blockquote>
        )}
      </div>
    </Dialog>
  );
}
