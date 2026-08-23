-- ============================================================================
-- NEXUS 0006 — Row Level Security
--
-- The trust model from the product brief is enforced HERE, in the database,
-- not in the UI. Two policies in this file are the ones that matter:
--
--   1. reconciliations are invisible to leads and executives until the
--      employee has confirmed them (or the correction window has elapsed).
--      "The employee sees it first" is not a routing convention that a future
--      dashboard query can casually bypass — it is a row filter.
--
--   2. raw check-in text is readable ONLY by its author. Leads and executives
--      see structured commitments and confirmed reconciliations; they never
--      read the unedited things a person typed at 11pm on a Friday. If we
--      cannot promise that, people write for the audience instead of writing
--      the truth, and the input data — the only real asset this system has —
--      quietly becomes worthless.
--
-- Background jobs run with the Supabase service role, which bypasses RLS.
-- ============================================================================

-- Link profiles to Supabase Auth, if the auth schema is present. Guarded so
-- these migrations still apply to a plain Postgres instance for local testing.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    alter table profiles
      add constraint profiles_user_fk
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity helpers.
--
-- SECURITY DEFINER and non-recursive on purpose: a policy on `profiles` that
-- reads `profiles` through a normal query deadlocks itself. These bypass RLS
-- to answer one narrow question — who is the caller — and are marked stable so
-- the planner calls them once per statement rather than once per row.
-- ---------------------------------------------------------------------------

create or replace function current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function current_org_role()
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function current_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function can_see_org()
returns boolean
language sql
stable
as $$
  select current_org_role() in ('executive', 'admin');
$$;

-- A lead sees their own department and anything beneath it in the hierarchy.
create or replace function can_see_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    can_see_org()
    or (
      current_org_role() = 'lead'
      and p_department_id is not null
      and exists (
        with recursive subtree as (
          select id from departments where id = current_department_id()
          union all
          select d.id from departments d join subtree s on d.parent_id = s.id
        )
        select 1 from subtree where id = p_department_id
      )
    );
$$;

-- Can the caller see this person's work at all?
create or replace function can_see_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = current_profile_id()
    or can_see_org()
    or exists (
      select 1 from profiles p
      where p.id = p_profile_id
        and can_see_department(p.department_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Any table added later without a policy is invisible
-- rather than public, which is the failure direction we want.
-- ---------------------------------------------------------------------------

alter table organizations     enable row level security;
alter table departments       enable row level security;
alter table profiles          enable row level security;
alter table cycles            enable row level security;
alter table check_ins         enable row level security;
alter table commitments       enable row level security;
alter table commitment_events enable row level security;
alter table evidence          enable row level security;
alter table reconciliations   enable row level security;
alter table advice            enable row level security;
alter table digests           enable row level security;
alter table notifications     enable row level security;
alter table memory_entries    enable row level security;
alter table calibration       enable row level security;
alter table ai_runs           enable row level security;

-- ---------------------------------------------------------------------------
-- Org structure — readable by everyone in the org. An org chart is not a
-- secret, and hiding it just makes the product feel hostile.
-- ---------------------------------------------------------------------------

create policy org_read on organizations
  for select using (id = current_org_id());

create policy org_admin_write on organizations
  for update using (id = current_org_id() and current_org_role() = 'admin');

create policy departments_read on departments
  for select using (org_id = current_org_id());

create policy departments_write on departments
  for all using (org_id = current_org_id() and current_org_role() in ('admin', 'executive'))
  with check (org_id = current_org_id() and current_org_role() in ('admin', 'executive'));

create policy profiles_read on profiles
  for select using (org_id = current_org_id());

create policy profiles_update_self on profiles
  for update using (id = current_profile_id())
  with check (id = current_profile_id());

create policy profiles_admin_write on profiles
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

create policy cycles_read on cycles
  for select using (org_id = current_org_id());

-- ---------------------------------------------------------------------------
-- check_ins — AUTHOR ONLY. See the header note; this one is load-bearing.
-- ---------------------------------------------------------------------------

create policy check_ins_own on check_ins
  for all using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

-- ---------------------------------------------------------------------------
-- commitments — own, plus department for leads, plus org for executives.
-- The *plan* is shared; the raw words behind it are not.
-- ---------------------------------------------------------------------------

create policy commitments_read on commitments
  for select using (deleted_at is null and can_see_profile(profile_id));

create policy commitments_write_own on commitments
  for all using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

create policy commitment_events_read on commitment_events
  for select using (
    exists (select 1 from commitments c
            where c.id = commitment_id and can_see_profile(c.profile_id))
  );

create policy evidence_read on evidence
  for select using (
    exists (select 1 from commitments c
            where c.id = commitment_id and can_see_profile(c.profile_id))
  );

-- ---------------------------------------------------------------------------
-- reconciliations — THE EMPLOYEE SEES IT FIRST.
--
-- Upward visibility is gated on the employee having confirmed, or the review
-- window having elapsed. Enforced as a row filter so no future query, report
-- or careless join can route around it.
-- ---------------------------------------------------------------------------

create policy reconciliations_own on reconciliations
  for select using (profile_id = current_profile_id());

create policy reconciliations_own_annotate on reconciliations
  for update using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

create policy reconciliations_upward on reconciliations
  for select using (
    profile_id <> current_profile_id()
    and status in ('confirmed', 'auto_confirmed')
    and can_see_profile(profile_id)
  );

-- ---------------------------------------------------------------------------
-- advice & notifications — addressed to one person, visible to that person.
-- Advice about someone is legible to its recipient (that is the point of a
-- leadership recommendation), but never to third parties.
-- ---------------------------------------------------------------------------

create policy advice_recipient on advice
  for select using (recipient_profile_id = current_profile_id());

create policy advice_feedback on advice
  for update using (recipient_profile_id = current_profile_id())
  with check (recipient_profile_id = current_profile_id());

create policy notifications_own on notifications
  for select using (profile_id = current_profile_id());

create policy notifications_own_update on notifications
  for update using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

-- ---------------------------------------------------------------------------
-- digests — executive digests to executives; department digests to that
-- department's leadership.
-- ---------------------------------------------------------------------------

create policy digests_read on digests
  for select using (
    org_id = current_org_id()
    and (
      (scope = 'executive'  and can_see_org())
      or (scope = 'department' and can_see_department(scope_id))
      or (scope = 'individual' and scope_id = current_profile_id())
    )
  );

-- ---------------------------------------------------------------------------
-- calibration — your own numbers are yours. A lead may see a member of their
-- team's calibration because coaching is their job; nobody else may.
-- ---------------------------------------------------------------------------

create policy calibration_read on calibration
  for select using (can_see_profile(profile_id));

create policy memory_read on memory_entries
  for select using (
    org_id = current_org_id()
    and (
      (scope = 'profile'    and can_see_profile(scope_id))
      or (scope = 'department' and can_see_department(scope_id))
      or (scope = 'org'        and can_see_org())
    )
  );

-- Spend is an admin/executive concern.
create policy ai_runs_read on ai_runs
  for select using (org_id = current_org_id() and can_see_org());
