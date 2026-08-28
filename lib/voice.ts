"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startSession } from "./voice-session";
import type { Session, SpeechRecognitionCtor } from "./voice-session";

/*
 * Dictation, via the browser's own speech recognition.
 *
 * GUIDE Corrective Brief: "Start with browser speech recognition where
 * available for prototype speed. Provide a fallback text composer if voice is
 * unavailable. Never auto-send voice output without review."
 *
 * This file is the React half: capability, state, and the four callbacks a
 * session reports through. The session itself — restarts, tolerated errors,
 * the recogniser's own quirks — lives in lib/voice-session.ts, which has no
 * React in it and is covered by tests/voice-session.test.ts. Everything that
 * was ever wrong with dictation was in that half, and none of it could be
 * tested while it lived in here.
 *
 * Two things worth knowing before relying on this.
 *
 * SUPPORT IS NARROW. The Web Speech API is Chromium-only in practice — Chrome,
 * Edge, and Chrome on Android. Firefox does not implement it and desktop
 * Safari's support is partial and inconsistent. So this is an accelerator on
 * top of typing, never a replacement for it, and `supported` is checked before
 * anything is offered rather than after it fails.
 *
 * A TRANSCRIPT IS NOT VERBATIM SPEECH. It is a machine's best guess at it.
 * That matters here more than in most products, because check-in text is
 * quoted back to people as "you said this". A dictated check-in is recorded as
 * dictated, so a disputed quote can be understood as a transcription error
 * rather than an accusation of lying.
 */

/*
 * Stable references for useSyncExternalStore.
 *
 * These MUST be module-level. Passing inline arrows means a new `subscribe`
 * identity on every render, so React tears down and re-establishes the
 * subscription each time — which re-renders, which resubscribes. That loop
 * surfaced as React error #441 and a 500 on any page rendering a composer.
 *
 * Nothing is subscribed to on purpose: a browser does not gain or lose the
 * Speech API mid-session, so the snapshot is read once and never invalidated.
 */
const NO_SUBSCRIPTION = () => () => {};
const getClientSnapshot = (): Availability => {
  if (getConstructor() === null) return "unsupported-browser";
  /*
   * A constructor is not permission.
   *
   * Chrome exposes webkitSpeechRecognition on any origin, but the microphone
   * itself needs a secure context — so over http://192.168.x.x, which is how
   * anyone tests on their phone, the button exists, the user taps it, and it
   * fails with a permission error that names nothing useful. Checking here
   * turns that into a sentence explaining why.
   */
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "insecure-context";
  }
  return "ready";
};
const getServerSnapshot = (): Availability => "unsupported-browser";

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Why dictation is or is not available.
 *
 * A boolean was not enough. "Unavailable" was rendered by hiding the button,
 * which is indistinguishable from the feature not existing — so the honest
 * report was "I cannot see the microphone anywhere", with no way to tell
 * whether that meant the wrong browser, the wrong URL, or nothing built.
 */
export type Availability = "ready" | "unsupported-browser" | "insecure-context";

/** The sentence to show when dictation cannot run here. Null when it can. */
export function reasonFor(availability: Availability): string | null {
  if (availability === "ready") return null;
  return availability === "insecure-context"
    ? "Dictation needs a secure page. Open NEXUS on localhost or over https."
    : "This browser cannot record speech — Chrome or Edge can.";
}

/**
 * Can this browser dictate, without setting anything up to find out.
 *
 * Split out of useDictation for the surfaces that need to know BEFORE they
 * offer the button: the check-in chooser used to present "Voice check-in —
 * speak to NEXUS" on every browser, and on Firefox or Safari pressing it
 * swapped in a composer that then sat there in silence. A door that opens onto
 * nothing is worse than a door marked closed.
 */
export function useDictationAvailability(): {
  availability: Availability;
  supported: boolean;
  unavailableReason: string | null;
} {
  const availability = useSyncExternalStore(
    NO_SUBSCRIPTION,
    getClientSnapshot,
    getServerSnapshot,
  );
  return {
    availability,
    supported: availability === "ready",
    unavailableReason: reasonFor(availability),
  };
}

export type DictationState = {
  /** Whether this browser can do it at all. */
  supported: boolean;
  availability: Availability;
  /** Plain sentence for the interface, or null when it works. */
  unavailableReason: string | null;
  listening: boolean;
  /** Text confirmed by the recogniser. */
  transcript: string;
  /** The current, still-changing guess. Shown greyed so it reads as provisional. */
  interim: string;
  /**
   * EVERYTHING SAID SO FAR — settled words plus the guess still in flight.
   *
   * This is what to read when harvesting a dictation, and what to show while
   * one is running. Six call sites were reading `transcript` alone, and every
   * one of them threw away the last thing the person said: the browser does
   * not mark a phrase final until it has heard a pause, so pressing Stop
   * mid-flow dropped the tail. The words were on screen, and then they were
   * not.
   *
   * Reported as one value rather than left to each caller to join, because
   * "remember to concatenate the interim" is a rule five of six callers
   * forgot.
   */
  spoken: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

export function useDictation(options?: { lang?: string }): DictationState {
  /*
   * Capability, read without an effect.
   *
   * The server cannot know whether the browser has speech recognition, so this
   * has to differ between the server render and the first client render — and
   * setting state in an effect to bridge that causes a cascading re-render on
   * every mount. useSyncExternalStore is built for exactly this shape.
   */
  const { availability, supported, unavailableReason } = useDictationAvailability();

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const session = useRef<Session | null>(null);

  const start = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) {
      setError("This browser cannot record speech. Type instead.");
      return;
    }

    setError(null);
    session.current?.abort();

    session.current = startSession(
      Ctor,
      { lang: options?.lang ?? "en-GB" },
      {
        onStart: () => {
          setListening(true);
          setError(null);
        },
        onSettled: (text) =>
          setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
        onInterim: setInterim,
        onFinish: (message) => {
          setListening(false);
          setInterim("");
          if (message) setError(message);
        },
      },
    );

    /*
     * Optimistic, and corrected by onStart above.
     *
     * The flag is set here as well because the browser can take a second or
     * two to decide about permission, and a microphone button that does
     * nothing visible for two seconds is a button people press again — which
     * aborts the session they just started.
     */
    setListening(true);
  }, [options?.lang]);

  const stop = useCallback(() => {
    session.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  // Never leave a microphone open — or a resume pending — behind a closed page.
  useEffect(() => {
    return () => {
      session.current?.abort();
      session.current = null;
    };
  }, []);

  return {
    supported,
    availability,
    unavailableReason,
    listening,
    transcript,
    interim,
    spoken: [transcript, interim].filter(Boolean).join(" ").trim(),
    error,
    start,
    stop,
    reset,
  };
}
