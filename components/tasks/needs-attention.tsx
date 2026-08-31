"use client";

import { ArrowRight, Ban, CheckCircle2 } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";
import { cn } from "@/lib/cn";

/*
 * "Needs attention" — the small, honest assistant panel beside the current
 * week. It surfaces only genuinely important items: blocked commitments and,
 * where one exists, a long-running carried piece. When nothing is blocked it
 * says so plainly rather than manufacturing a concern (rejected-patterns.md
 * #15). It is a subtle panel, not another dashboard card.
 */

export function NeedsAttention({
  blocked,
  onOpen,
  onViewAll,
}: {
  blocked: CommitmentRow[];
  onOpen: (c: CommitmentRow) => void;
  onViewAll: () => void;
}) {
  const count = blocked.length;
  const allClear = count === 0;

  return (
    <section
      aria-label="Needs attention"
      className={cn(
        // `on-dark`: painted from --nx-bg, not a card class. See globals.css.
        "on-dark flex min-h-0 flex-col rounded-2xl border bg-[var(--nx-bg)]",
        allClear
          ? "border-white/[0.08]"
          : "border-[var(--color-blocked)]/30",
      )}
      style={
        !allClear
          ? { boxShadow: "0 0 0 1px rgba(242,120,159,0.06), 0 20px 60px rgba(242,120,159,0.08)" }
          : undefined
      }
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        {allClear ? (
          <CheckCircle2 size={16} className="text-[var(--color-healthy)]" aria-hidden="true" />
        ) : (
          <Ban size={16} className="text-[var(--color-blocked)]" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold tracking-tight text-[var(--nx-text-primary)]">
          Needs attention
        </h2>
      </header>

      {allClear ? (
        <div className="flex flex-1 flex-col justify-center px-4 pb-4">
          <p className="text-sm font-medium text-[var(--nx-text-primary)]">All clear</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
            Nothing currently needs your attention.
          </p>
        </div>
      ) : (
        <>
          <p className="px-4 text-[13px] leading-snug text-[var(--nx-text-secondary)]">
            {count} {count === 1 ? "commitment is" : "commitments are"} blocked this week.
          </p>
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-2.5">
            {blocked.slice(0, 4).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="group w-full rounded-lg border border-[var(--color-blocked)]/25 bg-[var(--color-blocked)]/[0.06] px-3 py-2 text-left transition-colors duration-150 hover:border-[var(--color-blocked)]/45 hover:bg-[var(--color-blocked)]/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                >
                  <span className="block truncate text-[13px] font-semibold text-[var(--nx-text-primary)]">
                    {c.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--color-blocked)]">
                    {c.depends_on_department
                      ? `Waiting on ${c.depends_on_department}`
                      : "Blocked"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {blocked.length > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 border-t border-white/[0.06] px-4 py-2.5 text-[13px] font-medium text-[var(--nx-text-secondary)] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            >
              View blocked items
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </section>
  );
}
