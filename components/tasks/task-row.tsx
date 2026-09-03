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
        /*
         * TWO COLUMNS ON A PHONE, THREE FROM `sm`.
         *
         * The trailing group — carry figure, status badge, "Done", chevron —
         * is `shrink-0`, so in a three-column grid at 320px it took whatever
         * width it needed and the `1fr` holding the title was left with what
         * remained. Measured on the sweep: 52px. A task title reflowed into a
         * 52px column is a word per line, and the longest word overflows even
         * that.
         *
         * So below `sm` the controls drop to their own row under the title and
         * the title gets the full width of the card. Nothing is truncated and
         * nothing is hidden — the row is simply two lines tall on a phone,
         * which is what the content needs (see the note in working-on-card.tsx
         * on why a clamp is not an answer here).
         */
        "group relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--glass-fill-2)] px-3.5 py-3 text-left shadow-[var(--shadow-subtle)] sm:grid-cols-[auto_1fr_auto]",
        "transition-colors duration-150 hover:border-[var(--nx-border-strong)] hover:bg-[var(--glass-fill-3)] focus-within:border-[var(--nx-border-strong)]",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: rowAccent(c.status) }}
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={`${c.title} · ${statusShortLabel(c.status)}`}
        className="nx-focus-ring absolute inset-0 z-0 rounded-xl"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none relative z-[1] mt-[9px] ml-1 size-2.5 shrink-0 rounded-full"
        style={{ background: dotColor(c.status) }}
      />

      <span className="pointer-events-none relative z-[1] min-w-0">
        {/* Never clamped — see working-on-card.tsx for why two lines is not
            enough at 320px. */}
        <span className="block text-[15px] font-semibold leading-snug text-[var(--nx-text-primary)] sm:text-[16px]">
          {c.title}
        </span>
        {meta && (
          <span
            className={cn(
              "mt-1 flex items-center gap-2 truncate text-[12px] leading-snug sm:text-[13px]",
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
          <span className="mt-0.5 block truncate text-[12px] italic leading-snug text-[var(--nx-text-muted)]">
            &ldquo;{c.source_quote}&rdquo;
          </span>
        )}
        {trailing && (
          <span className="mt-1 block text-[12px] leading-snug text-[var(--nx-text-muted)]">
            {trailing}
          </span>
        )}
      </span>

      {/* Row 2 under the title on a phone; the third column from `sm`. */}
      <span className="relative z-[1] col-start-2 flex shrink-0 flex-wrap items-center gap-2.5 sm:col-auto sm:justify-end">
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

function rowAccent(status: string): string {
  if (status === "blocked") return "var(--color-blocked)";
  if (status === "in_progress" || status === "partial") return "var(--color-delivered)";
  return "transparent";
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
