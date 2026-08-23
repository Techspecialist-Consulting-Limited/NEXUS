-- ============================================================================
-- NEXUS 0010 — A pending member has no organisational context
--
-- Found by running the membership rules against the real database: somebody
-- who had signed up and NOT been approved could read the whole roster — every
-- colleague's name, email, title and role.
--
-- The cause is a half-finished change. 0008 taught current_org_role() to
-- require an active membership, because a pending person must not inherit an
-- elevated role. It left current_org_id() alone, and that is the one every
-- other policy leans on:
--
--   create policy profiles_read on profiles
--     for select using (org_id = current_org_id());
--
-- A pending profile has an org_id like anybody else, so that predicate was
-- true for them and the roster opened up.
--
-- The fix is to make "pending" mean what it says: until an administrator
-- confirms you, you have no context at all. Every identity helper now resolves
-- to NULL, which makes every org-scoped policy fall false rather than each
-- policy having to remember to check status for itself.
--
-- What still works: profiles_self_pending matches on user_id = auth.uid()
-- rather than on org context, so a pending person can still read their own row
-- and see the "waiting for approval" screen. The app's own membership lookup
-- runs as the service role, so /pending is unaffected.
-- ============================================================================

create or replace function current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function current_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from profiles
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

/*
 * A suspended member is covered by the same change, and deliberately so: the
 * profile is retained for history, but it stops being a way in the moment it
 * is suspended rather than at the next deploy.
 */
