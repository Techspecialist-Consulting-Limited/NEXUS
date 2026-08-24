"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { GlassCard } from "@/components/ui/glass-card";
import { InlineCheckIn } from "@/components/staff/inline-checkin";
import { FirstRun } from "@/components/onboarding/first-run";
import { useToast } from "@/components/ui/toast";
import { weekLabel } from "@/lib/cycle";
import type { CommitmentRow, Person, Reconciliation } from "@/lib/queries";

/*
 * My Co-Pilot — the employee's home.
 *
 * Three columns, in the order somebody actually uses them:
 *
 *   what matters now  ·  what NEXUS noticed  ·  tell it what changed
 *
 * The PRD calls this the highest-priority screen in the product, and the
 * framing is deliberate: "Your Commitments. Our Support." Everything an
 * employee sees about themselves is written to help them, never to grade them.
 *
 * TWO SCORES, NEVER ONE. Delivery says whether work landed; told-in-time says
 * whether they kept people informed. Deferring on Tuesday with a reason scores
 * high on the second. That split is the entire mechanism that stops this
 * becoming a system people game by committing to less — so it stays on their
 * home screen with the line saying it is not a performance review.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 * A design mock showed a coach reporting "you've been focused for 3.5 hrs this
 * morning". NEXUS has no activity tracking — no timers, no screen monitoring,
 * no keystrokes — so that figure could only be invented, and an invented number
 * about somebody's own working day is the fastest way to lose them. What the
 * coach says below comes from carry-over chains, blocked work, and what they
 * themselves reported.
 */

/*
 * Two colours per status, because a dot and a word have different jobs.
 *
 * `tone` paints the dot. `text` paints the label. They differ for the muted
 * statuses on purpose: --color-dropped is white at 0.22 alpha, legible as a 6px
 * dot and unreadable as a word. Rendering the label in the dot's colour put
 * "Dropped" at roughly 2:1 against the surface — below every contrast floor
 * there is, on the one status a person most needs to notice about their week.
 */
const STATUS = {
  delivered: { label: "Completed", tone: "var(--color-delivered)", text: "var(--color-delivered)" },
  partial: { label: "Partly", tone: "var(--color-partial)", text: "var(--color-partial)" },
  in_progress: { label: "In progress", tone: "var(--color-in-progress)", text: "var(--color-in-progress)" },
  blocked: { label: "Blocked", tone: "var(--color-blocked)", text: "var(--color-blocked)" },
  deferred: { label: "Delayed", tone: "var(--color-deferred)", text: "var(--text-secondary)" },
  dropped: { label: "Dropped", tone: "var(--color-dropped)", text: "var(--text-secondary)" },
  promised: { label: "To do", tone: "var(--color-promised)", text: "var(--text-secondary)" },
  superseded: { label: "Replaced", tone: "var(--color-superseded)", text: "var(--text-secondary)" },
} as const;

/** Still actionable this week — decides whether the guided path is worth offering. */
const OPEN_STATES = new Set(["promised", "in_progress", "partial", "blocked"]);

/** One-tap answers to a follow-up question. */
const QUICK_ANSWERS = [
  { value: "delivered", label: "Complete" },
  { value: "in_progress", label: "Still working" },
  { value: "blocked", label: "Blocked" },
  { value: "deferred", label: "Delayed" },
  { value: "dropped", label: "Not relevant" },
] as const;

function statusOf(s: string) {
  return STATUS[s as keyof typeof STATUS] ?? STATUS.promised;
}

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CopilotHome({
  firstRun,
  person,
  cycleId,
  cycleLabel,
  reconciliation,
  commitments,
  coaching,
  questions,
  reportedAt,
}: {
  /** True until this person has finished the introduction. */
  firstRun: boolean;
  person: Person;
  /** The week being reported ON — the current one, not the last settled one. */
  cycleId: string;
  cycleLabel: string;
  reconciliation: Reconciliation | null;
  commitments: CommitmentRow[];
  coaching: { title: string; body: string; based_on: string }[];
  /** Things NEXUS wants to ask — each one a gap it noticed. */
  questions: string[];
  /** When they last filed, or null if this week is still open. */
  reportedAt: string | null;
}) {
  const first = person.full_name.split(/\s+/)[0];
  const delivered = commitments.filter((c) => c.status === "delivered").length;
  const openCount = commitments.filter((c) => OPEN_STATES.has(c.status)).length;
  const carriedCount = commitments.filter((c) => c.carry_depth > 1).length;
  const rate = reconciliation?.delivery_rate ?? null;
  const told = reconciliation?.signal_integrity ?? null;

  /*
   * The one thing worth putting above everything else.
   *
   * Blocked first, because blocked work is the only kind that will not move on
   * its own. Then the longest-carried, because a chain is the finding a single
   * week never shows. If neither exists there is nothing urgent, and the card
   * says so rather than manufacturing a concern to look useful.
   */
  const blocked = commitments.find((c) => c.status === "blocked");
  const carried = [...commitments]
    .filter((c) => c.carry_depth > 1 && OPEN_STATES.has(c.status))
    .sort((a, b) => b.carry_depth - a.carry_depth)[0];
  const highlight = blocked ?? carried ?? commitments.find((c) => OPEN_STATES.has(c.status));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 pb-2">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="page-title">
            {partOfDay()}, {first}
          </h1>
          <p className="standfirst mt-1.5">
            Your commitments, and what NEXUS noticed since your last update.
          </p>
        </div>
        <span className="metric text-2xs uppercase tracking-wider text-tertiary">
          {cycleLabel}
        </span>
      </div>

      {/*
        min-w-0 on every column. A grid item defaults to min-width:auto, so a
        `truncate` title inside one — white-space:nowrap by definition — sets the
        track's minimum to the full untruncated string. At 390px that pushed the
        page to 565px wide and gave the whole app a horizontal scrollbar, while
        the ellipsis it was there to produce never appeared.
      */}
      {/*
        The introduction, once, above everything.

        Above rather than as a modal: a dialog over somebody's first week
        demands to be dismissed before they can look at anything, and the first
        thing NEXUS does should not be to block the screen. This can be read,
        skipped, or ignored while they get on with the week underneath it.
      */}
      {firstRun && <FirstRun firstName={first} />}

      <div className="grid items-start gap-5 xl:grid-cols-3">
        {/* ---- what matters now ------------------------------------------ */}
        <div className="flex min-w-0 flex-col gap-4">
          <Highlight commitment={highlight} cycleLabel={cycleLabel} />

          <GlassCard level={2} className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Active commitments</p>
              <Link
                href="/commitments"
                className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
              >
                All <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>

            {commitments.length === 0 ? (
              <p className="note mt-3">
                Nothing recorded for {weekLabel(cycleLabel)}. Your next check-in creates it.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {commitments.slice(0, 6).map((c) => {
                  const s = statusOf(c.status);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: s.tone }}
                      />
                      {/*
                        Clamped to two lines rather than truncated. At 390px a
                        single truncated line leaves roughly thirty characters,
                        and "Ship the commitment reco…" is not a commitment
                        anybody can recognise as theirs.
                      */}
                      <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-white/85">
                        {c.title}
                      </span>
                      {c.carry_depth > 1 && (
                        <RefreshCw
                          size={11}
                          aria-label={`Carried ${c.carry_depth} times`}
                          className="shrink-0 text-[var(--color-partial)]"
                        />
                      )}
                      <span
                        className="shrink-0 text-2xs uppercase tracking-wide"
                        style={{ color: s.text }}
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </div>

        {/* ---- what NEXUS noticed ---------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <StrategicPartner
            coaching={coaching}
            openCount={openCount}
            carriedCount={carriedCount}
          />
          {questions.length > 0 && (
            <FollowUp question={questions[0]} commitments={commitments} />
          )}

          {/*
            The two scores, kept small but never removed. The design mock has no
            tally; the product rule that there must be two scores on the
            employee's own screen outranks that, because it is the mechanism
            that stops the whole system being gamed.

            They sit under "NEXUS noticed" rather than under the commitment
            list because that is what they are: an observation about the week,
            not another thing to act on. It also stops the middle column
            collapsing to one short card on the weeks NEXUS has no question to
            ask, which left a hole between two full columns.
          */}
          <GlassCard level={2} className="p-5">
            <p className="eyebrow">Where you stand</p>
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <Score label="Delivered" value={delivered} of={commitments.length} />
              <Score
                label="Delivery rate"
                value={rate === null ? null : Math.round(rate)}
                suffix="%"
              />
              <Score
                label="Told in time"
                value={told === null ? null : Math.round(told)}
                suffix="%"
              />
            </div>
            <p className="note mt-3 flex items-start gap-1.5">
              <ShieldCheck size={12} className="mt-px shrink-0" aria-hidden="true" />
              Not a performance review. Telling us early counts in your favour.
            </p>
          </GlassCard>
        </div>

        {/* ---- tell it what changed -------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <GlassCard level={2} className="flex flex-col p-5">
            <InlineCheckIn
              cycleId={cycleId}
              alreadyReported={Boolean(reportedAt)}
              openCount={openCount}
            />
          </GlassCard>

          {/*
            Said plainly, on the screen where somebody might otherwise wonder.
            An employee who believes this is monitoring commits to less next
            week, and then every figure downstream is theatre.
          */}
          <GlassCard
            level={2}
            className="border-[var(--dept-techspecialist)]/25 bg-[var(--dept-techspecialist)]/[0.05] p-5"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-white/90">
              <Info
                size={15}
                className="text-[var(--dept-techspecialist)]"
                aria-hidden="true"
              />
              NEXUS is your co-pilot
            </p>
            <p className="body-sm mt-1.5">
              No monitoring, no activity tracking, no performance scoring. What you write
              here clears cross-team dependencies and nothing else. Your lead and the
              Chairman see the figures — never your raw words.
            </p>
          </GlassCard>

          {reportedAt && (
            <p className="note flex items-center gap-1.5 px-1">
              <Check size={11} aria-hidden="true" />
              Reported {ago(reportedAt)} · {weekLabel(cycleLabel)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * The single most important thing right now.
 *
 * Bordered in the status colour rather than filled: this is the first thing the
 * eye lands on, and a filled panel at the top of a page reads as an alert even
 * when the news is good.
 */
function Highlight({
  commitment,
  cycleLabel,
}: {
  commitment: CommitmentRow | undefined;
  cycleLabel: string;
}) {
  if (!commitment) {
    return (
      <GlassCard
        level={2}
        className="border-[var(--color-delivered)]/30 bg-[var(--color-delivered)]/[0.05] p-5"
      >
        <p className="eyebrow" style={{ color: "var(--color-delivered)" }}>
          Current highlight
        </p>
        <p className="mt-2 text-base leading-relaxed text-white/90">
          Nothing is blocked or carrying. Everything on your list for{" "}
          {weekLabel(cycleLabel)} is moving.
        </p>
      </GlassCard>
    );
  }

  const s = statusOf(commitment.status);
  const isBlocked = commitment.status === "blocked";

  return (
    <div
      className="glass-l2 glass-sheen relative overflow-hidden rounded-lg p-5"
      style={{
        borderColor: `color-mix(in oklab, ${s.tone} 32%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${s.tone} 5%, transparent)`,
      }}
    >
      <div className="relative z-10">
        <p className="eyebrow flex items-center gap-1.5" style={{ color: s.tone }}>
          <Target size={12} aria-hidden="true" />
          Current highlight
        </p>
        <p className="mt-2 text-base leading-relaxed text-white/90">{commitment.title}.</p>
        <p className="body-sm mt-1.5">
          {isBlocked
            ? commitment.depends_on_department
              ? `Waiting on ${commitment.depends_on_department}. Blocked work is not counted against your delivery.`
              : "Blocked, with nobody named yet. Blocked work is not counted against your delivery."
            : commitment.carry_depth > 1
              ? `This has moved ${commitment.carry_depth} times. Worth deciding what the smallest shippable piece would be.`
              : "The most open item on your list this week."}
        </p>
      </div>
    </div>
  );
}

/*
 * What NEXUS noticed, and why it is saying so.
 *
 * The "why am I seeing this" control is not decoration. An assistant that
 * volunteers observations has to be able to say what prompted each one, or it
 * reads as surveillance rather than support.
 */
function StrategicPartner({
  coaching,
  openCount,
  carriedCount,
}: {
  coaching: { title: string; body: string; based_on: string }[];
  openCount: number;
  carriedCount: number;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const top = coaching[0];

  return (
    <GlassCard level={2} className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-2 text-sm font-medium text-white/90">
          <Brain size={15} className="text-[var(--dept-techspecialist)]" aria-hidden="true" />
          NEXUS noticed
        </p>
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="-mr-2 inline-flex min-h-11 items-center px-2 text-2xs text-white/35 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        >
          Why am I seeing this?
        </button>
      </div>

      {top ? (
        <>
          <p className="mt-2 text-base font-medium leading-snug text-white/90">{top.title}</p>
          <p className="body-sm mt-1.5">{top.body}</p>
          {showWhy && (
            <p className="note mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              Based on {top.based_on}. Every observation here comes from a figure counted
              in your own reconciliation — never from anything the system watched you do.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="body-sm mt-2">
            {carriedCount > 0
              ? `${carriedCount} of your commitments have carried from an earlier week. Worth closing or splitting one before adding more.`
              : openCount > 0
                ? `You have ${openCount} open ${openCount === 1 ? "commitment" : "commitments"} this cycle.`
                : "Nothing needs flagging this week."}
          </p>
          {showWhy && (
            <p className="note mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              Counted from your commitments for this cycle. NEXUS has no activity tracking
              of any kind.
            </p>
          )}
        </>
      )}

      <Link
        href="/advice"
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
      >
        View coaching <ChevronRight size={13} aria-hidden="true" />
      </Link>
    </GlassCard>
  );
}

/*
 * A question NEXUS wants answered, with one-tap answers.
 *
 * Answering here writes a status directly, which is why every option is an
 * explicit declaration. `declared: true` is the whole point — the integrity
 * score turns on whether somebody SAID a thing changed, and a status inferred
 * from silence is exactly what this question exists to prevent.
 */
function FollowUp({
  question,
  commitments,
}: {
  question: string;
  commitments: CommitmentRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  /* The question quotes the commitment title, so match it back to a row. */
  const subject = commitments.find((c) => question.includes(c.title));

  async function answer(status: string) {
    if (!subject) return;
    setSaving(status);
    try {
      const res = await fetch(`/api/commitments/${subject.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, declared: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAnswered(true);
      toast({ variant: "success", title: "Thanks — recorded" });
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "Could not record that",
        description: "Try again, or answer it in your next check-in.",
      });
    } finally {
      setSaving(null);
    }
  }

  if (answered) {
    return (
      <GlassCard level={2} className="p-5">
        <p className="flex items-center gap-2 text-sm text-white/85">
          <Check size={15} className="text-[var(--color-delivered)]" aria-hidden="true" />
          Recorded. That is one less thing to explain later.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard level={2} className="p-5">
      <p className="flex items-start gap-1.5 text-base font-medium leading-snug text-white/90">
        <CircleAlert
          size={15}
          className="mt-0.5 shrink-0 text-[var(--color-partial)]"
          aria-hidden="true"
        />
        {question}
      </p>

      {subject ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ANSWERS.map((a) => (
            <button
              key={a.value}
              type="button"
              disabled={saving !== null}
              onClick={() => void answer(a.value)}
              className={cn(
                "min-h-11 rounded-full border border-white/[0.12] bg-white/[0.04] px-4 text-xs text-white/80",
                "transition-colors hover:bg-white/[0.09] disabled:opacity-40",
                saving === a.value && "bg-white/[0.12]",
              )}
            >
              {saving === a.value ? "Saving…" : a.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="note mt-2">Answer this in your next check-in.</p>
      )}
    </GlassCard>
  );
}

function Score({
  label,
  value,
  of,
  suffix = "",
}: {
  label: string;
  value: number | null;
  of?: number;
  suffix?: string;
}) {
  return (
    <div>
      <p className="metric text-xl leading-none text-white/95">
        {value === null ? "—" : value}
        {of !== undefined && <span className="text-white/30"> / {of}</span>}
        {value !== null && suffix}
      </p>
      <p className="note mt-1">{label}</p>
    </div>
  );
}
