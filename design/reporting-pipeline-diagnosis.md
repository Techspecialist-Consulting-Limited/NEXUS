# Reporting Pipeline — Diagnosis

> Investigated 27 Aug 2026, against the running code and a live database, after
> real users reported submissions that said "Failed", then "Successful", and
> then showed nothing on screen.
>
> **No production behaviour was changed while writing this.** Every claim below
> was produced by executing the real code paths against a seeded database and
> reading the resulting rows directly, not by reading source and inferring.
>
> Method, in two passes:
>
> 1. **Local** — one real user (Amara Okonkwo, `lead`), one real organisation,
>    the actual `submitCheckIn()` entry point with the exact payload the UI
>    sends, then direct SQL against `check_ins`, `commitments` and
>    `reconciliations`.
> 2. **Production** — the live Azure deployment (`gpt-4.1-mini`, fast tier),
>    called through the product's own provider and prompts, with the rejected
>    payload captured via temporary instrumentation that was reverted
>    immediately (`git diff` clean).
>
> The second pass overturned the conclusion of the first. The local run pointed
> at how plans are phrased; against the real model that turned out to be an
> artefact of the offline provider, and the actual production failure is
> something the mock cannot produce at all.

---

## Root cause

**The live model returns a correct extraction, and the application throws all
of it away because one secondary field came back as objects instead of
strings.**

`lib/ai/types.ts:76` requires:

```ts
blockers: z.array(z.string().max(300)).max(10).default([]),
```

The deployment returns:

```json
"blockers": [
  { "description": "Vendor approval is still blocked by Legal",
    "source_quote": "Vendor approval is still blocked by Legal." }
]
```

Zod rejects it, `lib/ai/azure.ts:398` throws, and because `extract()` runs
BEFORE the insert (`lib/checkin.ts:98` vs `:122`) **nothing is persisted at
all**. The user is told "Could not file that".

### What is actually lost

The captured payload from the failing call — the model had done the job
perfectly:

```json
"commitments": [
  { "title": "Complete vendor launch",     "source_quote": "Complete vendor launch." },
  { "title": "Finish API documentation",   "source_quote": "Finish API documentation." },
  { "title": "Resolve Legal approval",     "source_quote": "Resolve Legal approval." }
],
"updates": [],
"blockers": [ { "description": "...", "source_quote": "..." } ],
"mentions": []
```

**Three correctly extracted commitments are discarded over the shape of
`blockers`** — the least important field in the result, documented in
`lib/ai/types.ts:76` as "free-text obstacles worth surfacing even if not tied
to a commitment".

### Rate, measured against the real deployment

The exact text from §19 of the brief, eight consecutive calls:

```
1..8: FAILED — blockers.0: Invalid input: expected string, received object

8/8 lost entirely.
```

Deterministic for this input. Shorter texts that mention a blocker succeeded
8/8 in a separate run, which is why the symptom looked intermittent to users:
**it depends on the shape of what somebody wrote, not on luck.** A report with
several achievements, a blocker and several plans — the normal shape of a real
weekly update — fails every time. A one-line update usually does not.

That is precisely the reported pattern: *"One submission displayed Failed.
Another displayed Successful. After retries, some appeared to succeed."* The
ones that succeeded were the shorter ones.

### Why no test caught it

The mock provider constructs `blockers` as strings by rule, so it can never
produce this. Every test, the whole visual sweep and every local trace run
against the mock (`vitest.config.mts` sets `NEXUS_FORCE_MOCK_AI: "1"`
deliberately, so CI never bills a metered API). The failure exists only on the
path nothing automated exercises.

`npm run check:assistant` tests the live model against the assistant, not the
extractor.

### The precedent this ignores

`narrativeResult.coaching` already solves exactly this class of problem, in the
same file (`lib/ai/types.ts:137-152`): it accepts an object **or** a bare
string and normalises, with the comment —

> "models reliably return a plain list of sentences instead, and a schema that
> only accepts the richer form turns that into a 500 on somebody's own week
> page."

`blockers` has the inverse mismatch and no such tolerance. The lesson was
learned once and not generalised.

---

## A local finding that did NOT survive production

The first pass concluded that plans written as imperatives — "Complete vendor
launch." rather than "I will complete vendor launch." — produced no
commitments, because `lib/checkin.ts:94-96` merges the two labelled fields into
one blob and `extract()` takes a single `text: string`, so the achieved/planned
distinction has to be re-inferred from tense.

Against the mock that is exactly what happens: `lib/ai/mock.ts:36` requires an
explicit future marker, and imperatives yield zero commitments.

**Against the live model it does not.** The captured payload above shows Azure
extracting all three imperative plans correctly, with verbatim source quotes.

The merge is still a real weakness — the application destroys information it
already had, and relies on the model to reconstruct it — but it is **not** the
cause of the reported incident, and fixing it would not have helped anybody.
Recorded here so the wrong lead is not re-followed.

---

## Contributing causes

### C1 — A failed AI call discards the entire submission

`lib/checkin.ts:98` calls `aiProvider().extract()` **before** the insert at
line 122. On an Azure timeout or error the function throws, the route returns
non-2xx, and **nothing is persisted at all.**

This ordering is defensible — it avoids a half-written record — but it means
the model is a hard dependency of *saving*, not just of *understanding*. A slow
or rate-limited Azure deployment makes the product unable to accept a report.

This is the "Failed" half of the symptom. The client keeps the typed text
(`"Your words are still here — try again"`), so nothing the user typed was
lost, but a save that depends on a metered third party is a save that will fail
in front of people.

### C2 — Retrying duplicates commitments

Measured directly. The same payload submitted twice:

```
submit 1: 7f43eb41-…  | commitments: 1
submit 2: 7f43eb41-…  | same row? true
duplicate commitment titles from the retry: 1
```

The **check-in** is correctly idempotent — `on conflict (profile_id, cycle_id,
channel) do update`, with `raw_text` appended rather than overwritten, honouring
the append-only rule in migration 0002 (measured: 400 chars after two
submissions).

The **commitments** are not. There is no uniqueness on
`(profile_id, target_cycle_id, title)`, so each retry inserts another copy.
Because users were told "Failed" and retried — repeatedly — this has almost
certainly already happened in production.

Note the precedent in GUIDE §14: duplicated commitments previously inflated
delivery figures by roughly twenty points across every unit and the executive
briefing. This is the same failure arriving by a different route.

### C3 — Two check-in rows per person per cycle

Measured: `check_in rows for that cycle: 2`.

The unique constraint is `(profile_id, cycle_id, channel)`. The `prompt` job
creates one row and the UI writes another when the channel differs. GUIDE §14
already records this exact hazard — *"One row per person, not per channel"* —
where a plain join fanned out and inflated a headline count. The constraint
still permits the fan-out.

### C4 — The rhythm opens a check-in for a different cycle than the UI files against

Measured for the same user on the same day:

```
CYCLE the page shows :  W34 · 17 Aug–23 Aug   e4f3038b-…
CYCLE plans land in  :  W35 · 24 Aug–30 Aug   4eafcc69-…
CYCLE calendar today :  W35 · 24 Aug–30 Aug   4eafcc69-…
page == today?          false
```

`lib/queries.ts:78` deliberately excludes the current week:

```sql
where kind = 'week' and starts_on < date_trunc('week', current_date)::date
```

so `/my-week` shows **last week** — which is correct for the model in §2 of the
brief: you report on the week that just ended, and your plans land in the week
you are now in.

But `runPrompt` uses `currentCycles()`, which selects the **current** week. So
the rhythm opens a check-in row against W35 while the interface files against
W34. Read and write inside the UI agree with each other, so this is **not** the
cause of the empty screen — but "did this person report?" is answered from
`submission_status` per cycle, and the two halves of the system disagree about
which cycle a person is reporting for.

### C5 — `latestVisibleCycle` returns nothing until a week has settled

`lib/queries.ts:726` only returns a cycle that already has a `confirmed` or
`auto_confirmed` reconciliation. Until 26 Aug **nothing in the application ever
created a reconciliation** (fixed in `1a61f91`), so this returned `NULL`
in production for every viewer.

`/my-week` does not use it — it uses `recentCycles`, which is why the employee
page still rendered. But `/dashboard`, `/departments` and `/people/[id]` all do,
and they would have shown "no settled week" to the Chairman regardless of how
much staff had filed.

---

## Failure paths

Every way a submission can currently fail, and what the user is told:

| # | Failure | Persisted? | User sees | Correct? |
|---|---|---|---|---|
| 1 | **Model returns `blockers` as objects** | **No — nothing at all** | "Could not file that" + their text kept | **No — this is the bug.** A valid extraction is discarded |
| 2 | Azure times out or errors | **No** | "Could not file that" + their text kept | Honest, but the save should not depend on the model |
| 3 | Invalid body (bad `cycleId`) | No | 400 → generic failure | Adequate |
| 4 | Unknown cycle id | No | 404 → generic failure | Adequate |
| 5 | No session | No | 401 | Adequate |
| 6 | Retry after a real failure | Yes | "Filed" | Duplicates commitments (C2) |
| 7 | Network drop mid-request | Unknown to client | "NEXUS could not be reached" | Text kept; safe to retry |

`lib/api-messages.ts` already maps statuses to honest messages, so the
distinction the brief asks for in §14 partly exists. What it cannot express is
**"saved, but nothing was understood"** — because the route returns `200` with
`extracted: []` and the client treats any 2xx as complete success.

---

## Data lifecycle, as it actually runs

```
User types "progress" and "plan"        two labelled fields
        │
        ▼
POST /api/check-in                      both fields sent, cycleId from the page
        │
        ▼
route: resolve cycle + next cycle       ✅ correct
        │
        ▼
submitCheckIn()
   ├─ merge progress + plan → rawText   ⚠️  labels discarded (weakness, not the bug)
   ├─ aiProvider().extract(rawText)     ❌ VALID result rejected on blockers shape
   │                                    ❌ throws ⇒ NOTHING below ever runs
   ├─ insert check_ins                  ✅ correct when reached — never reached here
   ├─ insert commitments                ✅ correct when reached — never reached here
   └─ update resolutions                ✅ correct
        │
        ▼
reconciliation                          ⚠️ only since 1a61f91; nothing before
        │
        ▼
RLS                                     ✅ verified correct (below)
        │
        ▼
router.refresh() → server components    ✅ genuinely re-reads
        │
        ▼
screen shows what exists                ✅ … which is nothing new
```

### RLS is not implicated

Verified directly, as the brief requires — not inferred from tests passing:

```
author can read own check-in : true
colleague can read it        : false   (must be false)
```

`check_ins_own` is behaving exactly as designed. Commitments are org-visible and
readable. **No record is hidden by RLS.** The records genuinely do not exist.

---

## Data integrity risk

Assessed against the production failure. **Not** a claim that data is safe.

| Risk | Verdict |
|---|---|
| **Lost** | **Yes, outright.** Every submission whose extraction hit the `blockers` mismatch was never written. `extract()` runs before the insert, so there is no `check_ins` row, no `raw_text`, nothing. The words survived only in the browser, and only until the person gave up or navigated away. This is worse than the local pass suggested: not "saved but unstructured" — **not saved at all**. |
| **Which submissions** | Longer, realistic reports — several achievements, a blocker, several plans. Exactly the people who wrote the most. A one-line update usually got through. |
| **Duplicated** | **Likely.** Retries duplicate commitments (C2, measured). Users retried repeatedly against a deterministic failure, so any report that eventually succeeded may have left duplicates behind. |
| **Wrong cycle** | **No.** Verified: write and read agree, `cycle_id` correct in every trace. |
| **Wrong organisation** | **No.** `org_id` is derived inside the insert from the profile row; it cannot be passed in wrong. |
| **Hidden by RLS** | **No.** Verified by read-back: the author can read their own row, a colleague cannot. |
| **Orphaned** | **No.** Every commitment carries `source_check_in_id`. |
| **Raw text overwritten** | **No.** Append-only holds — 400 chars measured after two submissions. |

**Nothing can be recovered from backups, because nothing was ever written.**
The only record that a person tried to report is their own memory and whatever
they can retype. Anyone who reported a blocker in a substantial update should be
asked to re-submit once the fix is in.

---

## Repair plan, by severity

### P1 — Accept the shape the model actually returns
Make `blockers` tolerate an object as well as a string and normalise, exactly
as `narrativeResult.coaching` already does for the inverse mismatch in the same
file. Root cause; fixes the incident. Small and contained.

### P2 — Never let a model response cost somebody their report
Persist the check-in **before** extraction, then process. A model failure should
leave the report saved and re-processable, and the API should distinguish
`SAVE_FAILED` from `PROCESSING_FAILED` (brief §11, §14). Then no future schema
drift can ever silently delete a submission again — which matters more than any
single field, because this class of bug will recur.

### P3 — Test the live extractor, not only the mock
Nothing automated exercises the real model's extraction, which is why a
deterministic 8/8 failure reached real users. A `check:extract` script
alongside `check:assistant`, run against realistic multi-part reports.

### P4 — Make commitments idempotent per retry
Uniqueness on `(profile_id, target_cycle_id, lower(title))` so a retry updates
rather than inserts, then audit production for duplicates already created.

### P5 — Tell the user when a report saved but produced nothing
The route knows `extracted.length === 0`. Saying so turns a silent no-op into
something correctable.

### P6 — Reconcile which cycle the rhythm opens (C4), and one check-in row per person per cycle (C3)
Correctness issues not currently hurting users.

---

## What was ruled out

- **Organisation mismatch** (brief §6) — `org_id` is derived server-side from
  the profile; it cannot diverge.
- **Actor/profile confusion** (§7) — one identifier throughout the traced path.
- **RLS** (§10) — verified by read-back as the author and as a colleague.
- **Client cache / stale render** (§13) — `router.refresh()` genuinely re-reads;
  it displays an unchanged screen because the data is unchanged.
- **Raw text mutation** (§15) — append-only verified.
