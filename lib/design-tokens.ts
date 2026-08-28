/*
 * Centralized design tokens for the premium My Week surface.
 *
 * These map to the CSS custom properties declared in app/globals.css, so the
 * values live in one place (the stylesheet) and components reference them by
 * name here. Using a TS object rather than scattering literals keeps
 * components consistent and gives the type checker a single point of truth.
 */

export const nx = {
  colors: {
    bg: "#070A15",
    sidebar: "#0B1020",
    surface: "rgba(17, 24, 39, 0.72)",
    surfaceStrong: "rgba(17, 24, 39, 0.85)",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.12)",
    primary: "#8B5CF6",
    primaryLight: "#A78BFA",
    purple: "#A855F7",
    success: "#22C55E",
    successLight: "#34D399",
    info: "#3B82F6",
    warning: "#F59E0B",
    error: "#EF4444",
    textPrimary: "#F8FAFC",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
  },
  gradient: {
    nexus: "linear-gradient(135deg, #17112F 0%, #24115C 45%, #32127A 100%)",
    coaching: "linear-gradient(135deg, #062D2A 0%, #073D35 45%, #0A5145 100%)",
  },
  glow: {
    purple: "0 20px 60px rgba(139, 92, 246, 0.18)",
    green: "0 20px 60px rgba(34, 197, 94, 0.12)",
  },
} as const;

/** Commitment statuses shown as small badges on the Working On card. */
export const STATUS_BADGE: Record<
  string,
  { label: string; tone: string; text: string }
> = {
  delivered: { label: "Completed", tone: "var(--nx-success)", text: "var(--nx-success-light)" },
  partial: { label: "Partly", tone: "var(--color-partial)", text: "var(--color-partial)" },
  in_progress: { label: "In progress", tone: "var(--nx-info)", text: "var(--nx-info)" },
  blocked: { label: "Blocked", tone: "var(--nx-error)", text: "var(--nx-error)" },
  deferred: { label: "Delayed", tone: "var(--color-deferred)", text: "var(--nx-text-secondary)" },
  dropped: { label: "Dropped", tone: "var(--color-dropped)", text: "var(--nx-text-secondary)" },
  promised: { label: "To do", tone: "var(--color-promised)", text: "var(--nx-text-secondary)" },
  superseded: { label: "Replaced", tone: "var(--color-superseded)", text: "var(--nx-text-secondary)" },
};

export function statusBadge(status: string): { label: string; tone: string; text: string } {
  return STATUS_BADGE[status] ?? STATUS_BADGE.promised;
}
