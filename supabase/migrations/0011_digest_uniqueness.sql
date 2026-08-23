-- ============================================================================
-- NEXUS 0011 — Make digest uniqueness actually unique
--
-- 0005 declared:
--
--   unique (org_id, scope, scope_id, period, cycle_id)
--
-- and that constraint does not do what it appears to do. In SQL, NULL is not
-- equal to NULL, so a unique index treats every row with a NULL column as
-- distinct from every other. Executive digests always carry scope_id = NULL —
-- they are scoped to the organisation, not to a person or a unit — so the
-- constraint never applied to precisely the digests that matter most.
--
-- The consequence is not theoretical. `generateDigest` upserts with
-- ON CONFLICT on that key. With the conflict never firing, a second run
-- inserts a second row, and both are picked up as unsent — so a scheduler
-- retry, an overlapping deploy, or somebody pressing the manual trigger twice
-- sends the Chairman the same briefing twice. PRD F15 makes automatic delivery
-- the requirement this system is judged on; delivering it twice is its own
-- kind of failure, and the sort that erodes trust in the whole rhythm.
--
-- Postgres 15 introduced NULLS NOT DISTINCT, which makes the index treat NULLs
-- as equal — which is what was meant all along. Supabase runs 17 and the test
-- harness runs the same major version, so this is available on both.
-- ============================================================================

-- Remove any duplicates the old constraint permitted, keeping the newest of
-- each group. Ordered by sent_at first so a briefing that actually reached
-- somebody is never the one discarded.
delete from digests d
using digests keep
where d.org_id   is not distinct from keep.org_id
  and d.scope    is not distinct from keep.scope
  and d.scope_id is not distinct from keep.scope_id
  and d.period   is not distinct from keep.period
  and d.cycle_id is not distinct from keep.cycle_id
  and d.id <> keep.id
  and (keep.sent_at is not null, keep.created_at, keep.id)
    > (d.sent_at is not null, d.created_at, d.id);

alter table digests
  drop constraint if exists digests_org_id_scope_scope_id_period_cycle_id_key;

alter table digests
  add constraint digests_scope_period_cycle_key
  unique nulls not distinct (org_id, scope, scope_id, period, cycle_id);

comment on constraint digests_scope_period_cycle_key on digests is
  'NULLS NOT DISTINCT is load-bearing: executive digests have scope_id NULL, '
  'and a plain unique constraint would treat every one of them as distinct — '
  'letting a scheduler retry send the Chairman the same briefing twice.';
