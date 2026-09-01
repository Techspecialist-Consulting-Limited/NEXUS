"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { weekLabel } from "@/lib/cycle";
import { unitTone, unitWash } from "@/lib/unit-tone";
import { GlassCard } from "@/components/ui/glass-card";
import { VoiceConsole } from "@/components/assistant/voice-console";
import { WeeklyBriefModal } from "@/components/executive/weekly-brief-modal";
import { UnitRoster } from "@/components/executive/unit-roster";
import type { StaffUpdate, UnitRoster as Roster, WeeklyBrief } from "@/lib/queries";
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
 *
 * THERE IS NO VERSION OF THIS PAGE THAT DOES NOT RENDER.
 *
 * A Chairman invited into a brand-new organisation was shown one centred
 * sentence on an otherwise blank screen — the whole page was skipped, because
 * /dashboard bailed before reaching it whenever no reporting week had settled.
 * He could not see the assistant, the units that had just been created, or
 * anything he might ask about. My Week has never behaved that way for an
 * employee: it draws every card and each one says what will fill it.
 *
 * So `cycleLabel` is nullable and null is an ordinary state, not an error.
 * Every card renders in every case; only the sentences inside them change.
 *
 * THE FIRST DAY IS A REAL STATE, NOT A DEGRADED ONE.
 *
 * A Chairman is invited before anybody has reported, so the first thing this
 * page ever shows him is the empty version of itself — and it was showing him
 * blanks. Worse, "Nothing needs your attention this week. Every unit reported
 * and no commitment slipped" was rendered whenever the insight list came back
 * empty, which on day one is a claim about a week nobody has filed for. It was
 * not reassurance; it was a false statement about an organisation that had not
 * started reporting.
 *
 * So every empty state here is derived from counted facts and says which of
 * three situations he is actually in: nobody added yet, nobody reported yet,
 * or reported and clean. `reporting` carries the two numbers that decide it.
 *
 * The units band exists for the same reason. Units are created during setup,
 * long before the first check-in, and he should be able to see the shape of
 * his organisation on the day he arrives — including a unit nobody is in yet,
 * which is a fact he can act on rather than an absence he has to infer.
 *
 * ON THE CONTRAST OF THIS PAGE.
 *
 * The structure below is unchanged; the values it is painted in are not. This
 * screen had drifted to the bottom of the ink range — 11px metadata at white
 * 55%, timestamps at white 30%, severity washes at 10% alpha and card borders
 * at 8% — and read as a grey page with a few coloured dots on it.
 *
 * globals.css [FIX 1] already records the arithmetic: white/30 over #070A15
 * measures about 2.6:1 and fails GUIDE §17 outright. The offenders were
 * decoration in some places and load-bearing information in others, and the
 * ones carrying information have been raised until they clear 4.5:1. Nothing
 * moved, nothing was added, nothing was taken away.
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
/*
 * The wash was 10% on all three, which over the void is very nearly nothing:
 * three findings of three different severities arrived as three grey cards.
 * Severity is the only thing that orders this band, so it has to be visible
 * before the words are read.
 */
/*
 * THE WASH, IN THE THEME'S OWN INK.
 *
 * These were literal rgba(91,140,255) and rgba(124,124,255) — a blue and a
 * purple, hardcoded. The monochrome pass re-pointed tokens, and a literal is
 * by definition not a token, so the one screen the Chairman opens every
 * morning kept a blue glow after every other surface had stopped.
 *
 * Mixed from --nx-primary, they also follow the theme: white ink on black,
 * black ink on white, and the wash reads as depth in both instead of a
 * bruise on one.
 */
const MIX_STRONG = "color-mix(in oklab, var(--nx-primary) 14%, transparent)";
const MIX_SOFT = "color-mix(in oklab, var(--nx-primary) 9%, transparent)";

const TONE = {
  critical: { ring: "var(--color-critical)", wash: "rgba(242,120,159,0.15)" },
  warning: { ring: "var(--color-warning)", wash: "rgba(245,185,66,0.15)" },
  normal: { ring: "var(--color-healthy)", wash: "rgba(72,201,169,0.13)" },
} as const;

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
  roster,
  reporting,
  weeklyBrief = null,
}: {
  firstName: string;
  greeting: string;
  today: string;
  /** The settled week, or null when none has settled yet. */
  cycleLabel: string | null;
  insights: AIInsight[];
  updates: StaffUpdate[];
  /** Every unit and who is in it. Shown whether or not anybody has reported. */
  roster: Roster;
  /**
   * Who was expected to file this week, and who has. The two numbers that
   * decide which empty state is the true one.
   */
  reporting: { expected: number; submitted: number };
  weeklyBrief?: WeeklyBrief | null;
}) {
  const priority = insights.slice(0, 3);
  const needsAttention = insights.filter((i) => i.severity !== "normal").length;
  const nothingYet = reporting.submitted === 0;

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
                "radial-gradient(120% 90% at 12% 120%, " +
                `${MIX_STRONG}, transparent 62%),` +
                "radial-gradient(90% 70% at 78% 0%, " +
                `${MIX_SOFT}, transparent 60%)`,
            }}
          />

          <div className="relative">
            {/*
              The date reads as an eyebrow on a phone and as a right-hand
              marker on a desktop. Left to wrap it landed BETWEEN the greeting
              and the sentence explaining it, splitting one thought in two.
            */}
            <p className="metric mb-1 text-xs text-tertiary md:hidden">{today}</p>

            {/*
              A GREETING AT GREETING SIZE.

              This was a 30px headline, in accent colour, over a sentence
              describing the page — the two largest things on the Chairman's
              screen, and neither of them the reason he opened it. What he
              came for is the week's finding, which is now the first thing
              with any weight to it.

              The name stays. Addressing somebody by name costs one line and
              is not the same as spending the top of the page on it.
            */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[15px] text-secondary">
                {greeting}, {firstName}.
              </p>
              <p className="metric hidden shrink-0 text-xs text-tertiary md:block">{today}</p>
            </div>
            <h1 className="page-title mt-1">
              {/*
                THE DATES, NOT THE WEEK NUMBER.

                `cycleLabel` is the raw database label, "W34 · 17 Aug–23 Aug".
                Rendering it whole put the week number back on the one screen
                lib/cycle.ts was written to keep it off — and it is the exact
                string somebody had to ask the meaning of.
              */}
              {cycleLabel
                ? `The week of ${weekLabel(cycleLabel)}`
                : "No week has settled yet"}
            </h1>
            <p className="mt-1.5 max-w-[54ch] text-[15px] leading-relaxed text-secondary">
              {cycleLabel
                ? "Everything below is counted from what people filed. Ask about any of it."
                : "The figures below fill in once the first reporting week closes. Everything on this page is counted from what people file."}
            </p>

            <div className="mt-6 md:mt-8">
              <VoiceConsole
                greeting="Ask NEXUS"
                /*
                  The half that says something.

                  "Speak it or type it, and the answer is written back in a
                  few sentences" described the two controls sitting directly
                  underneath it — a microphone button and a text field — and
                  the shape of the reply, which the reader is about to see
                  anyway. Copy that narrates the interface below it is copy
                  somebody reads once and then learns to skip.

                  What is left is the part he cannot work out by looking:
                  what this thing knows enough to be asked about.
                */
                subtitle="Ask about the week, a unit or a person."
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
            <h2 className="card-title">Recent updates</h2>
            <Link
              href="/departments"
              /*
                -mr-2 keeps the padding that makes this a real touch target
                without pushing the label off the card's optical edge. A 16px
                link is a link nobody can hit on a phone.
              */
              className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm
                         text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
            >
              View all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {updates.length === 0 ? (
            /* Says what will fill it, and when. */
            <p className="mt-4 text-sm leading-relaxed text-secondary">
              {reporting.expected === 0
                ? "Nobody has been added to the organisation yet. Once people are invited and start reporting, what they say appears here in their own words."
                : cycleLabel
                  ? `Nobody has filed for ${cycleLabel} yet. As each person reports, their update appears here — their own sentence, not a summary of it.`
                  : "Nothing has been filed yet. As each person reports, their update appears here — their own sentence, not a summary of it."}
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
                    className="block rounded-lg border border-white/[0.13] bg-white/[0.05] p-3
                               transition-colors hover:border-white/[0.22] hover:bg-white/[0.09]
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={u.full_name} unit={u.department_name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium leading-tight text-white/90">
                            {u.full_name}
                          </p>
                          {/*
                            12px, not 11px, and secondary rather than tertiary.
                            Which unit somebody belongs to is how a Chairman
                            reads this list at all.
                          */}
                          <p className="truncate text-xs text-secondary">
                            {u.department_name ?? "Unassigned"}
                          </p>
                        </div>
                      </div>
                      {/*
                        white/30 measures about 2.6:1 over the void — see
                        globals.css [FIX 1], which raised the tertiary token
                        for exactly this reason and left the literals behind.
                      */}
                      <span className="metric shrink-0 pt-0.5 text-2xs text-white/55">
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
                      {/* What the person actually said. The content of the row. */}
                      <p className="min-w-0 text-sm leading-snug text-white/85">
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
            <h2 className="card-title">Priority updates</h2>
            {/*
              Plain text. It was an outlined pill, which gave a COUNT the same
              visual weight as the three findings below that actually need
              acting on — and the cards already say how many there are.

              Amber and 12px, though, rather than an 11px grey note. It is a
              count of things waiting on the reader; the palette should agree
              with the words.
            */}
            {needsAttention > 0 && (
              <span className="text-xs font-medium text-[var(--color-warning)]">
                {needsAttention} {needsAttention === 1 ? "needs" : "need"} your attention
              </span>
            )}
          </div>
          <Link
            href="/advice"
            className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm
                       text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
          >
            View full report <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {priority.length === 0 ? (
          /*
            THREE DIFFERENT SITUATIONS, AND ONLY ONE OF THEM IS GOOD NEWS.
            The old copy said "every unit reported and no commitment slipped"
            for all three — including a week nobody had filed for. An empty
            insight list means the model found nothing IN WHAT IT WAS GIVEN,
            and on day one it was given nothing.
          */
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-secondary">
            {reporting.expected === 0
              ? "Nobody has been added to the organisation yet. When people are invited and start reporting, NEXUS reads every check-in and what needs a decision from you appears here — what is blocked between units, what keeps carrying over, and who needs support."
              : nothingYet
                ? `Nobody has reported${cycleLabel ? ` for ${cycleLabel}` : ""} yet, so there is nothing to read. As check-ins arrive, NEXUS flags what is blocked between units, what has carried without explanation, and who needs support.`
                : `${reporting.submitted} of ${reporting.expected} reported${cycleLabel ? ` for ${cycleLabel}` : ""}, and nothing came back blocked across units, carried without explanation, or dropped without being declared.`}
          </p>
        ) : (
          /*
            A LIST, NOT A GRID OF CARDS INSIDE A CARD.

            This was three bordered, washed, icon-pucked cards nested in the
            card that introduces them — rejected-patterns.md #7, and the nesting
            was the smaller cost. Three columns at 1/3 width forced the finding
            itself to `line-clamp-2`, so the Chairman read "…name one owner for
            the…" and "…before treating the number as real…". The one sentence
            on this page that tells him what to do about something was the one
            sentence being cut.

            Full width, one per row, nothing clamped. The coloured puck the
            severity used to live in became a 2px rule at the left edge: it was
            the most emphasised element on the card and carried the least, which
            is exactly backwards on a finding.
          */
          <ul className="mt-4 flex flex-col gap-1.5">
            {priority.map((insight, i) => {
              const tone = TONE[insight.severity];
              return (
                <m.li
                  key={insight.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: [0.32, 0.72, 0, 1] }}
                >
                  <Link
                    href="/advice"
                    className="group flex items-start gap-3.5 rounded-xl border border-white/[0.06]
                               bg-white/[0.02] py-3.5 pl-3.5 pr-4 transition-colors
                               hover:border-white/[0.14] hover:bg-white/[0.05]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full"
                      style={{ background: tone.ring }}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug text-white/90">
                        {insight.title}
                      </span>
                      {/*
                        The half of a finding that says what to do about it.
                        Never truncated, never clamped.
                      */}
                      <span className="mt-1 block text-[13px] leading-relaxed text-white/78">
                        {insight.recommendedAction}
                      </span>
                    </span>

                    <ArrowRight
                      size={15}
                      aria-hidden="true"
                      className="mt-1 shrink-0 text-white/40 transition-transform duration-150
                                 group-hover:translate-x-0.5 group-hover:text-white/80"
                    />
                  </Link>
                </m.li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {/* ---- 4: the shape of the organisation --------------------------- */}
      <GlassCard level={2} className="p-5">
        <UnitRoster roster={roster} dense />
      </GlassCard>

      {/*
        EXECUTIVE SHORTCUTS: DELETED.

        Four tiles — Department Overview, Strategic Initiatives, Risk & Issues,
        Team Performance — each an icon, a title-case label and a blurb that
        `truncate`d to "See performance & pro…". It was rejected-patterns.md #1
        exactly: a grid that shows everything and decides nothing, on the one
        screen in the product whose entire job is deciding.

        Two of the four went to pages the rail already lists. The other two
        named nothing that exists in this product — there is no "strategic
        initiative" and no "risk register" in the data model, so a Chairman who
        pressed them arrived somewhere that did not answer the label.

        Nothing replaces it. The rail navigates, the findings above link to the
        work, and the roster links to each unit. A short page is not a defect.
      */}
    </div>
  );
}

/** Initials, coloured by unit. No photo uploads exist, so none are implied. */
function Avatar({ name, unit }: { name: string; unit: string | null }) {
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
      style={{ background: unitWash(unit), color: unitTone(unit) }}
    >
      {initials}
    </span>
  );
}
