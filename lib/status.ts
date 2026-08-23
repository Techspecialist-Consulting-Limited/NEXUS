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
  /** CSS custom property holding the hue. */
  color: string;
  /** Class from globals.css carrying the fill pattern. */
  fill: string;
};

export const STATUS: Record<CommitmentStatus, StatusMeta> = {
  promised: {
    label: "Promised",
    gloss: "Committed to, not started yet",
    icon: CircleDashed,
    color: "var(--color-promised)",
    fill: "status-promised",
  },
  in_progress: {
    label: "In progress",
    gloss: "Actively being worked on",
    icon: CircleDot,
    color: "var(--color-in-progress)",
    fill: "status-in_progress",
  },
  delivered: {
    label: "Delivered",
    gloss: "Landed in full",
    icon: CheckCircle2,
    color: "var(--color-delivered)",
    fill: "status-delivered",
  },
  partial: {
    label: "Partial",
    gloss: "Some of it landed",
    icon: PieChart,
    color: "var(--color-partial)",
    fill: "status-partial",
  },
  deferred: {
    label: "Deferred",
    gloss: "Consciously moved to a later week",
    icon: Clock,
    color: "var(--color-deferred)",
    fill: "status-deferred",
  },
  blocked: {
    label: "Blocked",
    gloss: "Cannot proceed — waiting on someone",
    icon: Ban,
    color: "var(--color-blocked)",
    fill: "status-blocked",
  },
  dropped: {
    label: "Dropped",
    gloss: "Abandoned",
    icon: CircleSlash,
    color: "var(--color-dropped)",
    fill: "status-dropped",
  },
  superseded: {
    label: "Superseded",
    gloss: "Replaced by a different commitment",
    icon: CircleSlash,
    color: "var(--color-superseded)",
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
