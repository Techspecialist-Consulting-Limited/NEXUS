"use client";

import { useEffect, useId, useRef, useState } from "react";
import { m } from "motion/react";
import { CircleAlert, Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/voice";

/*
 * The composer: one way of talking to NEXUS, used everywhere.
 *
 * GUIDE Corrective Brief: "There should be one reusable AI composer pattern
 * across the app... The app should feel like the user is talking to NEXUS, not
 * filling disconnected forms." Check-ins, manager notes, executive
 * instructions and replies all use this.
 *
 * Three rules it enforces on every caller:
 *
 *   TYPING IS NEVER SECOND-CLASS. The textarea is the control; the microphone
 *   is an accelerator beside it. Dictation appears only where the browser
 *   actually supports it, and the field works identically without it.
 *
 *   DICTATION LANDS IN THE FIELD, NOT IN THE SYSTEM. Speech becomes editable
 *   text the person can correct before anything is submitted. Nothing is sent
 *   because somebody stopped speaking.
 *
 *   THE INTERIM GUESS LOOKS PROVISIONAL. Words the recogniser has not settled
 *   on are shown greyed and italic, so nobody reads a mis-hearing as something
 *   they said.
 */

export function Composer({
  label,
  hint,
  placeholder,
  value,
  onChange,
  onDictationUsed,
  rows = 4,
  disabled,
  autoFocus,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  /** Told once, when speech is first used, so provenance can be recorded. */
  onDictationUsed?: () => void;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const dictation = useDictation();
  const textarea = useRef<HTMLTextAreaElement>(null);


  // What the field already held when dictation started, so speech appends
  // rather than replacing something the person typed.
  const baseline = useRef("");
  const [everDictated, setEverDictated] = useState(false);

  useEffect(() => {
    if (!dictation.transcript) return;
    const joined = [baseline.current.trim(), dictation.transcript.trim()]
      .filter(Boolean)
      .join(" ");
    onChange(joined);
    // onChange is a caller-supplied setter and is deliberately not a dep: it
    // changes identity on every render and would re-run this on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.transcript]);

  function toggle() {
    if (dictation.listening) {
      dictation.stop();
      /*
       * FLUSH THE TAIL.
       *
       * The effect above commits words as the recogniser marks them final,
       * which leaves whatever is still interim in the air — and Chrome does
       * not settle a phrase until it hears a pause, so the last thing said was
       * dropped every time somebody stopped mid-flow. `spoken` is settled plus
       * in-flight; see lib/voice.ts.
       */
      const said = dictation.spoken.trim();
      if (said) {
        onChange([baseline.current.trim(), said].filter(Boolean).join(" "));
      }
      return;
    }
    baseline.current = value;
    dictation.reset();
    dictation.start();

    if (!everDictated) {
      setEverDictated(true);
      onDictationUsed?.();
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-white/90">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-tertiary">{hint}</p>}

      <div
        className={cn(
          "relative mt-2 rounded-lg border bg-white/[0.04] transition-colors",
          dictation.listening
            ? "border-[var(--color-critical)]/50"
            : "border-white/[0.10] focus-within:border-white/25",
        )}
      >
        <textarea
          id={id}
          ref={textarea}
          rows={rows}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-y bg-transparent px-3.5 py-3 pr-14 text-sm leading-relaxed
                     text-white/90 placeholder:text-white/25 focus:outline-none
                     disabled:opacity-50"
        />

        {/*
          Interim words, shown beneath rather than inserted into the field.
          Putting an unsettled guess into editable text means the person edits
          around something that is about to change under them.
        */}
        {dictation.interim && (
          <p className="px-3.5 pb-2 text-sm italic leading-relaxed text-white/35">
            {dictation.interim}
          </p>
        )}

        {/*
          The button is ALWAYS rendered, even where speech cannot work.

          Hiding it was a mistake: an absent control is indistinguishable from
          an unbuilt feature, so the honest report from someone on the wrong
          browser — or on http:// rather than localhost, which is how anyone
          tests on a phone — was "I cannot see the microphone anywhere". A
          disabled control that says why is a smaller failure than an invisible
          one, and the field beside it works identically either way.
        */}
        {!dictation.supported ? (
          <span
            title={dictation.unavailableReason ?? undefined}
            aria-label={dictation.unavailableReason ?? "Dictation unavailable"}
            className="absolute right-2 top-2 grid size-11 cursor-not-allowed
                       place-items-center rounded-lg text-white/20"
          >
            <MicOff size={17} aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? "Stop dictating" : "Dictate instead of typing"}
            className={cn(
              "absolute right-2 top-2 grid size-11 place-items-center rounded-lg transition-colors",
              dictation.listening
                ? "bg-[var(--color-critical)]/20 text-[var(--color-critical)]"
                : "text-white/45 hover:bg-white/[0.08] hover:text-white/80",
            )}
          >
            {dictation.listening ? (
              <>
                {/* A pulse, so it is obvious the microphone is still open. */}
                <m.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-[var(--color-critical)]/20"
                  animate={{ opacity: [0.35, 0.1, 0.35] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <Square size={15} className="relative" fill="currentColor" />
              </>
            ) : (
              <Mic size={17} />
            )}
          </button>
        )}
      </div>

      <div className="mt-1.5 flex min-h-5 items-start justify-between gap-3">
        <p className="text-2xs leading-snug text-tertiary">
          {dictation.listening ? (
            <span className="text-[var(--color-critical)]">
              Listening — everything you say lands in the box above. Nothing is
              sent until you send it.
            </span>
          ) : dictation.supported ? (
            "Type, or use the microphone. You can edit either way."
          ) : (
            dictation.unavailableReason ?? "Type your update."
          )}
        </p>
        {value.length > 0 && (
          <span className="metric shrink-0 text-2xs text-white/25">
            {value.trim().split(/\s+/).length} words
          </span>
        )}
      </div>

      {dictation.error && (
        <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-[var(--color-warning)]">
          <CircleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
          {dictation.error}
        </p>
      )}


    </div>
  );
}
