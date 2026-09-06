/**
 * Create the `authenticated` role and grant it access, on a Postgres that
 * isn't Supabase.
 *
 * WHY THIS EXISTS
 *
 * Every actor-scoped query in `lib/db.ts` runs `set local role authenticated`
 * so RLS actually applies — a superuser bypasses row level security entirely,
 * so running as one would make every policy in migration 0006 a no-op. On
 * Supabase that role already exists. Off Supabase it does not, and several
 * migrations only grant to it when it's already present (see 0009, 0015,
 * 0016, 0022) — guarded that way so they apply cleanly to a bare Postgres too.
 *
 * Mirrors `setupRoles()` in scripts/db-harness.mjs, which does the same thing
 * for the PGlite test database.
 *
 * MUST run AFTER `npm run db:migrate` — the grants are against tables and
 * functions that have to exist first, and re-running this after a later
 * migration adds new ones is safe and idempotent.
 *
 * Usage:  node scripts/grant-roles.mjs [connection-url]   (defaults to DATABASE_URL)
 */
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No connection URL. Pass one, or set DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });

try {
  await sql.unsafe(`
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end;
    $roles$;

    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `);

  console.log("authenticated role ready — granted on all current public tables and functions.");
} finally {
  await sql.end();
}
