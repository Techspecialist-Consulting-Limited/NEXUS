"use client";

import { m, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { springDefault } from "@/lib/motion-tokens";

/*
 * Scroll-triggered reveal — GUIDE §10 pattern 3.
 *
 * `once: true` so nothing re-animates when the user scrolls back up. Uses `m`
 * rather than `motion` because LazyMotion is in strict mode: `motion` would
 * pull in the full feature bundle and defeat the code-splitting.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <m.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ ...springDefault, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}
