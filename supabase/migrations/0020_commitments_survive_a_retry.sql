-- ============================================================================
-- 0020 — a retry must not duplicate somebody's week
--
-- WHAT HAPPENED
--
-- Extraction ran before the check-in was saved, so when the model returned
-- `blockers` as objects instead of strings the whole submission was discarded
-- and the person was told "Could not file that". They retried. Some retries
-- succeeded — and every success inserted a fresh copy of the same commitments,
-- because nothing stopped it.
--
-- Measured in production before this migration:
--
--   2x  Abbas Taofeeq · W35 · Finalize the Smart Reporting System…
--   2x  Abbas Taofeeq · W35 · Continue defining the Credicorp solution…
--   2x  Abbas Taofeeq · W35 · Work with Robinah to update and improve…
--
-- The check-in row was already idempotent — `on conflict (profile_id,
-- cycle_id, channel)`, with raw_text appended rather than replaced. The
-- commitments it produced were not, so the one part of a retry that mattered
-- was the part with no protection.
--
-- This is the second time duplicate commitments have distorted this product's
-- figures. GUIDE §14 records the first: a seed bug gave one person the same
-- commitment three times in a week, and each copy counted separately, inflating
-- delivery by roughly twenty points across every unit and the executive
-- briefing. Same damage, different route in.
--
-- WHY TITLE, AND WHY LOWER()
--
-- A person cannot meaningfully promise the same thing twice for the same week.
-- Titles come from a model and vary in capitalisation between runs, so the key
-- is case-insensitive — otherwise "Finish API documentation" and "Finish API
-- Documentation" are two promises about one piece of work.
--
-- Scoped to LIVE rows: a soft-deleted commitment must not block re-promising
-- the same work later, and a superseded one is history rather than a duplicate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clean up what the retries already created, before the constraint lands.
--
-- Keeps the EARLIEST of each set. The first insert is the one whose id any
-- reconciliation, event or narrative already refers to; deleting it and
-- keeping a later copy would orphan those references. Later copies are
-- soft-deleted rather than removed, so the evidence of what happened survives
-- and nothing is destroyed on the way to fixing a counting bug.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id, target_cycle_id, lower(btrim(title))
      order by created_at, id
    ) as copy
  from commitments
  where deleted_at is null
    and status not in ('superseded', 'dropped')
)
update commitments c
   set deleted_at = now(),
       outcome_reason = coalesce(
         c.outcome_reason,
         'Duplicate created by a retry after a failed submission (migration 0020).'
       )
  from ranked r
 where r.id = c.id
   and r.copy > 1;

-- ---------------------------------------------------------------------------
-- One live promise per person, per target week, per piece of work.
--
-- A partial index rather than a table constraint, because the rule only
-- applies to rows that are still live. Postgres cannot express that in a
-- UNIQUE constraint, and expressing it as one would make soft-deletion
-- impossible.
-- ---------------------------------------------------------------------------
create unique index if not exists commitments_one_live_promise_idx
  on commitments (profile_id, target_cycle_id, lower(btrim(title)))
  where deleted_at is null and status not in ('superseded', 'dropped');

comment on index commitments_one_live_promise_idx is
  'A retry must not duplicate a week. Case-insensitive because titles come '
  'from a model and vary in capitalisation between runs.';
