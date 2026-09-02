"use client";

import type { ReactNode } from "react";
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
  }
  if (!c.was_planned) bits.push("unplanned");
  return bits.join(" · ");
}

export function TaskRow({
  commitment: c,
  onClick,
  showChevron = true,
  trailing = null,
  action = null,
}: {
  commitment: CommitmentRow;
  onClick: () => void;
  showChevron?: boolean;
  /**
   * A short fact about WHEN, under the metadata line. "for 24 Aug–30 Aug".
   *
   * Passed in rather than derived, because only the caller knows whether the
   * week is worth stating: on a list grouped by week it is already the
   * heading, and on a list of open work spanning weeks it is the fact that
   * stops a carried promise reading as one made today.
   */
  trailing?: string | null;
  /**
   * A control rendered at the row's trailing edge — "mark as done".
   *
   * Passed in rather than built here because only the caller knows whether
   * this list is somebody's own work to move or a record they are reading.
   */
  action?: ReactNode;
}) {
  const meta = metaLine(c);

  /*
   * THE WHOLE ROW OPENS THE TASK, AND A CONTROL CAN STILL SIT ON IT.
   *
   * This was a single <button> wrapping everything, which made the entire row
   * one target — good — and made a second button inside it invalid HTML, which
   * is the one thing standing between this list and a "done" control.
   *
   * So the shell is a div, the row-wide target is an absolutely positioned
   * button beneath the content, and anything interactive sits above it on
   * `relative`. Same click area, same keyboard behaviour, and actions are now
   * possible. The content itself is pointer-events-none so text selection does
   * not swallow the row click.
   */
  return (
    <div
      data-blocked-row={c.status === "blocked" ? "true" : undefined}
      className={cn(
        "group relative grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-left",
        "transition-colors duration-150 hover:border-white/[0.14] hover:bg-white/[0.05] focus-within:border-white/[0.18]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`${c.title} · ${statusShortLabel(c.status)}`}
        className="nx-focus-ring absolute inset-0 z-0 rounded-xl"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none relative z-[1] mt-[7px] size-2 shrink-0 rounded-full"
        style={{ background: dotColor(c.status) }}
      />

      <span className="pointer-events-none relative z-[1] min-w-0">
        {/* Never clamped — see working-on-card.tsx for why two lines is not
            enough at 320px. */}
        <span className="block text-[15px] font-semibold leading-snug text-[var(--nx-text-primary)]">
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
        {trailing && (
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--nx-text-muted)]">
            {trailing}
          </span>
        )}
      </span>

      <span className="relative z-[1] flex shrink-0 items-center gap-2.5">
        {/*
          CARRY IS THE LOUDEST THING ON A CARRIED ROW.

          It was an 11px line reading "carried 3×", set under the metadata and
          smaller than everything around it — and it was also in `metaLine`
          above, so the same fact appeared twice on the rows that had it.

          How long a promise has gone without moving is the most consequential
          thing this product knows, and it is the one figure a weekly rhythm
          is structurally bad at surfacing: each week on its own looks like a
          small slip, and only the count says otherwise. It gets the row's
          right edge, in the figure face, and it grows heavier the longer it
          runs.

          A fact about work. Never about a person — rejected-patterns.md #9.
        */}
        {c.carry_depth > 1 && (
          <span
            title={`Open for ${c.carry_depth} weeks`}
            className={cn(
              "metric inline-flex items-center gap-1 tabular-nums",
              c.carry_depth >= 6
                ? "text-[15px] font-semibold text-[var(--color-blocked)]"
                : c.carry_depth >= 3
                  ? "text-[14px] font-medium text-[var(--color-partial)]"
                  : "text-[13px] text-[var(--nx-text-secondary)]",
            )}
          >
            <Repeat2 size={13} aria-hidden="true" className="shrink-0 opacity-70" />
            {c.carry_depth}w
          </span>
        )}
        <StatusBadge status={c.status} size="sm" />
        {action}
        {showChevron && (
          <ChevronRight
            size={15}
            className="pointer-events-none text-[var(--nx-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--nx-text-secondary)]"
            aria-hidden="true"
          />
        )}
      </span>
    </div>
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
