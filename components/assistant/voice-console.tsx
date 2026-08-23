"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m } from "motion/react";
import { ArrowRight, CornerDownLeft, Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/voice";
import { askFailure } from "@/lib/api-messages";

/*
 * The assistant, as a thing you talk to.
 *
 * You press once, ask a question out loud, and NEXUS answers on screen. It is
 * not a dictation box: nothing you say here is filed, and the output is an
 * answer rather than a transcript of your own voice.
 *
 * VOICE IN, TEXT OUT
 *
 * Answers used to be read aloud as well, in a separate shorter form written
 * for the ear. That is gone. Speech is linear and unskimmable — somebody who
 * half-hears "sixty two percent" has no way back to it — and waiting for a
 * synthesised voice to finish a paragraph is slower than reading it. The
 * microphone stays because asking out loud is genuinely faster than typing;
 * the answer is written because reading an answer is faster than hearing one.
 *
 * WHY TYPING IS ALWAYS AVAILABLE
 *
 * Speech recognition is Chromium-only in practice. Firefox has none and
 * Safari's is inconsistent, so a voice-only surface is a dead screen for a
 * large share of people. Typing is not the fallback here — it is the other
 * way in, and it works identically.
 */

type Phase = "idle" | "listening" | "thinking" | "answered";

export type Figure = { label: string; value: string };

export type Answer = {
  detail: string;
  figures: Figure[];
  followUps: string[];
  answered: boolean;
};

type Turn = { question: string; answer: string };

export function VoiceConsole({
  greeting,
  subtitle,
  suggestions = [],
}: {
  /** "Your AI Executive Assistant" — the standing description. */
  greeting: string;
  subtitle: string;
  /** Openers offered before anyone has asked anything. */
  suggestions?: string[];
}) {
  const dictation = useDictation();

  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<Turn[]>([]);
  const typedField = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  const launcherAsked = useSearchParams().get("ask") === "1";
  /*
   * A mirror of `answer`, so a failed question can put the previous one back.
   *
   * Asking a follow-up used to clear the screen before the request left, so a
   * failure took the answer you were reading with it. You lose the thing you
   * had because you asked for something else — and the follow-up chips make
   * that a one-tap mistake.
   */
  const lastAnswer = useRef<Answer | null>(null);

  const send = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked) return;

      setQuestion(asked);
      setError(null);
      setPhase("thinking");

      let delivered: Answer | null = null;

      /*
       * The try covers GETTING the answer, and nothing after it.
       *
       * It used to wrap the read-aloud call too, so a browser that threw on
       * speechSynthesis — Safari does, before its voice list has loaded —
       * turned a perfectly good answer on screen into "I could not answer
       * that". Losing an answer you already have because you failed to say it
       * out loud is the wrong failure in every direction.
       */
      try {
        const res = await fetch("/api/assistant/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: asked, history: history.current.slice(-4) }),
        });

        if (res.status === 401) {
          setError("Your session ended. Sign in again to keep asking.");
          setPhase(lastAnswer.current ? "answered" : "idle");
          return;
        }
        if (!res.ok) {
          setError(askFailure(res.status));
          setPhase(lastAnswer.current ? "answered" : "idle");
          return;
        }

        const data = (await res.json()) as { answer: Answer };
        lastAnswer.current = data.answer;
        setAnswer(data.answer);
        setPhase("answered");
        delivered = data.answer;
      } catch {
        /*
         * Only a thrown fetch reaches here — the connection, not the answer.
         * Every status the route can return is named above.
         */
        setError("I could not reach NEXUS. Check your connection and ask again.");
        setPhase(lastAnswer.current ? "answered" : "idle");
        return;
      }

      if (!delivered) return;

      history.current = [
        ...history.current,
        { question: asked, answer: delivered.detail },
      ].slice(-8);
    },
    [],
  );

  /*
   * Stopping the microphone is what submits.
   *
   * Deliberately not a silence timer. People pause mid-thought, and a timer
   * that decides they finished is the single most irritating thing a voice
   * interface does — so the person says when they are done.
   */
  const stopAndAsk = useCallback(() => {
    dictation.stop();
    const said = dictation.transcript.trim();
    if (said) void send(said);
    else setPhase("idle");
  }, [dictation, send]);

  function press() {
    if (listening) {
      stopAndAsk();
      return;
    }
    setError(null);
    setAnswer(null);
    lastAnswer.current = null;
    setQuestion("");
    dictation.reset();
    dictation.start();
    setPhase("listening");
  }

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

    /*
     * Where the browser has no recogniser (Firefox has none, Safari is
     * inconsistent) the typed field takes focus instead, so the button still
     * does something visible rather than nothing at all.
     */
    if (!dictation.supported) {
      typedField.current?.focus();
      return;
    }
    dictation.reset();
    dictation.start();
    /*
     * Bootstrapping from the URL, which is the case the
     * set-state-in-an-effect rule is not written for: the param is cleared in
     * the same pass, so there is no cascade. Deriving the opening phase during
     * render instead would read the URL on the client and not on the server,
     * which is a hydration mismatch rather than a fix.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcherAsked]);

  /*
   * Derived, not stored.
   *
   * If the recogniser dies on its own — a denied microphone, a silence
   * timeout it could not restart from — the orb must stop pulsing. Doing that
   * by writing state from an effect means a second render pass on every
   * change and a phase that can briefly disagree with the thing it describes.
   * The rule is simply: listening requires a recogniser that is not in error.
   */
  const phaseNow: Phase = phase === "listening" && dictation.error ? "idle" : phase;

  const listening = phaseNow === "listening";
  const thinking = phaseNow === "thinking";
  const live = [dictation.transcript, dictation.interim].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
      <Orb listening={listening} thinking={thinking} />

      <div className="min-w-0 flex-1">
        {phaseNow === "idle" && !answer && (
          <>
            <h2 className="text-xl font-medium tracking-tight text-white/95 md:text-2xl">
              {greeting}
            </h2>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-secondary">
              {subtitle}
            </p>
          </>
        )}

        {listening && (
          <>
            <p className="text-2xs font-medium uppercase tracking-wide text-[var(--dept-techspecialist)]">
              Listening
            </p>
            <p className="mt-1.5 min-h-14 max-w-md text-base leading-relaxed text-white/90">
              {live || (
                <span className="text-white/35">Ask about the week, a unit, or a person…</span>
              )}
            </p>
          </>
        )}

        {thinking && (
          <>
            <p className="eyebrow">
              You asked
            </p>
            <p className="mt-1.5 max-w-md text-base leading-relaxed text-white/80">
              {question}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-secondary">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Working that out…
            </p>
          </>
        )}

        {phaseNow === "answered" && answer && (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <p className="eyebrow">
              {answer.answered ? "Answer" : "Not in this week's records"}
            </p>

            {/*
              The answer scrolls inside a fixed height. It does not stretch the
              page.

              A long answer used to push the dashboard down by several hundred
              pixels, so everything below it moved every time a question was
              asked and the controls slid off the bottom of a phone. Capping it
              means the panel is the same size before and after — the answer
              arrives in a box rather than rearranging the screen.

              The cap is generous now that answers are forty to seventy words:
              most never scroll at all. It is the guard for the ones that do.
            */}
            <div
              className="mt-1.5 max-h-56 overflow-y-auto overscroll-contain pr-1
                         sm:max-h-64"
              tabIndex={0}
              role="region"
              aria-label="Answer"
            >
              <p
                className={cn(
                  "max-w-xl text-base leading-relaxed",
                  answer.answered ? "text-white/90" : "text-white/70",
                )}
              >
                {answer.detail}
              </p>

              {/*
                Figures, quoted straight from the facts the answer was built
                on. Every number on screen traces to a row rather than to a
                sentence, which is the whole reason an executive can act on
                this.
              */}
              {answer.figures.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {answer.figures.map((f) => (
                    <span
                      key={`${f.label}-${f.value}`}
                      className="inline-flex items-baseline gap-1.5 rounded-md border
                                 border-white/[0.10] bg-white/[0.04] px-2 py-1"
                    >
                      <span className="text-2xs text-tertiary">{f.label}</span>
                      <span className="metric text-sm text-white/90">{f.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/*
              Outside the scroll box on purpose. A follow-up you have to scroll
              to find is a follow-up nobody taps.
            */}
            {answer.followUps.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {answer.followUps.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border
                               border-white/[0.10] bg-white/[0.03] px-3 text-xs text-white/70
                               transition-colors hover:bg-white/[0.08] hover:text-white/95"
                  >
                    {q}
                    <ArrowRight size={11} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </m.div>
        )}

        {phaseNow === "idle" && suggestions.length > 0 && !answer && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="inline-flex min-h-11 items-center rounded-full border
                           border-white/[0.10] bg-white/[0.03] px-3 text-xs text-white/60
                           transition-colors hover:bg-white/[0.08] hover:text-white/90"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {dictation.supported ? (
            <button
              type="button"
              onClick={press}
              disabled={thinking}
              aria-pressed={listening}
              className={cn(
                "inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-sm",
                "transition-colors disabled:opacity-40",
                listening
                  ? "border-[var(--color-critical)]/40 bg-[var(--color-critical)]/15 text-[var(--color-critical)]"
                  : "border-[var(--dept-techspecialist)]/40 bg-[var(--dept-techspecialist)]/12 text-white/95 hover:bg-[var(--dept-techspecialist)]/20",
              )}
            >
              {listening ? (
                <>
                  <Square size={13} fill="currentColor" aria-hidden="true" />
                  Stop and ask
                </>
              ) : (
                <>
                  <Mic size={15} aria-hidden="true" />
                  {answer ? "Ask another" : "Tap to Speak"}
                </>
              )}
            </button>
          ) : null}

          {/*
            The typed way in. Present for everyone, not only where speech is
            missing — plenty of people would rather not talk out loud in an
            open office, and hiding the field from them makes the whole
            feature unusable at a desk.
          */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = typed.trim();
              if (!t) return;
              setTyped("");
              void send(t);
            }}
            /*
              Full width on a phone, alongside the button from `sm` up. Sharing
              one row at 390px squeezed the field to "…or ty", which is not an
              affordance — it is a rectangle.
            */
            className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"
          >
            <div className="relative min-w-0 flex-1">
              <input
                ref={typedField}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={thinking || listening}
                /*
                  The same cap the route enforces. Stopping at 1000 characters
                  is better than accepting 1200 and answering with "I could not
                  read that question" — the field should not take what the
                  route will refuse.
                */
                maxLength={1000}
                placeholder={dictation.supported ? "…or type a question" : "Type a question"}
                aria-label="Ask the assistant a question"
                className="min-h-12 w-full rounded-full border border-white/[0.10] bg-white/[0.03]
                           pl-4 pr-10 text-sm text-white/90 placeholder:text-white/25
                           focus:border-white/25 focus:outline-none disabled:opacity-40"
              />
              {typed.trim() && (
                <button
                  type="submit"
                  aria-label="Ask"
                  className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full
                             text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/90"
                >
                  <CornerDownLeft size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </form>
        </div>

        {(error || dictation.unavailableReason) && (
          <p className="mt-2 text-2xs leading-snug text-[var(--color-warning)]">
            {error ?? dictation.unavailableReason}
          </p>
        )}
      </div>
    </div>
  );
}

/*
 * The orb.
 *
 * Transform and opacity only, so it composites on the GPU and never touches
 * layout — a decorative element that costs frames on a dashboard is a
 * decorative element that gets removed. It is aria-hidden: it carries state
 * that is already stated in words beside it, and narrating "animated circle"
 * to a screen reader adds nothing.
 */
function Orb({ listening, thinking }: { listening: boolean; thinking: boolean }) {
  const active = listening || thinking;

  return (
    <div
      aria-hidden="true"
      className="relative grid size-40 shrink-0 place-items-center md:size-48"
    >
      <m.span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(124,124,255,0.30), rgba(124,124,255,0) 68%)",
        }}
        animate={{ scale: active ? [1, 1.09, 1] : [1, 1.03, 1], opacity: active ? 1 : 0.75 }}
        transition={{ duration: active ? 2 : 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <m.span
        className="absolute inset-[14%] rounded-full border"
        style={{ borderColor: "rgba(150,150,255,0.35)" }}
        animate={{ scale: active ? [1, 1.05, 1] : 1, opacity: active ? [0.9, 0.45, 0.9] : 0.5 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="absolute inset-[24%] rounded-full border border-white/[0.14] bg-white/[0.04]" />

      <div className="relative flex h-9 items-end gap-[3px]">
        {[0.45, 0.8, 1, 0.7, 0.4].map((height, i) => (
          <m.span
            key={i}
            className="w-[3px] rounded-full bg-[var(--dept-techspecialist)]"
            style={{ height: `${height * 100}%` }}
            animate={
              active
                ? { scaleY: [0.4, 1, 0.55, 0.95, 0.4] }
                : { scaleY: [0.85, 1, 0.85] }
            }
            transition={{
              duration: active ? 1.1 : 3.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.09,
            }}
          />
        ))}
      </div>
    </div>
  );
}
