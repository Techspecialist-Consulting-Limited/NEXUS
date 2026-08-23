/*
 * Shared animation config — GUIDE.md §10.
 *
 * Module-level constants, never inline objects in render (GUIDE §15 rule 16):
 * a fresh object each render makes Motion treat the transition as changed and
 * restart springs mid-flight.
 */

/** Default UI spring — snappy, no bounce. Use for almost everything. */
export const springDefault = {
  type: "spring" as const,
  stiffness: 350,
  damping: 30,
};

/** Gentle — page transitions and large-area movement. */
export const springGentle = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25,
};

/** Bouncy — ONLY drag-to-dismiss, pull-to-refresh, playful moments. */
export const springBouncy = {
  type: "spring" as const,
  stiffness: 300,
  damping: 15,
  mass: 0.8,
};

/** Snappy — button press feedback and other small interactions. */
export const springSnappy = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
};

export const easeOut = [0.16, 1, 0.3, 1] as const;

/*
 * Stagger group entrance.
 *
 * GUIDE §10 caps stagger at 8 items — past that the tail feels slow — and
 * §15 rule 19 forbids opacity-fading the LCP element. Those two rules
 * collide, since the first KPI card is usually the LCP. `staggerItem` is
 * therefore for everything AFTER the hero; the hero uses `heroItem`, which
 * moves but never starts transparent.
 */
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springDefault },
};

/** LCP-safe: visible on the first frame, so it never delays paint. */
export const heroItem = {
  hidden: { opacity: 1, y: 8 },
  visible: { opacity: 1, y: 0, transition: springDefault },
};
