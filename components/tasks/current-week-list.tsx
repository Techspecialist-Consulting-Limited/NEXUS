"use client";

import { CheckCircle2 } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";
import { weekLabel } from "@/lib/cycle";
import { TaskRow } from "@/components/tasks/task-row";

/*
 * The current week — the dominant content on the Tasks page.
 *
 * One panel, a thin delimiter bar (not a nested card): "THIS WEEK", the date
 * range, and a quiet delivered count. Its rows are clean, scannable task rows
 * that open details on demand. The list scrolls inside its own container if
 * the week is long, so the page does not.
 */

const OPEN = new Set(["promised", "in_progress", "partial", "blocked"]);

export function CurrentWeekList({
  label,
  commitments,
  onOpen,
}: {
  label: string;
  commitments: CommitmentRow[];
  onOpen: (c: CommitmentRow) => void;
}) {
  const ordered = [...commitments].sort((a, b) => {
    const ao = OPEN.has(a.status) ? 0 : 1;
    const bo = OPEN.has(b.status) ? 0 : 1;
    return ao - bo || a.title.localeCompare(b.title);
  });
  const delivered = commitments.filter((c) => c.status === "delivered").length;

  return (
    <section
      aria-label="Current week"
      className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.08] bg-[var(--nx-surface)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div className="min-w-0">
          <p className="eyebrow">This week</p>
          <p className="truncate text-[15px] font-semibold tracking-tight text-[var(--nx-text-primary)]">
            {weekLabel(label)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs text-[var(--nx-text-secondary)]">
          <CheckCircle2 size={13} className="text-[var(--color-delivered)]" aria-hidden="true" />
          {delivered} of {commitments.length} delivered
        </span>
      </header>

      {commitments.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--nx-text-primary)]">
            No commitments yet
          </p>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
            Your weekly commitments will appear here once you give an update.
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5">
          {ordered.map((c) => (
            <li key={c.id} className="shrink-0">
              <TaskRow commitment={c} onClick={() => onOpen(c)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
