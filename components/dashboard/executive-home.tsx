"use client";

import Link from "next/link";
import { m } from "motion/react";
import {
  ArrowRight,
  Building2,
  CircleCheck,
  CircleSlash,
  Rocket,
  ShieldAlert,
  Sparkles,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { VoiceConsole } from "@/components/assistant/voice-console";
import { WeeklyBriefModal } from "@/components/executive/weekly-brief-modal";
import type { StaffUpdate, WeeklyBrief } from "@/lib/queries";
import type { AIInsight } from "@/lib/insights";

/*
 * The Chairman's landing view.
 *
 * Four bands, in the order somebody actually uses them:
 *
 *   1  Ask         one thing to talk to, and the day's framing
 *   2  Who moved   what people published, most recent first
 *   3  What needs you   the findings, ranked, each with a way in
 *   4  Where to go  four destinations, not fourteen
 *
 * The constraint that shapes it is subtraction. An executive dashboard fails
 * by showing everything it could rather than the few things that change a
 * decision, so each band answers exactly one question and nothing here exists
 * to fill space. Charts, tables and per-unit breakdowns live one click away on
 * the pages built for them.
 *
 * Every figure on this screen was counted by SQL upstream. The assistant
 * explains those same numbers rather than producing its own, so the screen and
 * the answer can never disagree.
 */

/*
 * Colour carries severity; the icon carries what KIND of thing it is.
 *
 * Deriving both from severity meant two different findings — a cross-team
 * bottleneck and somebody dropping a commitment — arrived as identical amber
 * rockets, which makes a scannable row unscannable. Severity answers "how
 * urgent"; type answers "what am I looking at", and they are not the same
 * question.
 */
const TONE = {
  critical: { ring: "var(--color-critical)", wash: "rgba(242,120,159,0.10)" },
  warning: { ring: "var(--color-warning)", wash: "rgba(245,185,66,0.10)" },
  normal: { ring: "var(--color-healthy)", wash: "rgba(72,201,169,0.10)" },
} as const;

const TYPE_ICON = {
  blocker: ShieldAlert,
  dependency: ShieldAlert,
  risk: TriangleAlert,
  /*
   * A rocket on "commitments went quiet" reads as good news at a glance,
   * which is precisely the wrong first impression for the finding this
   * product exists to surface. CircleSlash says absence.
   */
  mismatch: CircleSlash,
  silence: CircleSlash,
  coaching: Rocket,
} as const;

const SHORTCUTS = [
  {
    href: "/departments",
    icon: Building2,
    title: "Department Overview",
    blurb: "See performance & progress",
  },
  {
    href: "/advice",
    icon: Target,
    title: "Strategic Initiatives",
    blurb: "Track key programs",
  },
  {
    href: "/notifications",
    icon: ShieldAlert,
    title: "Risk & Issues",
    blurb: "Review attention areas",
  },
  {
    href: "/departments",
    icon: Users,
    title: "Team Performance",
    blurb: "People & productivity",
  },
] as const;

/** "12m ago", "1h ago", "3d ago" — relative, because the exact clock time is noise. */
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}

const LIVE = new Set(["delivered", "in_progress", "partial"]);

export function ExecutiveHome({
  firstName,
  greeting,
  today,
  cycleLabel,
  insights,
  updates,
  weeklyBrief = null,
}: {
  firstName: string;
  greeting: string;
  today: string;
  cycleLabel: string;
  insights: AIInsight[];
  updates: StaffUpdate[];
  weeklyBrief?: WeeklyBrief | null;
}) {
  const priority = insights.slice(0, 3);
  const needsAttention = insights.filter((i) => i.severity !== "normal").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      {/*
        Shown once per brief, then not again until the next one is sent. It
        decides that for itself on the client, so nothing renders here that the
        browser immediately has to take back.
      */}
      {weeklyBrief && <WeeklyBriefModal brief={weeklyBrief} />}
      {/* ---- 1 + 2: ask, and who moved ---------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <GlassCard level={2} className="relative overflow-hidden p-5 md:p-7">
          {/*
            The wash. Purely decorative, so it is aria-hidden and painted with
            gradients rather than an image — nothing here should cost a network
            request on the first screen an executive sees each morning.
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 90% at 12% 120%, rgba(91,140,255,0.20), transparent 62%)," +
                "radial-gradient(90% 70% at 78% 0%, rgba(124,124,255,0.14), transparent 60%)",
            }}
          />

          <div className="relative">
            {/*
              The date reads as an eyebrow on a phone and as a right-hand
              marker on a desktop. Left to wrap it landed BETWEEN the greeting
              and the sentence explaining it, splitting one thought in two.
            */}
            <p className="metric mb-1 text-xs text-tertiary md:hidden">{today}</p>

            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-3xl font-medium leading-tight tracking-tight md:text-3xl">
                {greeting},{" "}
                <span className="text-[var(--dept-techspecialist)]">{firstName}.</span>
              </h1>
              <p className="metric hidden shrink-0 text-xs text-tertiary md:block">{today}</p>
            </div>
            <p className="mt-1 text-sm text-secondary">
              Your organisation at a glance — settled through {cycleLabel}.
            </p>

            <div className="mt-6 md:mt-8">
              <VoiceConsole
                greeting="Your AI Executive Assistant"
                subtitle="Ask about the week, a unit or a person. Speak it or type it, and the answer is written back in a few sentences."
                suggestions={[
                  "How are we doing this week?",
                  "What is blocked between teams?",
                  "Who needs support?",
                ]}
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard level={2} className="flex min-h-0 flex-col p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-medium tracking-tight">Recent Staff Updates</h2>
            <Link
              href="/departments"
              /*
                -mr-2 keeps the padding that makes this a real touch target
                without pushing the label off the card's optical edge. A 16px
                link is a link nobody can hit on a phone.
              */
              className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs
                         text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
            >
              View all <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>

          {updates.length === 0 ? (
            <p className="mt-4 text-sm text-tertiary">
              Nothing published yet for {cycleLabel}.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {updates.slice(0, 3).map((u) => (
                <li key={`${u.profile_id}-${u.title}`}>
                  {/*
                    The whole card is the target, not the name. The name
                    truncates at this width — "Musa Danj…" — and a link you
                    cannot read the end of is a poor thing to ask somebody to
                    aim at. The card is already well over the 44px minimum.

                    The label says whose week it opens, because the card's own
                    text reads as a sentence about work rather than as a
                    destination.
                  */}
                  <Link
                    href={`/people/${u.profile_id}`}
                    aria-label={`Open ${u.full_name}'s week`}
                    className="block rounded-lg border border-white/[0.08] bg-white/[0.03] p-3
                               transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={u.full_name} color={u.department_color} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium leading-tight text-white/90">
                            {u.full_name}
                          </p>
                          <p className="truncate text-2xs text-tertiary">
                            {u.department_name ?? "Unassigned"}
                          </p>
                        </div>
                      </div>
                      <span className="metric shrink-0 pt-0.5 text-2xs text-white/30">
                        {ago(u.at)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] size-1.5 shrink-0 rounded-full"
                        style={{
                          background: LIVE.has(u.status)
                            ? "var(--color-healthy)"
                            : "var(--color-blocked)",
                        }}
                      />
                      {/*
                        Their own sentence where the extractor found a literal
                        one, the commitment title otherwise. Never a generated
                        paraphrase: this reads as "what Sarah said", and it has
                        to actually be that.
                      */}
                      <p className="min-w-0 text-sm leading-snug text-white/70">
                        {u.source_quote ?? u.title}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* ---- 3: what needs you ------------------------------------------ */}
      <GlassCard level={2} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles
              size={17}
              className="text-[var(--dept-techspecialist)]"
              aria-hidden="true"
            />
            <h2 className="text-base font-medium tracking-tight">Priority Updates</h2>
            {/*
              Plain text. It was an outlined pill, which gave a COUNT the same
              visual weight as the three findings below that actually need
              acting on — and the cards already say how many there are.
            */}
            {needsAttention > 0 && (
              <span className="note">
                {needsAttention} {needsAttention === 1 ? "needs" : "need"} your attention
              </span>
            )}
          </div>
          <Link
            href="/advice"
            className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs
                       text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
          >
            View full report <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        {priority.length === 0 ? (
          <p className="mt-4 text-sm text-tertiary">
            Nothing needs your attention this week. Every unit reported and no
            commitment slipped without being declared.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {priority.map((insight, i) => {
              const tone = TONE[insight.severity];
              const Icon = TYPE_ICON[insight.type] ?? CircleCheck;
              return (
                <m.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: [0.32, 0.72, 0, 1] }}
                >
                  <Link
                    href="/advice"
                    className="group flex h-full items-start gap-3 rounded-xl border p-4
                               transition-colors"
                    style={{
                      borderColor: `color-mix(in oklab, ${tone.ring} 26%, transparent)`,
                      background: tone.wash,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-full"
                      style={{
                        background: `color-mix(in oklab, ${tone.ring} 18%, transparent)`,
                        color: tone.ring,
                      }}
                    >
                      <Icon size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-white/90">
                        {insight.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-tertiary">
                        {insight.recommendedAction}
                      </p>
                    </div>

                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full
                                 border border-white/[0.10] bg-white/[0.04] text-white/50
                                 transition-colors group-hover:text-white/90"
                    >
                      <ArrowRight size={14} />
                    </span>
                  </Link>
                </m.div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* ---- 4: where to go --------------------------------------------- */}
      <GlassCard level={2} className="p-5">
        <h2 className="text-base font-medium tracking-tight">Executive Shortcuts</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map(({ href, icon: Icon, title, blurb }) => (
            <Link
              key={title}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.08]
                         bg-white/[0.03] p-4 transition-colors hover:border-white/[0.16]
                         hover:bg-white/[0.06]"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-xl
                           bg-[var(--dept-techspecialist)]/12 text-[var(--dept-techspecialist)]"
              >
                <Icon size={19} />
              </span>
              <div className="min-w-0 flex-1">
                {/* Wraps rather than truncates: "Department Overvi…" is not a label. */}
                <p className="text-sm font-medium leading-snug text-white/90">{title}</p>
                <p className="mt-0.5 truncate text-xs text-tertiary">{blurb}</p>
              </div>
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="shrink-0 text-white/25 transition-colors group-hover:text-white/70"
              />
            </Link>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/** Initials, coloured by unit. No photo uploads exist, so none are implied. */
function Avatar({ name, color }: { name: string; color: string | null }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full text-2xs font-semibold"
      style={{
        background: `color-mix(in oklab, ${color ?? "var(--dept-techspecialist)"} 22%, transparent)`,
        color: color ?? "var(--dept-techspecialist)",
      }}
    >
      {initials}
    </span>
  );
}
