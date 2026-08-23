# NEXUS AI Personality Audit

> Audited 21 Aug 2026. Separate from [current-ui-audit.md](current-ui-audit.md)
> because it asks a different question.
>
> That audit asked *is the tone safe* — no blame, no invented numbers, evidence
> present, not accusatory — and answered "nothing to correct". That bar was too
> low, and the conclusion was wrong.
>
> This audit asks: **does NEXUS sound like an intelligent chief-of-staff?**

---

## The standard

[ai-communication.md](ai-communication.md) already specifies it:

```text
Observation  →  Context  →  Implication  →  Suggested next action
```

And gives the worked example:

| | |
|---|---|
| **Bad** | Creative Hub is delaying Techspecialist. |
| **Better** | Three Techspecialist commitments are currently waiting on Creative Hub approval. |
| **Best** | Three Techspecialist commitments are waiting on Creative Hub approval. **The same dependency has appeared for two cycles.** Consider confirming one approval owner and a decision date. |

The difference between *Better* and *Best* is **situational awareness** — the
system knowing this has happened before and saying so.

The previous audit graded against *Better* and passed the product. Graded
against *Best*, most of the product does not pass.

---

## The finding that reframes everything

**The tone gap is mostly a data-plumbing gap, not a wording gap.**

You cannot prompt your way to *"this has carried over for two cycles"* if the
two cycles were never passed in. Every voice that sounds like a chief-of-staff
turns out to have history available; every voice that sounds like a status
reporter turns out not to.

| Voice | Source | Has history? | Structure |
|---|---|---|---|
| **Carryover finding** | `insights.ts` (code) | Yes — `depth` | **Observation → Context → Implication → Action** ✅ |
| **Executive digest** | `DIGEST_SYSTEM` | Yes — `previous` cycle | ✅ |
| **Assistant** | `ASSISTANT_SYSTEM` | Partial — inherits from findings | Inconsistent |
| **Blocking finding** | `insights.ts` (code) | **Available, unused** | Observation → Implication only ❌ |
| **Silence finding** | `insights.ts` (code) | No | ❌ |
| **Firefighting finding** | `insights.ts` (code) | No | Partial |
| **Employee coaching** | `NARRATIVE_SYSTEM` | **None passed** | ❌ — structurally cannot |
| **Notifications** | `TONE_SYSTEM` | None | ❌ |

### A second structural fact

**Most of what reads as "the AI" is not the AI.** Insights, Alerts and the
Chairman's Priority Updates are assembled by `lib/insights.ts` — deterministic
TypeScript, no model. Improving the voice on those surfaces means editing string
assembly, not prompts.

That is good news: those are the highest-traffic messages in the product and
they are the cheapest and most predictable to change.

---

## Finding 1 — The blocking message throws away the history it already has

**Severity: Critical to the personality.** It is the product's flagship finding
and the user's own example.

`blockingEdges()` returns `oldest_since` — how long this dependency has been
live. Confirmed by grep: **`oldest_since` appears nowhere in `insights.ts`.**

Currently:

> **Creative Hub is holding up Techspecialist**
> 2 commitments in Techspecialist cannot move until Creative Hub clears them.
> The people waiting are not scored down for it, so this will not show up as
> anyone's poor week — it only shows up here.
>
> → Ask the Techspecialist and Creative Hub leads to name one owner for the
> handoff and commit to a date before Friday.

Observation, implication, action. **No context.** It reads as though this
started this week.

Intended:

> **Creative Hub is holding up Techspecialist**
> 2 commitments in Techspecialist cannot move until Creative Hub clears them,
> **and this dependency has been open for three weeks.** The people waiting are
> not scored down for it, so it will not show up as anyone's poor week — it only
> shows up here.
>
> → Ask the Techspecialist and Creative Hub leads to name one owner for the
> handoff and commit to a date before Friday.

One clause. The data is already in the row.

**Severity rises with age**, too: a dependency in its third week is not the same
finding as one in its first, and it should not carry the same weight.

---

## Finding 2 — Employee coaching has no memory at all

**Severity: Critical to the personality.**

`narrate()` receives only this week's counts — `promised_count`,
`delivered_count`, `carryover_count`, and so on. Confirmed: **no previous cycle,
no calibration, no trend is passed.**

So the employee's coach can only ever describe the current week. It cannot say
*"this is the third week running"*, *"you usually close four"*, or *"this is
better than last week"* — the three things a real chief-of-staff would say to
somebody about their own work.

Current output, live model:

> Two of your four landed. One was deferred. One commitment went unreported; I
> have asked about it.

Accurate. No situational awareness at all. It is a receipt.

Intended:

> Two of your four landed, which is about where you have been for the last three
> weeks. The pipeline migration has now moved three times — each week looked like
> a small slip, but the chain is the thing worth acting on. Worth deciding what
> the smallest shippable piece is rather than carrying it again.

**Two ingredients already exist and are not wired:**

- **`personTrend()`** — already written, already fetched on `/my-week`, and
  passed only to the sparkline in `my-week-view.tsx`. That component is dead
  (see the UI audit), so the trend is currently **fetched and thrown away on the
  page that matters.**
- **`calibration`** — a table created in migration 0005 that is **never written
  and never read.** The "you run 1.4× optimistic on backend work" mechanism was
  designed and never built.

`NARRATIVE_SYSTEM` even accepts an optional `calibration` field. `coach.ts` does
not pass one.

---

## Finding 3 — Notifications have no memory either

**Severity: Important.**

`TONE_SYSTEM` produces the sharpest single-message voice in the product:

> You planned to finalise vendor onboarding this week. Should I mark it
> complete, delayed, or blocked?

That is genuinely good — specific, one clear next step, no fault implied. But it
is a **first-time** message every time. A second reminder about the same
commitment reads identically to the first, and a blocker in its third week gets
the same wording as one in its first.

`ai-communication.md` asks for context; the facts handed to `tone()` contain
none.

Intended, for a repeat:

> The vendor onboarding commitment has now moved twice. Should I mark it
> complete, delayed, or blocked — or is it worth splitting?

---

## Finding 4 — The assistant is inconsistent about closing the loop

**Severity: Important.**

Sampling real output from `npm run check:assistant` against live data:

**Has all four parts:**

> Techspecialist needs support because two commitments are blocked waiting on
> Creative Hub, and one long-running task has slipped eight weeks. Asking Amara
> Okonkwo to break down that task and naming a single owner for the handoff with
> Creative Hub would help unblock progress.

**Stops at implication — no action:**

> Creative Hub is not behind; it has a delivery rate of 79%, above the group
> average of 77%. However, it is holding up Techspecialist by blocking two
> commitments, which delays overall progress.

The second is a good *correction of a false premise* — genuinely intelligent
behaviour — but it leaves the executive holding a fact with nothing to do about
it.

`ASSISTANT_SYSTEM` says *"where the facts support it, say what could be done"*.
That hedge is doing too much work: the model reads it as optional and drops the
action roughly half the time. The instruction should be that an answer about a
problem ends in a next step, and only a genuinely neutral answer does not.

---

## Finding 5 — The silence finding states a rule instead of a consequence

**Severity: Important.**

> 4 commitments ended the week unresolved and unmentioned — Musa Danjuma, Segun
> Adeyemi, Tunde Balogun and Fatima Bello. That is different from being late:
> being late is visible, and this was not.

The second sentence explains the *product's scoring model* to somebody who did
not ask. It is the system talking about itself.

Intended — same facts, aimed at the reader's decision:

> 4 commitments ended the week unresolved and unmentioned across 4 people. Work
> that goes quiet is usually work that got stuck rather than work that got
> dropped, and none of it will surface anywhere else. All four have been asked
> directly; their answers will land in next week's reconciliation.

---

## What is genuinely good, and should be the model

Two voices already hit the target. They are the reference for everything else.

### The carryover finding — the best writing in the product

> **"Migrate the reporting pipeline to the new warehouse" has moved 8 weeks
> running**
>
> Amara Okonkwo in Techspecialist has carried this commitment 8 times. **Each
> week on its own looked like a small slip; the chain is the finding.** Work that
> keeps moving is usually too large to finish in a week rather than neglected.
>
> → Ask Amara what the smallest shippable piece of this would be, and let the
> rest become a separate commitment.

Observation, context, an *interpretation that reframes the reader's assumption*,
and a concrete action naming a person. This is what the rest should sound like —
and it is deterministic code, which proves the voice does not require a model.

### The digest headline

> Delivery rose to 77 from 69, and silent drops fell to 4 from 5. The reporting
> pipeline migration has slipped eight weeks; two Techspecialist commitments are
> waiting on Creative Hub.

Movement, not levels. It reads this way because `buildDigestContext` passes a
`previous` block — the only place in the product that does.

---

## What the previous audit got right

Worth keeping, because these are real and were verified:

- No accusatory language anywhere.
- No model-produced figure on any screen.
- No characterisation of a person's effort or reliability. Asked *"is Musa
  lazy?"* the assistant states what the records show and that they contain
  nothing supporting the reading.
- Prompt injection is refused and the premise corrected.
- "I do not have that" is a reachable answer.

The safety floor holds. The ceiling is the problem.

---

## Priority

1. **Pass history to `narrate()`.** `personTrend()` already exists and is
   already being fetched. This is wiring, not new capability, and it fixes the
   voice on the employee's home page — the highest-priority screen in the
   product.

2. **Use `oldest_since` in the blocking finding.** One clause, data already in
   the row, on the product's flagship insight. Consider raising severity with
   age.

3. **Tighten the action requirement in `ASSISTANT_SYSTEM`.** An answer about a
   problem ends in a next step.

4. **Give `tone()` a repeat count**, so a second reminder does not read like a
   first.

5. **Rewrite the silence finding** to state the consequence rather than the
   scoring rule.

6. **Decide about `calibration`.** It is a designed-and-unbuilt mechanism —
   "you run 1.4× optimistic on backend work" — that would give coaching real
   memory. Either build it or drop the table, but leaving a schema promise
   unfulfilled is its own kind of debt.

---

## Note on method

This audit reads output, not prompts. Samples came from `npm run
check:assistant` against live Azure with real data, the stored executive digest,
the cached weekly narratives, and the exact deterministic strings in
`lib/insights.ts`.

The previous audit's error is worth naming so it is not repeated: it checked the
messages against a **compliance checklist** and never against the **standard the
documentation already sets**. A message can pass every safety rule and still
sound like a status report — and *"three commitments are waiting on Creative Hub
approval"* is exactly that message.
