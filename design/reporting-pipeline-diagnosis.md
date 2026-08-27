# Reporting Pipeline — Diagnosis

> Investigated 27 Aug 2026, against the running code and a live database, after
> real users reported submissions that said "Failed", then "Successful", and
> then showed nothing on screen.
>
> **No production behaviour was changed while writing this.** Every claim below
> was produced by executing the real code paths against a seeded database and
> reading the resulting rows directly, not by reading source and inferring.
>
> Method: one real user (Amara Okonkwo, `lead`), one real organisation, the
> actual `submitCheckIn()` entry point with the exact payload the UI sends, then
> direct SQL against `check_ins`, `commitments` and `reconciliations`.

---

## Root cause

**The employee's plan is discarded before it ever becomes a commitment,
because the two labelled fields are concatenated into one blob and the
distinction between *achieved* and *planned* is thrown away at the boundary.**

`components/staff/inline-checkin.tsx` collects two separate, clearly labelled
fields and posts them as two separate keys:

```ts
body: JSON.stringify({ cycleId, progress, plan, dictated, resolutions })
```

`lib/checkin.ts:94-96` then merges them:

```ts
const rawText = [draft.progress.trim(), draft.plan.trim()]
  .filter(Boolean)
  .join("\n\n");
```

and `lib/ai/types.ts:210` gives the extractor no way to recover the difference:

```ts
extract(input: {
  text: string;                       // <- one blob. Which half was the plan?
  openCommitments: { id: string; title: string }[];
  personName: string;
  cycleLabel: string;
}): Promise<AiResult<ExtractionResult>>;
```

So the extractor must re-infer "this sentence is a future intention" from
**tense alone**. When somebody writes a plan the way a field labelled *"what
are you planning"* invites them to — as a bare imperative list — that
inference fails and **zero commitments are created**.

### Evidence

Submitting the exact text from §19 of the brief, through the real code path:

```
progress: "Completed onboarding checklist. Vendor approval is still blocked by Legal."
plan:     "Complete vendor launch. Finish API documentation. Resolve Legal approval."

submit ok. checkInId: 7f43eb41-60bb-45d6-b91b-e78401f77c8a
extracted commitments: 0
COMMITMENTS CREATED:   0
```

The check-in row itself is **perfect**:

```json
{ "id": "7f43eb41-…", "profile_id": "cdfbcd2b-…", "org_id": "896aec23-…",
  "cycle_id": "e4f3038b-…", "status": "parsed", "chars": 149,
  "responded_at": "2026-08-27T08:47:02.048Z" }
```

Right person, right organisation, right cycle, text saved, `responded_at` set.
**The save is not the problem.** Nothing downstream was produced from it.

Isolating the trigger — same extractor, four phrasings:

| Text | Commitments |
|---|---|
| progress + plan, as the UI sends it | **0** |
| `"Complete vendor launch. Finish API documentation."` (imperative) | **0** |
| `"I will complete vendor launch. I will finish API documentation."` | 2 |
| `"Next week I will complete the vendor launch…"` | 1 |

The differentiator is an explicit future marker. `lib/ai/mock.ts:36` makes this
explicit for the offline provider:

```ts
const FUTURE = /\b(will|going to|plan to|planning|next week|aim to|intend to|i'?ll)\b/i;
```

**This is not only a mock artefact.** The live Azure provider receives the same
single blob with the same missing signal. It may infer better from tense, but
it is being asked to reconstruct information the application already had and
deliberately destroyed. §1 of the brief states the rule this violates: *"These
must never be treated as the same thing."* The code merges them one line before
extraction.

### Why the user sees "Successful, then nothing"

The client is well behaved, which is what makes this so confusing to a user:

```
POST /api/check-in  →  200 OK
toast: "Filed — Your week is recorded."
setProgress(""); setPlan("");        // the text is cleared
router.refresh();                    // server components re-read
```

The refresh is real and correct. It re-reads the database and finds **exactly
what was there before**, because nothing new was created. The user is told the
truth ("it was filed") and shown the truth ("nothing new"), and the two
together read as data loss.

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
| 1 | Azure extract throws / times out | **No** | "Could not file that" + their text kept | Honest, but the save should not depend on the model |
| 2 | Plan written as imperatives | **Check-in yes, commitments no** | "Filed" then an unchanged screen | **No — this is the bug** |
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
   ├─ merge progress + plan → rawText   ❌ THE LABELS ARE LOST HERE
   ├─ aiProvider().extract(rawText)     ❌ fails ⇒ nothing saved at all (C1)
   ├─ insert check_ins                  ✅ correct, idempotent, append-only
   ├─ insert commitments                ❌ zero, when plans are imperative
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

Assessed honestly; **not** a claim that data is safe.

| Risk | Verdict |
|---|---|
| **Lost** | **Yes, in effect.** Every plan submitted as an imperative list exists only as free text in `check_ins.raw_text`. It was never structured into commitments, so nothing tracks, reconciles or reports it. The words are recoverable; the meaning was never captured. |
| **Duplicated** | **Likely.** Retries after "Failed" duplicate commitments (C2 measured). Users retried repeatedly, so production probably holds duplicates that will inflate delivery figures exactly as GUIDE §14 records. |
| **Wrong cycle** | **No.** Write and read agree; `cycle_id` was correct in every trace. |
| **Wrong organisation** | **No.** `org_id` is derived from the profile row inside the insert (`from profiles p where p.id = …`), never passed in. The hypothesis in §6 of the brief is disproven. |
| **Hidden by RLS** | **No.** Verified read-back above. |
| **Orphaned** | **No.** Every commitment carries `source_check_in_id`. |
| **Raw text overwritten** | **No.** Append-only holds — measured 400 chars after two submissions. |

**Nothing needs recovering from backups. What needs repairing is that
submissions were never converted into records**, plus duplicate commitments
created by retries.

---

## Repair plan, by severity

### P1 — Tell the extractor which half is the plan
Give `extract()` the two fields separately rather than one merged blob, so
"achieved" and "planned" are structural rather than inferred from grammar. This
is the root cause and fixes the reported symptom. Requires changing the
`AiProvider` interface, both providers, and the prompt.

### P2 — Do not let a failed model call discard a saved report
Persist the check-in first, then extract. A model failure should leave the
report saved and re-processable, and the response should distinguish
`SAVE_FAILED` from `PROCESSING_FAILED` (brief §11, §14).

### P3 — Make commitments idempotent per retry
Uniqueness on `(profile_id, target_cycle_id, lower(title))` so a retry updates
rather than inserts. Then audit production for duplicates already created.

### P4 — Tell the user when a report saved but produced nothing
The route already knows `extracted.length === 0`. Saying so — "filed, but I did
not find any commitments in that" — converts a silent failure into a correctable
one.

### P5 — Reconcile which cycle the rhythm opens (C4)
Align `runPrompt` with the cycle the UI files against, or make the discrepancy
explicit, so compliance answers "did they report" against the same week.

### P6 — One check-in row per person per cycle (C3)
Revisit the `channel` component of the uniqueness constraint.

---

## What was ruled out

- **Organisation mismatch** (brief §6) — `org_id` is derived server-side from
  the profile; it cannot diverge.
- **Actor/profile confusion** (§7) — one identifier throughout the traced path.
- **RLS** (§10) — verified by read-back as the author and as a colleague.
- **Client cache / stale render** (§13) — `router.refresh()` genuinely re-reads;
  it displays an unchanged screen because the data is unchanged.
- **Raw text mutation** (§15) — append-only verified.
