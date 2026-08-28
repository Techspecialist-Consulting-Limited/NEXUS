/*
 * One dictation session, with no React in it.
 *
 * WHY THIS IS A SEPARATE FILE.
 *
 * Everything that was wrong with dictation was in here — a silence timeout
 * ending the session, a restart refused because it was issued too early, an
 * error swallowed — and none of it could be tested, because it was tangled
 * with hook state in a component tree and this suite has no browser in it.
 *
 * Pulled out, it is a small state machine over a recogniser and four
 * callbacks, and tests/voice-session.test.ts drives it with a fake recogniser
 * and a fake clock. lib/voice.ts is now the React wrapper: state, and nothing
 * else.
 *
 * WHAT THE BROWSER ACTUALLY DOES, since none of it is obvious:
 *
 *   - Chrome ends a continuous session after a few seconds of silence. It
 *     fires `no-speech` and then `end`. Somebody drawing breath mid-sentence
 *     has not finished talking, so an unrequested end is resumed.
 *   - start() called from inside the `end` handler throws InvalidStateError:
 *     the session has announced its end but has not finished tearing down.
 *     The resume is therefore scheduled, not immediate.
 *   - `aborted` arrives whenever a session is replaced or cancelled, which is
 *     routine and is not an error anybody can act on.
 *   - A recogniser that ends immediately every time is a dead microphone, not
 *     a pause, so resumes are budgeted rather than infinite.
 */

// The prefixed constructor is absent from lib.dom, and the unprefixed one is
// only present in newer typings. Declared narrowly rather than pulling in a
// dependency for two call sites.
export type SpeechRecognitionAlternativeLike = { transcript: string };
export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};
export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};
export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
};
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** How many silence-timeouts to ride out before calling it a dead microphone. */
export const MAX_RESUMES = 12;
/*
 * Long enough for the browser to finish tearing the session down, short enough
 * that a pause in speech is not a gap in the transcript.
 */
export const RESUME_DELAY_MS = 120;

/**
 * The sentence to show for a recogniser error, or null if it is not one.
 *
 * `no-speech` and `aborted` return null. They were being reported as failures,
 * which is what people meant by "the voice does not work": you paused to think
 * and the interface told you nothing had been picked up, having already thrown
 * the session away.
 */
export function messageForError(code: string): string | null {
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was refused. Allow it for this site in your browser, then press the microphone again — or type instead.";
    case "audio-capture":
      return "No microphone was found. Plug one in or type instead.";
    case "network":
      return "Speech recognition could not reach the network. Type instead, or try again in a moment.";
    default:
      return "Speech recognition stopped unexpectedly. Your text is safe — carry on typing.";
  }
}

export type SessionHandlers = {
  /** The recogniser is actually open. Not when start() was called — when it opened. */
  onStart: () => void;
  /** Words the recogniser has committed to. */
  onSettled: (text: string) => void;
  /** The current, still-changing guess. */
  onInterim: (text: string) => void;
  /**
   * The session is over and will not resume. `message` is null for a clean
   * stop, and a sentence for the reader when something went wrong.
   */
  onFinish: (message: string | null) => void;
};

export type Session = {
  /** Finish cleanly. Nothing resumes after this. */
  stop: () => void;
  /** Drop it on the floor — page unload, component unmount. */
  abort: () => void;
};

export type SessionOptions = {
  lang?: string;
  /** Injected so tests can drive the resume without a real clock. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
};

export function startSession(
  Ctor: SpeechRecognitionCtor,
  options: SessionOptions,
  handlers: SessionHandlers,
): Session {
  const schedule =
    options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel =
    options.cancel ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let wantsToListen = true;
  let resumes = 0;
  let pending: unknown = null;
  let finished = false;

  const r = new Ctor();
  r.lang = options.lang ?? "en-GB";
  r.continuous = true;
  r.interimResults = true;

  function finish(message: string | null) {
    if (finished) return;
    finished = true;
    wantsToListen = false;
    if (pending !== null) {
      cancel(pending);
      pending = null;
    }
    handlers.onInterim("");
    handlers.onFinish(message);
  }

  r.onstart = () => {
    handlers.onStart();
  };

  r.onresult = (event) => {
    let settled = "";
    let guess = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) settled += text;
      else guess += text;
    }
    if (settled) handlers.onSettled(settled.trim());
    handlers.onInterim(guess);
    // Words arrived, so the microphone is alive. Start the budget over.
    resumes = 0;
  };

  r.onerror = (event) => {
    const message = messageForError(event.error ?? "unknown");
    // Tolerated. onend decides whether to resume.
    if (message === null) return;
    finish(message);
  };

  r.onend = () => {
    handlers.onInterim("");

    if (!wantsToListen) {
      finish(null);
      return;
    }

    if (resumes >= MAX_RESUMES) {
      finish("The microphone kept dropping out. Your text is safe — carry on typing.");
      return;
    }

    resumes += 1;
    pending = schedule(() => {
      pending = null;
      if (!wantsToListen) return;
      try {
        r.start();
      } catch {
        // The browser refused to resume. Stop cleanly rather than loop on it.
        finish(null);
      }
    }, RESUME_DELAY_MS);
  };

  try {
    r.start();
  } catch {
    finish("Could not start the microphone. Type instead.");
  }

  return {
    stop() {
      wantsToListen = false;
      if (pending !== null) {
        cancel(pending);
        pending = null;
      }
      /*
       * stop(), not finish(): the recogniser still owes us its `end` event,
       * and any words it settles on the way out belong in the transcript.
       * finish() runs from onend, where a clean stop is a clean stop.
       */
      try {
        r.stop();
      } catch {
        finish(null);
      }
    },
    abort() {
      wantsToListen = false;
      if (pending !== null) {
        cancel(pending);
        pending = null;
      }
      finished = true;
      try {
        r.abort();
      } catch {
        // The page is going away. Nothing to report to.
      }
    },
  };
}
