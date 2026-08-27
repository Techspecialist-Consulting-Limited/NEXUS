# The Chairman's brief — delivery, reconfigured

> Companion to [reporting-pipeline-diagnosis.md](reporting-pipeline-diagnosis.md)
> and [reporting-pipeline-repair-report.md](reporting-pipeline-repair-report.md).
> Migration `0021` applied to production 27 Aug 2026.

---

## What was asked for

> "I want a situation whereby I can even configure that in the next 10 minutes I
> need the report to land in his page. So everything should be as flexible as
> possible."

The configuration surface offered a day and an hour. It could not express "every
morning", "every twenty minutes while we pilot this", "only when I ask", or
"now". The finest grain it could reach was an hour.

That was the visible half. The invisible half was worse: **no setting anywhere
could have made a brief arrive sooner than the following Monday**, because four
separate constraints sat between a report and a briefing and only one of them
was configurable.

---

## The four things that made "in ten minutes" impossible

| # | The constraint | Where it lived | Now |
|---|---|---|---|
| 1 | The scheduler ticked hourly | `.github/workflows/rhythm.yml` | every 5 minutes |
| 2 | The gate was day-of-week + hour | `gateFor` | a cadence, to the minute |
| 3 | A week could only settle **after it ended** | `runReconcile` step 2 | a setting |
| 4 | The correction window had a one-hour floor | `review_window_hours` | minutes, floor of 5 |

Number 3 was the real blocker and the least visible. An administrator could have
set the brief to "every ten minutes", NEXUS would have agreed, and nothing would
ever have been sent — because the chain feeding it could not produce a settled
week to brief on until the week was over. A control that cannot do what it says
is worse than no control.

---

## What an administrator can now do

**Administration → Reporting**, and every control does something on the next tick.

```
The Chairman's brief

  Send it            [ Every week ▾ ] [ Monday ▾ ] [ 09 : 00 ]
                     Every week · Every day · Every few minutes · Only when I ask

  Brief on           [ The week that has ended ▾ ]
                     …or the week in progress

  Correction window  [ 24 hours ▾ ]     5 minutes → 3 days

  Next brief: Mon 31 Aug, 09:00
```

and, as a separate act:

```
Send a brief outside the rhythm

  [ Send it now ]   or   in [ 10 minutes ▾ ] [ Queue it ]
```

### Why the one-off is separate from the cadence

Setting a schedule and asking for one brief are different decisions. "I need him
briefed in ten minutes" says nothing about Mondays, and honouring it must not
cost the organisation its Monday. So a one-off is its own stored instant
(`exec_digest_next_at`), it is cleared once fulfilled, and a pending one never
suppresses the regular cadence.

### Why the gate now reads "last delivered"

The old gate asked "is it at or after Monday 9?", which stays true for the rest
of the week. That only ever looked correct because the digests table has a unique
key per cycle, so a second run updated one row rather than sending twice — the
idempotency was real but **accidental**, and it is why a repeating cadence would
have expressed itself as "once, then silence".

The gate now asks: *has the moment arrived, and has nothing been delivered since
it?* Still at-or-after — a missed tick catches up rather than skipping the week —
but it closes behind itself, which is what makes a repeating cadence possible.

An organisation that has **never** been briefed is due immediately rather than
waiting for the next moment. That is deliberate: Techspecialist ran for eight
days with no briefing ever generated, and "wait until Monday" would have made day
nine look identical.

---

## Three production bugs the end-to-end run found

None of these were visible to the test suite, because the suite runs against a
seeded PGlite with a mock model and all three lived in the joins between the real
pieces.

### 1. A late report could never settle · `0021`

`refresh_reconciliation` writes `skipped` when nobody has answered, and on later
recomputes updates every count but deliberately **not** `status` — correct, for
`awaiting_employee` and `confirmed`, which are decisions somebody made.

Wrong for `skipped`, which is not a decision. It is the absence of a report, and
it stops being true the moment one arrives.

```
08:00  the rhythm runs. Nobody has reported. Every row → 'skipped'
14:00  the person files. responded → true, every count becomes real
       status stays 'skipped'. Forever.
```

Nothing promotes `skipped`. The week never settled, and the digest — which briefs
on the most recent *settled* cycle — had nothing to say about a week in which
people had genuinely reported. Measured in production: two people, both
`skipped`, no digest row had **ever** existed for the organisation.

### 2. A quarter of extractions were being destroyed

The live model returned status updates with **no `status` field at all**, and
commitments shaped `{person, week, text}` instead of `{title, source_quote}`.
Zod rejected the array, the provider threw, and the submission was lost.

Measured: **3 failures in 12** on a report with open commitments.

The root cause was the prompt. `EXTRACTION_SYSTEM` named the four top-level keys
and never stated the shape of the items inside them — while `DRAFT_SYSTEM`, for
the same kind of work, shows a full worked JSON example. The model was inventing
element shapes and it was a coin flip.

Fixed at three levels:

- **the prompt** now shows the exact shape, field by field — 10/10 clean after
- **`salvage`** keeps the good elements of a bad list, but only as a *last
  resort*, after the retry has also failed. Salvaging on the first attempt would
  silently discard a promise that one more call usually recovers
- **`looseStatus`** normalises unambiguous synonyms ("completed" → `delivered`)
  and drops an update with no status rather than defaulting it. There is no
  honest default: `in_progress` invents progress nobody claimed

### 3. The brief told the Chairman nobody had reported

Every figure in the briefing was a roll-up of `brief.departments` — summed across
units, averaged across units. Correct arithmetic over the wrong set. An
organisation with no departments has nothing to roll up:

```
people_reporting: 0    people_responded: 0    units_reporting: 0
headline: "No unit reports or findings this week."
```

Two people had filed full reports. The model was faithfully describing figures
that were wrong — the exact inversion this codebase exists to prevent.

`cycleTotals()` now counts from **profiles and their reconciliations**, and works
identically whether an organisation has twenty units or none.

A related find in the same query: `weeklyPersonReports` filtered
`p.role in ('staff','lead','hr')`, so an **administrator could file a full week
and appear nowhere** — not in a thread, not in the per-person view, not in the
silent column. Migration `0015` is literally titled *"the Administrator is a
staff member too"*; this query was written later and reintroduced the old list.
Now `p.role <> 'executive'`, the same rule as `runPrompt` and `runReconcile`.

---

## Evidence, against production

Run with `scripts/verify-delivery.mts` — submits through the same function the
HTTP route calls, reads back through the same queries the pages call, runs the
same jobs the scheduler runs.

```
=== SUBMIT, AS EACH PERSON, THROUGH THE REAL PATH
ok    Abbas Taofeeq      filed against W35    commitments=1 blockers=1
ok    Suleman Olalomi    filed against W35    commitments=2 blockers=1

=== READ IT BACK, AS THE PERSON, THROUGH THE PAGE'S OWN QUERIES
ok    ... can read their own check-in back
ok    ... their own words survived verbatim
ok    ... Tasks finds a week with work in it
ok    ... has live commitments

=== RULE 2
ok    nothing settled while its correction window was still open

=== RUN THE CHAIN, EXACTLY AS THE SCHEDULER DOES
ok    the week settled once its window elapsed
      digest      : Wrote 1 briefing — Techspecialist: W35 · 24 Aug–30 Aug
      send-digest : Delivered to 1 recipient

=== CAN THE CHAIRMAN ACTUALLY SEE IT?
ok    the brief is on the Chairman's dashboard
ok    delivery was recorded, so the gate closes behind itself
```

And after the metrics repair:

```
metrics  : people_reporting=2  people_responded=2  delivery_rate=0  signal_integrity=50
silent   : []
thread   : Credicorp solution definition — Abbas Taofeeq
thread   : Smart Reporting System preparation — Abbas Taofeeq
thread   : TechSpecialist website content updates — Abbas Taofeeq
thread   : Chairman's brief delivery schedule — Suleman Olalomi
thread   : Pilot checklist completion — Suleman Olalomi
```

This is the first executive briefing this organisation has ever received.

Suite: 147 tests · sweep clean at 360/768/1440 · check-in interaction sweep
passes both breakpoints including the reload assertion · migrations replay clean
· `check:extract` 7/7 against the live deployment.

---

## Timing, honestly

The tick is best-effort. GitHub schedules it every five minutes and can run it
several minutes late under load, so **"in ten minutes" means ten to fifteen**.

`Send it now` does not wait for a tick at all — it runs reconcile → digest →
send inline, scoped to the caller's own organisation.

Five minutes is therefore the floor on every interval the picker offers. Offering
one minute would promise a precision nothing can honour.

---

## Known issues left open

1. **`source_quote` is sometimes elided with an ellipsis.** The model writes
   `"Next week I will ... finish the pilot checklist"`. Visible and not
   deceptive, but not verbatim either. The prompt now forbids it and the model
   still does it occasionally. Enforcing it needs a substring check at the
   caller, where the raw text is available.
2. **The demo seed organisation is still in production.** Inert — every job is
   now per-organisation — but it is why multi-tenant bugs keep surfacing here
   first.
3. **`recentCycles` excludes the current week** while `runPrompt` opens a
   check-in against it. The two halves disagree about which week a person is
   reporting for. Nothing is broken today because the read and write inside the
   UI agree with each other.
4. **Custom SMTP is unconfirmed.** No Supabase auth email has appeared in the
   Resend log. Briefing delivery uses Resend directly and is verified working.
