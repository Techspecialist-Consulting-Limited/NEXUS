import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/** A small, non-interactive label. Interactive things must be 44px (§11). */
export function GlassBadge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  /** A CSS colour value — usually a status or department custom property. */
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5",
        "text-xs font-medium leading-5",
        className,
      )}
      style={
        tone
          ? {
              color: tone,
              backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 28%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
