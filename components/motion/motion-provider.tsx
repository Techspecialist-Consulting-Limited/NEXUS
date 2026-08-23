"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/*
 * GUIDE §15 rules 17-18 and §17.
 *
 * LazyMotion + domAnimation loads only the DOM animation feature set, roughly
 * halving the Motion bundle. reducedMotion="user" makes every component in the
 * tree honour the OS setting without each one asking.
 *
 * Note: domAnimation excludes layout animations and drag. The bottom nav's
 * shared-element highlight and the draggable sheet both need those, so they
 * are implemented without layoutId/drag — see app-nav.tsx.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
