/**
 * In-process Postgres for testing the NEXUS migrations.
 *
 * Docker is not installed on this machine, so `supabase start` is unavailable.
 * PGlite is real PostgreSQL compiled to WASM — same parser, same plpgsql, same
 * pgvector — which means the migrations, the scoring functions and the RLS
 * policies are genuinely executed rather than eyeballed.
 *
 * Two shims stand in for Supabase:
 *
 *   auth.uid()   backed by a session GUC so tests can "log in as" a profile
 *                and assert that RLS actually blocks what it claims to block.
 *   auth.users   a minimal table, so the profiles FK in 0006 is exercised
 *                rather than skipped.
 */

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, "..", "supabase", "migrations");

const AUTH_SHIM = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text
  );

  -- Supabase resolves the caller from the request JWT. Here it comes from a
  -- session setting, so a test can impersonate a profile and verify that the
  -- policies hold from that seat.
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $shim$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $shim$;
`;

export async function listMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Boot a fresh database with every migration applied, in order.
 * Throws with the offending filename attached, so a failure names its file.
 */
export async function createTestDb({ log = false } = {}) {
  const db = await PGlite.create({ extensions: { vector, pgcrypto } });

  await db.exec("create extension if not exists pgcrypto;");
  await db.exec("create extension if not exists vector;");
  await db.exec(AUTH_SHIM);

  for (const file of await listMigrations()) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      if (log) console.log(`  ok  ${file}`);
    } catch (err) {
      /*
       * Report only the useful part. A PGlite error drags the entire bundled
       * module along in its stack, which buries the one line that says what is
       * actually wrong under a screenful of minified JavaScript — and that line
       * is the whole reason anyone runs this.
       */
      const detail = [
        `migration ${file} failed`,
        `  ${err.message}`,
        err.hint ? `  hint: ${err.hint}` : null,
        err.position ? `  at character ${err.position}` : null,
      ]
        .filter(Boolean)
        .join(String.fromCharCode(10));
      const clean = new Error(detail);
      clean.stack = detail;
      throw clean;
    }
  }

  await setupRoles(db);
  return db;
}

/** Boot a database with migrations AND the generated demo seed applied. */
export async function createSeededDb(opts = {}) {
  const db = await createTestDb(opts);
  const seedPath = join(HERE, "..", "supabase", "seed", "seed.sql");
  const seed = await readFile(seedPath, "utf8");
  await db.exec(seed);
  await setupRoles(db); // re-grant: the seed creates no tables, but be safe
  return db;
}

/** Resolve a seeded person to their profile id, and give them a login. */
export async function loginAs(db, email) {
  await actAsService(db);
  const { rows } = await db.query(
    "select id, user_id from profiles where email = $1",
    [email],
  );
  if (!rows.length) throw new Error(`no seeded profile for ${email}`);

  let userId = rows[0].user_id;
  if (!userId) {
    const created = await db.query(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    userId = created.rows[0].id;
    await db.query("update profiles set user_id = $1 where id = $2", [
      userId,
      rows[0].id,
    ]);
  }

  await actAs(db, userId);
  return { profileId: rows[0].id, userId };
}

/**
 * Create the unprivileged role that RLS is actually tested through.
 *
 * PGlite connects as a superuser, and superusers BYPASS row level security
 * entirely — so a "RLS test" run as the default user passes no matter how
 * broken the policies are. Everything that asserts on visibility must run
 * as this role, which mirrors Supabase's `authenticated`.
 */
export async function setupRoles(db) {
  await db.exec(`
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
}

/**
 * Run subsequent statements as the given profile's linked auth user, under the
 * unprivileged role. Pass null for an anonymous caller.
 */
export async function actAs(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    userId ?? "",
  ]);
  await db.exec("set role authenticated;");
}

/** Drop back to the service role: full access, RLS bypassed. Like a job runner. */
export async function actAsService(db) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}
