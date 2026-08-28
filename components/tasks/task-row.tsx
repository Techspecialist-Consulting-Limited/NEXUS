"use client";

import { ChevronRight, Repeat2, ShieldCheck } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { StatusBadge, statusShortLabel } from "@/components/tasks/status-badge";

/*
 * One commitment as a scannable workspace row.
 *
 * Horizontal rhythm, not a nested card: the title is the strongest thing, the
 * metadata is secondary, and the status on the right answers "where is this?"
 * without reading a word of the middle. The whole row is one interactive
 * target that opens the commitment details (card-nesting exception documented
 * in rejected-patterns.md — a row that navigates is a distinct target, not a
 * card inside a card).
 */

function metaLine(c: CommitmentRow) {
  const bits: string[] = [];
  if (c.category) bits.push(c.category);
  if (c.status === "blocked" && c.depends_on_department) {
    bits.push(`waiting on ${c.depends_on_department}`);
  } else if (c.carry_depth > 1) {
    bits.push(`carried ${c.carry_depth}×`);
  }
  if (!c.was_planned) bits.push("unplanned");
  return bits.join(" · ");
}

export function TaskRow({
  commitment: c,
  onClick,
  showChevron = true,
}: {
  commitment: CommitmentRow;
  onClick: () => void;
  showChevron?: boolean;
}) {
  const meta = metaLine(c);

  return (
    <button
      type="button"
      onClick={onClick}
      data-blocked-row={c.status === "blocked" ? "true" : undefined}
      aria-label={`${c.title} · ${statusShortLabel(c.status)}`}
      className={cn(
        "group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-left",
        "transition-colors duration-150 hover:border-white/[0.14] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 size-2 shrink-0 rounded-full"
        style={{ background: dotColor(c.status) }}
      />

      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-snug text-[var(--nx-text-primary)]">
          {c.title}
        </span>
        {meta && (
          <span
            className={cn(
              "mt-0.5 flex items-center gap-2 truncate text-[13px] leading-snug",
              c.status === "blocked"
                ? "text-[var(--color-blocked)]"
                : "text-[var(--nx-text-secondary)]",
            )}
          >
            {c.status === "blocked" && !c.depends_on_department ? (
              <ShieldCheck size={13} className="shrink-0" aria-hidden="true" />
            ) : null}
            <span className="truncate">{meta}</span>
          </span>
        )}
        {c.status === "blocked" && c.source_quote && (
          <span className="mt-0.5 block truncate text-[12px] italic leading-snug text-[var(--text-tertiary)]">
            &ldquo;{c.source_quote}&rdquo;
          </span>
        )}
        {c.carry_depth > 1 && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-partial)]">
            <Repeat2 size={12} aria-hidden="true" />
            carried {c.carry_depth}×
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <StatusBadge status={c.status} size="sm" />
        {showChevron && (
          <ChevronRight
            size={15}
            className="text-[var(--nx-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--nx-text-secondary)]"
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
}

function dotColor(status: string): string {
  const map: Record<string, string> = {
    delivered: "var(--color-delivered)",
    partial: "var(--color-partial)",
    in_progress: "var(--color-in-progress)",
    blocked: "var(--color-blocked)",
    deferred: "var(--color-deferred)",
    dropped: "var(--color-dropped)",
    promised: "var(--color-promised)",
    superseded: "var(--color-superseded)",
  };
  return map[status] ?? "var(--color-promised)";
}
