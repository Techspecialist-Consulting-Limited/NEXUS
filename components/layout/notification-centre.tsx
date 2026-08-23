"use client";

import Link from "next/link";
import { m } from "motion/react";
import { BellOff, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";
import type { Alert } from "@/app/(app)/notifications/page";

/*
 * GUIDE "Notification And Digest Rules".
 *
 * The priority stripe is the only ornament: alerts are already ranked, and a
 * second visual system on top of that ranking would just be noise.
 *
 * The footer note is not filler. A person who understands that the system is
 * rate-limited stops treating it as spam, and that is the difference between
 * an assistant people keep switched on and one they mute in week two.
 */

const PRIORITY_TONE = [
  "var(--color-critical)",
  "var(--color-warning)",
  "var(--color-in-progress)",
  "var(--color-neutral)",
];

export function NotificationCentre({
  alerts,
  role,
}: {
  alerts: Alert[];
  role: string;
}) {
  const isChairman = role === "executive" || role === "admin";

  return (
    <div className="mx-auto max-w-2xl pt-2">
      <h1 className="text-2xl font-medium tracking-tight">Alerts</h1>
      <p className="mt-0.5 text-xs text-tertiary">
        {isChairman
          ? "Only what needs a decision from you."
          : "Only what needs a moment from you."}
      </p>

      {alerts.length === 0 ? (
        <GlassCard level={1} className="mt-4">
          <EmptyState
            icon={BellOff}
            title="Nothing needs you"
            body="Alerts appear when something is genuinely waiting on you. An empty list here is the system working, not the system asleep."
          />
        </GlassCard>
      ) : (
        <m.ul
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mt-4 space-y-2"
        >
          {alerts.map((a) => {
            const tone = PRIORITY_TONE[Math.min(a.priority, 3)];
            const body = (
              <GlassCard level={1} className="p-4">
                <div className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-0.5 shrink-0 self-stretch rounded-full"
                    style={{ backgroundColor: tone }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-medium uppercase tracking-wide" style={{ color: tone }}>
                      {a.kind.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-white/90">{a.title}</p>
                    {a.body && (
                      <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                        {a.body}
                      </p>
                    )}
                  </div>
                  {a.href && (
                    <ChevronRight
                      size={15}
                      className="mt-0.5 shrink-0 text-white/25"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </GlassCard>
            );

            return (
              <m.li key={a.id} variants={staggerItem}>
                {a.href ? (
                  <Link href={a.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </m.li>
            );
          })}
        </m.ul>
      )}

      <p className="mt-6 px-1 text-2xs leading-relaxed text-tertiary">
        NEXUS sends at most two nudges a day, never during your quiet hours, and
        never about something you cannot act on. Anything it holds back is
        recorded with the reason, so the limits can be tuned from evidence.
      </p>
    </div>
  );
}
