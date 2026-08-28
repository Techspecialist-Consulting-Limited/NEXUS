import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/cn";

/*
 * A commitment status shown as a dot + label, never by colour alone
 * (visual-system.md: "never signal state by color alone").
 *
 * Two colours per status: `tone` paints the dot, `text` paints the label.
 * They differ for the muted statuses on purpose — --color-dropped is white at
 * 0.22 alpha, legible as a dot and unreadable as a word. The label always
 * maps the achromatic statuses to a readable text value.
 *
 * Labels use the short forms from ui-content.md's commitment state table
 * (Done, Partly, Going, Blocked, Moved, Dropped, To do, Replaced) — a task
 * list scans better with the short word than with the longer database label.
 */

const SHORT_LABEL: Record<string, string> = {
  delivered: "Done",
  partial: "Partly",
  in_progress: "Going",
  blocked: "Blocked",
  deferred: "Moved",
  dropped: "Dropped",
  promised: "To do",
  superseded: "Replaced",
};

const MUTED = new Set(["promised", "deferred", "dropped", "superseded"]);

/** The short, task-list label for a status (ui-content.md commitment states). */
export function statusShortLabel(status: string): string {
  return SHORT_LABEL[status] ?? statusMeta(status).label;
}

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = statusMeta(status);
  const isMuted = MUTED.has(status);
  const label = statusShortLabel(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-medium tracking-tight",
        size === "md" ? "text-xs" : "text-[11px]",
        className,
      )}
      style={{ color: isMuted ? "var(--text-secondary)" : meta.color }}
    >
      <span
        aria-hidden="true"
        className={cn("rounded-full", size === "md" ? "size-1.5" : "size-1")}
        style={{ background: meta.color }}
      />
      {label}
    </span>
  );
}
