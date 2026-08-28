"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Clock,
  Keyboard,
  Loader2,
  Mic,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Target,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { GlassCard } from "@/components/ui/glass-card";
import { useDictation } from "@/lib/voice";
import { useToast } from "@/components/ui/toast";
import { weekLabel } from "@/lib/cycle";
import { filingFailure } from "@/lib/api-messages";
import type { OpenCommitment } from "@/lib/checkin";

/*
 * The weekly reconciliation.
 *
 * Two shapes of the same flow, sharing one piece of state:
 *
 *   phone    a five-step wizard — one decision per screen, thumb-first
 *   desktop  a three-column workspace — the whole week visible at once
 *
 * That split is the point. A wizard on a 1440px display wastes the width and
 * makes somebody click through what they could have read; the same three
 * columns on a 390px phone is a wall. Neither is a fallback for the other.
 *
 * State lives in this component and both layouts read it, so switching
 * breakpoints mid-flow never loses an answer.
 *
 * THE ORDER IS THE SAFETY PROPERTY. Resolve, describe, confirm what was
 * understood, plan, review — and only the final confirm writes. Everything
 * before it goes through /api/check-in/draft, which cannot write at all.
 */

const RESOLUTIONS = [
  { value: "delivered", label: "Done", hint: "Finished and closed out" },
  { value: "partial", label: "Partly done", hint: "Some of it landed" },
  { value: "in_progress", label: "Still working on it", hint: "Carrying into next week" },
  { value: "blocked", label: "Blocked", hint: "Waiting on something outside my control" },
  { value: "deferred", label: "Delayed", hint: "Pushed to a later week" },
  { value: "dropped", label: "No longer relevant", hint: "Scope changed or dropped" },
] as const;

const STATUS_TONE: Record<string, string> = {
  delivered: "var(--color-delivered)",
  partial: "var(--color-partial)",
  in_progress: "var(--color-in-progress)",
  blocked: "var(--color-blocked)",
  deferred: "var(--text-secondary)",
  dropped: "var(--text-secondary)",
};

type Understood = {
  progress: string;
  plan: string;
  question: string | null;
};

type Update = { commitmentId: string; title: string; status: string };

/** 0 is the entry screen; 1–5 are the wizard steps the design numbers. */
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_TITLE: Record<Exclude<Step, 0>, string> = {
  1: "Reconciliation",
  2: "Unplanned changes",
  3: "NEXUS interpretation",
  4: "Next week commitments",
  5: "Verification & summary",
};

/*
 * Which layout to render — one of them, never both.
 *
 * The first attempt shipped both and hid one with `lg:hidden`. That leaves
 * every control of the hidden layout in the DOM: a screen reader announces
 * twenty-one buttons where seven are visible, the tab order walks through a
 * form nobody can see, and the touch-target sweep measures elements with no
 * size. Visual hiding is not hiding.
 *
 * useSyncExternalStore rather than an effect: the server cannot know the
 * viewport, so this has to differ between the server render and the first
 * client render, and this is the hook built for exactly that shape. The server
 * snapshot is `false` — mobile-first, so the narrow layout is what renders
 * without JavaScript.
 */
const DESKTOP = "(min-width: 1024px)";

function subscribeToWidth(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const isDesktopNow = () =>
  typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;
const isDesktopOnServer = () => false;


export function CheckInFlow({
  cycleId,
  cycleLabel,
  open,
  deliveryRate,
  streakWeeks,
}: {
  cycleId: string;
  cycleLabel: string;
  open: OpenCommitment[];
  /** Last settled delivery rate, or null when no week has settled. */
  deliveryRate: number | null;
  /** Consecutive weeks reported, counted in SQL. */
  streakWeeks: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const dictation = useDictation();

  const [step, setStep] = useState<Step>(0);
  /*
   * Which commitment step 1 is asking about.
   *
   * One per screen, deliberately. Stacked, three commitments made step 1 a
   * 2,500px scroll with eighteen buttons — the wall the wizard exists to
   * avoid. One decision per screen is the whole reason a phone gets a wizard
   * and a desktop gets a workspace.
   */
  const [at, setAt] = useState(0);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [blockerNote, setBlockerNote] = useState<Record<string, string>>({});

  const [changed, setChanged] = useState("");
  const [nextWeek, setNextWeek] = useState("");
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);

  const [sorting, setSorting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictated = useRef(false);
  /** Which field the microphone is currently filling. */
  const target = useRef<"changed" | "next">("changed");

  const listening = dictation.listening && !dictation.error;
  const answered = Object.keys(resolutions).length;

  /*
   * Send text to be sorted. Writes nothing.
   *
   * If it fails, the words go through exactly as typed — they were always a
   * valid update on their own, and nobody should lose a week's reporting
   * because a model had a bad minute.
   */
  const sort = useCallback(
    async (text: string, forStep: Step) => {
      const said = text.trim();
      if (!said) {
        setStep(forStep);
        return;
      }
      setSorting(true);
      setError(null);
      try {
        const res = await fetch("/api/check-in/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: said, cycleId }),
        });
        if (res.status === 401) {
          setError("Your session ended. Sign in again before filing this.");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          draft: Understood;
          updates: Update[];
        };
        setUnderstood(data.draft);
        setUpdates(data.updates);
        if (data.draft.plan) {
          setPlanned(
            data.draft.plan
              .split(/\n|(?<=\.)\s+/)
              .map((l) => l.replace(/^[-•]\s*/, "").trim())
              .filter((l) => l.length > 3),
          );
        }
      } catch {
        setUnderstood({ progress: said, plan: "", question: null });
        setUpdates([]);
      } finally {
        setSorting(false);
        setStep(forStep);
      }
    },
    [cycleId],
  );

  function startDictation(into: "changed" | "next") {
    target.current = into;
    dictated.current = true;
    dictation.reset();
    dictation.start();
  }

  function stopDictation() {
    dictation.stop();
    const said = dictation.transcript.trim();
    if (!said) return;
    if (target.current === "changed") setChanged((v) => (v ? `${v} ${said}` : said));
    else setNextWeek((v) => (v ? `${v} ${said}` : said));
  }

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          progress: understood?.progress || changed,
          plan: nextWeek || understood?.plan || "",
          dictated: dictated.current,
          resolutions: Object.entries(resolutions).map(([commitmentId, status]) => ({
            commitmentId,
            status,
            reason: blockerNote[commitmentId] || undefined,
          })),
        }),
      });
      if (!res.ok) throw new Error(filingFailure(res.status));
      toast({
        variant: "success",
        title: "Filed",
        description: "Your week is recorded and will appear in this week's brief.",
      });
      router.push("/my-week");
      router.refresh();
    } catch (e) {
      /*
       * The flow stays exactly where it was. Everything typed and every
       * resolution is still in state, so the retry costs one tap rather than
       * five steps — which is the whole reason this does not navigate away or
       * reset on failure.
       */
      setSaving(false);
      toast({
        variant: "error",
        title: "Could not file that",
        description:
          e instanceof Error
            ? e.message
            : "NEXUS could not be reached. Your words are still here — try again.",
      });
    }
  }

  /*
   * What step 3 confirms: everything NEXUS has been told, from both routes.
   *
   * Somebody who resolves six commitments by tapping and then skips "what
   * changed this week" has still told NEXUS six things — but `updates` only
   * ever held what the sorter found in dictated text, so step 3 showed them
   * "Nothing to show yet." and asked them to confirm an empty screen.
   *
   * The sorter wins on a collision: if they tapped "Delayed" and then said
   * why, their own words are the better record of the same commitment.
   */
  const confirmed: Update[] = [
    ...updates,
    ...open
      .filter((c) => resolutions[c.id] && !updates.some((u) => u.commitmentId === c.id))
      .map((c) => ({ commitmentId: c.id, title: c.title, status: resolutions[c.id] })),
  ];

  const shared = {
    open,
    resolutions,
    setResolutions,
    blockerNote,
    setBlockerNote,
    changed,
    setChanged,
    nextWeek,
    setNextWeek,
    understood,
    updates: confirmed,
    planned,
    listening,
    dictation,
    startDictation,
    stopDictation,
    sorting,
    saving,
    error,
    submit,
    sort,
    step,
    setStep,
    at,
    setAt,
    cycleLabel,
    deliveryRate,
    streakWeeks,
    answered,
  };

  const desktop = useSyncExternalStore(
    subscribeToWidth,
    isDesktopNow,
    isDesktopOnServer,
  );

  return desktop ? <DesktopWorkspace {...shared} /> : <MobileWizard {...shared} />;
}

type Shared = Parameters<typeof MobileWizard>[0];

// ---------------------------------------------------------------------------
// Phone: one decision per screen
// ---------------------------------------------------------------------------

function MobileWizard(props: {
  open: OpenCommitment[];
  resolutions: Record<string, string>;
  setResolutions: (f: (p: Record<string, string>) => Record<string, string>) => void;
  blockerNote: Record<string, string>;
  setBlockerNote: (f: (p: Record<string, string>) => Record<string, string>) => void;
  changed: string;
  setChanged: (v: string | ((p: string) => string)) => void;
  nextWeek: string;
  setNextWeek: (v: string | ((p: string) => string)) => void;
  understood: Understood | null;
  updates: Update[];
  planned: string[];
  listening: boolean;
  dictation: ReturnType<typeof useDictation>;
  startDictation: (into: "changed" | "next") => void;
  stopDictation: () => void;
  sorting: boolean;
  saving: boolean;
  error: string | null;
  submit: () => void;
  sort: (text: string, forStep: Step) => Promise<void>;
  step: Step;
  setStep: (s: Step) => void;
  at: number;
  setAt: (n: number) => void;
  cycleLabel: string;
  deliveryRate: number | null;
  streakWeeks: number;
  answered: number;
}) {
  const {
    open, resolutions, setResolutions, blockerNote, setBlockerNote,
    changed, setChanged, nextWeek, setNextWeek, understood, updates, planned,
    listening, dictation, startDictation, stopDictation, sorting, saving,
    error, submit, sort, step, setStep, at, setAt, cycleLabel,
  } = props;

  /*
   * Back to the top whenever the screen changes.
   *
   * Every step puts its action at the bottom, so by the time somebody taps
   * "Next commitment" they are ~250px down the page. Without this they arrive
   * at the next commitment already scrolled past its title and past the
   * sentence they wrote about it last week. A wizard that asks one question
   * per screen has to actually show the question.
   *
   * Instant, not smooth: a 250px animated scroll on every tap reads as the
   * page recovering from something rather than a new screen arriving.
   */
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "auto" });
  }, [step, at]);

  const current = open[at];
  const lastCommitment = at >= open.length - 1;

  /* ---- 0: the entry screen ---------------------------------------------- */
  if (step === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NEXUS</p>
          <span className="metric rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
            {cycleLabel}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {/*
            One ambient element, and only here. The entry screen has a single
            job — start — so it can afford presence. No other step does.
          */}
          <m.span
            aria-hidden="true"
            className="mb-10 block size-40 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(124,124,255,0.45), rgba(124,124,255,0) 68%)",
            }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />

          <h1 className="text-3xl font-semibold tracking-tight">Reconcile your week</h1>
          <p className="standfirst mx-auto mt-3">
            Go through last week&rsquo;s commitments, then tell NEXUS what changed.
          </p>

          <p className="mt-8 flex items-center gap-2.5 rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-secondary">
            <Clock size={16} className="text-[var(--dept-techspecialist)]" aria-hidden="true" />
            {open.length === 0
              ? "Nothing outstanding — this will be quick"
              : `${open.length} ${open.length === 1 ? "commitment" : "commitments"} to go through`}
          </p>
        </div>

        <StickyBar>
          <PrimaryButton onClick={() => setStep(1)} className="w-full">
            Begin
          </PrimaryButton>
        </StickyBar>
      </div>
    );
  }

  const stepNumber = step as Exclude<Step, 0>;

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
      <WizardHeader
        step={stepNumber}
        title={STEP_TITLE[stepNumber]}
        onBack={() => {
          if (step === 1 && at > 0) setAt(at - 1);
          else setStep((step - 1) as Step);
        }}
      />

      <div className="flex-1 pt-6">
        {/* ---- 1: last week ------------------------------------------------ */}
        {step === 1 && (
          <>
            <h2 className="text-2xl font-semibold tracking-tight">
              Last week&rsquo;s target
            </h2>
            <p className="standfirst mt-1">How did you progress on this commitment?</p>

            {open.length === 0 || !current ? (
              <GlassCard level={1} className="mt-5 p-5 text-center">
                <Check
                  size={22}
                  className="mx-auto text-[var(--color-delivered)]"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-medium text-white/90">Nothing outstanding</p>
                <p className="note mt-1">
                  You had no open commitments, so go straight to what changed.
                </p>
              </GlassCard>
            ) : (
              <>
                {open.length > 1 && (
                  <p className="note mt-3">
                    Commitment {at + 1} of {open.length}
                  </p>
                )}
                <div className="mt-4">
                  <CommitmentPrompt
                    key={current.id}
                    commitment={current}
                    chosen={resolutions[current.id]}
                    onChoose={(v) =>
                      setResolutions((p) => ({ ...p, [current.id]: v }))
                    }
                    note={blockerNote[current.id] ?? ""}
                    onNote={(v) => setBlockerNote((p) => ({ ...p, [current.id]: v }))}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ---- 2: what changed --------------------------------------------- */}
        {step === 2 && (
          <>
            <h2 className="text-2xl font-semibold tracking-tight">What changed this week?</h2>
            <p className="standfirst mt-1">
              Anything new, finished, or blocked that was not on your list.
            </p>

            <Capture
              value={changed}
              onChange={setChanged}
              listening={listening}
              dictation={dictation}
              onStart={() => startDictation("changed")}
              onStop={stopDictation}
              placeholder="Tap to type your update instead…"
            />
          </>
        )}

        {/* ---- 3: what NEXUS understood ------------------------------------ */}
        {step === 3 && (
          <>
            <h2 className="text-2xl font-semibold tracking-tight">What NEXUS understood</h2>
            <p className="standfirst mt-1">
              Everything you have told NEXUS so far. Nothing is filed until you
              confirm it.
            </p>
            <Understanding understood={understood} updates={updates} sorting={sorting} />
          </>
        )}

        {/* ---- 4: next week ------------------------------------------------ */}
        {step === 4 && (
          <>
            <h2 className="text-2xl font-semibold tracking-tight">Focus for next cycle?</h2>
            <p className="standfirst mt-1">
              Speak or write it plainly. Whatever you say here becomes next week&rsquo;s
              commitments.
            </p>

            <Capture
              value={nextWeek}
              onChange={setNextWeek}
              listening={listening}
              dictation={dictation}
              onStart={() => startDictation("next")}
              onStop={stopDictation}
              placeholder="Type next week&rsquo;s focus instead…"
            />

            {planned.length > 0 && (
              <div className="mt-6">
                <p className="eyebrow">Here&rsquo;s what I understood</p>
                <ul className="mt-2 space-y-2">
                  {planned.map((t) => (
                    <li
                      key={t}
                      className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5"
                    >
                      <Target
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--dept-techspecialist)]"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-snug text-white/85">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ---- 5: review --------------------------------------------------- */}
        {step === 5 && (
          <Review
            open={open}
            resolutions={resolutions}
            planned={planned.length ? planned : nextWeek ? [nextWeek] : []}
            cycleLabel={cycleLabel}
          />
        )}

        {error && (
          <p className="mt-4 flex items-start gap-1.5 text-2xs leading-snug text-[var(--color-warning)]">
            <CircleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>

      <StickyBar>
        {step === 1 && (
          <>
            <GhostButton onClick={() => setStep(2)}>Skip all</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (!lastCommitment) setAt(at + 1);
                else setStep(2);
              }}
              className="flex-1"
            >
              {lastCommitment ? "Next step" : "Next commitment"}
            </PrimaryButton>
          </>
        )}
        {step === 2 && (
          <>
            <GhostButton onClick={() => setStep(3)}>Skip this</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (listening) stopDictation();
                void sort(listening ? [changed, dictation.transcript].filter(Boolean).join(" ") : changed, 3);
              }}
              disabled={sorting}
              className="flex-1"
            >
              {sorting ? <Loader2 size={15} className="animate-spin" /> : null}
              {sorting ? "Sorting…" : listening ? "I'm done speaking" : "I'm done"}
            </PrimaryButton>
          </>
        )}
        {step === 3 && (
          <>
            <GhostButton onClick={() => setStep(2)}>Edit</GhostButton>
            <PrimaryButton onClick={() => setStep(4)} className="flex-1">
              Looks correct
            </PrimaryButton>
          </>
        )}
        {step === 4 && (
          <>
            <GhostButton onClick={() => setStep(5)}>Skip</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (listening) stopDictation();
                void sort(listening ? [nextWeek, dictation.transcript].filter(Boolean).join(" ") : nextWeek, 5);
              }}
              disabled={sorting}
              className="flex-1"
            >
              {sorting ? <Loader2 size={15} className="animate-spin" /> : null}
              Approve commitments
            </PrimaryButton>
          </>
        )}
        {step === 5 && (
          <>
            <GhostButton onClick={() => setStep(1)}>Edit</GhostButton>
            <PrimaryButton onClick={submit} disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Filing…
                </>
              ) : (
                <>
                  <Send size={15} /> Confirm report
                </>
              )}
            </PrimaryButton>
          </>
        )}
      </StickyBar>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop: the whole week at once
// ---------------------------------------------------------------------------

function DesktopWorkspace(props: Shared) {
  const {
    open, resolutions, setResolutions, changed, setChanged, nextWeek, setNextWeek,
    understood, updates, listening, dictation, startDictation, stopDictation,
    sorting, saving, submit, sort, cycleLabel, answered,
  } = props;

  const delivered = Object.values(resolutions).filter((v) => v === "delivered").length;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:gap-5">
      {/* Header */}
      <header className="flex shrink-0 items-start justify-between gap-6 pt-1">
        <div className="min-w-0">
          {/*
            Plain language, not the operating model. "Weekly reconciliation",
            "cycle archive" and "reconciliation stats" describe how NEXUS
            works internally; nobody filing a report should have to learn the
            database's vocabulary to say what they did. The technical terms
            stay in the code, the schema and the executive surfaces, where
            they are precise and the reader wants precision.
          */}
          <h1 className="page-title">Check in</h1>
          <p className="mt-1 text-lg font-medium leading-snug text-[var(--nx-text-primary)]">
            Let&rsquo;s wrap up your week
          </p>
          <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-[var(--nx-text-secondary)]">
            What happened to what you planned, what changed, and what you are doing next
            &mdash; all on one page.
          </p>
        </div>
        <Stages answered={answered} total={open.length} hasUnderstood={Boolean(understood)} />
      </header>

      {/* Body: previous commitments + what changed */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.5fr)] lg:gap-5">
        {/* Your commitments */}
        <section
          aria-label="Your commitments"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035]"
        >
          <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <p className="eyebrow">Your commitments</p>
              <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--nx-text-primary)]">
                {weekLabel(cycleLabel)}
              </h2>
            </div>
            <span className="metric text-xs text-[var(--nx-text-secondary)]">
              {answered}/{open.length} reviewed
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {open.length === 0 ? (
              <p className="note mx-1 mt-2">Nothing was outstanding this week.</p>
            ) : (
              <ul className="space-y-2.5">
                {open.map((c) => (
                  <li key={c.id}>
                    <CompactPrompt
                      commitment={c}
                      chosen={resolutions[c.id]}
                      onChoose={(v) => setResolutions((p) => ({ ...p, [c.id]: v }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="shrink-0 border-t border-white/[0.06] px-5 py-3">
            <span className="note">
              {delivered} of {open.length} delivered.
            </span>
          </footer>
        </section>

        {/* What changed */}
        <section
          aria-label="What changed this week"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035]"
        >
          <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
            <Sparkles size={16} className="text-[var(--nx-primary)]" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold text-[var(--nx-text-primary)]">
              What changed this week?
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <p className="body-sm mt-0.5">
              Anything new, finished, or blocked that was not on your list. Speak it or type
              it.
            </p>

            <div className="mt-4">
              <Composer
                value={changed}
                onChange={setChanged}
                listening={listening}
                dictation={dictation}
                onStart={() => startDictation("changed")}
                onStop={stopDictation}
                rows={5}
                placeholder="Finished the onboarding checklist. Legal is still blocking the vendor contract…"
              />
            </div>

            <div className="mt-3 flex justify-end">
              <PrimaryAction
                onClick={() => void sort(changed, 3)}
                disabled={sorting || listening || !changed.trim()}
              >
                {sorting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {sorting ? "Sorting…" : "Sort this out"}
              </PrimaryAction>
            </div>

            {(understood || sorting) && (
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <h3 className="text-sm font-semibold text-[var(--nx-text-primary)]">
                  NEXUS organized your update
                </h3>
                <div className="mt-2.5">
                  <Understanding understood={understood} updates={updates} sorting={sorting} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Focus for next week */}
      <section
        aria-label="Focus for next week"
        className="shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.035]"
      >
        <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="w-full lg:w-64 lg:shrink-0">
            <h2 className="text-[15px] font-semibold text-[var(--nx-text-primary)]">
              Focus for next week
            </h2>
            <p className="body-sm mt-0.5">
              Whatever you say here becomes next week&rsquo;s commitments.
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <Composer
              value={nextWeek}
              onChange={setNextWeek}
              listening={listening}
              dictation={dictation}
              onStart={() => startDictation("next")}
              onStop={stopDictation}
              rows={2}
              placeholder="Ship the vendor launch by Friday and finish the API documentation…"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="note flex items-start gap-1.5">
          <TriangleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
          Review before confirming &mdash; this becomes part of this week&rsquo;s brief.
        </p>
        <PrimaryAction onClick={submit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Filing…
            </>
          ) : (
            <>
              <Send size={15} /> Confirm report
            </>
          )}
        </PrimaryAction>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces used by both layouts
// ---------------------------------------------------------------------------

function WizardHeader({
  step,
  title,
  onBack,
}: {
  step: number;
  title: string;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <p className="eyebrow" style={{ color: "var(--dept-techspecialist)" }}>
          {title}
        </p>
        <span className="metric text-xs text-white/40">{step}/5</span>
      </div>

      {/*
        A single filled bar, not five dots. The dots invite counting; the bar
        answers the only question somebody has mid-flow — how much is left.
      */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.10]">
        <m.span
          className="block h-full rounded-full bg-[var(--dept-techspecialist)]"
          initial={false}
          animate={{ width: `${(step / 5) * 100}%` }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        />
      </div>
    </div>
  );
}

function CommitmentPrompt({
  commitment,
  chosen,
  onChoose,
  note,
  onNote,
}: {
  commitment: OpenCommitment;
  chosen?: string;
  onChoose: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  return (
    <>
      <GlassCard level={1} className="p-4">
        <p className="text-base font-medium leading-snug text-white/95">{commitment.title}</p>
        {commitment.source_quote && (
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            <span className="font-medium text-white/70">Last week you said: </span>
            &ldquo;{commitment.source_quote}&rdquo;
          </p>
        )}
        {commitment.carry_depth > 1 && (
          <p className="note mt-2 flex items-center gap-1.5">
            <RefreshCw size={11} aria-hidden="true" />
            Carried {commitment.carry_depth} times
          </p>
        )}
      </GlassCard>

      {/*
        Each option carries a plain-language hint.

        "Delayed" and "Dropped" are the two people misuse most, and the
        difference between them is the difference between a declared slip and a
        silent one — which is what the whole integrity score turns on. A label
        alone does not teach that; one line under it does.
      */}
      <ul className="mt-3 space-y-2">
        {RESOLUTIONS.map((r) => {
          const active = chosen === r.value;
          return (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => onChoose(r.value)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                  active
                    ? "bg-white/[0.06]"
                    : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]",
                )}
                style={active ? { borderColor: STATUS_TONE[r.value] } : undefined}
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-2 shrink-0 rounded-full"
                  style={{
                    background: active ? STATUS_TONE[r.value] : "rgba(255,255,255,0.18)",
                  }}
                />
                <span className="min-w-0">
                  <span
                    className="block text-base font-medium leading-snug"
                    style={{ color: active ? STATUS_TONE[r.value] : "rgba(255,255,255,0.9)" }}
                  >
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-secondary">{r.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen === "blocked" && (
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="mt-3 rounded-xl border border-[var(--color-partial)]/25 bg-[var(--color-partial)]/[0.07] p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-partial)]">
            <CircleAlert size={14} aria-hidden="true" />
            What is blocking this?
          </p>
          {/*
            Asked only when they say blocked, and asked in their words. A
            blocker with no owner cannot be escalated to anybody, which is the
            single most common way work stalls invisibly between two teams.
          */}
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
            placeholder="Who or what is it waiting on?"
            aria-label="What is blocking this"
            className="mt-2 w-full resize-none rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
        </m.div>
      )}
    </>
  );
}

function CompactPrompt({
  commitment,
  chosen,
  onChoose,
}: {
  commitment: OpenCommitment;
  chosen?: string;
  onChoose: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-snug text-white/90">
          {commitment.title}
        </p>
        {chosen && (
          <span className="shrink-0 text-2xs" style={{ color: STATUS_TONE[chosen] }}>
            {RESOLUTIONS.find((r) => r.value === chosen)?.label}
          </span>
        )}
      </div>
      {commitment.source_quote && (
        <p className="note mt-1 line-clamp-2">
          Last week: &ldquo;{commitment.source_quote}&rdquo;
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {RESOLUTIONS.map((r) => {
          const active = chosen === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChoose(r.value)}
              aria-pressed={active}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-xs transition-colors",
                active
                  ? "bg-white/[0.08] text-white"
                  : "border-white/[0.10] bg-white/[0.03] text-white/65 hover:bg-white/[0.08]",
              )}
              style={active ? { borderColor: STATUS_TONE[r.value] } : undefined}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Understanding({
  understood,
  updates,
  sorting,
}: {
  understood: Understood | null;
  updates: Update[];
  sorting: boolean;
}) {
  if (sorting) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-secondary">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        Sorting that out…
      </p>
    );
  }
  if (!understood && updates.length === 0) {
    return (
      <p className="body-sm mt-3">
        Nothing to confirm — you have not resolved a commitment or described
        anything yet. Go back a step, or file the week as it stands.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2.5">
      {understood?.progress && (
        <ParsedRow tag="Completed" tone="var(--color-delivered)" text={understood.progress} />
      )}
      {updates.map((u) => (
        <ParsedRow
          key={u.commitmentId}
          tag={RESOLUTIONS.find((r) => r.value === u.status)?.label ?? u.status}
          tone={STATUS_TONE[u.status] ?? "var(--color-promised)"}
          text={u.title}
        />
      ))}
      {understood?.plan && (
        <ParsedRow tag="Next cycle" tone="var(--dept-techspecialist)" text={understood.plan} />
      )}

      {understood?.question && (
        <p className="rounded-lg border border-[var(--color-partial)]/20 bg-[var(--color-partial)]/[0.07] px-3.5 py-3 text-sm leading-relaxed text-white/85">
          {understood.question}
        </p>
      )}
    </div>
  );
}

function ParsedRow({ tag, tone, text }: { tag: string; tone: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <span
        className="rounded-md px-2 py-0.5 text-2xs font-medium uppercase tracking-wide"
        style={{ background: `color-mix(in oklab, ${tone} 16%, transparent)`, color: tone }}
      >
        {tag}
      </span>
      <p className="mt-2 text-sm font-medium leading-snug text-white/90">{text}</p>
    </div>
  );
}

function Review({
  open,
  resolutions,
  planned,
  cycleLabel,
}: {
  open: OpenCommitment[];
  resolutions: Record<string, string>;
  planned: string[];
  cycleLabel: string;
}) {
  const done = Object.values(resolutions).filter((v) => v === "delivered").length;
  const going = Object.values(resolutions).filter(
    (v) => v === "in_progress" || v === "partial",
  ).length;
  const blocked = Object.values(resolutions).filter((v) => v === "blocked").length;
  const carried = open.filter((c) => c.carry_depth > 1);

  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Review weekly brief</h2>
      <p className="standfirst mt-1">
        Your confirmed update becomes part of this week&rsquo;s organisational brief.
      </p>

      {/*
        Three counts, straight from the answers just given. No ring, no chart —
        this is the moment somebody checks their own week against what they
        remember, and three numbers do that better than a shape.
      */}
      <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.08] rounded-xl border border-white/[0.08] bg-white/[0.02] py-4">
        <ReviewStat value={done} label="Completed" tone="var(--color-delivered)" />
        <ReviewStat value={going} label="In progress" tone="var(--color-in-progress)" />
        <ReviewStat value={blocked} label="Blocked" tone="var(--color-blocked)" />
      </div>

      {carried.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--dept-techspecialist)]/25 bg-[var(--dept-techspecialist)]/[0.07] p-4">
          <p className="text-sm leading-relaxed text-white/85">
            <span className="font-medium text-[var(--dept-techspecialist)]">
              NEXUS noticed:{" "}
            </span>
            &ldquo;{carried[0].title}&rdquo; has now moved {carried[0].carry_depth} times.
          </p>
        </div>
      )}

      <div className="mt-5">
        <p className="eyebrow">What you&rsquo;re planning next</p>
        {planned.length === 0 && (
          /*
            Said, not left blank. An empty region here reads as something that
            failed to load; naming it as a choice they made — and offering the
            way back — is the difference between a gap and an answer.
          */
          <p className="note mt-2">
            None set. You can go back and add next week&rsquo;s focus, or leave it and
            capture it in your next update.
          </p>
        )}
      </div>

      {planned.length > 0 && (
        <div className="mt-3">
          <ul className="mt-2 space-y-2">
            {planned.map((t) => (
              <li
                key={t}
                className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--dept-techspecialist)]"
                />
                <span className="text-sm leading-snug text-white/85">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="note mt-5">
        Confirming this shares it with {cycleLabel}&rsquo;s brief. Your lead and the Chairman
        see the figures, never your raw words.
      </p>
    </>
  );
}

/*
 * A zero is never painted in its status colour.
 *
 * "0" in the blocked red reads as a warning about nothing, and a review screen
 * that alarms you on a clean week teaches you to stop reading it. Colour here
 * means "this happened"; grey means it did not.
 */
function ReviewStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="text-center">
      <p
        className="metric text-2xl leading-none"
        style={{ color: value > 0 ? tone : "var(--text-quaternary)" }}
      >
        {value}
      </p>
      <p className="note mt-1">{label}</p>
    </div>
  );
}

function Capture({
  value,
  onChange,
  listening,
  dictation,
  onStart,
  onStop,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  listening: boolean;
  dictation: ReturnType<typeof useDictation>;
  onStart: () => void;
  onStop: () => void;
  placeholder: string;
}) {
  const live = [dictation.transcript, dictation.interim].filter(Boolean).join(" ");

  return (
    <div className="mt-6">
      {dictation.supported && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center">
          <button
            type="button"
            onClick={listening ? onStop : onStart}
            aria-pressed={listening}
            aria-label={listening ? "Stop speaking" : "Speak your update"}
            className={cn(
              "mx-auto grid size-20 place-items-center rounded-full transition-colors",
              listening
                ? "bg-[var(--color-critical)] text-white"
                : "bg-[var(--dept-techspecialist)] text-white",
            )}
          >
            {listening ? (
              <Square size={22} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={26} aria-hidden="true" />
            )}
          </button>

          <p className="mt-4 text-base font-medium text-white/90">
            {listening ? "NEXUS is listening…" : "Tap to speak"}
          </p>
          <p className="note mt-1">Speak naturally, or type below</p>

          {listening && <Waveform />}

          {live && (
            <p className="mt-4 text-sm leading-relaxed text-white/85">{live}</p>
          )}
        </div>
      )}

      <div className="relative mt-3">
        <Keyboard
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-4 text-white/30"
        />
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.04] py-3.5 pl-10 pr-3.5 text-sm leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
        />
      </div>

      {dictation.unavailableReason && (
        <p className="note mt-2">{dictation.unavailableReason}</p>
      )}
    </div>
  );
}

/** The desktop composer: one box, microphone inside it. */
function Composer({
  value,
  onChange,
  listening,
  dictation,
  onStart,
  onStop,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  listening: boolean;
  dictation: ReturnType<typeof useDictation>;
  onStart: () => void;
  onStop: () => void;
  placeholder: string;
  rows?: number;
}) {
  const live = [dictation.transcript, dictation.interim].filter(Boolean).join(" ");

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border bg-white/[0.04] transition-colors",
        listening ? "border-[var(--color-critical)]/50" : "border-white/[0.12]",
      )}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed text-white/90 placeholder:text-white/25 focus:outline-none"
      />
      {listening && live && (
        <p className="px-4 pb-1 text-sm italic leading-relaxed text-white/45">{live}</p>
      )}
      <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2">
        <span className="note flex items-center gap-1.5">
          <Paperclip size={12} aria-hidden="true" />
          {listening ? "Listening — everything you say lands above" : "Type or speak"}
        </span>
        {dictation.supported && (
          <button
            type="button"
            onClick={listening ? onStop : onStart}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictating" : "Dictate"}
            className={cn(
              "grid size-11 place-items-center rounded-lg transition-colors",
              listening
                ? "bg-[var(--color-critical)]/20 text-[var(--color-critical)]"
                : "text-white/45 hover:bg-white/[0.08] hover:text-white/85",
            )}
          >
            {listening ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Stages({
  answered,
  total,
  hasUnderstood,
}: {
  answered: number;
  total: number;
  hasUnderstood: boolean;
}) {
  const stages = [
    { label: "Previous commitments", done: total === 0 || answered > 0 },
    { label: "What changed", done: hasUnderstood },
    { label: "Next week", done: false },
  ];

  return (
    <ol className="flex shrink-0 items-center gap-2" aria-label="Progress">
      {stages.map((s, i) => {
        const isCurrent = i === stages.findIndex((x) => !x.done);
        return (
          <li key={s.label} className="flex items-center gap-2">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-6",
                  stages[i - 1].done ? "bg-[var(--nx-primary)]/60" : "bg-white/[0.14]",
                )}
              />
            )}
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  s.done
                    ? "bg-[var(--nx-primary-light)]"
                    : isCurrent
                      ? "bg-[var(--nx-primary)] shadow-[0_0_0_3px_rgba(139,92,246,0.2)]"
                      : "bg-white/[0.22]",
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap text-xs",
                  s.done ? "text-[var(--nx-text-primary)]" : "text-[var(--nx-text-secondary)]",
                )}
              >
                {s.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/*
 * The wizard's action bar.
 *
 * Pinned inside the flow rather than to the viewport: the app already has a
 * fixed bottom nav on phones, and a second fixed bar above it eats a third of
 * a small screen.
 */
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 flex items-center gap-3 border-t border-white/[0.08] pt-4">
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full",
        "bg-[var(--dept-techspecialist)] px-6 text-sm font-medium text-white",
        "transition-[filter] hover:brightness-110 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Desktop CTA in NEXUS purple, matching the rest of the surface. */
function PrimaryAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium text-white",
        "bg-[var(--nx-primary)] shadow-[0_8px_24px_-8px_rgba(139,92,246,0.55)]",
        "transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:hover:brightness-100",
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.03] px-5 text-sm text-white/75 transition-colors hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

/* Decorative. aria-hidden: the listening state is already stated in words. */
function Waveform() {
  const bars = [0.4, 0.75, 1, 0.55, 0.9, 0.45, 0.8, 0.35, 0.65];
  return (
    <div aria-hidden="true" className="mt-4 flex h-8 items-center justify-center gap-[3px]">
      {bars.map((h, i) => (
        <m.span
          key={i}
          className="w-[3px] rounded-full bg-[var(--dept-techspecialist)]"
          style={{ height: `${h * 100}%` }}
          animate={{ scaleY: [0.4, 1, 0.6, 0.95, 0.4] }}
          transition={{
            duration: 1 + (i % 3) * 0.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.07,
          }}
        />
      ))}
    </div>
  );
}

