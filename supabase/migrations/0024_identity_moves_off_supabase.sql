-- ============================================================================
-- NEXUS 0024 — identity moves off Supabase
--
-- Supabase Auth is gone. Signing in — email + password, and Microsoft Entra
-- ID — is now Auth.js (NextAuth v5) running against this same database, via
-- its official Postgres adapter. That adapter expects a fixed, documented
-- shape (see node_modules/@auth/pg-adapter): `users`, `accounts`, `sessions`,
-- `verification_token`, with exact column names and casing. Nothing here is
-- invented — it is copied from the adapter's own queries so the two can never
-- disagree about what the schema is.
--
-- `password_hash` is the one column the adapter does not know about, added
-- for the Credentials provider. Null for an account that only ever signs in
-- with Microsoft.
--
-- profiles.user_id already existed, nullable, with no permanent assumption
-- about what it pointed to — migration 0006 only added a foreign key to
-- `auth.users(id)` when that schema happened to be present (a real Supabase
-- project). It never was on this database, so no such constraint exists here
-- to conflict with the one this migration adds.
-- ============================================================================

create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  email          text unique,
  "emailVerified" timestamptz,
  image          text,
  -- Credentials provider only. Null for a Microsoft-only sign-in.
  password_hash  text,
  created_at     timestamptz not null default now()
);

create table if not exists accounts (
  id                  uuid primary key default gen_random_uuid(),
  "userId"            uuid not null references users(id) on delete cascade,
  type                text not null,
  provider            text not null,
  "providerAccountId" text not null,
  refresh_token       text,
  access_token        text,
  expires_at          bigint,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  unique (provider, "providerAccountId")
);

create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  "sessionToken" text not null unique,
  "userId"       uuid not null references users(id) on delete cascade,
  expires        timestamptz not null
);

create table if not exists verification_token (
  identifier text not null,
  token      text not null,
  expires    timestamptz not null,
  primary key (identifier, token)
);

-- Guarded rather than a bare ADD CONSTRAINT: a database that once ran against
-- a real Supabase project may already carry `profiles_user_fk` pointing at
-- `auth.users`, and re-adding it under the same name would fail. Everywhere
-- this migration actually matters — local, and every plain Postgres this
-- project now runs on — no such constraint exists yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_user_fk'
  ) then
    alter table profiles
      add constraint profiles_user_fk
      foreign key (user_id) references users(id) on delete set null;
  end if;
end;
$$;

/*
 * NO GRANT TO `authenticated` HERE, ON PURPOSE.
 *
 * These four tables are Auth.js's own bookkeeping, read and written through
 * its adapter over a separate, fully-privileged connection (see auth.ts) —
 * the same way `asService()` bypasses RLS for background jobs. Identity is
 * resolved BEFORE any request has a profile to run `asActor()` as, so nothing
 * under RLS ever needs to see these rows directly.
 */
