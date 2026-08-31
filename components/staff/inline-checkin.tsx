"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Mic,
  PenLine,
  Send,
  Square,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/voice";
import { useToast } from "@/components/ui/toast";
import { filingFailure } from "@/lib/api-messages";

/*
 * The whole check-in, on the card.
 *
 * Speak or type, NEXUS sorts it into what happened and what is next, you
 * correct anything it got wrong, and one button files it. No navigation: the
 * point of a home page that answers everything is that you never leave it to
 * do the one thing it exists for.
 *
 * THE ORDER IS THE SAFETY PROPERTY. Capture, then sort, then confirm, then
 * save — and the save is the only step that writes. The draft route cannot
 * write at all, so a mis-heard word or instruction-shaped speech can only ever
 * produce a wrong suggestion in an editable box.
 *
 * AND THE SORTING IS OPTIONAL. If the model is slow or fails, the raw words go
 * through unchanged — they were always a valid check-in on their own. Nobody
 * loses a week's update because a language model had a bad minute.
 */

type Phase = "idle" | "listening" | "sorting" | "review" | "saving";

type Update = {
  commitmentId: string;
  title: string;
  status: string;
  declared: boolean;
};

/*
 * Two colours per status, because a dot and a word have different jobs.
 *
 * `tone` paints the dot. `text` paints the label. They differ for the muted
 * statuses on purpose: --color-dropped is white at 0.22 alpha, which is
 * legible as a 6px dot and completely unreadable as a word. Rendering the
 * label in the dot's colour put "Dropped" at roughly 2:1 against the surface
 * — below every contrast floor there is, on the one status a person most
 * needs to notice about their own week.
 */
const STATUS_LABEL: Record<string, { label: string; tone: string; text: string }> = {
  delivered: { label: "Done", tone: "var(--color-delivered)", text: "var(--color-delivered)" },
  partial: { label: "Partly", tone: "var(--color-partial)", text: "var(--color-partial)" },
  in_progress: { label: "Going", tone: "var(--color-in-progress)", text: "var(--color-in-progress)" },
  blocked: { label: "Blocked", tone: "var(--color-blocked)", text: "var(--color-blocked)" },
  deferred: { label: "Moved", tone: "var(--color-deferred)", text: "var(--text-secondary)" },
  dropped: { label: "Dropped", tone: "var(--color-dropped)", text: "var(--text-secondary)" },
  promised: { label: "To do", tone: "var(--color-promised)", text: "var(--text-secondary)" },
  superseded: { label: "Replaced", tone: "var(--color-superseded)", text: "var(--text-secondary)" },
};

export function InlineCheckIn({
  cycleId,
  alreadyReported,
  openCount = 0,
  autoStart = false,
}: {
  cycleId: string;
  alreadyReported: boolean;
  /** Open commitments this week — decides whether the guided path is offered. */
  openCount?: number;
  /**
   * Open with the microphone already listening.
   *
   * For a caller that has ALREADY asked "how would you like to check in?" and
   * been told "by voice". Without it, a button labelled "Speak to NEXUS" landed
   * the person on an idle composer with a second microphone to find — the
   * label made a promise the next screen did not keep.
   *
   * Mount-based here, unlike the launcher below, and correctly so: this only
   * ever arrives with the component freshly mounted, because the caller renders
   * it in place of the chooser rather than alongside it.
   */
  autoStart?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const launcherAsked = useSearchParams().get("ask") === "1";
  const { toast } = useToast();
  const dictation = useDictation();

  const [phase, setPhase] = useState<Phase>("idle");
  const [raw, setRaw] = useState("");
  const [progress, setProgress] = useState("");
  const [plan, setPlan] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** Whether any of it was spoken, so a disputed quote can be read as a mis-hearing. */
  const dictated = useRef(false);

  /*
   * Derived, not stored. When the recogniser fails mid-session the card must
   * stop claiming to listen AND get its composer back — an effect that reset
   * `phase` would render the stuck state once before correcting it.
   */
  const listening = phase === "listening" && !dictation.error;
  const phaseNow: Phase = phase === "listening" && dictation.error ? "idle" : phase;

  const sort = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said) {
        setPhase("idle");
        return;
      }

      setRaw(said);
      setError(null);
      setPhase("sorting");

      try {
        const res = await fetch("/api/check-in/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: said, cycleId }),
        });

        if (res.status === 401) {
          setError("Your session ended. Sign in again before filing this.");
          setPhase("idle");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));

        const data = (await res.json()) as {
          draft: { progress: string; plan: string; question: string | null };
          updates: Update[];
        };

        setProgress(data.draft.progress || said);
        setPlan(data.draft.plan);
        setQuestion(data.draft.question);
        setUpdates(data.updates);
        setDropped(new Set());
      } catch {
        /*
         * Sorting failed, so the words go through as written. Not an error the
         * person needs to act on — their update is intact and still valid.
         */
        setProgress(said);
        setPlan("");
        setQuestion(null);
        setUpdates([]);
      } finally {
        setPhase("review");
      }
    },
    [cycleId],
  );

  function press() {
    if (listening) {
      dictation.stop();
      // spoken, not transcript — see lib/voice.ts. Pressing "stop and
      // sort" used to discard whatever had not yet been marked final,
      // which is normally the last thing said.
      void sort(dictation.spoken);
      return;
    }
    dictated.current = true;
    setError(null);
    dictation.reset();
    dictation.start();
    setPhase("listening");
  }

  /*
   * Chosen "by voice" on the way in, so start listening.
   *
   * Runs once, on mount. The caller swaps the chooser out for this component,
   * so there is no case where somebody re-picks voice without a remount — the
   * hazard the launcher effect below has to work around does not exist here.
   */
  useEffect(() => {
    if (!autoStart || !dictation.supported) return;
    dictated.current = true;
    dictation.reset();
    dictation.start();
    /* Bootstrapping from a prop — same reasoning as the launcher below. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  /*
   * Arriving from the launcher in the bottom bar opens the microphone.
   *
   * Driven by the search param, not by mount. Tapping the launcher while
   * already standing on this page does not remount anything — a mount-only
   * effect would fire the first time and never again, which is exactly the tap
   * somebody makes when they are already looking at their week.
   *
   * The param is cleared with router.replace rather than history.replaceState:
   * replaceState leaves the router still holding ask=1, so the next tap would
   * be a no-op change and this would not run again.
   *
   * It starts the recogniser directly rather than calling press(). On arrival
   * there is nothing to stop, and press() is the toggle — routing a one-shot
   * through a toggle is how you end up stopping a microphone you never began.
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
    setPhase("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcherAsked]);

  async function submit() {
    setPhase("saving");
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          progress,
          plan,
          dictated: dictated.current,
          resolutions: updates
            .filter((u) => !dropped.has(u.commitmentId))
            .map((u) => ({ commitmentId: u.commitmentId, status: u.status })),
        }),
      });
      if (!res.ok) throw new Error(filingFailure(res.status));

      /*
       * "Filed" used to be said for every 2xx, including responses where the
       * model had failed and nothing was extracted — so somebody was told
       * their week was recorded and then shown an unchanged screen, which
       * reads as data loss. The report IS saved in all three branches; what
       * differs is whether anything was understood, and saying so is the
       * difference between a system that seems broken and one that is honest
       * about where it got to.
       */
      const result = (await res.json().catch(() => ({}))) as {
        processingFailed?: string | null;
        understoodNothing?: boolean;
        extracted?: { title: string }[];
        updates?: { title: string; status: string }[];
      };

      if (result.processingFailed) {
        toast({
          variant: "error",
          title: "Saved, but not yet read",
          description:
            "Your report is stored exactly as you wrote it. NEXUS could not " +
            "process it just now and will pick it up again — nothing you " +
            "typed has been lost.",
        });
      } else if (result.understoodNothing) {
        /*
         * A success, with a caveat — not an error. The report is stored and
         * nothing was lost; it simply produced no commitments. Painting that
         * red would tell somebody their week failed when it did not.
         */
        toast({
          variant: "success",
          title: "Saved",
          description:
            "Your words are recorded. No commitments were found in them — " +
            "naming what you finished and what you plan next usually helps.",
        });
      } else {
        /*
          Say what was captured, not just that something was.
          "Filed" told somebody an action succeeded; it did not tell them what
          NEXUS now believes, which is the only thing they can correct. Naming
          it turns a receipt into a chance to catch a misheard sentence.
        */
        const captured = [
          result.updates?.length
            ? `${result.updates.length} ${result.updates.length === 1 ? "update" : "updates"} to what you had planned`
            : null,
          result.extracted?.length
            ? `${result.extracted.length} for next week`
            : null,
        ].filter(Boolean);

        toast({
          variant: "success",
          title: "Your update is saved",
          description: captured.length
            ? `NEXUS captured ${captured.join(" and ")}. It is all on this page — check anything it misheard.`
            : "Your week is recorded. You can add to it any time.",
        });
      }

      setPhase("idle");
      setRaw("");
      setProgress("");
      setPlan("");
      setUpdates([]);
      setQuestion(null);
      dictation.reset();
      // Re-read the page so the tally and tree reflect what was just filed.
      router.refresh();
    } catch (e) {
      setPhase("review");
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

  // ---- review -------------------------------------------------------------
  if (phase === "review" || phase === "saving") {
    const saving = phase === "saving";

    return (
      <m.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <p className="eyebrow">
          Check this over
        </p>
        <p className="mt-1 text-sm text-secondary">
          Edit anything that is not right. Nothing is filed until you press file.
        </p>

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <Field
            label="This week"
            value={progress}
            onChange={setProgress}
            placeholder="What you worked on"
            disabled={saving}
          />
          <Field
            label="Next week"
            value={plan}
            onChange={setPlan}
            placeholder="What you are planning — this becomes next week's commitments"
            disabled={saving}
          />

          {updates.length > 0 && (
            <div>
              <p className="eyebrow">
                What this changes
              </p>
              {/*
                Struck out, never silently removed. These are status changes on
                commitments other people can see, so the person gets to say "no,
                not that one" — and seeing what they turned off is part of
                trusting what they left on.
              */}
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {updates.map((u) => {
                  const off = dropped.has(u.commitmentId);
                  const s = STATUS_LABEL[u.status] ?? {
                    label: u.status,
                    tone: "var(--color-promised)",
                    text: "var(--text-secondary)",
                  };
                  return (
                    <li key={u.commitmentId} className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          setDropped((prev) => {
                            const next = new Set(prev);
                            if (next.has(u.commitmentId)) next.delete(u.commitmentId);
                            else next.add(u.commitmentId);
                            return next;
                          })
                        }
                        aria-pressed={!off}
                        aria-label={off ? `Include: ${u.title}` : `Leave out: ${u.title}`}
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-lg transition-colors",
                          off
                            ? "text-white/25 hover:text-white/50"
                            : "text-white/55 hover:bg-white/[0.08] hover:text-white/90",
                        )}
                      >
                        <Check size={14} />
                      </button>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          off ? "text-white/30 line-through" : "text-white/80",
                        )}
                      >
                        {u.title}
                      </span>
                      <span
                        className="shrink-0 text-2xs"
                        style={{ color: off ? "var(--text-tertiary)" : s.text }}
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {question && (
            <p className="rounded-lg border border-[var(--color-partial)]/20 bg-[var(--color-partial)]/[0.07] px-3 py-2.5 text-sm leading-relaxed text-white/80">
              {question}{" "}
              <span className="text-white/40">Add it above if it matters.</span>
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving || (!progress.trim() && !plan.trim())}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl
                       bg-[var(--dept-techspecialist)] px-4 text-sm text-[var(--on-accent)]
                       transition-[filter] hover:brightness-110 disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                Filing…
              </>
            ) : (
              <>
                <Send size={15} aria-hidden="true" />
                File my week
              </>
            )}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setPhase("idle");
              setProgress("");
              setPlan("");
              setUpdates([]);
              setQuestion(null);
              dictation.reset();
            }}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border
                       border-white/[0.12] bg-white/[0.04] px-4 text-sm text-white/80
                       transition-colors hover:bg-white/[0.09] disabled:opacity-40"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Start over
          </button>
        </div>
      </m.div>
    );
  }

  // ---- capture ------------------------------------------------------------
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="eyebrow">
        Automated check-in
      </p>
      <p className="mt-1.5 text-base text-white/90">
        {listening
          ? "Listening…"
          : alreadyReported
            ? "Anything to add?"
            : "How is it going?"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        {listening
          ? "Say what you did and what is next. Stop when you are done."
          : "Say it or type it in plain sentences. NEXUS sorts it out and shows you before anything is filed."}
      </p>

      {listening ? (
        <>
          <Waveform live />
          <p className="mt-3 min-h-14 text-sm leading-relaxed text-white/85">
            {dictation.spoken || (
              <span className="text-white/30">…</span>
            )}
          </p>
        </>
      ) : phase === "sorting" ? (
        <>
          <Waveform live />
          <p className="mt-3 flex items-center gap-2 text-sm text-secondary">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Sorting that out…
          </p>
        </>
      ) : (
        <>
          {/*
            NO WAVEFORM HERE. It is drawn live while listening and while
            sorting, where it carries state somebody can check against what
            they are hearing. Frozen above a text box it carries none —
            rejected-patterns #5 asks an ambient element to show "only state
            that is already stated in words beside it" — and it was costing
            the input forty pixels in a card that had none to spare.

            Typing is not the fallback, it is the other way in. Speech
            recognition is Chromium-only in practice, and plenty of people
            would rather not talk out loud at a desk.
          */}
          {/*
            It has to look like something you can type in.

            At 4% fill, a 10% border and a 25% placeholder this read as a faint
            rectangle rather than a field — and inside a card with a bounded
            height, `rows={3}` was a fixed request the flex parent squeezed
            below it, so the example text was clipped mid-sentence and the
            buttons closed in on top. The strongest signal a check-in surface
            can send is that there is somewhere to write.

            flex-1 with a floor, so it takes the room the card has instead of
            asking for three lines and being given less.
          */}
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Finished the onboarding checklist. Legal is still blocking the vendor contract. Next week I'll start the payments spike…"
            aria-label="Your update"
            className="mt-3 min-h-[7.5rem] w-full flex-1 resize-none rounded-xl
                       border border-white/[0.16] bg-white/[0.07] px-3.5 py-3
                       text-sm leading-relaxed text-white/90
                       placeholder:text-white/45
                       focus:border-[var(--nx-primary)]/70 focus:bg-white/[0.09]
                       focus:outline-none"
          />
        </>
      )}

      {/*
        The two paths, told apart — and BELOW the thing they are an alternative
        to.

        This sat between the prompt and the text box, where it pushed the input
        off the bottom of a height-bounded card and the example text was clipped
        mid-sentence. An alternative route is not a precondition; it reads
        correctly after the primary action and costs the input nothing.

        Shown only when there is enough outstanding for the slower path to be
        the better answer. An always-visible alternative just reads as doubt
        about the thing you are standing in.
      */}
      {!listening && phaseNow === "idle" && openCount > 2 && (
        <p className="mt-3 flex shrink-0 flex-wrap items-center gap-x-2 text-xs text-tertiary">
          <span>{openCount} still open.</span>
          <Link
            href="/check-in"
            className="nx-focus-ring -my-2 inline-flex min-h-11 items-center gap-1
                       text-[var(--nx-primary-light)] transition-opacity hover:opacity-80"
          >
            Go through them one at a time
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </p>
      )}

      <div className="mt-auto flex shrink-0 flex-col gap-2 pt-4 sm:flex-row">
        {dictation.supported && (
          <button
            type="button"
            onClick={press}
            disabled={phase === "sorting"}
            aria-pressed={listening}
            className={cn(
              "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm transition-colors disabled:opacity-40",
              listening
                ? "border-[var(--color-critical)]/40 bg-[var(--color-critical)]/15 text-[var(--color-critical)]"
                : "border-[var(--dept-techspecialist)]/40 bg-[var(--dept-techspecialist)]/12 text-white/95 hover:bg-[var(--dept-techspecialist)]/20",
            )}
          >
            {listening ? (
              <>
                <Square size={13} fill="currentColor" aria-hidden="true" />
                Stop and sort
              </>
            ) : (
              <>
                <Mic size={15} aria-hidden="true" />
                Voice check-in
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => void sort(raw)}
          disabled={phase === "sorting" || listening || raw.trim().length === 0}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl
                     border border-white/[0.12] bg-white/[0.04] px-4 text-sm text-white/85
                     transition-colors hover:bg-white/[0.09] disabled:opacity-40"
        >
          <PenLine size={14} aria-hidden="true" />
          {raw.trim() ? "Sort what I typed" : "Type check-in"}
        </button>
      </div>

      {/*
        THE RECOGNISER'S OWN FAILURE IS SHOWN HERE TOO.

        It was not. This rendered the component's error and the
        browser-capability sentence and dropped dictation.error on the
        floor, so a refused microphone, a missing microphone and a network
        failure all looked identical from the outside: the waveform
        vanished, the composer came back, and nothing said why. "The voice
        is not working and I do not know why" was this interface working
        exactly as written.

        Bigger than a 2xs note, as well. A sentence telling somebody why
        the thing they just pressed did nothing is not a footnote.
      */}
      {(error || dictation.error || dictation.unavailableReason) && (
        <p
          role="status"
          className="mt-2 flex shrink-0 items-start gap-1.5 rounded-lg border border-[var(--color-warning)]/25
                     bg-[var(--color-warning)]/[0.08] px-3 py-2 text-xs leading-relaxed text-[var(--color-warning)]"
        >
          <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error ?? dictation.error ?? dictation.unavailableReason}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="eyebrow">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-1 w-full resize-none rounded-lg border border-white/[0.10]
                   bg-white/[0.04] px-3 py-2.5 text-sm leading-relaxed text-white/90
                   placeholder:text-white/25 focus:border-white/25 focus:outline-none
                   disabled:opacity-50"
      />
    </label>
  );
}

/*
 * Decorative, and honest about it: a picture of the idea of speaking, not a
 * reading of any microphone. Transform-only so it composites on the GPU.
 */
function Waveform({ live }: { live?: boolean }) {
  const bars = [0.3, 0.55, 0.8, 0.45, 1, 0.65, 0.35, 0.75, 0.5, 0.9, 0.4, 0.6, 0.85];

  return (
    <div aria-hidden="true" className="mt-4 flex h-12 items-center justify-center gap-[3px]">
      {bars.map((height, i) => (
        <m.span
          key={i}
          className="w-[3px] rounded-full bg-[var(--dept-techspecialist)]"
          style={{ height: `${height * 100}%`, opacity: live ? 0.9 : 0.35 + height * 0.4 }}
          animate={live ? { scaleY: [0.4, 1, 0.6, 0.95, 0.4] } : { scaleY: [0.85, 1, 0.85] }}
          transition={{
            duration: live ? 0.9 + (i % 3) * 0.2 : 3.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.06,
          }}
        />
      ))}
    </div>
  );
}
