import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Clock,
  Ban,
  PieChart,
  type LucideIcon,
} from "lucide-react";

/*
 * One description of every commitment status, used everywhere.
 *
 * Each carries a hue, a fill pattern and an icon. GUIDE §5's status palette is
 * byte-identical to its department palette — delivered #48C9A9 is also
 * Operations — so hue alone cannot be trusted to say which is meant. Pattern
 * and icon carry the meaning; hue reinforces it. This is also what keeps the
 * three near-identical whites (promised/deferred/dropped) apart at ribbon size
 * on a phone, and what satisfies "never by colour alone" in GUIDE §17.
 *
 * Mirrors the commitment_status enum in migration 0003 exactly, superseded
 * included.
 */

export type CommitmentStatus =
  | "promised"
  | "in_progress"
  | "delivered"
  | "partial"
  | "deferred"
  | "blocked"
  | "dropped"
  | "superseded";

export type StatusMeta = {
  label: string;
  /** Plain-language gloss shown in tooltips and legends. */
  gloss: string;
  icon: LucideIcon;
  /** CSS custom property holding the hue. Paints the dot/fill — the "tone". */
  color: string;
  /**
   * The label's own colour — see visual-system.md's status section.
   * `promised`/`deferred`/`dropped`/`superseded` are ink at low alpha: a
   * legible dot, an unreadable word. `blocked`'s dot is the hottest mark in
   * the palette and fails contrast as text, so its label borrows
   * `--color-critical` instead — the same deeper hue, already named for
   * exactly this. Every other status is already a real hue and reads fine as
   * its own text.
   */
  text: string;
  /** Class from globals.css carrying the fill pattern. */
  fill: string;
};

export const STATUS: Record<CommitmentStatus, StatusMeta> = {
  promised: {
    label: "Promised",
    gloss: "Committed to, not started yet",
    icon: CircleDashed,
    color: "var(--color-promised)",
    text: "var(--text-secondary)",
    fill: "status-promised",
  },
  in_progress: {
    label: "In progress",
    gloss: "Actively being worked on",
    icon: CircleDot,
    color: "var(--color-in-progress)",
    text: "var(--color-in-progress)",
    fill: "status-in_progress",
  },
  delivered: {
    label: "Delivered",
    gloss: "Delivered in full",
    icon: CheckCircle2,
    color: "var(--color-delivered)",
    text: "var(--color-delivered)",
    fill: "status-delivered",
  },
  partial: {
    label: "Partial",
    gloss: "Some of it landed",
    icon: PieChart,
    color: "var(--color-partial)",
    text: "var(--color-partial)",
    fill: "status-partial",
  },
  deferred: {
    label: "Deferred",
    gloss: "Consciously moved to a later week",
    icon: Clock,
    color: "var(--color-deferred)",
    text: "var(--text-secondary)",
    fill: "status-deferred",
  },
  blocked: {
    label: "Blocked",
    gloss: "Cannot proceed — waiting on someone",
    icon: Ban,
    color: "var(--color-blocked)",
    text: "var(--color-critical)",
    fill: "status-blocked",
  },
  dropped: {
    label: "Dropped",
    gloss: "Abandoned",
    icon: CircleSlash,
    color: "var(--color-dropped)",
    text: "var(--text-secondary)",
    fill: "status-dropped",
  },
  superseded: {
    label: "Superseded",
    gloss: "Replaced by a different commitment",
    icon: CircleSlash,
    color: "var(--color-superseded)",
    text: "var(--text-secondary)",
    fill: "status-superseded",
  },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS[status as CommitmentStatus] ?? STATUS.promised;
}

/** Health banding for a 0-100 rate. Used for signal colour, never for ranking people. */
export function healthTone(value: number | null): string {
  if (value === null) return "var(--color-neutral)";
  if (value >= 80) return "var(--color-healthy)";
  if (value >= 60) return "var(--color-warning)";
  return "var(--color-critical)";
}
