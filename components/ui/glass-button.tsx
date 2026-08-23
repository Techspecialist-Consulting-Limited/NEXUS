"use client";

import { m } from "motion/react";
/*
 * `m`, not `motion`: MotionProvider runs LazyMotion in strict mode, which
 * loads only the domAnimation feature set. Importing `motion` pulls in the
 * full bundle and defeats that split, so strict mode throws rather than let
 * the saving disappear silently.
 */
import { cn } from "@/lib/cn";
import { springSnappy } from "@/lib/motion-tokens";
import type { ReactNode } from "react";

/*
 * GUIDE §13.
 *
 * whileTap is pointer feedback, not an animated state change — GUIDE §15
 * rule 5 forbids animating keyboard-initiated actions, and a tap scale does
 * not fire on Enter/Space, so the two coexist. Every size clears the 44px
 * touch minimum (§11) via min-h, including `sm`, which the guide's own h-8
 * spec would have violated.
 */

const variants = {
  primary:
    "bg-[var(--dept-techspecialist)] text-white border border-transparent hover:brightness-110",
  secondary:
    "bg-white/[0.08] text-white/90 border border-white/[0.12] hover:bg-white/[0.12]",
  ghost:
    "bg-transparent text-white/60 border border-transparent hover:bg-white/[0.06] hover:text-white/90",
  danger:
    "bg-[var(--color-critical)]/20 text-[var(--color-critical)] border border-[var(--color-critical)]/30 hover:bg-[var(--color-critical)]/30",
} as const;

const sizes = {
  sm: "min-h-11 px-3 text-xs rounded-lg",
  md: "min-h-11 px-4 text-sm rounded-lg",
  lg: "min-h-12 px-6 text-base rounded-lg",
} as const;

export function GlassButton({
  children,
  variant = "secondary",
  size = "md",
  onClick,
  disabled,
  type = "button",
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <m.button
      type={type}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium",
        "transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </m.button>
  );
}
