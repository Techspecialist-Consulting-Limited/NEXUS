-- ============================================================================
-- NEXUS 0001 — Core org structure
--
-- Design notes that matter downstream:
--
--  * profiles.id is its own uuid, NOT auth.users.id. The link to Supabase Auth
--    is profiles.user_id (nullable). This lets the seed script create a whole
--    organisation with 8 weeks of history without minting auth users, and lets
--    a person exist in the org chart before they ever log in.
--
--  * cycles are precomputed rows, not computed date ranges. Every weekly and
--    monthly rollup joins to a cycle id. "Week 34" must mean exactly one thing
--    org-wide regardless of the reader's timezone, and ad-hoc date_trunc() in
--    query after query is how that guarantee gets quietly broken.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- shared helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------

create type org_role as enum ('staff', 'lead', 'executive', 'admin');
create type cycle_kind as enum ('week', 'month', 'quarter');

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  timezone      text not null default 'Africa/Lagos',

  -- Tunables the product reads at runtime rather than hardcoding, so an admin
  -- can dial the system's chattiness without a deploy.
  settings      jsonb not null default jsonb_build_object(
                  'week_starts_on',            1,      -- ISO: Monday
                  'checkin_prompt_day',        5,      -- Friday
                  'checkin_prompt_hour',       15,
                  'review_window_hours',       24,     -- employee correction window
                  'exec_digest_day',           7,      -- Sunday
                  'exec_digest_hour',          18,
                  'max_nudges_per_day',        2,
                  'calibration_min_weeks',     6
                ),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------

create table departments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  parent_id     uuid references departments(id) on delete set null,

  name          text not null,
  slug          text not null,
  description   text,

  -- Identity colour, used for the constellation nodes and every chart series
  -- that groups by department. Stored so charts stay consistent across views.
  color         text not null default '#7C8CF8',

  lead_id       uuid,  -- FK added in 0002 once profiles exists (circular ref)

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, slug)
);

create index departments_org_idx on departments (org_id);
create index departments_parent_idx on departments (parent_id) where parent_id is not null;

create trigger departments_updated_at
  before update on departments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  department_id   uuid references departments(id) on delete set null,

  -- Nullable on purpose: seeded/imported people exist before first login.
  user_id         uuid unique,

  full_name       text not null,
  email           text not null,
  title           text,
  avatar_url      text,

  role            org_role not null default 'staff',
  timezone        text not null default 'Africa/Lagos',
  is_active       boolean not null default true,

  -- Quiet hours in the profile's own local time. The notification budget in
  -- 0005 refuses to deliver inside this window; nothing is lost, it is held.
  quiet_hours_start smallint not null default 20 check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint not null default 8  check (quiet_hours_end between 0 and 23),

  notification_prefs jsonb not null default jsonb_build_object(
                       'nudges',        true,
                       'weekly_digest', true,
                       'email',         true,
                       'in_app',        true
                     ),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_org_idx on profiles (org_id);
create index profiles_department_idx on profiles (department_id);
create index profiles_user_idx on profiles (user_id) where user_id is not null;
create unique index profiles_org_email_idx on profiles (org_id, lower(email));

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table departments
  add constraint departments_lead_fk
  foreign key (lead_id) references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- cycles
-- ---------------------------------------------------------------------------

create table cycles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,

  kind          cycle_kind not null,
  starts_on     date not null,
  ends_on       date not null,

  -- Human label ("W34 · 18–24 Aug") is precomputed so the UI, the digest email
  -- and the AI prompt all name the same period identically.
  label         text not null,
  iso_year      smallint not null,
  seq           smallint not null,   -- ISO week number, month number, or quarter number

  created_at    timestamptz not null default now(),

  unique (org_id, kind, starts_on),
  check (ends_on >= starts_on)
);

create index cycles_org_kind_starts_idx on cycles (org_id, kind, starts_on desc);

-- ---------------------------------------------------------------------------
-- generate_cycles(org, kind, from, to)
--
-- Idempotent. Called by the seed and by the weekly cron tick so the calendar
-- always runs at least one cycle ahead of "now" — a commitment made on Friday
-- targets a week that must already exist.
-- ---------------------------------------------------------------------------

create or replace function generate_cycles(
  p_org_id uuid,
  p_kind   cycle_kind,
  p_from   date,
  p_to     date
)
returns integer
language plpgsql
as $$
declare
  v_cursor  date;
  v_start   date;
  v_end     date;
  v_label   text;
  v_seq     smallint;
  v_year    smallint;
  v_count   integer := 0;
begin
  v_cursor := case p_kind
                when 'week'    then date_trunc('week',    p_from)::date
                when 'month'   then date_trunc('month',   p_from)::date
                when 'quarter' then date_trunc('quarter', p_from)::date
              end;

  while v_cursor <= p_to loop
    if p_kind = 'week' then
      v_start := v_cursor;
      v_end   := v_cursor + 6;
      v_seq   := extract(week from v_cursor)::smallint;
      v_year  := extract(isoyear from v_cursor)::smallint;
      v_label := format('W%s · %s–%s',
                        v_seq,
                        to_char(v_start, 'DD Mon'),
                        to_char(v_end,   'DD Mon'));
      v_cursor := v_cursor + 7;

    elsif p_kind = 'month' then
      v_start := v_cursor;
      v_end   := (v_cursor + interval '1 month' - interval '1 day')::date;
      v_seq   := extract(month from v_cursor)::smallint;
      v_year  := extract(year from v_cursor)::smallint;
      v_label := to_char(v_start, 'Mon YYYY');
      v_cursor := (v_cursor + interval '1 month')::date;

    else
      v_start := v_cursor;
      v_end   := (v_cursor + interval '3 months' - interval '1 day')::date;
      v_seq   := extract(quarter from v_cursor)::smallint;
      v_year  := extract(year from v_cursor)::smallint;
      v_label := format('Q%s %s', v_seq, v_year);
      v_cursor := (v_cursor + interval '3 months')::date;
    end if;

    insert into cycles (org_id, kind, starts_on, ends_on, label, iso_year, seq)
    values (p_org_id, p_kind, v_start, v_end, v_label, v_year, v_seq)
    on conflict (org_id, kind, starts_on) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
