"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";

/** Parent that times its children in. Keep groups to 8 or fewer (GUIDE §10). */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div variants={staggerItem} className={className}>
      {children}
    </m.div>
  );
}
