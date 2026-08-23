-- ============================================================================
-- NEXUS 0009 — Submission status, without exposing what anybody wrote
--
-- PRD F18 requires HR to see "who submitted, who was late, and who did not
-- submit". That collides head-on with the promise in 0002 and 0006 that raw
-- check-in text is readable only by its author.
--
-- The collision is real but not fundamental: HR needs the ENVELOPE, never the
-- LETTER. Whether a report arrived, and when, is compliance information. What
-- the person actually wrote at 11pm on a Friday is not, and the moment people
-- believe HR is reading it they start writing for an audience — at which point
-- the only real asset this system has is worthless.
--
-- Row Level Security cannot express that distinction, because it filters rows
-- and this is a column problem: a SELECT policy generous enough to reveal
-- responded_at also reveals raw_text sitting beside it.
--
-- So the envelope gets its own object. This view names a fixed list of
-- metadata columns and cannot be persuaded to return the body, and because it
-- is SECURITY DEFINER it carries its own visibility predicate — the underlying
-- table keeps its author-only policy completely untouched.
-- ============================================================================

create view submission_status
with (security_invoker = false)
as
select
  ci.org_id,
  ci.profile_id,
  ci.cycle_id,
  ci.channel,
  ci.status,
  ci.prompted_at,
  ci.responded_at,

  (ci.responded_at is not null) as submitted,

  -- The PRD deadline is 12:00 on the reporting day. Late submissions are
  -- accepted and flagged rather than blocked (F4), so this is a label on a
  -- record, never a gate on an action.
  case
    when ci.responded_at is null then null
    else ci.responded_at > (cy.ends_on::timestamptz + interval '12 hours')
  end as late,

  -- Length only. Enough to tell a real update from a full stop, and useless
  -- for reading over somebody's shoulder.
  coalesce(length(ci.raw_text), 0) as characters_written

from check_ins ci
join cycles cy on cy.id = ci.cycle_id
where ci.org_id = current_org_id()
  and (
    ci.profile_id = current_profile_id()          -- your own
    or can_see_org()                              -- HR, Chairman, admin
    or exists (                                   -- a lead, for their unit
      select 1 from profiles p
      where p.id = ci.profile_id
        and can_see_department(p.department_id)
    )
  );

comment on view submission_status is
  'Check-in metadata for compliance reporting. Deliberately excludes raw_text '
  'and transcript: HR sees whether a report arrived, never what it said.';

/*
 * Supabase ships the `authenticated` role; a bare Postgres does not. Guarding
 * the grant keeps this migration replayable against either, rather than
 * failing on a role that the platform is expected to provide.
 */
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on submission_status to authenticated;
  end if;
end;
$grant$;
