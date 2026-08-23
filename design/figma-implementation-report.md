# NEXUS Figma Implementation Report

> 21 Aug 2026. Building the eight supplied Figma screens — the employee
> dashboard and the seven-screen check-in flow — with the mobile view as the
> primary target.
>
> Structure from the references. Colour, palette and glass untouched, as asked.
> No schema, migration, RLS, authentication, query, scoring or AI contract was
> changed. One additive query (`reportingStreak`) supplies figures the desktop
> design asks for.
>
> Validation: typecheck ✅ · lint ✅ · 95 tests ✅ · build ✅ · migrations replay
> ✅ · UI sweep across every role at 360/768/1440 ✅ · check-in end-to-end ✅ ·
> assistant end-to-end ✅

---

## What was built

### The check-in flow — two shapes, one state

`components/checkin/check-in-flow.tsx` was rewritten around the seven reference
screens, which describe two different things and not one thing twice.

**Phone — a five-step wizard.** Entry, then:

| Step | Screen |
|---|---|
| 1/5 | Last week's target — one commitment at a time |
| 2/5 | What changed this week |
| 3/5 | What NEXUS understood |
| 4/5 | Focus for next cycle |
| 5/5 | Review weekly brief |

**Desktop — a three-column workspace.** Last week's commitments, the
conversation, and next week, all visible at once with a stats rail.

They share one piece of state and are selected with `useSyncExternalStore` over
a `matchMedia` query, so a resize mid-flow never loses an answer and only one
layout is ever in the DOM. Rendering both and hiding one with CSS put 21 buttons
in the accessibility tree where 7 were visible.

**One decision per screen is the constraint that shaped step 1.** Stacked, three
commitments made it a 2,517px scroll with eighteen buttons — exactly the wall
the wizard exists to replace. Paginated, every step is now one viewport:

| Screen | Height at 390×844 |
|---|---|
| Entry | 844px |
| 1/5 target | 1114px (six resolutions plus the quote) |
| 2/5 changed | 844px |
| 3/5 understood | 844px |
| 4/5 next cycle | 844px |
| 5/5 review | 844px |

### The employee dashboard

`components/staff/copilot-home.tsx` became three columns in the order somebody
uses them — **what matters now · what NEXUS noticed · tell it what changed** —
with the inline check-in living in the third column rather than on another page.

### Real figures behind the desktop stats rail

`reportingStreak()` in `lib/queries.ts` supplies "Last settled delivery" and
"Weeks reported in a row". The streak counts **weeks reported**, not weeks
delivered: it rewards the reporting rhythm rather than punishing a hard week
that was declared. That is the same rule as the two scores, applied to a
different number.

---

## Defects found while building, and fixed

### 1. `text-2xs` was not a class — Critical

The single largest finding of this pass, and it had nothing to do with the
Figma.

`--text-2xs` lived in `:root` with the rest of the type scale. Tailwind v4
generates a `text-*` utility only for a `--text-*` variable it can see **inside
`@theme`**, and 2xs is the one step Tailwind does not ship itself. So the
variable existed — `.eyebrow`, `.note` and every hand-written
`font-size: var(--text-2xs)` resolved it perfectly — while the class `text-2xs`
compiled to **no rule at all**.

**111 usages across 32 files silently inherited their parent's font size.** On
the phone's bottom navigation that meant 16px labels inside a pill built for
11px: "My week" wrapped onto two lines and spilled out of the pill, and with
five tabs the labels ran into each other across the whole bar.

This survived the entire convergence pass — the one that migrated 105 ad-hoc
pixel sizes onto the scale — because a missing utility is not an error. Nothing
warns. The class is simply absent, and the text renders at whatever it
inherited.

Fixed by declaring the step inside `@theme`, where the compiled output is now
`.text-2xs{font-size:.6875rem}` with the variable still emitted to `:root` for
the CSS that reads it directly.

**And guarded.** `scripts/smoke.mjs` measures a rendered `.text-2xs` on every
page and fails if it computes above 12px. Verified in both directions: removing
the token again fails the sweep on 30-odd role/route/breakpoint combinations
with the file and block named.

### 2. The dashboard forced a 565px page onto a 390px phone — Important

Grid items default to `min-width: auto`. A `truncate` title inside one is
`white-space: nowrap` by definition, so the untruncated string set the track's
minimum: the whole app scrolled sideways, and the ellipsis the class existed to
produce never appeared.

`min-w-0` on the three columns. Then, because a single truncated line at 390px
leaves about thirty characters — *"Ship the commitment reco…"* is not a
commitment anybody recognises as theirs — the titles are clamped to two lines
instead.

A sweep across every role and route at 360px and 768px now confirms zero
horizontal overflow anywhere.

### 3. The wizard kept your scroll position between steps — Important

Every step puts its action at the bottom, so by the time you tap "Next
commitment" you are ~250px down. The next commitment then rendered with you
already scrolled past its title and past the sentence you wrote about it last
week. A wizard that asks one question per screen has to show the question.

Scroll resets on every `step` or commitment change, instantly rather than
smoothly — a 250px animated scroll on each tap reads as the page recovering from
something rather than a new screen arriving.

### 4. Step 3 asked you to confirm an empty screen — Important

`updates` only ever held what the sorter found in *dictated* text. Somebody who
resolved six commitments by tapping and then skipped "what changed this week"
reached **"What NEXUS understood"** and was shown *"Nothing to show yet."* above
a **Looks correct** button.

Step 3 now confirms everything NEXUS has been told from both routes, with the
sorter winning on a collision: if you tapped "Delayed" and then said why, your
own words are the better record of the same commitment. The standfirst changed
from *"Your words, sorted"* to *"Everything you have told NEXUS so far"*,
because on the tap-only path there were no words.

### 5. The microphone had no accessible name

The large mic button in the wizard's capture card was an icon with
`aria-hidden`, inside a button with no label — a screen reader announced
"button". The visible "Tap to speak" text is a sibling, not its content. Given
an `aria-label`, and it changes with state.

### 6. A zero painted in the blocked red

The review screen rendered `0 Blocked` in the critical colour. A review screen
that alarms you on a clean week teaches you to stop reading it. Colour now means
"this happened"; a zero is grey.

### 7. The dashboard's middle column was a hole

At 1440px the middle column held one short card between two full ones — and it
is legitimately empty on any week NEXUS has no question to ask. The two scores
moved there from under the commitment list, which is also where they belong:
they are an observation about the week, not another thing to act on.

### 8. Mock plurals

*"1 commitments arrived from a previous week"*, *"1 pieces of work landed"*. The
mock provider is the wording every offline run and every test sees, so it is
product copy, not a fixture.

---

## Unchanged, deliberately

**The colours, the palette and the glass.** Explicitly out of scope.

**The bottom navigation stays visible during the wizard.** A second fixed bar
above it would eat a third of a small screen, so the step actions sit inline at
the end of the content. Measured at 390×844 with the page scrolled to the
bottom: no overlap.

**The desktop workspace's ragged column bottoms.** The left column is the work;
the right is a reference rail. Padding a rail to match a list is decoration.

**The check-in flow's write boundary.** Everything before the final confirm goes
through `/api/check-in/draft`, which cannot write. Only step 5 files.

---

## Follow-up: the typed question on the executive dashboard

Reported after the pass above: typing a question into the assistant returned
*"I could not answer that just now. Try again in a moment."* while the
suggestion chips and the microphone both worked.

**Cause.** `POST /api/assistant/ask` required two words. That rule was written
for the microphone — a recogniser that mis-fires emits one stray syllable and
there is no point paying for an answer to it — and it was applied to every
route in. Typed one word at a time, which is how anybody types into a box,
**"Blockers?"**, **"Operations"** and **"Techspecialist"** each returned 422.

Nothing noticed because the two working paths both send full sentences: the
suggestion chips are fixed strings and dictation produces a spoken sentence.

The gate now asks only whether there is anything to answer at all — two
characters that are a letter or a digit. `"?"` and `"  "` still stop; a single
real word costs one cheap call and gets a real answer, or the assistant's own
*"I do not have that"*, which is the better failure.

### The bug underneath it

Every non-2xx became that same sentence. Three of the statuses that route
returns are permanent, so the console was telling people to retry something that
would fail identically forever. **An assistant that cannot say what went wrong
is in the same position as one that cannot say "I do not have that": it will
invent, and here the invention was "try again".**

`lib/api-messages.ts` now maps each status to what actually happened:

| Status | Was | Now |
|---|---|---|
| 400 | try again in a moment | I could not read that question. Try rewording it. |
| 422 | try again in a moment | There was nothing there to answer. Ask me in a word or two. |
| 409 | try again in a moment | No reporting week has settled yet, so there is nothing for me to answer from. |
| 429 | try again in a moment | That is more questions than I can take right now. Give it a minute. |
| 502/3/4 | try again in a moment | I could not reach the model just now. Try again in a moment. |
| thrown | try again in a moment | I could not reach NEXUS. Check your connection and ask again. |

Only the last two say "try again", because only those can come true.

### The same class of failure, elsewhere

Filing a check-in threw `Save failed (401)`. At the end of a five-step
reconciliation that is the worst moment in the product to be terse, and it does
not say the thing that matters: **your words are still here.** `filingFailure()`
now covers both check-in surfaces, and each message says what happens to what
you wrote.

`/api/onboarding` and `/api/invitations` already return human-readable `error`
strings that their clients surface, so they were left alone — the server's
wording is more specific than anything derivable from a number.

### Two smaller things fixed alongside

- **A failed follow-up wiped the answer you were reading.** `send()` cleared the
  answer before the request left, so tapping a follow-up chip and having it fail
  cost you the thing you already had. The previous answer now stays on screen
  with the failure beneath it.
- **The typed field accepted more than the route would.** `maxLength={1000}`
  matches the schema, so a long paste stops at the field rather than coming back
  as "I could not read that question".

### Guarded

`scripts/smoke-assistant.mjs` now types a deliberately **one-word** question on
both breakpoints and asserts an answer comes back with no failure message.
Verified in both directions: restoring the two-word rule fails the sweep on
mobile and desktop.

The mock provider also learned `blocker` and `stuck`, so the offline path
answers the one-word question rather than falling through to "I do not have
that".

---

## Follow-up: the phone bar and the assistant panel

Two things from the reference screenshots.

### The launcher in the middle of the phone bar

The bar is now four tabs and a raised 48px circle between them. It is an
**action, not a destination** — no label, no `aria-current`, and it never takes
the sliding indicator.

What it opens follows what the role does:

| Role | Opens | Slots |
|---|---|---|
| staff | quick voice check-in on `/my-week`, listening | 4 + launcher |
| executive | the assistant on `/dashboard`, listening | 4 + launcher |
| lead | quick voice check-in | 5 + launcher |
| hr | quick voice check-in | 5 + launcher |
| admin | — | 5, no launcher |

**It replaces the "Check in" tab rather than joining it.** Two entry points to
the same act, one of them four times the size, is a question the interface
should not be asking. The tab stays in the desktop sidebar, where there is no
launcher.

The admin gets none. They neither file nor carry the assistant, so a microphone
in the middle of their bar would open nothing, and a prominent button that does
nothing is worse than five plain tabs.

Staff and the Chairman land on exactly five slots with the circle dead centre,
which is the reference. Leads and HR carry one more tab and the circle sits one
slot right of centre — the alternative was hiding a route on phones to buy
symmetry, which is the wrong trade.

**Two details that were nearly wrong.**

- *Driven by the search param, not by mount.* Tapping the launcher while already
  standing on the target page remounts nothing, so a mount-only effect would
  have fired the first time and never again — which is exactly the tap somebody
  makes when they are already looking at their week. Verified: tapping twice in
  a row opens the recogniser twice.
- *Cleared with `router.replace`, not `history.replaceState`.* The latter leaves
  the router still holding `ask=1`, so the next tap would be a no-op change and
  nothing would happen.

The launcher is also `prefetch={false}`. `?ask=1` is an instruction rather than
an address; prefetching it refetches the same page under a URL that exists only
to be acted on and discarded, and the aborted prefetches showed up as failures
in the sweep.

### The assistant stopped talking

**Nothing is read aloud any more.** `lib/speech.ts`, the mute toggle and the
read-aloud button are gone.

Speech is linear and unskimmable — somebody who half-hears "sixty two percent"
has no way back to it — and waiting for a synthesised voice to finish a
paragraph is slower than reading one. The microphone stays, because asking out
loud is genuinely faster than typing.

That also collapsed the answer contract. `AssistantAnswer` carried a separate
`spoken` field written for the ear; with nothing speaking it, that field was a
promise the schema could not keep, so it was removed rather than left behind.
**One answer now, written to be read.**

### And it got much shorter

The old contract asked for 60–110 words in `detail`. The reference screenshot
shows what that produces on a phone: nine sentences, five figure chips and three
follow-ups, stretching the panel past a full screen.

`ASSISTANT_SYSTEM` now specifies:

- **40–70 words. Three or four short sentences. Never more.**
- **One idea per sentence.** If it needs a comma to hold two thoughts, it is two
  sentences.
- **Plain words.** "Is waiting on", not "is pending upstream resolution".
- Two or three numbers at most — the rest are in the figure chips beside the
  answer, so repeating them in the sentence buys nothing.

The zod cap dropped from 2500 characters to 900 as the last line of defence, and
the mock provider was rewritten to the same length so the layout is never
designed against a wordier answer than production produces.

### The panel no longer stretches the page

The answer and its figures sit in a `max-h-56` region that scrolls. Follow-ups
and the controls stay outside it — a follow-up you have to scroll to find is a
follow-up nobody taps.

The point is not the scrollbar; it is that the panel is the same height before
and after a question. A long answer used to push everything below it down by
several hundred pixels and slide the controls off the bottom of a phone.

### Guarded

`scripts/smoke-assistant.mjs` now asserts, on both breakpoints, that nothing
called `speechSynthesis.speak`, that the answer region computes
`overflow-y: auto`, and that it is capped under 280px.

**What I could not verify here:** the sweeps run against the mock provider, so
what is proven is that the contract, the layout and the caps are right. Whether
the live model actually writes at a fifth-grade reading level is a prompt
outcome — `npm run check:intelligence` prints the word count of every answer and
flags anything over 70, which is the way to check it against Azure.

---

## Still open

Carried from [convergence-report.md](convergence-report.md) and
[intelligence-continuity-report.md](intelligence-continuity-report.md),
unchanged by this pass:

1. `department-view.tsx` — the Chairman scans Units in the new layer and lands
   in the old one.
2. `team-board.tsx` still uses a `ProgressRing` for a single percentage.
3. The two `border-l-2` side stripes.
4. `calibration` is still built and never used — build it or drop the table.
5. Notification repeat counting is per-kind, not per-subject.
6. HR and leads still have no conversational surface.

On the Chairman's dashboard at 360px, the Priority Updates bodies clamp to two
lines and cut mid-sentence — *"Ask what happened to those items before treatin…"*
That surface was left structurally alone by the convergence pass and is left
alone here, but it is the next thing worth looking at on a phone.
