import { describe, expect, it } from "vitest";
import {
  MAX_RESUMES,
  messageForError,
  startSession,
  type SpeechRecognitionLike,
} from "../lib/voice-session";

/*
 * Dictation, driven without a microphone.
 *
 * Every one of these is a bug somebody actually hit and could not explain,
 * because the browser half of dictation is invisible to a type checker, a
 * linter, and a smoke test that has no microphone to press. The report was
 * "the voice is not working, I don't know why", and it had four separate
 * causes — each one below.
 */

/** A recogniser under our control: nothing here touches a real browser. */
class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;

  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onstart: SpeechRecognitionLike["onstart"] = null;
  onend: SpeechRecognitionLike["onend"] = null;

  starts = 0;
  stops = 0;
  aborts = 0;
  /** Set to make start() throw, the way Chrome does when asked too early. */
  refuseStart = false;

  start() {
    if (this.refuseStart) throw new Error("InvalidStateError");
    this.starts += 1;
    this.onstart?.();
  }
  stop() {
    this.stops += 1;
  }
  abort() {
    this.aborts += 1;
  }

  /** The recogniser hearing something. */
  say(text: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal, length: 1, 0: { transcript: text } },
      },
    });
  }
  fail(code: string) {
    this.onerror?.({ error: code });
  }
  end() {
    this.onend?.();
  }
}

/** A clock we advance by hand, so a 120ms resume costs the suite nothing. */
function fakeClock() {
  const queue: { id: number; fn: () => void }[] = [];
  let next = 1;
  return {
    schedule(fn: () => void) {
      const id = next++;
      queue.push({ id, fn });
      return id;
    },
    cancel(handle: unknown) {
      const i = queue.findIndex((t) => t.id === handle);
      if (i >= 0) queue.splice(i, 1);
    },
    /** Run everything currently queued. */
    tick() {
      const due = queue.splice(0, queue.length);
      for (const t of due) t.fn();
    },
    get pending() {
      return queue.length;
    },
  };
}

type Recorded = {
  started: number;
  settled: string[];
  interim: string[];
  finished: (string | null)[];
};

function drive(refuseStart = false) {
  const r = new FakeRecognition();
  r.refuseStart = refuseStart;
  const clock = fakeClock();
  const log: Recorded = { started: 0, settled: [], interim: [], finished: [] };

  const session = startSession(
    class {
      constructor() {
        return r;
      }
    } as unknown as new () => SpeechRecognitionLike,
    { lang: "en-GB", schedule: clock.schedule, cancel: clock.cancel },
    {
      onStart: () => {
        log.started += 1;
      },
      onSettled: (t) => log.settled.push(t),
      onInterim: (t) => log.interim.push(t),
      onFinish: (m) => log.finished.push(m),
    },
  );

  return { r, clock, log, session };
}

describe("dictation session", () => {
  it("opens the recogniser in continuous mode with interim results", () => {
    const { r, log } = drive();
    expect(r.starts).toBe(1);
    expect(r.continuous).toBe(true);
    expect(r.interimResults).toBe(true);
    expect(r.lang).toBe("en-GB");
    expect(log.started).toBe(1);
  });

  /*
   * THE ONE THAT MADE IT LOOK BROKEN.
   *
   * Chrome raises `no-speech` every time somebody stops talking for a few
   * seconds. It was being treated as a failure: the session was torn down and
   * the composer came back saying "nothing was picked up" — to a person who
   * was mid-thought. Dictation could not survive a pause.
   */
  it("survives a pause: no-speech is not a failure", () => {
    const { r, clock, log } = drive();

    r.say("finished the onboarding checklist", true);
    r.fail("no-speech");
    r.end();

    expect(log.finished).toEqual([]);
    expect(clock.pending).toBe(1);

    clock.tick();
    expect(r.starts).toBe(2);
    expect(log.finished).toEqual([]);
  });

  /*
   * The resume has to be scheduled, not issued from inside onend: the session
   * has announced its end but has not finished tearing down, and start()
   * throws InvalidStateError. The old code caught that and quietly stopped,
   * which is the same symptom by a different route.
   */
  it("schedules the resume rather than restarting inside onend", () => {
    const { r, clock } = drive();
    r.end();
    expect(r.starts).toBe(1); // nothing yet
    expect(clock.pending).toBe(1);
    clock.tick();
    expect(r.starts).toBe(2);
  });

  it("gives up after a budget of resumes rather than looping on a dead microphone", () => {
    const { r, clock, log } = drive();

    for (let i = 0; i < MAX_RESUMES; i++) {
      r.end();
      clock.tick();
    }
    expect(r.starts).toBe(MAX_RESUMES + 1);

    r.end();
    expect(clock.pending).toBe(0);
    expect(log.finished).toHaveLength(1);
    expect(log.finished[0]).toMatch(/kept dropping out/i);
  });

  it("resets the budget whenever words actually arrive", () => {
    const { r, clock, log } = drive();

    for (let i = 0; i < MAX_RESUMES - 1; i++) {
      r.end();
      clock.tick();
    }
    r.say("still here", true); // a live microphone
    for (let i = 0; i < MAX_RESUMES; i++) {
      r.end();
      clock.tick();
    }

    expect(log.finished).toEqual([]);
  });

  /*
   * A refused microphone used to stop the session in silence, because the
   * three surfaces rendering dictation never read the error. It is reported
   * here so they have something to render.
   */
  it("reports a refused microphone in words a person can act on", () => {
    const { r, log } = drive();
    r.fail("not-allowed");
    expect(log.finished).toHaveLength(1);
    expect(log.finished[0]).toMatch(/refused/i);
  });

  it("distinguishes a missing microphone from a refused one", () => {
    expect(messageForError("audio-capture")).toMatch(/No microphone was found/);
    expect(messageForError("not-allowed")).toMatch(/refused/i);
    expect(messageForError("network")).toMatch(/network/i);
    expect(messageForError("no-speech")).toBeNull();
    expect(messageForError("aborted")).toBeNull();
    expect(messageForError("something-new")).toMatch(/stopped unexpectedly/i);
  });

  it("stops cleanly when asked, and does not resume afterwards", () => {
    const { r, clock, log, session } = drive();
    r.say("done", true);

    /*
     * stop() asks the recogniser to finish; the browser still owes us its
     * `end` event, and any words it settles on the way out belong in the
     * transcript. So the session is not over until `end` arrives.
     */
    session.stop();
    expect(r.stops).toBe(1);
    expect(log.finished).toEqual([]);

    r.end();
    expect(log.finished).toEqual([null]); // clean: no error message
    expect(clock.pending).toBe(0);
    expect(r.starts).toBe(1); // never resumed
  });

  it("separates settled words from the guess still in flight", () => {
    const { r, log } = drive();
    r.say("legal is still", false);
    r.say("legal is still blocking the contract", true);

    expect(log.settled).toEqual(["legal is still blocking the contract"]);
    expect(log.interim).toContain("legal is still");
  });

  it("reports a microphone that will not open at all", () => {
    const { log } = drive(true);
    expect(log.finished).toHaveLength(1);
    expect(log.finished[0]).toMatch(/Could not start the microphone/);
  });

  it("abort leaves nothing running and nothing pending", () => {
    const { r, clock, session } = drive();
    r.end(); // queues a resume
    expect(clock.pending).toBe(1);

    session.abort();
    expect(clock.pending).toBe(0);
    expect(r.aborts).toBe(1);

    clock.tick();
    expect(r.starts).toBe(1);
  });
});
