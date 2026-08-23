-- ============================================================================
-- NEXUS 0016 — Administrative audit log
--
-- Who changed what, and when. Four columns of substance and nothing else:
-- actor, action, target, time.
--
-- WHY IT IS NOT A GENERIC EVENT TABLE
--
-- The temptation is a table that can record anything, with a payload column
-- and a taxonomy nobody maintains. What an audit log is actually for is
-- answering "who gave that person access?" and "when did the reporting
-- deadline change?", months later, to somebody who was not there. That needs a
-- sentence a human can read, and the ids to check it against — not a JSON blob
-- whose shape drifted three releases ago.
--
-- So each row carries a rendered summary AND the ids it was rendered from. The
-- summary is what the page shows; the ids are what a support question is
-- answered with.
--
-- WHY THE ACTOR IS DENORMALISED
--
-- `actor_name` is copied at write time. A profile can be deleted, renamed, or
-- moved, and an audit line reading "(deleted user) granted Ibrahim Department
-- Lead" has lost the only fact that made it worth keeping. The FK stays for
-- the cases where the row is still there.
--
-- READ-ONLY BY CONSTRUCTION
--
-- There is a policy for select and a policy for insert, and none for update or
-- delete. RLS denies what it does not permit, so an audit row cannot be edited
-- or removed through the application at all — not by an administrator, not by
-- the person the row is about. Only the service role, which bypasses RLS, can
-- touch history, and nothing in the product asks it to.
-- ============================================================================

create table audit_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,

  -- Who did it. Nullable because the service role has no profile: a row
  -- written by a scheduled job legitimately has no human behind it.
  actor_id     uuid references profiles(id) on delete set null,
  actor_name   text not null,

  -- A stable machine key, e.g. 'member.role_changed'. Used for filtering, and
  -- kept short enough to read in a query.
  action       text not null,

  -- What it happened to, when there is one thing. Free text rather than a
  -- polymorphic FK: the target may be a person, a unit, an invitation or the
  -- organisation itself, and four nullable FKs is four ways to be wrong.
  target_kind  text,
  target_id    uuid,
  target_name  text,

  -- The line the page renders. Written at insert time, in the past tense, as
  -- a whole sentence.
  summary      text not null,

  created_at   timestamptz not null default now(),

  constraint audit_action_shape check (action ~ '^[a-z_]+\.[a-z_]+$')
);

create index audit_events_org_time_idx on audit_events (org_id, created_at desc);
create index audit_events_target_idx on audit_events (target_id) where target_id is not null;

comment on table audit_events is
  'Administrative history. Append-only: there is no update or delete policy, '
  'so RLS refuses both.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table audit_events enable row level security;

/*
 * Read: the Administrator, and nobody else.
 *
 * Not HR, not the Chairman. An audit log is a record of who holds authority
 * and how they used it, and the only person whose job needs that is the person
 * administering the organisation. PRD F17 keeps the Chairman's view read-only
 * and free of administrative capability; showing him who granted whom what
 * would make him a participant in decisions the product says he does not make.
 */
create policy audit_read on audit_events
  for select using (org_id = current_org_id() and current_org_role() = 'admin');

/*
 * Write: an administrator, about their own organisation, naming themselves.
 *
 * `actor_id = current_profile_id()` is the load-bearing clause. Without it an
 * administrator could write history attributing an action to somebody else,
 * which is worse than having no log at all — a forgeable record is one people
 * trust and should not.
 */
create policy audit_write on audit_events
  for insert with check (
    org_id = current_org_id()
    and current_org_role() = 'admin'
    and actor_id = current_profile_id()
  );

-- Deliberately no update or delete policy. RLS denies what it does not permit.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

/*
 * A policy decides which ROWS you may touch. A grant decides whether you may
 * touch the table at all, and a new table has neither until it is given one —
 * so without this, `audit_events` fails with "permission denied for table"
 * before RLS is ever consulted, and the carefully written policies above never
 * run.
 *
 * The local demo database happens to survive without it, because its bootstrap
 * grants on ALL tables after every migration has run. A real Postgres does
 * not, which is exactly the kind of difference that only shows up in
 * production. Guarded on the role existing, so this still replays against a
 * bare Postgres that has no Supabase roles. Same shape as 0009.
 */
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on audit_events to authenticated;
  end if;
end;
$grant$;
