/**
 * Prepare a plain Postgres instance to run NEXUS's RLS policies without
 * Supabase hosting the database.
 *
 * WHY THIS EXISTS
 *
 * Every RLS policy in migration 0006 is written in terms of `auth.uid()` —
 * on Supabase that function already exists, reading the identity a
 * Supabase-aware connection sets on the session. Off Supabase there is no such
 * function, so `current_profile_id()` and everything built on it would fail to
 * even create.
 *
 * This script creates the same minimal shim that `lib/db.ts` already builds
 * for local PGlite development — an `auth` schema and an `auth.uid()` function
 * that reads `request.jwt.claim.sub`, which is exactly what `asActor()` sets
 * per-transaction regardless of which Postgres is on the other end.
 *
 * Deliberately does NOT create `auth.users`. Migration 0006 only adds a
 * foreign key from `profiles.user_id` to `auth.users(id)` when that table
 * exists — and this database will never hold Supabase's real auth rows, so a
 * local stand-in table would make every real onboarding fail its foreign key.
 * Leaving `auth.users` absent makes migration 0006 treat this exactly like
 * "a plain Postgres instance for local testing", which is a path it is
 * already written to support.
 *
 * Run this ONCE, before `npm run db:migrate`, against a fresh database.
 *
 * Usage:  node scripts/setup-auth-shim.mjs [connection-url]   (defaults to DATABASE_URL)
 */
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No connection URL. Pass one, or set DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });

try {
  await sql`create extension if not exists pgcrypto`;
  await sql`create extension if not exists vector`;
  await sql`create schema if not exists auth`;
  await sql.unsafe(`
    create or replace function auth.uid()
    returns uuid language sql stable as $shim$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $shim$;
  `);

  console.log(
    "auth shim ready — extensions installed, auth.uid() created.\n" +
      "Next: npm run db:migrate",
  );
} finally {
  await sql.end();
}
