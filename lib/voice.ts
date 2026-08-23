"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * Dictation, via the browser's own speech recognition.
 *
 * GUIDE Corrective Brief: "Start with browser speech recognition where
 * available for prototype speed. Provide a fallback text composer if voice is
 * unavailable. Never auto-send voice output without review."
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

// The prefixed constructor is absent from lib.dom, and the unprefixed one is
// only present in newer typings. Declared narrowly rather than pulling in a
// dependency for two call sites.
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

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
   * every mount. useSyncExternalStore is built for exactly this shape: a
   * client snapshot, a server snapshot, and no subscription, because a
   * browser does not grow the API halfway through a session.
   */
  const availability = useSyncExternalStore(
    NO_SUBSCRIPTION,
    getClientSnapshot,
    getServerSnapshot,
  );
  const supported = availability === "ready";

  const unavailableReason =
    availability === "ready"
      ? null
      : availability === "insecure-context"
        ? "Dictation needs a secure page. Open NEXUS on localhost or over https."
        : "This browser cannot record speech — Chrome or Edge can.";

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  /*
   * Whether the user asked to stop, as opposed to the recogniser stopping on
   * its own. Chrome ends the session after a few seconds of silence, and
   * somebody mid-thought has not finished talking — so an unrequested end is
   * restarted rather than treated as "done".
   */
  const wantsToListen = useRef(false);

  const start = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) {
      setError("This browser cannot record speech. Type instead.");
      return;
    }

    setError(null);
    wantsToListen.current = true;

    const r = new Ctor();
    r.lang = options?.lang ?? "en-GB";
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (event) => {
      let settled = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) settled += text;
        else pending += text;
      }
      if (settled) {
        setTranscript((prev) => (prev ? `${prev} ${settled.trim()}` : settled.trim()));
      }
      setInterim(pending);
    };

    r.onerror = (event) => {
      const code = event.error ?? "unknown";
      wantsToListen.current = false;
      setListening(false);
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone access was refused. Allow it in your browser, or type instead."
          : code === "no-speech"
            ? "Nothing was picked up. Try again, or type instead."
            : "Speech recognition stopped unexpectedly. Your text is safe — carry on typing.",
      );
    };

    r.onend = () => {
      setInterim("");
      if (wantsToListen.current) {
        // Silence timeout, not a decision. Pick the thread back up.
        try {
          r.start();
          return;
        } catch {
          // Restart refused; fall through and stop cleanly.
        }
      }
      setListening(false);
    };

    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
      setListening(false);
    }
  }, [options?.lang]);

  const stop = useCallback(() => {
    wantsToListen.current = false;
    recognition.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  // Never leave a microphone open behind a closed page.
  useEffect(() => {
    return () => {
      wantsToListen.current = false;
      recognition.current?.abort();
    };
  }, []);

  return {
    supported,
    availability,
    unavailableReason,
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    reset,
  };
}
