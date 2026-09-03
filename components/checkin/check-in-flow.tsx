"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m } from "motion/react";
import {
  Check,
  CircleAlert,
  Loader2,
  Mic,
  Send,
  Square,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/voice";
import { useToast } from "@/components/ui/toast";
import { weekLabel } from "@/lib/cycle";
import { filingFailure } from "@/lib/api-messages";
import type { OpenCommitment } from "@/lib/checkin";

/*
 * THE WEEKLY REPORT. This page owns reporting, end to end.
 *
 * It used to be one of two complete reporting paths — the other was a card
 * wrapping the whole composer on /my-week — and nothing on either surface said
 * why a person was being offered both. My Week is now the review surface and
 * this is the only place a week is filed.
 *
 * WHAT SOMEBODY DOES HERE, in the order they do it:
 *
 *   1. resolve last week's commitments, if any are open   (optional)
 *   2. say what changed this week                          (submittable alone)
 *   3. say what next week is for                           (submittable alone)
 *   4. review both, and confirm
 *
 * EITHER HALF GOES ON ITS OWN, and that is the structural change.
 *
 * A person on Wednesday knows what has happened and not yet what is next; a
 * person on Friday afternoon may only want to set up Monday. Forcing both
 * through one button meant the honest answer to "what are you doing next week"
 * was often typed to get past a validation rule.
 *
 * The API already supported this and nothing needed changing: `progress` and
 * `plan` both default to "" in /api/check-in, and `saveCheckIn` APPENDS on
 * conflict rather than replacing — so a second submission for the same week
 * adds to `check_ins.raw_text` instead of overwriting it, which is exactly
 * what the append-only guard in migration 0002 requires.
 *
 * WHY THERE IS NO LONGER A PHONE WIZARD.
 *
 * This was two layouts: a five-step wizard below `lg` and a three-column
 * workspace above it. The wizard was a good answer to a linear flow, and this
 * flow is no longer linear — "submit either section independently" cannot be
 * expressed as step 3 of 5. One sectioned form, one column on a phone and two
 * on a desktop, is now the same interaction at every width.
 *
 * THE ORDER IS STILL THE SAFETY PROPERTY. Nothing here writes until a submit
 * button is pressed. The rewrite runs through /api/check-in/rewrite, which is
 * deliberately incapable of writing, and its output is held BESIDE the
 * person's words until they accept it.
 */

const RESOLUTIONS = [
  { value: "delivered", label: "Done", hint: "Finished and closed out" },
  { value: "in_progress", label: "Still going", hint: "Carrying into next week" },
  { value: "partial", label: "Partly done", hint: "Some of it landed" },
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

/** The two free-text sections, and the only things a microphone can fill. */
type FieldId = "changed" | "next";

const SECTION_ID: Record<FieldId, string> = {
  changed: "what-changed",
  next: "next-week",
};

export function CheckInFlow({
  cycleId,
  cycleLabel,
  open,
}: {
  cycleId: string;
  cycleLabel: string;
  open: OpenCommitment[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const launcherAsked = useSearchParams().get("ask") === "1";
  const { toast } = useToast();

  /*
   * ONE RECOGNISER, AND THE FIELD THAT CURRENTLY OWNS IT.
   *
   * THE BUG THIS FIXES. There was one `useDictation()` and both composers were
   * handed its `listening` flag, so pressing the microphone on "what changed"
   * put BOTH fields into the recording state — the second one visibly
   * listening while every word went to the first. A `target` ref decided where
   * the text landed, and nothing decided what the interface showed.
   *
   * `micField` is that missing piece. Each field is told `listening` only when
   * it owns the microphone, so exactly one can ever be recording.
   *
   * It is one shared session rather than one hook per field ON PURPOSE. There
   * is a single microphone on the device: two SpeechRecognition instances
   * would contend for it, and "both fields recording at once" is not a state
   * the hardware can be in. Taking the microphone from the other field is
   * therefore an explicit hand-off — stop, harvest what was said into the
   * field that was listening, then start for the new one — rather than two
   * sessions racing.
   */
  const dictation = useDictation();
  const [micField, setMicField] = useState<FieldId | null>(null);
  /** Whether any of this was spoken. Recorded because raw_text is quoted back. */
  const dictated = useRef(false);

  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [blockerNote, setBlockerNote] = useState<Record<string, string>>({});
  /** Resolutions already sent, so a second submit does not re-file the first. */
  const sentResolutions = useRef<Set<string>>(new Set());

  const [changed, setChanged] = useState("");
  const [nextWeek, setNextWeek] = useState("");

  /** Which sections have reached the database. Drives the filed state. */
  const [filed, setFiled] = useState<Record<FieldId, boolean>>({
    changed: false,
    next: false,
  });
  const [saving, setSaving] = useState<FieldId | "both" | null>(null);

  /*
   * The route answers as soon as the words are saved and reads them afterwards,
   * so the commitments it pulls out land a few seconds after the response. These
   * are the refreshes that go and collect them. Held in a ref so leaving the page
   * mid-extraction does not refresh a route nobody is looking at.
   */
  const followUps = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Whether the last submission left the model still reading. */
  const interpreting = useRef(false);
  useEffect(
    () => () => {
      for (const id of followUps.current) clearTimeout(id);
    },
    [],
  );

  /* Where a harvested dictation lands, keyed by the field that owns the mic. */
  const setValue: Record<FieldId, (updater: (p: string) => string) => void> = {
    changed: (u) => setChanged(u),
    next: (u) => setNextWeek(u),
  };

  /*
   * Stop the microphone and put what was said into the field that owned it.
   *
   * `spoken`, never `transcript`: the recogniser does not mark a phrase final
   * until it hears a pause, so reading the settled text alone drops the last
   * thing a person said — the words are on screen and then they are not. See
   * lib/voice.ts.
   */
  const harvest = useCallback(() => {
    const owner = micField;
    dictation.stop();
    if (!owner) return;
    const said = dictation.spoken.trim();
    if (said) setValue[owner]((v) => (v ? `${v} ${said}` : said));
    dictation.reset();
    setMicField(null);
    // setValue is rebuilt each render and holds only setState identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation, micField]);

  const startMic = useCallback(
    (field: FieldId) => {
      // Hand-off, not a second session — see the note on micField above.
      if (micField && micField !== field) harvest();
      dictated.current = true;
      dictation.reset();
      dictation.start();
      setMicField(field);
    },
    [dictation, harvest, micField],
  );

  /*
   * Arrived from the raised centre button on the phone bar, which carries
   * `?ask=1` and means "open listening".
   *
   * The parameter is stripped in the same pass so a refresh does not reopen
   * the microphone, and the effect keys on it rather than running a toggle —
   * bootstrapping from a URL is how you end up stopping a microphone you never
   * began.
   */
  useEffect(() => {
    if (!launcherAsked) return;
    router.replace(pathname, { scroll: false });
    if (!dictation.supported) return;
    dictated.current = true;
    dictation.reset();
    dictation.start();
    /* Bootstrapping from the URL — see the note in voice-console.tsx. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMicField("changed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcherAsked]);

  /*
   * WHAT ACTUALLY GETS FILED.
   *
   * `which` decides the halves. Resolutions ride along with whichever
   * submission happens first and are then remembered, so filing the second
   * section does not re-send a status the first one already recorded.
   */
  async function submit(which: FieldId | "both") {
    if (micField) harvest();

    const progress = which === "next" ? "" : changed.trim();
    const plan = which === "changed" ? "" : nextWeek.trim();

    const pending = Object.entries(resolutions)
      .filter(([id]) => !sentResolutions.current.has(id))
      .map(([commitmentId, status]) => ({
        commitmentId,
        status,
        reason: blockerNote[commitmentId] || undefined,
      }));

    if (!progress && !plan && pending.length === 0) return;

    setSaving(which);

    /*
     * WHETHER THE SERVER ANSWERED AT ALL, which is a different fact from
     * whether it accepted. See the catch.
     */
    let answeredBack = false;
    let succeeded = false;

    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          progress,
          plan,
          dictated: dictated.current,
          resolutions: pending,
        }),
      });
      answeredBack = true;
      if (!res.ok) throw new Error(filingFailure(res.status));

      succeeded = true;
      for (const r of pending) sentResolutions.current.add(r.commitmentId);
      setFiled((f) => ({
        changed: f.changed || which !== "next",
        next: f.next || which !== "changed",
      }));

      /*
       * "Recorded", and separately "being read".
       *
       * Saving is now the only thing that has happened by the time this runs;
       * extraction is still going. Saying "Filed" and nothing else would leave
       * somebody staring at a week with no commitments on it, wondering what
       * went wrong — so the sentence says the words are safe AND that the
       * reading is still in progress, which is exactly the state of things.
       */
      const stillReading = ((await res
        .clone()
        .json()
        .catch(() => ({}))) as { interpreting?: boolean }).interpreting === true;

      toast({
        variant: "success",
        title: "Filed",
        description:
          (which === "both"
            ? "Your week is recorded. You can add to it any time."
            : which === "changed"
              ? "What changed is recorded. Add next week's focus whenever you are ready."
              : "Next week's focus is recorded.") +
          (stillReading ? " NEXUS is reading it now — anything it finds appears in a moment." : ""),
      });

      interpreting.current = stillReading;
    } catch (e) {
      /*
       * A REJECTED FETCH IS NOT A REJECTED WRITE.
       *
       * This branch used to say "Could not file that" for both, and the two
       * are not the same event. The route runs extraction before it answers,
       * so a slow week can outlast the browser's patience — the report is
       * written and the connection is gone. Somebody was told their check-in
       * failed, wrote it again, and then found the first copy on My Week.
       *
       * With a response in hand the status is a fact and the sentence can be
       * definite. Without one the honest answer is that the outcome is
       * unknown, and the safe instruction is to look before retyping — never
       * to file it a second time.
       */
      if (answeredBack) {
        toast({
          variant: "error",
          title: "Could not file that",
          description:
            e instanceof Error
              ? e.message
              : "NEXUS refused the report. Your words are still here — try again.",
        });
      } else {
        toast({
          variant: "warning",
          title: "NEXUS did not answer",
          duration: 12000,
          description:
            "The connection dropped before it replied, so this may already be recorded. Open My week to check before writing it again — your words are still here.",
        });
      }
    } finally {
      /*
       * BEFORE the refresh, not after it.
       *
       * router.refresh() re-runs the server component, and React holds every
       * update queued behind it until the new payload lands — around ten
       * seconds here. setSaving(null) used to sit after it, so the whole form
       * stayed disabled for that entire window: the section that had just been
       * filed said "Filing…", and the OTHER section's submit and "Confirm
       * report" were locked out with it, because both read `saving !== null`.
       *
       * Anybody who typed next week's focus during that window found a dead
       * button and concluded the page had failed.
       */
      setSaving(null);
    }

    /* Outside the transition-blocking path, and only when there is news. */
    if (!succeeded) return;
    startTransition(() => router.refresh());

    /*
     * And again once the model has had time, because the commitments it found
     * did not exist when the first refresh ran. Two passes: one for a quick
     * week, one with room for a slow one. Measured extraction is around ten
     * seconds against real Azure.
     */
    if (interpreting.current) {
      for (const delay of [7000, 16000]) {
        followUps.current.push(
          setTimeout(() => startTransition(() => router.refresh()), delay),
        );
      }
      interpreting.current = false;
    }
  }

  const answered = Object.keys(resolutions).length;
  const hasChanged = changed.trim().length > 0;
  const hasNext = nextWeek.trim().length > 0;
  const nothingToFile =
    (!hasChanged || filed.changed) && (!hasNext || filed.next) && answered === 0;

  /*
   * HOW WIDE THE PAGE IS DEPENDS ON WHETHER IT HAS TWO COLUMNS.
   *
   * With commitments to resolve, the width carries two columns and 1100px is
   * right. With none — a new joiner, or anybody who closed everything out —
   * the report sections span the whole row, and at 1100px that is a textarea
   * around 130 characters wide. Prose typed at that measure is hard to read
   * back before filing it, and visual-system.md caps body copy at 65-75ch for
   * the same reason.
   *
   * This is NOT the "centred phone column in a void" the UI audit rejected on
   * this page. That was one short card with 700px of nothing under it; this is
   * three substantial sections at a width somebody can write in.
   */
  const wide = open.length > 0;

  return (
    <div
      /*
       * THE PAGE IS AS TALL AS WHAT IS ON IT.
       *
       * This was h-[calc(100dvh-9rem)] with overflow-hidden, so the whole
       * check-in had to fit one screen and everything inside scrolled in its
       * own little box. In practice the composer opened mid-sentence with its
       * heading scrolled away above and its Submit button clipped off the
       * bottom edge of the card — on the one screen in the product where
       * somebody is writing prose and needs to read it back.
       *
       * Content sets the shape. The document scrolls; the cards do not.
       */
      className={cn(
        "mx-auto flex w-full flex-col gap-3 pb-4 lg:gap-4",
        wide ? "max-w-[1280px]" : "max-w-[52rem]",
      )}
    >
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 pt-1">
        <div className="min-w-0">
          {/*
            Plain language, not the operating model. "Weekly reconciliation"
            and "cycle archive" describe how NEXUS works internally; nobody
            filing a report should have to learn the database's vocabulary to
            say what they did.
          */}
          <h1 className="page-title">Check in</h1>
          <p className="standfirst mt-1">
            Say what changed this week and what next week is for. Either one can
            go on its own.
          </p>
          <p className="metric mt-1.5 text-sm text-[var(--nx-text-secondary)]">
            {weekLabel(cycleLabel)}
          </p>
        </div>

        <Stages
          openCount={open.length}
          answered={answered}
          hasChanged={hasChanged || filed.changed}
          hasNext={hasNext || filed.next}
        />
      </header>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-4">
        {/* ---- Last week's commitments -------------------------------- */}
        {open.length > 0 && (
          <section
            id="commitments"
            aria-labelledby="commitments-heading"
            className="scroll-mt-6 rounded-2xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] p-4 shadow-[var(--shadow-subtle)] sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2
                id="commitments-heading"
                className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]"
              >
                Last week&rsquo;s commitments
              </h2>
              <span className="metric text-xs text-[var(--nx-text-secondary)]">
                {answered}/{open.length} answered
              </span>
            </div>
            <p className="body-sm mt-1">
              Where did each of these get to? Anything you skip is treated as
              unmentioned rather than as done.
            </p>

            <ul className="mt-4 flex flex-col gap-2.5">
              {open.map((c) => (
                <li key={c.id}>
                  <CommitmentPrompt
                    commitment={c}
                    chosen={resolutions[c.id]}
                    onChoose={(v) =>
                      setResolutions((p) => ({ ...p, [c.id]: v }))
                    }
                    note={blockerNote[c.id] ?? ""}
                    onNote={(v) => setBlockerNote((p) => ({ ...p, [c.id]: v }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- The two reports ---------------------------------------- */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4",
            /* With nothing to reconcile there is no left column to sit beside. */
            open.length === 0 && "lg:col-span-2",
          )}
        >
          <ReportField
            field="changed"
            heading="What changed this week"
            hint="What you completed, resolved, or worked on. Anything new, finished or blocked that was not on your list."
            placeholder="Finished the onboarding checklist. Legal is still blocking the vendor contract…"
            rows={6}
            value={changed}
            onChange={setChanged}
            listening={micField === "changed"}
            dictation={dictation}
            onStartMic={() => startMic("changed")}
            onStopMic={harvest}
            filed={filed.changed}
            saving={saving === "changed"}
            /*
             * Only while THIS section is going, or while the combined confirm
             * is. `saving !== null` disabled both halves whenever either one
             * was in flight, which is how filing "what changed" took the
             * "next week" submit down with it.
             */
            disabled={saving === "changed" || saving === "both"}
            onSubmit={() => void submit("changed")}
            submitLabel="Submit what changed"
          />

          <ReportField
            field="next"
            heading="Focus for next week"
            hint="What you intend to work on or achieve. Whatever you say here becomes next week's commitments."
            placeholder="Ship the vendor launch by Friday and finish the API documentation…"
            rows={4}
            value={nextWeek}
            onChange={setNextWeek}
            listening={micField === "next"}
            dictation={dictation}
            onStartMic={() => startMic("next")}
            onStopMic={harvest}
            filed={filed.next}
            saving={saving === "next"}
            disabled={saving === "next" || saving === "both"}
            onSubmit={() => void submit("next")}
            submitLabel="Submit next week's focus"
          />
        </div>
      </div>

      {/* ---- Review and confirm -------------------------------------- */}
      <div>
        <ReviewAndConfirm
          changed={changed}
          nextWeek={nextWeek}
          filed={filed}
          answered={answered}
          openCount={open.length}
          saving={saving === "both"}
          disabled={saving !== null || nothingToFile}
          onSubmit={() => void submit("both")}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One reportable section: text, a microphone of its own, and a rewrite
// ---------------------------------------------------------------------------

function ReportField({
  field,
  heading,
  hint,
  placeholder,
  rows,
  value,
  onChange,
  listening,
  dictation,
  onStartMic,
  onStopMic,
  filed,
  saving,
  disabled,
  onSubmit,
  submitLabel,
}: {
  field: FieldId;
  heading: string;
  hint: string;
  placeholder: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  /** True ONLY when this field owns the microphone. The per-field mic fix. */
  listening: boolean;
  dictation: ReturnType<typeof useDictation>;
  onStartMic: () => void;
  onStopMic: () => void;
  filed: boolean;
  saving: boolean;
  disabled: boolean;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const { toast } = useToast();

  /*
   * The rewrite, held BESIDE the original rather than applied to it.
   *
   * Null means none has been asked for. A value means one is waiting on a
   * decision, and until that decision is made the textarea is untouched — the
   * person's own words stay on screen and stay what would be filed. Reload the
   * page, press "Keep mine", or simply ignore it, and nothing has changed.
   *
   * This is the whole difference between "Auto rewrite" and the "Sort this
   * out" button it replaces. That one sent the text away and came back with
   * the model's version in its place, so the decision had already been taken
   * by the time anybody saw it.
   */
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);

  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const spoken = listening ? dictation.spoken : "";

  async function askForRewrite() {
    setRewriting(true);
    setSuggestion(null);
    try {
      const res = await fetch("/api/check-in/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        unchanged?: boolean;
        error?: string;
      };

      if (!res.ok || !data.text) {
        toast({
          variant: "error",
          title: "No rewrite this time",
          description: data.error ?? "Your words are unchanged.",
        });
        return;
      }

      /*
       * Nothing to decide is said, not shown. Offering an identical
       * "suggestion" asks somebody to compare two copies of their own sentence
       * and pick one.
       */
      if (data.unchanged) {
        toast({
          variant: "success",
          title: "That already reads well",
          description: "NEXUS would not change anything.",
        });
        return;
      }

      setSuggestion(data.text);
    } catch {
      toast({
        variant: "error",
        title: "NEXUS could not be reached",
        description: "Your words are unchanged.",
      });
    } finally {
      setRewriting(false);
    }
  }

  return (
    <section
      id={SECTION_ID[field]}
      aria-labelledby={`${SECTION_ID[field]}-heading`}
      className="scroll-mt-6 rounded-2xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] p-4 shadow-[var(--shadow-subtle)] sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${SECTION_ID[field]}-heading`}
          className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]"
        >
          {heading}
        </h2>
        {filed && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-delivered)]">
            <Check size={13} aria-hidden="true" />
            Filed
          </span>
        )}
      </div>
      <p className="body-sm mt-1">{hint}</p>

      <textarea
        id={`${SECTION_ID[field]}-input`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={heading}
        className="mt-4 w-full resize-y rounded-xl border border-[var(--nx-border-strong)] bg-[var(--nx-bg)]
             px-3.5 py-3 text-sm leading-relaxed text-[var(--nx-text-primary)]
                   placeholder:text-[var(--nx-text-muted)]
                   focus:border-[var(--nx-primary)]/70 focus:bg-white/[0.09] focus:outline-none"
      />

      {/*
        WHAT IS BEING HEARD, while it is being heard — and only on the field
        that owns the microphone. It lands in the box on stop, not as it
        arrives, so a mis-heard word never edits what somebody already typed.
      */}
      {listening && (
        <p
          aria-live="polite"
          className="mt-2 rounded-lg border border-[var(--color-critical)]/25 bg-[var(--color-critical)]/[0.07] px-3 py-2 text-sm leading-relaxed text-[var(--nx-text-secondary)]"
        >
          {spoken || "Listening — say what happened."}
        </p>
      )}

      {dictation.error && listening && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <CircleAlert size={13} className="mt-px shrink-0" aria-hidden="true" />
          {dictation.error}
        </p>
      )}

      {/*
        THE REWRITE SITS BESIDE THE ORIGINAL, NEVER ON TOP OF IT.

        Both are on screen while the choice is open, because the choice is only
        meaningful if you can see what you would be giving up.
      */}
      {suggestion && (
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 rounded-xl border border-[var(--nx-primary)]/35 bg-[rgba(79,191,168,0.08)] p-3.5"
        >
          <p className="eyebrow text-[var(--nx-primary-light)]">Suggested rewrite</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-primary)]">
            {suggestion}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--nx-text-secondary)]">
            Same facts, tidier wording. Confirm it and it becomes your update;
            keep yours and nothing changes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(suggestion);
                setSuggestion(null);
              }}
              className="nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg
                           bg-[var(--nx-primary)] px-3.5 text-sm font-medium text-[var(--nx-bg)]
                         transition-opacity hover:opacity-90"
            >
              <Check size={14} aria-hidden="true" />
              Confirm rewrite
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="nx-focus-ring inline-flex min-h-11 items-center rounded-lg border
                         border-white/[0.14] px-3.5 text-sm text-[var(--nx-text-primary)]
                         transition-colors hover:bg-white/[0.06]"
            >
              Keep mine
            </button>
          </div>
        </m.div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dictation.supported && (
          <button
            type="button"
            onClick={listening ? onStopMic : onStartMic}
            aria-pressed={listening}
            aria-label={listening ? `Stop dictating ${heading}` : `Dictate ${heading}`}
            className={cn(
              "nx-focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border px-3.5 text-sm transition-colors",
              listening
                ? "border-[var(--color-critical)]/40 bg-[var(--color-critical)]/15 text-[var(--color-critical)]"
                : "border-white/[0.14] text-[var(--nx-text-primary)] hover:bg-white/[0.06]",
            )}
          >
            {listening ? (
              <Square size={13} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={15} aria-hidden="true" />
            )}
            {listening ? "Stop" : "Speak it"}
          </button>
        )}

        {/*
          Offered only once there is something to tidy. Three words is the same
          floor /api/check-in/rewrite enforces — below it there is nothing to
          rewrite, and asking costs a model call to change somebody's mind
          about their own sentence.
        */}
        {words >= 3 && !suggestion && (
          <button
            type="button"
            onClick={() => void askForRewrite()}
            /* Not while the microphone is open — the text is still arriving. */
            disabled={rewriting || listening}
            className="nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border
                       border-white/[0.14] px-3.5 text-sm text-[var(--nx-primary-light)]
                       transition-colors hover:bg-white/[0.06] disabled:opacity-45"
          >
            {rewriting ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 size={14} aria-hidden="true" />
            )}
            {rewriting ? "Rewriting…" : "Auto rewrite"}
          </button>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || listening || words === 0}
          className="nx-focus-ring ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg
                     border border-[var(--nx-primary)]/45 bg-[rgba(79,191,168,0.08)] px-3.5 text-sm font-medium
                     text-[var(--nx-primary-light)] transition-colors
                     hover:bg-[var(--nx-primary)]/12 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={14} aria-hidden="true" />
          )}
          {saving ? "Filing…" : filed ? "Add to what is filed" : submitLabel}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One commitment, and where it got to
// ---------------------------------------------------------------------------

function CommitmentPrompt({
  commitment: c,
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
    <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--glass-fill-2)] p-3.5 shadow-[var(--shadow-subtle)]">
      <p className="text-[15px] font-medium leading-snug text-[var(--nx-text-primary)]">
        {c.title}
      </p>
      {/*
        Their own sentence from the check-in that created this. It is what
        makes a commitment recognisable a week later — a title alone is
        somebody else's paraphrase of what you said.
      */}
      {c.source_quote && (
        <p className="mt-1 text-[13px] italic leading-snug text-[var(--nx-text-secondary)]">
          &ldquo;{c.source_quote}&rdquo;
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RESOLUTIONS.map((r) => {
          const active = chosen === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChoose(r.value)}
              aria-pressed={active}
              title={r.hint}
              className={cn(
                "nx-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors",
                active
                  ? "border-transparent bg-white/[0.10] text-[var(--nx-text-primary)]"
                  : "border-white/[0.10] text-[var(--nx-text-secondary)] hover:bg-white/[0.06]",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: STATUS_TONE[r.value] }}
              />
              {r.label}
            </button>
          );
        })}
      </div>

      {/*
        THE REASON MATTERS MORE THAN THE STATUS ON THESE THREE.

        A blocked, delayed or dropped commitment with no explanation is exactly
        the silent drop this product exists to surface — so the box appears the
        moment one is chosen, rather than being one more thing to find.
      */}
      {(chosen === "blocked" || chosen === "deferred" || chosen === "dropped") && (
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          placeholder={
            chosen === "blocked"
              ? "What is holding it up, and who could clear it?"
              : "What changed?"
          }
          aria-label={`Why "${c.title}" is ${chosen}`}
          className="mt-2.5 w-full resize-y rounded-lg border border-white/[0.14] bg-white/[0.05]
                     px-3 py-2 text-[13px] leading-relaxed text-[var(--nx-text-primary)]
                     placeholder:text-[var(--nx-text-muted)]
                     focus:border-[var(--nx-primary)]/70 focus:outline-none"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review, then confirm
// ---------------------------------------------------------------------------

function ReviewAndConfirm({
  changed,
  nextWeek,
  filed,
  answered,
  openCount,
  saving,
  disabled,
  onSubmit,
}: {
  changed: string;
  nextWeek: string;
  filed: Record<FieldId, boolean>;
  answered: number;
  openCount: number;
  saving: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  /*
   * WHAT IS ABOUT TO BE FILED, in the person's own words.
   *
   * Not a model's summary of them. This step exists so somebody can read back
   * what they wrote before it becomes part of the week's record, and a
   * paraphrase would defeat that — they would be confirming something they had
   * not written.
   *
   * A section already filed is listed as filed rather than queued, because
   * pressing confirm again would append it a second time.
   */
  const lines: { label: string; body: string; done: boolean }[] = [];
  if (changed.trim())
    lines.push({ label: "What changed", body: changed.trim(), done: filed.changed });
  if (nextWeek.trim())
    lines.push({ label: "Next week", body: nextWeek.trim(), done: filed.next });

  const nothingWritten = lines.length === 0 && answered === 0;

  return (
    <section
      id="review"
      aria-labelledby="review-heading"
      className="scroll-mt-6 rounded-2xl border border-[var(--nx-border)] bg-[var(--glass-fill-1)] p-4 shadow-[var(--shadow-subtle)] sm:p-5"
    >
      <h2
        id="review-heading"
        className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]"
      >
        Review and confirm
      </h2>
      <p className="body-sm mt-1">
        Nothing has been filed until you press confirm. This becomes part of this
        week&rsquo;s brief.
      </p>

      {nothingWritten ? (
        /*
          Says what the page is waiting for, and claims nothing about the week
          itself — rejected-patterns.md #15.
        */
        <p className="mt-4 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
          Nothing to file yet. Write either section above and it appears here.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {openCount > 0 && answered > 0 && (
            <p className="text-sm text-[var(--nx-text-secondary)]">
              <span className="metric text-[var(--nx-text-primary)]">{answered}</span>{" "}
              of{" "}
              <span className="metric text-[var(--nx-text-primary)]">{openCount}</span>{" "}
              commitments answered.
            </p>
          )}
          {lines.map((l) => (
            <div
              key={l.label}
              className="rounded-xl border border-[var(--nx-border)] bg-[var(--glass-fill-2)] p-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">{l.label}</p>
                {l.done && (
                  <span className="inline-flex items-center gap-1 text-2xs font-medium text-[var(--color-delivered)]">
                    <Check size={11} aria-hidden="true" />
                    Filed
                  </span>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-primary)]">
                {l.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="note max-w-[52ch]">
          Not a performance review. Telling us early counts in your favour.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="nx-focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl
                     bg-[var(--nx-primary)] px-6 text-sm font-medium text-[var(--nx-bg)]
                     transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Filing…
            </>
          ) : (
            <>
              <Send size={15} aria-hidden="true" />
              Confirm report
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progress, and the way to each section
// ---------------------------------------------------------------------------

/*
 * IT LOOKED LIKE NAVIGATION AND IT WAS AN ORNAMENT.
 *
 * This was an <ol> of dots and labels — "Previous commitments · What changed ·
 * Next week" — sitting at the top of the page in the shape every product uses
 * for a stepper. Pressing "What changed" did nothing, because there was
 * nothing to press: no button, no link, no handler. On a long page the section
 * it names can be well below the fold, so the one control that looked like it
 * would take you there was the one thing on the header that could not.
 *
 * Each stage is a real button now and moves the page to its section, focusing
 * the input where there is one so a keyboard lands in the same place a
 * pointer does. `scroll-mt-6` on each section keeps the heading clear of the
 * top edge on arrival.
 */
function Stages({
  openCount,
  answered,
  hasChanged,
  hasNext,
}: {
  openCount: number;
  answered: number;
  hasChanged: boolean;
  hasNext: boolean;
}) {
  const stages = [
    ...(openCount > 0
      ? [{ id: "commitments", label: "Commitments", done: answered > 0, focus: false }]
      : []),
    { id: SECTION_ID.changed, label: "What changed", done: hasChanged, focus: true },
    { id: SECTION_ID.next, label: "Next week", done: hasNext, focus: true },
  ];

  function go(id: string, focus: boolean) {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    /*
     * Focus the input, not the section. Scrolling moves the eye; focus moves
     * the keyboard, and a "go to this section" control that leaves the caret
     * at the top of the document has only done half the job.
     *
     * `preventScroll` because the smooth scroll above is already running —
     * focus would otherwise jump it to the end instantly.
     */
    if (!focus) return;
    document
      .getElementById(`${id}-input`)
      ?.focus({ preventScroll: true });
  }

  return (
    <nav aria-label="Sections of this check-in" className="shrink-0">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-5",
                  stages[i - 1].done ? "bg-[var(--nx-primary)]/60" : "bg-white/[0.14]",
                )}
              />
            )}
            <button
              type="button"
              onClick={() => go(s.id, s.focus)}
              className="nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs
                         transition-colors hover:bg-white/[0.06]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  s.done ? "bg-[var(--nx-primary-light)]" : "bg-white/[0.22]",
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap",
                  s.done
                    ? "text-[var(--nx-text-primary)]"
                    : "text-[var(--nx-text-secondary)]",
                )}
              >
                {s.label}
              </span>
              {/* Never state by colour alone. The dot is decoration; this is the fact. */}
              {s.done && <span className="sr-only">— started</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
