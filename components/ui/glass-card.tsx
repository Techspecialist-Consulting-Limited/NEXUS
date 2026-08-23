import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/*
 * The base surface — GUIDE §6.
 *
 * A server component. It renders no motion and holds no state, so making it a
 * client component would ship JavaScript for a div (GUIDE §15 rule 15: client
 * components are leaves, never layouts). Where a card needs to animate, wrap
 * it in <Reveal> or a motion parent rather than converting this.
 */

const levels = {
  1: "glass-l1",
  2: "glass-l2",
  3: "glass-l3",
  4: "glass-l4",
} as const;

export function GlassCard({
  children,
  level = 1,
  className,
  sheen = true,
  as: Tag = "div",
}: {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
  className?: string;
  sheen?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "relative overflow-hidden rounded-lg",
        levels[level],
        sheen && "glass-sheen",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </Tag>
  );
}
