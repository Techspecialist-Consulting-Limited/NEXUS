-- ============================================================================
-- NEXUS 0008 — Membership, onboarding and invitations
--
-- Turns the single seeded demo organisation into a real multi-tenant product:
-- an organisation is created, people join it by invitation or by signing up,
-- and everything they can see follows from the role they hold in it.
--
-- ONE RULE SHAPES THIS WHOLE FILE: A PERSON MAY NOT CHOOSE THEIR OWN AUTHORITY.
--
-- The obvious reading of "sign up and pick your role" is a self-service
-- dropdown containing "Executive". That is an org-wide data leak with a nice
-- UI on it — anyone with a matching email domain could read every unit's
-- numbers and every confirmed reconciliation in the company.
--
-- So role arrives one of exactly two ways:
--
--   1. An invitation, where somebody who already holds authority chose the
--      role before the invitee ever saw it.
--   2. Self-signup, which always lands on 'staff', and records what the person
--      *asked* for in requested_role for an admin to grant or refuse.
--
-- The single exception is the person who creates an organisation: they become
-- its admin, because an org with nobody able to administer it is unusable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership state
-- ---------------------------------------------------------------------------

create type membership_status as enum (
  'invited',    -- an invitation exists; nobody has signed in against it yet
  'pending',    -- signed up, waiting on an admin to place or approve them
  'active',     -- full member
  'suspended'   -- retained for history, but cannot sign in
);

create type join_method as enum ('founder', 'invitation', 'self_signup', 'seed');

alter table profiles
  add column status          membership_status not null default 'active',
  -- What they asked to be. Never what they are: an admin moves `role`.
  add column requested_role  org_role,
  add column joined_via      join_method not null default 'seed',
  add column invited_by      uuid references profiles(id) on delete set null,
  add column joined_at       timestamptz,
  -- Which external identity provider actually authenticated them, for support
  -- questions of the form "I can't sign in" — Entra and Google users need
  -- very different answers.
  add column auth_provider   text;

comment on column profiles.requested_role is
  'What the person asked for at signup. Advisory only — an admin sets role.';

create index profiles_status_idx on profiles (org_id, status);

-- Everything that already exists was seeded, and is active.
update profiles set status = 'active', joined_via = 'seed', joined_at = created_at;

-- ---------------------------------------------------------------------------
-- Organisations gain the fields a real tenant needs
-- ---------------------------------------------------------------------------

alter table organizations
  add column created_by      uuid references profiles(id) on delete set null,
  -- When set, anyone authenticating with a matching email domain may join
  -- without an invitation. Still lands on 'staff'.
  add column allowed_domains text[] not null default '{}',
  add column onboarding_complete boolean not null default true;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table invitations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,

  -- Stored lower-cased rather than as citext: the extension is not present
  -- in every Postgres build this runs on, and normalising on the way in is
  -- one constraint instead of a deployment dependency.
  email         text not null,
  role          org_role not null default 'staff',
  department_id uuid references departments(id) on delete set null,
  title         text,

  -- Random, single-use, and the only thing the acceptance link carries. The
  -- email address is NOT trusted from the URL: it is read from this row, so a
  -- tampered link cannot redirect an invitation to a different mailbox.
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),

  invited_by    uuid references profiles(id) on delete set null,
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_at   timestamptz,
  accepted_by   uuid references profiles(id) on delete set null,
  revoked_at    timestamptz,

  created_at    timestamptz not null default now(),

  -- One live invitation per address per org. Re-inviting replaces rather than
  -- accumulating, so a mailbox cannot collect several roles and pick the best.
  constraint invitation_email_lowercase check (email = lower(email))
);

create unique index invitations_live_idx
  on invitations (org_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_token_idx on invitations (token) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Creating an organisation
-- ---------------------------------------------------------------------------

/**
 * Stand up a new tenant and make its creator the admin.
 *
 * Runs as SECURITY DEFINER because at the moment of creation the caller has no
 * profile and therefore no RLS foothold anywhere — there is no row yet that
 * says who they are. Every argument is used as data; nothing is interpolated.
 */
create or replace function create_organization(
  p_user_id    uuid,
  p_org_name   text,
  p_full_name  text,
  p_email      text,
  p_timezone   text default 'Africa/Lagos',
  p_provider   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_slug    text;
  v_profile uuid;
  v_n       int := 0;
begin
  if p_user_id is null then
    raise exception 'create_organization requires an authenticated user';
  end if;

  if exists (select 1 from profiles where user_id = p_user_id) then
    raise exception 'this account already belongs to an organisation';
  end if;

  -- Slugify, then de-collide. Two companies called "Acme" are both entitled to
  -- exist.
  v_slug := regexp_replace(lower(trim(p_org_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'org'; end if;

  while exists (select 1 from organizations where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := regexp_replace(lower(trim(p_org_name)), '[^a-z0-9]+', '-', 'g') || '-' || v_n;
  end loop;

  insert into organizations (name, slug, timezone, onboarding_complete)
  values (trim(p_org_name), v_slug, coalesce(p_timezone, 'Africa/Lagos'), false)
  returning id into v_org;

  insert into profiles (org_id, user_id, full_name, email, role, status,
                        joined_via, joined_at, timezone, auth_provider)
  values (v_org, p_user_id, p_full_name, p_email, 'admin', 'active',
          'founder', now(), coalesce(p_timezone, 'Africa/Lagos'), p_provider)
  returning id into v_profile;

  update organizations set created_by = v_profile where id = v_org;

  -- A tenant with no reporting weeks has nothing to show, so give it a year of
  -- cycles up front rather than making the first check-in fail mysteriously.
  perform generate_cycles(v_org, 'week',
            (date_trunc('week', current_date) - interval '8 weeks')::date,
            (current_date + interval '8 weeks')::date);
  perform generate_cycles(v_org, 'month',
            (date_trunc('month', current_date) - interval '2 months')::date,
            (current_date + interval '2 months')::date);

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accepting an invitation
-- ---------------------------------------------------------------------------

/**
 * Redeem an invitation token and become a member.
 *
 * SECURITY DEFINER for the same reason as above: the caller has no profile
 * yet. The role comes from the invitation row, never from the caller — which
 * is the whole point of inviting rather than self-selecting.
 */
create or replace function accept_invitation(
  p_user_id   uuid,
  p_token     text,
  p_full_name text,
  p_email     text,
  p_provider  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     invitations%rowtype;
  v_profile uuid;
begin
  select * into v_inv
  from invitations
  where token = p_token
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'this invitation is not valid any more';
  end if;

  /*
   * The invitation is bound to the address it was sent to. Without this check
   * a forwarded link would let anybody claim a role that was chosen for
   * somebody else — which is exactly the escalation invitations exist to
   * prevent.
   */
  if lower(p_email) <> v_inv.email then
    raise exception 'this invitation was issued to a different email address';
  end if;

  if exists (select 1 from profiles where user_id = p_user_id) then
    raise exception 'this account already belongs to an organisation';
  end if;

  insert into profiles (org_id, department_id, user_id, full_name, email, title,
                        role, status, joined_via, invited_by, joined_at,
                        auth_provider)
  values (v_inv.org_id, v_inv.department_id, p_user_id, p_full_name, p_email,
          v_inv.title, v_inv.role, 'active', 'invitation', v_inv.invited_by,
          now(), p_provider)
  returning id into v_profile;

  update invitations
     set accepted_at = now(), accepted_by = v_profile
   where id = v_inv.id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Self-signup into an existing organisation
-- ---------------------------------------------------------------------------

/**
 * Join an organisation without an invitation.
 *
 * Only possible when the org has published a matching email domain, and the
 * result is always 'staff' + 'pending'. p_requested_role is recorded as a
 * request and has no effect on what the person can see: an admin promotes
 * them, or does not.
 */
create or replace function request_to_join(
  p_user_id        uuid,
  p_org_slug       text,
  p_full_name      text,
  p_email          text,
  p_department_id  uuid default null,
  p_requested_role org_role default 'staff',
  p_provider       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     organizations%rowtype;
  v_domain  text;
  v_profile uuid;
begin
  select * into v_org from organizations where slug = p_org_slug;
  if not found then
    raise exception 'no such organisation';
  end if;

  v_domain := lower(split_part(p_email, '@', 2));
  if not (v_domain = any (v_org.allowed_domains)) then
    raise exception 'joining % requires an invitation', v_org.name;
  end if;

  if exists (select 1 from profiles where user_id = p_user_id) then
    raise exception 'this account already belongs to an organisation';
  end if;

  -- A department the person picked must actually belong to this org.
  if p_department_id is not null
     and not exists (select 1 from departments
                     where id = p_department_id and org_id = v_org.id) then
    raise exception 'that department does not belong to %', v_org.name;
  end if;

  insert into profiles (org_id, department_id, user_id, full_name, email,
                        role, requested_role, status, joined_via, joined_at,
                        auth_provider)
  values (v_org.id, p_department_id, p_user_id, p_full_name, p_email,
          'staff', p_requested_role, 'pending', 'self_signup', now(), p_provider)
  returning id into v_profile;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table invitations enable row level security;

/*
 * Who may hand out authority: the Administrator, and nobody else.
 *
 * Not the Chairman. PRD F17 is explicit that his signed-in view "is read-only
 * and carries no administrative capability" — he consumes the organisation's
 * reporting, he does not decide who may read it. A lead runs their unit and
 * cannot mint another lead.
 *
 * The founder of an organisation is made an admin precisely so this role is
 * never vacant.
 */
create policy invitations_manage on invitations
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- HR sees who is in the organisation and whether they reported. The PRD makes
-- HR the enforcement partner, and enforcement needs the roster.
create policy invitations_hr_read on invitations
  for select using (org_id = current_org_id() and current_org_role() = 'hr');

/*
 * HR's visibility deliberately mirrors the executive's, with one exception
 * that is not negotiable: raw check-in text stays unreadable to them, exactly
 * as it does for everyone but its author (see 0006). HR needs to know WHETHER
 * somebody reported, never the unedited words they used.
 */
create or replace function can_see_org()
returns boolean
language sql
stable
as $$
  select current_org_role() in ('executive', 'admin', 'hr');
$$;

-- A pending member can read their own row so the app can show them "waiting
-- for approval" rather than an error.
create policy profiles_self_pending on profiles
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Guard: nobody promotes themselves
-- ---------------------------------------------------------------------------

/**
 * Role changes are an admin action, always.
 *
 * RLS decides which ROWS you may touch; it does not stop you writing a
 * different value into a column of a row you legitimately own. Without this
 * trigger, `update profiles set role = 'executive' where id = <me>` is a
 * perfectly ordinary self-update — the profile is yours — and the whole
 * invitation model is decoration.
 */
create or replace function guard_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role org_role;
  v_actor      uuid;
begin
  if new.role is not distinct from old.role
     and new.status is not distinct from old.status
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  v_actor := current_profile_id();
  select role into v_actor_role from profiles where id = v_actor;

  -- The service role has no profile and runs jobs; it is trusted by design.
  if v_actor is null then
    return new;
  end if;

  if v_actor_role <> 'admin' then
    raise exception 'only an admin may change a role or membership status';
  end if;

  if new.org_id is distinct from old.org_id then
    raise exception 'a profile cannot be moved between organisations';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_role
  before update on profiles
  for each row execute function guard_role_changes();
