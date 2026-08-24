"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { Dialog } from "@/components/ui/dialog";
import { weekLabel } from "@/lib/cycle";
import type { WeeklyBrief } from "@/lib/queries";

/*
 * The Chairman's weekly brief, shown once when a new one exists.
 *
 * It renders the STORED digest — the same `summary_json` object that produced
 * the email he has already read — so the screen and the email cannot disagree
 * about what the week was. No model runs here.
 *
 * ON THE TYPEWRITER
 *
 * This was asked for explicitly, over the alternative of typing the headline
 * alone. It is worth writing down that it re-introduces the property that got
 * read-aloud removed from the assistant (GUIDE §11): text arriving in sequence
 * cannot be skimmed, and a reader who wants the third decision has to wait for
 * the first two. Three things keep that from being costly:
 *
 *   1  The full text is in the DOM from the first frame, with the untyped part
 *      at opacity 0. Layout is final immediately, so nothing reflows, the
 *      scrollbar does not jump, and the panel never resizes as it types.
 *   2  A click anywhere completes it at once, and the invitation to do that is
 *      on screen the whole time rather than hidden behind a guess.
 *   3  Screen readers are given the complete brief immediately, from a
 *      visually-hidden copy. A reader announcing character by character is
 *      unusable, and reading a partial briefing aloud is worse than unusable.
 *
 * Under `prefers-reduced-motion` nothing types and nothing slides.
 */

/** Roughly 110 characters a second: brisk enough to read along with. */
const CHARS_PER_SECOND = 110;

const SEEN_KEY = "nexus.weekly-brief.seen";

/*
 * Which brief has already been shown, read as an external store rather than
 * copied into state by an effect.
 *
 * GUIDE §14: "Derive, don't write state in an effect." Opening the modal from
 * an effect meant a render that immediately had to be taken back, and it is
 * the pattern the lint rule exists to catch. Here `open` is derived — closing
 * IS writing the seen id, and the store notifies, and the modal follows.
 *
 * The server snapshot is a sentinel no brief id can equal, so the dialog is
 * never part of the server render. The client decides, once, on first paint.
 */
const SERVER = "__nexus_server_snapshot__";
const listeners = new Set<() => void>();

function subscribeSeen(notify: () => void) {
  listeners.add(notify);
  // Another tab dismissing it should settle this one too.
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    // Private mode, or storage disabled. Showing it again is the safe
    // direction; showing it twice costs a click, hiding it loses the brief.
    return null;
  }
}

function serverSeen() {
  return SERVER;
}

function markSeen(id: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, id);
  } catch {
    /* Nothing to persist to. It reappears next visit. */
  }
  listeners.forEach((notify) => notify());
}

/*
 * The brief flattened into the order it is read, so one cursor can run across
 * the whole document. Headings are not part of the sequence — they are
 * signposts, and hiding them would mean the reader cannot see what is still
 * coming.
 */
type Segment = { text: string; at: number };

function sequence(brief: WeeklyBrief) {
  const segments: Record<string, Segment[]> = {
    headline: [],
    changed: [],
    threads: [],
    decisions: [],
    praise: [],
  };
  let at = 0;
  const push = (key: string, text: string) => {
    segments[key].push({ text, at });
    at += text.length;
  };

  push("headline", brief.headline);
  // Reading order, not source order: one cursor runs across the document, so
  // the sequence has to match what is on screen or the typing jumps sections.
  brief.threads.forEach((t) => {
    push("threads", t.headline);
    push("threads", t.detail);
  });
  brief.whatChanged.forEach((t) => push("changed", t));
  brief.decisions.forEach((d) => {
    push("decisions", d.risk);
    push("decisions", d.action);
  });
  brief.praise.forEach((t) => push("praise", t));

  return { segments, total: at };
}

/**
 * Advance a cursor over `total` characters on a rAF clock.
 *
 * Time-based rather than one step per frame, so the pace is the same on a
 * 60Hz and a 120Hz display, and a dropped frame does not slow the whole thing
 * down.
 */
function useTypewriter(total: number, enabled: boolean) {
  /*
   * Only the animation frame and the skip button write this. The disabled case
   * — reduced motion, or the dialog closed — is DERIVED below rather than
   * assigned in the effect, which is both the React guidance the lint rule
   * encodes and the same lesson as GUIDE §14: a value you can compute is not a
   * value to store.
   */
  const [typed, setTyped] = useState(0);
  const skipped = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    skipped.current = false;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (skipped.current) return;
      // Time-based, so the pace is identical at 60Hz and 120Hz and a dropped
      // frame does not slow the whole brief down.
      const n = Math.floor(((now - start) / 1000) * CHARS_PER_SECOND);
      setTyped(Math.min(n, total));
      if (n < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total, enabled]);

  const complete = useCallback(() => {
    skipped.current = true;
    setTyped(total);
  }, [total]);

  const cursor = enabled ? typed : total;
  return { cursor, done: cursor >= total, complete };
}

/*
 * One segment. The untyped remainder stays in the DOM so the text occupies its
 * final space from the first frame — this is what stops the panel growing and
 * the content jumping while it types.
 *
 * It is faint rather than invisible, and that is not decoration. At opacity 0
 * the waiting sections rendered as bare bullet points in empty space and an
 * empty bordered box, which at 360px reads as content that failed to load
 * rather than content on its way. Barely visible is legible as "arriving";
 * absent is legible as "broken". Too faint to actually read ahead, so it does
 * not undo the effect that was asked for.
 */
function Typed({ segment, cursor }: { segment: Segment; cursor: number }) {
  const shown = Math.max(0, Math.min(segment.text.length, cursor - segment.at));
  return (
    <>
      {segment.text.slice(0, shown)}
      <span className="opacity-[0.09]">{segment.text.slice(shown)}</span>
    </>
  );
}

export function WeeklyBriefModal({ brief }: { brief: WeeklyBrief }) {
  const reduced = useReducedMotion();

  /*
   * Once per brief. localStorage rather than a column: this is a welcome, not
   * a record. Its one cost is that a second browser shows the same brief
   * again — a far smaller problem than a migration to remember something this
   * cheap.
   */
  const seen = useSyncExternalStore(subscribeSeen, readSeen, serverSeen);
  const open = seen !== SERVER && seen !== brief.id;

  const { segments, total } = sequence(brief);
  const { cursor, done, complete } = useTypewriter(total, open && !reduced);

  const close = useCallback(() => markSeen(brief.id), [brief.id]);

  /** Name -> profile, resolved when the briefing was written. */
  const roster = new Map(brief.roster.map((r) => [r.name, r.profileId]));

  const plain = [
    brief.headline,
    ...brief.whatChanged,
    ...brief.threads.flatMap((t) => [t.headline, t.detail, t.people.join(", ")]),
    ...brief.decisions.flatMap((d) => [d.risk, d.action]),
    ...brief.praise,
    ...(brief.silent.length
      ? [`No report was filed by ${brief.silent.join(", ")}`]
      : []),
  ].join(". ");

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="weekly-brief-title"
      closeLabel="Close the weekly brief"
    >
      {/*
        The complete brief, for assistive technology, announced in full the
        moment the dialog opens. The visual copy below is aria-hidden.

        The dialog's accessible name points HERE rather than at the visible
        eyebrow, because a name resolved through an aria-hidden subtree is
        unreliable across screen readers. `sr-only` hides visually without
        hiding from the accessibility tree, which is the distinction that
        matters.
      */}
      <h2 id="weekly-brief-title" className="sr-only">
        Weekly brief{brief.cycleLabel ? ` for ${weekLabel(brief.cycleLabel)}` : ""}
      </h2>
      {/*
        Only while the visual copy is hidden. Once typing finishes the visual
        block becomes the accessible one, and keeping this would announce the
        whole brief twice.
      */}
      {!done && <p className="sr-only">{plain}</p>}

      <div
        aria-hidden={done ? undefined : true}
        onClick={done ? undefined : complete}
        className={`flex min-h-0 flex-1 flex-col ${done ? "" : "cursor-pointer"}`}
      >
        <div className="shrink-0 px-5 pb-3 pt-5 pr-16 sm:px-7 sm:pb-4 sm:pt-6 sm:pr-16">
          <p className="eyebrow">
            Weekly brief{brief.cycleLabel ? ` · ${weekLabel(brief.cycleLabel)}` : ""}
          </p>
          <h2 className="standfirst mt-2 text-primary">
            {segments.headline.map((s) => (
              <Typed key={s.at} segment={s} cursor={cursor} />
            ))}
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-2 sm:px-7">
          {/*
            The week as one account. Each thread names whose reports it came
            from, and each name opens that person — which is what makes the
            claim checkable rather than an assertion about a colleague.

            The names are only LINKS once typing has finished. While the block
            is aria-hidden they must not be focusable, or a keyboard user tabs
            into controls their screen reader cannot see.
          */}
          {brief.threads.length > 0 && (
            <section>
              <h3 className="card-title text-primary">The week</h3>
              <ul className="mt-2 space-y-3">
                {brief.threads.map((t, i) => {
                  const head = segments.threads[i * 2];
                  const body = segments.threads[i * 2 + 1];
                  const revealed = cursor >= body.at + body.text.length;
                  return (
                    <li key={head.at} className="border-l-2 border-white/[0.12] pl-3">
                      <p className="text-sm leading-snug text-white/90">
                        <Typed segment={head} cursor={cursor} />
                      </p>
                      <p className="body-sm mt-1">
                        <Typed segment={body} cursor={cursor} />
                      </p>
                      {revealed && t.people.length > 0 && (
                        <p className="note mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                          {t.people.map((name) => {
                            const id = roster.get(name);
                            return done && id ? (
                              <Link
                                key={name}
                                href={`/people/${id}`}
                                className="underline decoration-white/25 underline-offset-2 hover:text-white/80"
                              >
                                {name}
                              </Link>
                            ) : (
                              <span key={name}>{name}</span>
                            );
                          })}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {segments.changed.length > 0 && (
            <section>
              <h3 className="card-title text-primary">What changed</h3>
              <ul className="mt-2 space-y-2">
                {segments.changed.map((s) => (
                  <li key={s.at} className="body-sm flex gap-2.5">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
                    <span>
                      <Typed segment={s} cursor={cursor} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {brief.decisions.length > 0 && (
            <section>
              <h3 className="card-title text-primary">Decisions</h3>
              <ul className="mt-2 space-y-3">
                {brief.decisions.map((d, i) => {
                  const risk = segments.decisions[i * 2];
                  const action = segments.decisions[i * 2 + 1];
                  return (
                    <li
                      key={risk.at}
                      className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-3"
                    >
                      <p className="body-sm text-primary">
                        <Typed segment={risk} cursor={cursor} />
                      </p>
                      <p className="body-sm mt-1.5">
                        <Typed segment={action} cursor={cursor} />
                      </p>
                      {/*
                        Held back until its own card has finished typing.
                        Rendered on the sequence's schedule it arrived first,
                        leaving a labelled empty box above the text it labels.
                      */}
                      {d.concerns && cursor >= action.at + action.text.length && (
                        <p className="note mt-1.5">{d.concerns}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {segments.praise.length > 0 && (
            <section>
              <h3 className="card-title text-primary">Worth saying</h3>
              <ul className="mt-2 space-y-2">
                {segments.praise.map((s) => (
                  <li key={s.at} className="body-sm flex gap-2.5">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
                    <span>
                      <Typed segment={s} cursor={cursor} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            Named, not counted. A number would let him assume the worst about
            whoever it is; a name is something he can act on. And the sentence
            says what is missing — a report — never what the person did, which
            the records do not contain (rule 5).

            Rendered from the stored SQL fact, never from the model.
          */}
          {brief.silent.length > 0 && (
            <section>
              <h3 className="card-title text-primary">Not heard from</h3>
              <p className="body-sm mt-1.5">
                {brief.silent.map((name, i) => {
                  const id = roster.get(name);
                  return (
                    <span key={name}>
                      {i > 0 && ", "}
                      {done && id ? (
                        <Link
                          href={`/people/${id}`}
                          className="underline decoration-white/25 underline-offset-2 hover:text-white/80"
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </span>
                  );
                })}
              </p>
              <p className="note mt-1.5">
                No report was filed for this week. That is a gap in the record,
                not a record of their work.
              </p>
            </section>
          )}
        </div>

      </div>

      {/*
        The escape hatch, and the provenance. Outside the aria-hidden subtree
        and a real button while typing, so it is reachable by keyboard — a
        click-anywhere affordance is a mouse-only one, and being unable to skip
        is exactly the cost of typing a whole report.

        Once finished, the useful thing to say is where the words came from:
        the same brief already sitting in his inbox.
      */}
      <div className="shrink-0 border-t border-white/[0.07] px-5 py-2.5 sm:px-7">
        {done ? (
          <p className="note py-1">
            The same brief that was emailed to you. Every figure behind it was
            counted, not estimated.
          </p>
        ) : (
          <button
            type="button"
            onClick={complete}
            className="note flex min-h-11 items-center rounded-lg px-1 text-left transition-colors hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
          >
            Show all of it
          </button>
        )}
      </div>
    </Dialog>
  );
}
