-- ============================================================================
-- NEXUS 0018 — First run, for a person and for an organisation
--
-- Two small pieces of state that the product was reasoning about without
-- storing:
--
--   profiles.welcomed_at        has this person seen the introduction?
--   organizations.onboarding_complete   already existed, and was never written
--
-- WHY A COLUMN RATHER THAN A FLAG IN notification_prefs
--
-- The jsonb was the tempting no-migration answer, and it is the wrong one:
-- "has seen the welcome" is not a preference, it is a fact with a time. A
-- timestamp answers "when", which is the question support actually gets — "I
-- never saw any introduction" is answerable, and a boolean would not be.
--
-- WHY IT IS NULLABLE AND NOT DEFAULTED
--
-- Null means "has not seen it". Everybody who already exists is mid-flight in
-- an organisation that has been running for weeks, and showing them all a
-- "welcome to NEXUS" panel because a migration ran would be the worst possible
-- introduction. So existing profiles are marked as welcomed, and only genuinely
-- new people see it.
--
-- SAFE TO REPLAY. One nullable column, one backfill of existing rows to a value
-- that matches the state they are already in.
-- ============================================================================

alter table profiles
  add column welcomed_at timestamptz;

comment on column profiles.welcomed_at is
  'When this person finished the introduction. Null means they have not seen '
  'it. Replayable from Settings, which does not clear this.';

/*
 * Everybody who already exists has been using the product. Backfilled to
 * their join time rather than now(), so the column reads as history rather
 * than as "everyone was welcomed the day we deployed a migration".
 */
update profiles
   set welcomed_at = coalesce(joined_at, created_at)
 where welcomed_at is null;

-- ---------------------------------------------------------------------------
-- The organisation's own first run
-- ---------------------------------------------------------------------------

/*
 * `onboarding_complete` has existed since 0008 and nothing has ever written
 * it. It stays, and it is now the thing that decides whether the setup
 * checklist leads the Administration home or sits quietly below the fold.
 *
 * Seeded and pre-existing organisations are complete: they have units, people
 * and settled weeks, and a setup checklist at the top of a working
 * organisation is noise.
 */
update organizations o
   set onboarding_complete = true
 where onboarding_complete = false
   and exists (select 1 from departments d where d.org_id = o.id)
   and exists (
     select 1 from profiles p
     join reconciliations r on r.profile_id = p.id
     where p.org_id = o.id and r.status in ('confirmed', 'auto_confirmed')
   );
