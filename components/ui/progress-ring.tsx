"use client";

import { m, useReducedMotion } from "motion/react";
/*
 * `m`, not `motion`: MotionProvider runs LazyMotion in strict mode, which
 * loads only the domAnimation feature set. Importing `motion` pulls in the
 * full bundle and defeats that split, so strict mode throws rather than let
 * the saving disappear silently.
 */
import { springGentle } from "@/lib/motion-tokens";

/*
 * GUIDE §13. Animates strokeDashoffset, which is a paint-only property on the
 * compositor — it does not trigger layout, so the 60fps budget holds.
 *
 * The percentage inside is NOT opacity-faded in: on My Week this is the
 * largest contentful element (GUIDE §15 rule 19).
 */
export function ProgressRing({
  value,
  size = 132,
  strokeWidth = 8,
  color = "var(--color-delivered)",
  label,
  sublabel,
}: {
  value: number | null;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const reduce = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value ?? 0;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={
          value === null
            ? `${label ?? "Progress"}: no data yet`
            : `${label ?? "Progress"}: ${pct} percent`
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reduce ? { duration: 0 } : springGentle}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {value === null ? (
          <span className="metric text-2xl text-white/40">—</span>
        ) : (
          <span className="metric text-3xl font-medium text-white/90">
            {Math.round(pct)}
            <span className="text-lg text-white/50">%</span>
          </span>
        )}
        {sublabel && (
          <span className="mt-0.5 text-xs text-tertiary">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
