# NEXUS Intelligence Continuity Report

> 21 Aug 2026. Making NEXUS behave like the assistant `design/NEXUS.md`
> describes, working the queue from
> [convergence-report.md](convergence-report.md).
>
> No database architecture, authentication, RLS, route or visual system was
> changed. One schema-free query extension and a set of prompt and wiring
> changes.
>
> Validation: typecheck ✅ · lint ✅ · 95 tests ✅ · build ✅ · migrations replay
> ✅ · UI sweep across every role at 360/768/1440 ✅ · check-in end-to-end ✅ ·
> assistant end-to-end ✅

---

## The finding that shaped the pass

**Situational awareness is a data problem before it is a wording problem.**

You cannot prompt a model into saying "for the third week running" if the
previous weeks were never passed in. Every voice that already sounded like a
chief-of-staff turned out to have history available; every voice that sounded
like a status reporter turned out not to.

So most of this pass is plumbing, and the prompt changes are small.

---

## Historical context added

### `WeeklyHistory` — a new, compact contract

Added to `lib/ai/types.ts` and accepted by `narrate()`:

```ts
type WeeklyHistory = {
  previous?: { label; delivered; promised; delivery_rate };
  settled_weeks?: number;
  recent_delivery_rates?: number[];   // up to 4, oldest first
  carried?: { title; times }[];       // up to 3
  waiting_on?: string[];
};
```

**Every field is optional, and absent means absent.** A first-ever week produces
`{}`. No raw rows are sent — the model gets the handful of facts that let it say
"again", not a table to summarise.

### `buildHistory()` in `lib/coach.ts`

Assembled from data that already existed:

| Signal | Source | Note |
|---|---|---|
| Previous cycle | `personTrend()` | Only when the rate is non-null — a null rate means the week never settled, and a fabricated "0 of 5" is worse than no comparison |
| Weeks of history | `personTrend()` | Count of settled weeks before this one |
| Recent trend | `personTrend()` | Last four delivery rates |
| Repeated carryovers | `carry_depth` on the commitments already loaded | No second query |
| Current dependencies | `depends_on_department` | Deduplicated |

`personTrend()` was already written and, after the convergence pass deleted its
only consumer, was being fetched nowhere. It now feeds the coach.

---

## Blocker age

`blockingEdges()` already returned `oldest_since`; `lib/insights.ts` never
referenced it. It now does, through `weeksOpen()`:

- **Floored, never rounded up.** A dependency in its ninth day is in its first
  week. Inflating that is the small dishonesty that costs a system its
  credibility on the finding people are most likely to check.
- **Below one week produces nothing.** "Open for zero weeks" is worse than
  silence, so the clause is simply omitted.
- **Age raises severity.** A dependency at three weeks is now `critical`
  regardless of count. In its first week it is coordination; in its third it is
  a queue nobody owns, and counting blocked commitments alone treated the two
  identically.
- **Age appears as evidence**, not only as prose — a chip reading "Open 2 weeks"
  that expands to the date of the earliest still-blocked commitment.

Verified against real data:

> Creative Hub is holding up Techspecialist
> 2 commitments in Techspecialist cannot move until Creative Hub clears them.
> **The dependency has been open for a week.** The people waiting are not scored
> down for it…

---

## AI prompt changes

### `ASSISTANT_SYSTEM` — a hierarchy, not a template

```text
current situation  ->  why it matters  ->  recommended next step
```

Stated explicitly as a hierarchy with **"DO NOT produce three paragraphs"**, and
matched to the question:

- **Factual** — "how is Operations?" — one or two sentences, no unrequested
  recommendation. Padding a plain answer is its own kind of noise.
- **Decision** — "what needs my attention?" — ends in the single most useful
  next step. One, not three.
- **Risk** — carries evidence: what, how long, who is affected.

The old hedge *"where the facts support it, say what could be done"* was read as
optional and the action dropped from roughly half of all answers. It now reads:
**when the answer is about a problem, it ends in a next step** — omitted only for
genuinely neutral answers.

Also added: use duration where the facts carry it, and never say "again" about
something you were not told happened before.

### `NARRATIVE_SYSTEM` — using the past

A "USING THE PAST" section naming each history field, capped at **one**
historical comparison ("two makes a report"), and:

> WHEN "history" IS ABSENT OR EMPTY, SAY NOTHING ABOUT THE PAST. Not "this is
> your first week", not "no previous data" — simply write about this week as it
> is.

### `TONE_SYSTEM` — repeats get more useful, not sharper

A progression by `reminders_already_sent`, with the rule stated plainly:

> Never escalate in tone because a reminder repeated. Somebody who has not
> replied twice is usually busy or stuck, and the third message should make it
> easier to say which — not harder to ignore.

---

## Notification tone changes

`planDispatches()` previously sent `facts: {}` for a reminder — nothing for the
model to word around, so every reminder was identical.

It now carries `reminders_already_sent` and `longest_open_commitment`. The count
comes from `notifications` filtered by kind within the cycle window — no schema
change; the table has no per-subject key, and "how often have we chased this
person about this week" is exactly the question being asked.

**A bug fixed alongside it:** the reminder query excluded `hr`, while
`runPrompt()` opens a check-in for them. HR was being asked to report and never
reminded.

---

## Employee coaching changes

The coach now receives `WeeklyHistory` and uses it. Live model, real data:

> **Musa** — "You flagged the drop in time. Two of your three landed… Delivery
> rate was 75, **up from 42 in W32**."

> **Amara** — "…**The reporting pipeline migration rolled again; it has been
> carried eight times.**"

Good conduct still leads: flagging a slip early is acknowledged before anything
else. The mock provider was given the same behaviour, so the offline path
exercises it too.

---

## Manager and executive changes

Both inherit the above rather than getting separate treatment — the manager's
findings and the executive's assistant read the same `lib/insights.ts` output,
so blocker age and the response contract reach them without duplicate work.

Live executive answers now carry duration unprompted:

> "…two Techspecialist commitments have been blocked by Creative Hub **for two
> weeks**, creating a warning-level delay."

---

## Evidence

No new architecture. Blocker age is emitted as an `InsightEvidence` entry with a
`quote` naming the date it was derived from, so it renders through the existing
`EvidenceChip` on Insights, Alerts and the Chairman's dashboard.

The boundary is unchanged: **facts come from application data, the AI interprets
them.** No figure in any message is model-produced.

---

## Tests performed

Live Azure against real seeded data, via a new `npm run check:intelligence`.

| Scenario | Result |
|---|---|
| **A — no history** | Earliest week for a person: *"You delivered 2 of 7 commitments this week."* No historical language. **Correct.** |
| **B — one previous cycle** | *"…up from 42 in W32"*, *"down from 38% the week before"*. **Referenced appropriately.** |
| **C — repeated blocker** | *"blocked by Creative Hub for two weeks"* in the executive answer; *"The dependency has been open for a week"* in the finding. **Duration communicated.** |
| **D — repeated reminder** | 0 → *"You planned to Sign the distribution partnership. Complete, delayed, or blocked?"* · 1 → *"remains open from your last update. Delayed, blocked, or still in progress?"* · 3 → *"has stayed open across several updates. Would you rather revise the commitment, or capture what is blocking it?"* **Evolves; no escalation in tone.** |
| **E — executive question** | 30–51 spoken words. Factual question got a factual answer with no bolted-on recommendation; decision question ended in one next step. **Concise and decision-oriented.** |
| **F — employee coaching** | Supportive, non-judgmental, history-aware. Good conduct acknowledged first. **Correct.** |

Also run: typecheck, lint, 95 unit tests, build, migration replay, the UI sweep
across every role at three breakpoints, and both interaction sweeps — to confirm
an intelligence pass changed no interface behaviour.

---

## Remaining intelligence limitations

1. **`calibration` is still unbuilt.** The table from migration 0005 is never
   written and never read, and `NARRATIVE_SYSTEM` still accepts a field nothing
   passes. "You run 1.4× optimistic on backend work" remains a designed-and-
   unbuilt mechanism. Building it needs a real decision about how bias is
   computed; dropping the table is the honest alternative.

2. **Notification repeat counting is per-kind, not per-subject.** "How many
   times have we chased you this week" is answerable; "how many times about
   *this commitment*" is not, because `notifications` has no subject key.
   Adding one is a schema change and was out of scope.

3. **Blocker age is measured from `oldest_since`, not from cycle recurrence.**
   The system can say "open for three weeks" but not "this dependency has
   appeared in three separate cycles" — those differ when a blocker clears and
   returns. `dependency_edges` is per-cycle, so recurrence is derivable, but it
   would need a new query.

4. **The manager surface has no dedicated intelligence.** Leads read the same
   findings as the executive. `NEXUS.md` asks for suggested check-in questions
   and recognition prompts; neither exists.

5. **Coaching history is per-person only.** It cannot say "your unit is carrying
   more than usual" — unit-level trend exists in `departmentHealth` but is not
   plumbed into the coach.

6. **The assistant has no memory across sessions.** `history` carries the
   current conversation's turns and nothing else, so it cannot say "you asked
   about this last week".

7. **HR and leads still have no conversational surface.** Only the Chairman has
   the assistant — unchanged by this pass, and still a product decision rather
   than a defect.

---

## A note on method

Three edits in this pass silently failed before I noticed, for two reasons worth
recording:

**Most of `lib/` uses CRLF.** Multi-line search strings written with `\n` do not
match, and the replace reports success while changing nothing. Every edit here
now normalises line endings, edits, and restores CRLF.

**Backticks inside a template literal terminate it.** Writing `` `history` ``
inside a prompt string broke the file twice. There is now a check that counts
stray backticks inside every exported `*_SYSTEM` template; all seven are clean.

One edit removed three functions from `lib/insights.ts` through a bad boundary
calculation. They were recovered intact from a build source map, verified
against the pre-edit state, and re-applied by line index rather than by text
match.
