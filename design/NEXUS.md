# NEXUS — Product & Experience Specification

> What NEXUS is for, and how each role should experience it.
>
> This file owns **product and experience decisions**. It does not describe
> implementation — see [GUIDE.md](../GUIDE.md) for architecture, the data model,
> security, the AI layer and the reporting rhythm.

---

## Product definition

NEXUS is an **AI chief-of-staff layer for organizational execution**.

Its job is to turn scattered reports into organizational memory and useful
action. The employee should not have to remember to file an update, and the
executive should not have to go looking for one.

What makes it more than a reporting form: it connects what somebody promised
last week to what they report this week, and turns the gap into coaching for
the employee and a decision for leadership.

---

## The core loop

```text
Previous commitment
        ↓
Current update
        ↓
AI interpretation
        ↓
Employee confirmation      ← the employee always sees it first
        ↓
Reconciliation
        ↓
Signal detection
        ↓
Manager support
        ↓
Executive intelligence
```

If this loop is not visible in the product, what you have is a dashboard.

The confirmation step is not politeness. It is the only thing standing between
a mis-heard word and a permanent record with somebody's name on it.

---

## Product promise

**Employee:** *Reporting should feel easy and useful.*

**Manager:** *The system should tell me where I can help.*

**Executive:** *I should understand what is happening without chasing reports.*

---

## The three modes

The interface visibly changes shape by role. Reuse components where the job is
the same; change the surface where it is not.

### Assist — the employee

> What should I focus on, and what do I need to report?

### Coach — the manager or lead

> Where does my team need support?

### Command — the executive

> Is the organization moving in the right direction?

Never serve the same dashboard to all three. A page that reads as surveillance
to the first and as noise to the third has failed both.

---

## Product design rules

Every major screen answers at least one of:

- What changed?
- What matters?
- What is at risk?
- What needs attention?
- What should happen next?
- Who needs support?
- What decision is required?

A screen that answers none of these is a report, not a product surface.

**The product must not become a collection of dashboards.** The constraint that
prevents it is subtraction: a screen fails by showing everything it could rather
than the few things that change a decision.

---

## The failure mode this design exists to prevent

An app that scores people on "commitment integrity" and reports "silent drops"
to the boss teaches exactly one lesson: **commit to less**. Once people sandbag
their weekly commitments to protect a number, every figure downstream is
theatre.

Four mechanisms hold that off. None are cosmetic, and none are negotiable:

1. **Two scores, never one.** *Delivery* — did the work land. *Told in time* —
   did you keep people informed. Deferring on Tuesday with a reason scores
   **high** on the second. This is what makes it a coach rather than a cop.
2. **Blocked-by-another-team never counts against you.** Blocked work is
   excluded from the delivery denominator, and the interface says so on the row.
   If it counted, people would stop declaring dependencies — and cross-team
   blockers are the most valuable thing this product finds.
3. **The employee sees it first.** A reconciliation is invisible to leads and
   executives until its subject has confirmed it or the review window closes.
4. **Scores are not performance-review inputs**, and the employee's own screen
   says so in plain words.

---

## Employee experience — Assist

**Primary objective: submit a useful update with minimum friction.**

The sequence:

```text
Speak or type
      ↓
AI interprets
      ↓
AI shows what it extracted
      ↓
Employee reviews and edits
      ↓
Employee confirms
      ↓
It becomes official
```

Voice and text are both first-class. Speech recognition is Chromium-only in
practice, and plenty of people would rather not talk out loud at a desk —
typing is not the fallback, it is the other way in.

**This happens on the employee's own page.** They do not navigate away to
report on their own week. The point of a home page that answers everything is
that you never leave it to do the one thing it exists for.

The experience should feel: supportive, fast, conversational, respectful,
useful.

It must never feel: bureaucratic, punitive, surveillance-oriented, or like a
spreadsheet.

### Two paths, and why both exist

Decided 21 Aug 2026. The product has two ways to file, and each has a job.

**Inline — the quick path.** On the employee's own home page.

> *Just tell NEXUS what happened.*

Voice-first, around thirty seconds, no navigation. Speak or type, NEXUS sorts it
into this week / next week / what this changes, you correct anything wrong, one
button files it. This is the default and the one most weeks should use.

**`/check-in` — the deliberate path.** A guided reconciliation.

> *Let's properly reconcile your week.*

```text
Previous commitments
        ↓
Status resolution, one at a time
        ↓
Current update
        ↓
Next-week plans
        ↓
AI interpretation
        ↓
Confirmation
```

For the week where things moved and each commitment needs an answer, rather than
one paragraph covering everything.

**Both surfaces must say which they are.** The ambiguity that made this a
decision was not that two paths existed — it was that a person was shown both
and told nothing about why. The inline card offers the deliberate path when
there is a lot outstanding; the guided flow says it is the thorough option.

### What the employee's home shows

- Where they stand — the two scores, stated as help rather than judgment.
- What they committed to, grouped and scannable.
- One place to file an update.
- Coaching, when there is something real to say.

### What it must not show

Anything the system cannot actually observe. NEXUS has no activity tracking —
no timers, no screen monitoring, no keystrokes. A line like *"you've been
focused for 3.5 hours this morning"* could only be invented, and an invented
number about somebody's own working day is the fastest way to lose them.

---

## Manager experience — Coach

Managers primarily see:

- people needing support
- blockers, and repeated blockers
- vague updates
- missing updates
- cross-team dependencies
- overloaded commitments
- recommended follow-up questions
- positive progress worth naming

The interface answers **"where can I help?"** — not "who failed?".

Do not design it around ranking or failure. No leaderboards. No org-wide
ranking of humans, ever. Individual drill-down is framed as *this person may
need support*.

---

## Executive experience — Command

The first viewport answers, in order:

1. Are we on track?
2. What changed?
3. What matters?
4. What needs attention?
5. What should leadership do?

**Conclusions before details.**

```text
Organization signal
        ↓
Executive brief
        ↓
Department movement
        ↓
Top risks
        ↓
Leadership actions
        ↓
Evidence / detail
```

Do **not** default to:

```text
KPI grid + KPI grid + chart + table + recent activity
```

That is generic dashboard design. It shows everything and decides nothing.

Every executive card carries a **reason**, an **impact**, and a **next action**.

Weak:

> Creative Hub has 3 blockers.

Strong:

> Creative Hub is blocking three delivery commitments in Techspecialist. The
> repeated blocker is asset approval, now in its third week. Ask both leads to
> confirm a single approval owner before Friday.

---

## Progressive disclosure

Reveal in layers. Do not force the reader through all three at once.

```text
Layer 1  Conclusion   Vendor launch may slip.
Layer 2  Reason       Legal approval has stayed open for two cycles.
Layer 3  Evidence     Previous commitment · current update · cycle history
```

Evidence is always reachable and never mandatory reading. A finding you can
check is a finding you can act on; one you cannot is an opinion from software.

---

## AI behavior

The AI should act like an analyst with receipts.

It should:

- interpret updates
- ask useful follow-up questions
- identify commitment drift
- identify repeated blockers
- identify vague reporting
- identify silence
- identify cross-department dependencies
- prepare summaries
- recommend actions
- help employees clarify their work
- help managers support their people
- help executives understand organizational movement

It must not:

- invent statistics
- blame employees
- expose employees unnecessarily
- present uncertain conclusions as facts
- silently change meaningful records

### The rule that governs all of it

**Numbers come from application data. Prose comes from the AI.**

Never let a model produce a figure an executive might check. A model that
computes gets caught being wrong exactly once, and after that nothing it says is
trusted.

Facts and inference must stay visually distinguishable. Confidence is stated,
not implied.

### Ask before escalating

Unless the risk is critical, the employee gets a chance to clarify before
leadership sees a negative interpretation. This is the trust model, and it is
enforced in the database rather than in the interface.

---

## Where the other rules live

| Topic | File |
|---|---|
| Visual system, typography, color, motion | [visual-system.md](visual-system.md) |
| How the AI speaks | [ai-communication.md](ai-communication.md) |
| Realistic UI copy | [ui-content.md](ui-content.md) |
| What we do not build | [rejected-patterns.md](rejected-patterns.md) |
| Current UI state | [current-ui-audit.md](current-ui-audit.md) |
| Architecture and implementation | [../GUIDE.md](../GUIDE.md) |
