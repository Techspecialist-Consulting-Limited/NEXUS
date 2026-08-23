# NEXUS — Rejected Patterns

> An anti-pattern library. Everything here has either been proposed for this
> product and rejected, or shipped here and removed.
>
> If you are about to build one of these, the answer is not "do it more
> tastefully". Rewrite the element with different structure.

---

## 1. The generic dashboard

```text
4 KPI cards
4 more KPI cards
a large chart
a large table
recent activity
```

**Why it is rejected.** It shows everything and decides nothing. The reader does
the summarising the product exists to do. It is also the single most predictable
output for "build a dashboard", which means shipping it says the screen was
generated rather than designed.

**Instead:** lead with the conclusion. Organization signal → brief → movement →
risks → actions → evidence.

---

## 2. Decorative analytics

A chart that communicates no decision.

**The test:** if the reader cannot name a different action they would take
depending on what the chart shows, it is decoration.

Specific offenders already removed from this codebase:

- **A progress ring for a single percentage**, placed directly beside the counts
  that produce it. The same fact told twice, once in a form you cannot read
  precisely. A figure is the figure.
- **Per-unit delivery bars on a page whose decision is something else.** On HR's
  overview the decision is who to chase; five bars made context the loudest
  thing on screen and none of it was theirs to act on.

**Kept, because it earns its place:** the delivery bars on the Units page. That
page exists to compare units at a glance, which is what a bar does better than a
column of numbers.

---

## 3. Excessive glass

Glass applied to every section for consistency.

Glass is a material for framing important content and creating depth. Applied
uniformly it stops meaning anything and starts costing legibility.

**Never:** glass inside glass. Heavy blur on a small element. Glowing borders.

---

## 4. Excessive pills

Everything rendered as a pill, badge or tag.

**Removed from this codebase:**

- **Fifteen coloured pills with avatar circles** on HR's Reporting page, to say
  "these people are fine" — the heaviest element on a page whose entire job is
  pointing at the one person who has *not* reported. They are a receipt, and a
  receipt is a sentence.
- **A filled chip on every commitment row**, where the coloured dot beside the
  name already carried the state. The same thing said twice, turning a quiet
  list into a row of buttons that do nothing.
- **"3 items need your attention" as an outlined pill**, giving a *count* the
  same visual weight as the three findings below it that actually need acting
  on.

**The rule:** a badge is for something that needs acting on. A count is text. A
state that a dot already carries is not a badge.

---

## 5. Decorative AI

Glowing orbs, gradients, oversized assistant graphics, sci-fi decoration.

An assistant surface should look like something you talk to, not like a
screensaver. Where an ambient element exists — an orb, a waveform — it must be
`aria-hidden`, carry only state that is already stated in words beside it, and
animate on transform and opacity alone.

**AI output must never look more confident than the data warrants.** Confidence
is stated in words, not implied by visual polish.

---

## 6. Empty luxury

Large hero areas with little meaningful content. Generous whitespace around
nothing.

Whitespace is for hierarchy. If a section is mostly empty, the section is the
problem.

---

## 7. Card nesting

Cards inside cards inside cards.

A card says "this is a separate thing". Nesting them says it three times about
the same thing. The only acceptable inner container is a distinct interactive
target — a row that navigates somewhere.

---

## 8. The mobile desktop squeeze

Taking a desktop dashboard and stacking everything into one long mobile page.

Also its inverse, which this product shipped once: **every screen looking like a
stretched phone app**, with a centred column and a bottom pill on a 1440px
display. Desktop executive views should feel like a command room.

Mobile-first means the employee's phone workflow is designed and validated
first — not that the phone layout is the only layout.

---

## 9. Surveillance UX

Any interface that makes an employee feel watched, ranked or punished.

**Never:**

- an org-wide ranking of humans
- a leaderboard of any kind
- a single "integrity" score with no counterweight
- individual drill-down framed as investigation rather than support
- reporting a person's figures upward before they have seen them

This is not a tone preference. An employee who feels surveilled commits to less,
and once that happens every number downstream is theatre.

---

## 10. AI blame language

Language that identifies a person as a failure rather than describing a
situation and a possible next step.

| Never | Instead |
|---|---|
| You failed to complete this. | You planned to finish this this week. Complete, delayed, blocked, or no longer relevant? |
| Amara is underperforming. | Amara has several open commitments and the same blocker in two cycles. A short check-in may clarify the dependency. |
| Musa is unreliable. | Musa dropped one commitment without saying so. The records contain nothing about reliability. |

**Never characterise attitude, effort or reliability.** The system cannot
observe any of them.

---

## 11. Inventing what the system cannot see

NEXUS has no activity tracking — no timers, no screen monitoring, no keystrokes.

**Rejected from a design mock:** *"You've been focused for 3.5 hrs this morning.
Great momentum!"* That number could only be fabricated, and a fabricated number
about somebody's own working day is the fastest way to lose them.

Also rejected: **a percent-complete on a single commitment**. No such value
exists in the schema — a commitment has a status. Category-level percentages are
real and computed; per-item ones would be invented in the browser.

---

## 12. Making the reader do the filtering

A flat list of everybody, sorted, when the page exists to surface the two people
who need something.

The people who are fine are not a to-do list. Split by what the page asks of the
reader — chase these, note these, everyone else — and let the third group be a
sentence.

---

## 13. Repeating one fact per person

Three people who each dropped one commitment is **one fact about the week**.
Emitting it as three findings produced three cards with identical bodies and
identical recommended actions on every surface that renders findings — and a
reader scanning that learns to skip the whole shape.

Group the finding. Keep the names in the summary and the evidence.

---

## 14. Defensive rendering that hides a real failure

Tolerating missing fields so a schema change cannot break delivery is good.
Tolerating them so far that an *empty* artefact renders cleanly and reports
itself as sent is how a blank executive briefing went out looking fine.

**Tolerate at the edge; refuse to send nothing.**

---

## 15. Asserting in an empty state

An empty state must not claim something the system has not checked.

> "Nothing has gone quiet — the week is running itself."

Coaching that is merely absent is not evidence that the week is clean. The model
may have been slow, mocked, or failed. Derive the empty-state sentence from the
rows, or say plainly that there is nothing to show.
