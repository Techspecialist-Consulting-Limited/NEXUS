"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight, BellOff, CircleAlert, Clock, Info } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekCode } from "@/lib/cycle";
import type { Alert } from "@/app/(app)/notifications/page";

/*
 * Alerts, in one view.
 *
 * Split once — needs a decision, and worth knowing — and no further. Anything
 * finer would be a filing system for a list that should stay short enough not
 * to need one.
 *
 * The split is by whether the reader has to DO something, not by severity.
 * Those are different questions: a critical finding somebody else already owns
 * is not the Chairman's decision, and burying a small one he alone can settle
 * under three red cards is how a system trains people to skim past the top of
 * the page.
 *
 * GUIDE's notification rule is that a message must name the specific thing and
 * ask for one next step. Every row here therefore carries a link — an alert
 * with nowhere to go is a status update wearing an alert's clothes.
 */

const PRIORITY = [
  { ring: "var(--color-critical)", label: "Critical" },
  { ring: "var(--color-warning)", label: "High" },
  { ring: "var(--color-in-progress)", label: "Normal" },
  { ring: "var(--color-neutral)", label: "Low" },
] as const;

function when(iso: string | null): string | null {
  if (!iso) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}

export function AlertBoard({
  cycleLabel,
  alerts,
}: {
  cycleLabel: string;
  alerts: Alert[];
}) {
  const decide = alerts.filter((a) => a.priority <= 1);
  const know = alerts.filter((a) => a.priority > 1);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Alerts"
        cycleLabel={weekCode(cycleLabel)}
        standfirst={
          alerts.length === 0 ? (
            "Nothing is waiting on you."
          ) : decide.length === 0 ? (
            <>
              Nothing needs a decision. {know.length}{" "}
              {know.length === 1 ? "item is" : "items are"} worth knowing about.
            </>
          ) : (
            <>
              {decide.length} {decide.length === 1 ? "item needs" : "items need"} a
              decision from you
              {know.length > 0 ? `, and ${know.length} more are worth knowing.` : "."}
            </>
          )
        }
      />

      {alerts.length === 0 ? (
        <GlassCard level={2} className="p-8">
          <div className="mx-auto max-w-md text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-11 place-items-center rounded-full
                         bg-white/[0.06] text-white/40"
            >
              <BellOff size={20} />
            </span>
            <p className="mt-3 text-sm font-medium text-white/90">Nothing waiting</p>
            <p className="mt-1 text-sm leading-relaxed text-tertiary">
              You are notified when something needs you, and not otherwise. An empty
              page here means the week is running itself.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          {decide.length > 0 && (
            <Band
              icon={CircleAlert}
              accent="var(--color-critical)"
              title="Needs a decision"
              alerts={decide}
            />
          )}
          {know.length > 0 && (
            <Band
              icon={Info}
              accent="var(--color-neutral)"
              title="Worth knowing"
              alerts={know}
              muted
            />
          )}
        </>
      )}
    </div>
  );
}

function Band({
  icon: Icon,
  accent,
  title,
  alerts,
  muted,
}: {
  icon: typeof CircleAlert;
  accent: string;
  title: string;
  alerts: Alert[];
  muted?: boolean;
}) {
  return (
    <GlassCard level={2} className="p-4 md:p-5">
      <div className="flex items-center gap-2.5">
        <Icon size={16} style={{ color: accent }} aria-hidden="true" />
        <h2 className="text-sm font-medium tracking-tight text-white/90">{title}</h2>
        <span className="metric text-xs text-white/30">{alerts.length}</span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {alerts.map((a, i) => {
          const tone = PRIORITY[Math.min(a.priority, 3)];
          const ago = when(a.createdAt);

          const body = (
            <div
              className="flex items-start gap-3 rounded-xl border border-white/[0.08]
                         bg-white/[0.03] p-3.5 transition-colors group-hover:border-white/[0.16]
                         group-hover:bg-white/[0.06]"
            >
              <span
                aria-hidden="true"
                className="mt-[7px] size-2 shrink-0 rounded-full"
                style={{ background: muted ? "var(--color-neutral)" : tone.ring }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium leading-snug text-white/90">
                    {a.title}
                  </p>
                  {ago && (
                    <span className="metric flex shrink-0 items-center gap-1 text-2xs text-white/25">
                      <Clock size={10} aria-hidden="true" />
                      {ago}
                    </span>
                  )}
                </div>
                {a.body && (
                  <p className="mt-1 text-sm leading-relaxed text-secondary">{a.body}</p>
                )}
              </div>

              {a.href && (
                <ArrowRight
                  size={15}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-white/20 transition-colors
                             group-hover:text-white/70"
                />
              )}
            </div>
          );

          return (
            <m.li
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: Math.min(i, 8) * 0.03, ease: [0.32, 0.72, 0, 1] }}
            >
              {/*
                A row with somewhere to go is a link; one without is not
                dressed up as though it were. Nothing is worse than a card that
                looks clickable and answers nothing.
              */}
              {a.href ? (
                <Link href={a.href} className="group block">
                  {body}
                </Link>
              ) : (
                <div className="group">{body}</div>
              )}
            </m.li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
