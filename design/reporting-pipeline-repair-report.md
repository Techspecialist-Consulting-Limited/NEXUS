# Reporting Pipeline — Repair Report

> Companion to [reporting-pipeline-diagnosis.md](reporting-pipeline-diagnosis.md).
> Commits `fe09a91` (corrected diagnosis) and `a04ef98` (the repair).
> Migration `0020` applied to production 27 Aug 2026.

---

## What was wrong, in one line

The deployment returned `blockers` as objects, the schema demanded strings, and
because extraction ran **before** the insert the rejection destroyed the entire
submission — including the three correctly extracted commitments in the same
response.

---

## Files changed

| File | Change |
|---|---|
| `lib/ai/types.ts` | `blockers` and `mentions` accept a string **or** an object, normalising via `sentenceList()`. Generalises the lesson `narrativeResult.coaching` already encoded for the inverse mismatch. |
| `lib/checkin.ts` | Extraction moved **after** the insert. New `saveCheckIn()` persists first; a model failure marks the row `'failed'` and returns `processingFailed` instead of throwing. Commitment insert now upserts. |
| `app/api/check-in/route.ts` | Returns `saved`, `processed`, `processingFailed`, `understoodNothing` as distinct facts rather than one 200. |
| `components/staff/inline-checkin.tsx` | Three outcomes instead of one: **Filed** · **Saved** (nothing recognised) · **Saved, but not yet read** (model failed). |
| `scripts/check-extract.mts` | New. `npm run check:extract` — exercises the **live** model against five realistic report shapes. |
| `scripts/audit-reporting.mts` | New. Read-only production audit; contains no write statement of any kind. |
| `scripts/smoke-checkin.mjs` | Accepts `Filed` or `Saved` — both mean the report reached the database, which is what that check is for. |
| `supabase/migrations/0020_…sql` | Soft-deletes existing duplicates, adds a partial unique index per `(person, target week, lower(title))`. |

## Database changes

`0020_commitments_survive_a_retry.sql`, applied to production:

- Soft-deleted duplicate commitments, **keeping the earliest** — that is the id
  reconciliations, events and narratives already reference. Later copies are
  marked `deleted_at` with a reason, never removed, so the evidence survives.
- `commitments_one_live_promise_idx` — unique on
  `(profile_id, target_cycle_id, lower(btrim(title)))` where the row is live.
  Partial, because a soft-deleted or superseded commitment must not block
  re-promising the same work later.

**No RLS changes.** RLS was verified correct during diagnosis and not touched.

**No API-breaking changes.** The check-in response only gained fields.

---

## Evidence, against production

### The fix works on the exact text that failed

```
before:  8/8 FAILED — blockers.0: expected string, received object
after :  5/5 OK      commitments=3  blockers=["Vendor approval is still blocked by Legal"]
```

### A model failure no longer costs the report

Forced a genuine extraction failure:

```
status        : failed        ← migration 0002: "raw_text still intact, safe to retry"
raw_text kept : "Completed onboarding. Vendor approval is blocked by Legal…"
parsed_at     : null
```

### Retries no longer duplicate

Four identical submissions: live commitment count held at 57, zero duplicates
per `(person, week, title)`, carryovers across different weeks untouched.

### Production state after the migration

```
constraint live in production            : true
duplicates soft-deleted by the migration : 3      ← Abbas Taofeeq's W35 retries
duplicate commitments remaining          : none
commitments whose org != owner's org     : 0
check-ins whose org != owner's org       : 0
```

### Live model check

`npm run check:extract` — five shapes, all pass, including headed bullet lists
and prose-with-a-blocker.

---

## Failure cases tested

| Case | Result |
|---|---|
| Model returns objects for `blockers` | Normalised; extraction succeeds |
| Model unreachable / errors | **Report saved**, marked `failed`, `raw_text` intact |
| Duplicate submission ×4 | One set of commitments; quote refreshed, status not reset |
| Submission with tap resolutions only | Counted as understood — not "nothing recognised" |
| Extraction returns genuinely nothing | "Saved", not "Filed"; honest rather than cheerful |
| Unauthenticated POST | 307 to login |
| Check-in interaction sweep, mobile + desktop | Passes |
| All migrations replayed from scratch | Clean |

---

## What is NOT proven, and needs a person

§24's acceptance chain ends with a real authenticated session. Everything up to
that point is verified; the final leg is not, and I will not claim it is:

- [x] Database contains the repair, verified directly
- [x] Retry safety, measured
- [x] Model failure no longer destroys a report, measured
- [x] Deployment serving; all routes 200
- [ ] **A real employee submits and immediately sees their own records**
- [ ] **Survives refresh, logout, and a fresh login**
- [ ] **Next cycle reconciles plan against outcome**

The right test is **Suleman Olalomi re-submitting** — his `reports=0 / NEVER` is
the clearest evidence of the original loss, and a successful submission from him
is the clearest evidence of the repair. Running
`node --env-file-if-exists=.env.local --import tsx scripts/audit-reporting.mts`
immediately afterwards will show whether it landed.

Deliberately not simulated by writing a synthetic check-in against production:
that would put fabricated work under a real person's name, and §21 is explicit
that the database must be correct rather than made to look correct.

---

## Known issues left open

1. **`runDigest` has no organisation filter.** It selects one settled cycle
   globally and generates one digest, so with two organisations in production
   only one can ever receive a briefing. Real today, not caused by this repair.
2. **The demo seed organisation is in production** — inert behind RLS, but it is
   why (1) is live rather than theoretical.
3. **The `workflow` dependency** is installed and imported by nothing: 401
   packages, 14 high advisories. Committed here only because it was already in
   the tree; removing it is one command.
4. **`recentCycles` excludes the current week** so `/my-week` reports on the week
   that just ended, while `runPrompt` opens a check-in against the current one.
   Read and write inside the UI agree, so nothing is broken today, but the two
   halves disagree about which week a person is reporting for.
