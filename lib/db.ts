/* eslint-disable @typescript-eslint/no-explicit-any --
 * postgres.js ships no useful types for a dynamically-built tagged-template
 * client, and PGlite's row type is generic. The `any` here is confined to this
 * module's driver seam; everything above it is typed through Sql<T>.
 */
// Server-only. This module holds the database connection and the actor lock;
// bundling it into a client component would ship credentials to the browser.
if (typeof window !== "undefined") {
  throw new Error("lib/db.ts is server-only and must never be imported by a client component.");
}

/**
 * One SQL interface, two drivers.
 *
 *   local   PGlite (Postgres compiled to WASM) with an on-disk data directory.
 *           Boots itself: migrations, then the demo seed, then a login for
 *           every seeded person. `npm run dev` therefore works on a clean
 *           machine with no Supabase project, no Docker and no credentials —
 *           which is the difference between a design being reviewable today
 *           and being reviewable after an afternoon of account setup.
 *
 *   remote  postgres.js against Supabase's connection string.
 *
 * Both expose the same tagged-template `sql` and, importantly, both run
 * queries through `asActor()` under the unprivileged `authenticated` role, so
 * the RLS policies in migration 0006 are live in local development. The demo
 * does not merely describe the trust model — an executive clicking around it
 * genuinely cannot see a reconciliation the employee has not confirmed.
 */

export type Row = Record<string, any>;

export type Sql = <T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

/*
 * Which database.
 *
 * NEXUS_FORCE_LOCAL_DB exists for the visual sweep, which verifies the
 * interface against eight weeks of seeded demo data. Once DATABASE_URL points
 * at a real Supabase project that data is not there — the sweep finds no
 * organisation, no personas and no identity, and every route redirects to
 * /login. Rather than unset DATABASE_URL and lose to Next's .env.local
 * precedence, the intent is stated directly.
 *
 * Server-only and read at runtime, so it can never reach a browser or a build
 * artefact.
 */
const MODE: "local" | "remote" =
  process.env.NEXUS_FORCE_LOCAL_DB === "1"
    ? "local"
    : process.env.DATABASE_URL
      ? "remote"
      : "local";

export const dbMode = MODE;

// ---------------------------------------------------------------------------
// Local driver
// ---------------------------------------------------------------------------

type LocalHandle = {
  query: (text: string, params: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (text: string) => Promise<unknown>;
};

// Cached on globalThis so Next's dev-server hot reloads reuse one instance
// rather than racing several WASM Postgres processes over the same directory.
const g = globalThis as unknown as {
  __nexusDb?: Promise<LocalHandle>;
  __nexusLock?: Promise<unknown>;
};

async function bootLocal(): Promise<LocalHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { readFile, readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const dataDir = join(process.cwd(), ".pglite");
  const db = await PGlite.create(dataDir, {
    extensions: { vector, pgcrypto },
  });

  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const migrations = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const [{ ready }] = (
    await db.query<{ ready: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'reconciliations'
       ) as ready`,
    )
  ).rows;

  /*
   * Does this database have every migration in it?
   *
   * The local demo database used to be built once and never touched again, so
   * every migration added afterwards left it a version behind — and the
   * symptom was a 500 reading `column d.archived_at does not exist` on a page
   * that worked perfectly in a fresh checkout. Nothing warned; the schema was
   * simply old.
   *
   * A demo fixture is regenerable by definition — the seed script creates the
   * whole thing — so drift is answered by rebuilding rather than by trying to
   * apply the difference. Applying only the missing files sounds tidier and is
   * not: a migration that ran against a schema its author never saw is exactly
   * how a local database ends up in a state no deployment will ever be in.
   *
   * THIS PATH IS LOCAL-ONLY. bootLocal is reached when there is no Supabase
   * configuration; the remote driver never comes near it, and nothing here can
   * drop a production schema.
   */
  let current: string[] = [];
  if (ready) {
    try {
      current = (
        await db.query<{ name: string }>(
          `select name from _nexus_local_migrations order by name`,
        )
      ).rows.map((r) => r.name);
    } catch {
      // No ledger: this database predates migration tracking entirely.
      current = [];
    }
  }

  const stale =
    ready && migrations.some((m) => !current.includes(m));

  if (stale) {
    console.log(
      `[nexus] local demo database is ${migrations.length - current.length} migration(s) behind — rebuilding…`,
    );
    await db.exec(`
      drop schema public cascade;
      create schema public;
      drop schema if exists auth cascade;
    `);
  }

  if (!ready || stale) {
    if (!stale) console.log("[nexus] first run — building the local demo database…");

    await db.exec(`
      create extension if not exists pgcrypto;
      create extension if not exists vector;
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key default gen_random_uuid(),
        email text
      );
      create or replace function auth.uid()
      returns uuid language sql stable as $shim$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $shim$;
    `);

    for (const file of migrations) {
      await db.exec(await readFile(join(migrationsDir, file), "utf8"));
    }

    /*
     * The ledger. Written after the migrations rather than alongside them, so
     * a half-applied rebuild is recorded as nothing applied and rebuilds again
     * next boot rather than claiming to be current.
     */
    await db.exec(`
      create table if not exists _nexus_local_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    for (const file of migrations) {
      await db.query(
        `insert into _nexus_local_migrations (name) values ($1)
         on conflict (name) do nothing`,
        [file],
      );
    }

    await db.exec(
      await readFile(join(process.cwd(), "supabase", "seed", "seed.sql"), "utf8"),
    );

    // Give every seeded person a login, so the persona switcher can put you in
    // any seat and the policies apply from that seat for real.
    await db.exec(`
      insert into auth.users (email)
      select email from profiles where user_id is null;

      update profiles p
      set user_id = u.id
      from auth.users u
      where u.email = p.email and p.user_id is null;

      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
      end;
      $roles$;

      grant usage on schema public, auth to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant execute on all functions in schema public to authenticated;
      grant execute on all functions in schema auth to authenticated;
    `);

    console.log(
      `[nexus] local demo database ready — ${migrations.length} migrations applied.`,
    );
  }

  return db as unknown as LocalHandle;
}

function localHandle(): Promise<LocalHandle> {
  g.__nexusDb ??= bootLocal();
  return g.__nexusDb;
}

/**
 * PGlite is a single session, so `set role` is process-wide state. Requests
 * rendering concurrently would otherwise leak one person's identity into
 * another's query — the worst possible bug in a product whose whole promise is
 * "your manager cannot see this yet". Every actor-scoped unit of work is
 * therefore serialised through one lock.
 */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g.__nexusLock ?? Promise.resolve()).then(fn, fn);
  g.__nexusLock = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Remote driver
// ---------------------------------------------------------------------------

let remoteClient: any;

async function remote() {
  if (!remoteClient) {
    const postgres = (await import("postgres")).default;
    remoteClient = postgres(process.env.DATABASE_URL!, {
      prepare: false, // Supabase's transaction pooler does not support it
      max: 5,
    });
  }
  return remoteClient;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Tagged template → parameterised SQL. Values never reach the query text. */
function compile(strings: TemplateStringsArray, values: unknown[]) {
  return strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
    "",
  );
}

/**
 * Run a unit of work as a specific person. Every query inside runs under the
 * `authenticated` role with that profile's identity, so RLS decides what comes
 * back. Pass null to run anonymously.
 */
/*
 * Postgres error codes that mean "this database is behind the code".
 *
 *   42703  undefined_column
 *   42P01  undefined_table
 *   42883  undefined_function
 *
 * These are the shape a missing migration takes, and on their own they surface
 * as `column p.welcomed_at does not exist` at whichever query happened to
 * touch the new column first — a stack trace pointing at lib/auth.ts for a
 * problem that has nothing to do with authentication.
 */
const SCHEMA_DRIFT = new Set(["42703", "42P01", "42883"]);

/**
 * Say what a missing migration actually is.
 *
 * A raw undefined-column error is technically accurate and practically
 * useless: it names a symptom in a file that is not the cause, and the person
 * reading it has no reason to think "migration". Rethrown with the fix in the
 * message, and the original kept as `cause` so nothing is lost.
 *
 * Only the remote driver needs this. The local demo database detects drift at
 * boot and rebuilds itself.
 */
function explainSchemaDrift(error: unknown): never {
  const code = (error as { code?: string } | null)?.code;
  if (code && SCHEMA_DRIFT.has(code)) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `This database is behind the application: ${detail}. ` +
        `Apply the migrations with \`npm run db:migrate\` (it is tracked and ` +
        `re-runnable, so already-applied files are skipped).`,
      { cause: error },
    );
  }
  throw error;
}

export async function asActor<T>(
  profileId: string | null,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  if (MODE === "local") {
    return withLock(async () => {
      const db = await localHandle();

      const userId = profileId
        ? (
            await db.query("select user_id from profiles where id = $1", [profileId])
          ).rows[0]?.user_id ?? null
        : null;

      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
        userId ?? "",
      ]);
      await db.exec("set role authenticated;");

      const sql: Sql = async <T2>(strings: TemplateStringsArray, ...values: unknown[]) => {
        const res = await db.query(compile(strings, values), values);
        return res.rows as T2[];
      };

      try {
        return await fn(sql);
      } finally {
        await db.exec("reset role;");
        await db.query("select set_config('request.jwt.claim.sub', '', false)", []);
      }
    });
  }

  const client = await remote();
  return client
    .begin(async (tx: any) => {
      const userId = profileId
        ? (await tx`select user_id from profiles where id = ${profileId}`)[0]?.user_id ?? null
        : null;
      await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
      await tx`set local role authenticated`;
      return fn(tx as Sql);
    })
    .catch(explainSchemaDrift);
}

/**
 * Full access, RLS bypassed. For background jobs only — never for anything
 * that renders a page. If you are reaching for this in a route handler, the
 * answer is almost certainly asActor().
 */
export async function asService<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (MODE === "local") {
    return withLock(async () => {
      const db = await localHandle();
      const sql: Sql = async <T2>(strings: TemplateStringsArray, ...values: unknown[]) => {
        const res = await db.query(compile(strings, values), values);
        return res.rows as T2[];
      };
      return fn(sql);
    });
  }
  const client = await remote();
  return fn(client as Sql).catch(explainSchemaDrift);
}
