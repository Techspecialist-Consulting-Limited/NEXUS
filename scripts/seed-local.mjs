/**
 * Apply the demo seed to a plain Postgres — local dev, Neon, anywhere that
 * isn't a Supabase project.
 *
 * WHY THIS IS NOT `seed-staging.mjs`. That script also creates real Auth.js
 * logins (email + password, in `users` — see migration 0024), which a bare
 * local Postgres has no need for: local exploration goes through the persona
 * switcher (NEXUS_FORCE_DEMO_AUTH=1), which resolves a viewer straight from
 * `profiles` and never touches a login table at all.
 *
 * The seed itself (supabase/seed/seed.sql) is generated, re-runnable, and
 * clears its own organisation first — see scripts/generate-seed.mjs.
 *
 * ONE THING THE SEED ITSELF DOES NOT DO: set `profiles.user_id`. It was
 * written for PGlite, where `bootLocal()` (lib/db.ts) creates a matching
 * `auth.users` row and backfills `user_id` as part of local bootstrap — a
 * step that only runs for PGlite, never for a real Postgres. Without it every
 * seeded profile has `user_id = null`, and `devIdentity()` in lib/auth.ts
 * treats a null `user_id` as "nobody" and refuses to resolve them — so the
 * persona switcher would silently find nobody home no matter who you picked.
 * This script backfills it directly: safe here because this database has no
 * `auth.users` table (see setup-auth-shim.mjs) and so no foreign key expects
 * `user_id` to point at a real row — it only has to be a stable, non-null id.
 *
 * Usage:  node scripts/seed-local.mjs [connection-url]   (defaults to DATABASE_URL)
 */
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, "..", "supabase", "seed", "seed.sql");

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No connection URL. Pass one, or set DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 30 });

try {
  console.log("applying the demo seed...");
  await sql.unsafe(await readFile(SEED, "utf8"));

  console.log("linking seeded people to a signed-in identity...");
  await sql`
    update profiles p
    set user_id = gen_random_uuid()
    from organizations o
    where p.org_id = o.id and o.slug = 'nexus-demo' and p.user_id is null
  `;

  const [counts] = await sql`
    select
      (select count(*) from profiles p join organizations o on o.id = p.org_id
        where o.slug = 'nexus-demo')::int as people,
      (select count(*) from commitments c join organizations o on o.id = c.org_id
        where o.slug = 'nexus-demo')::int as commitments,
      (select count(*) from cycles cy join organizations o on o.id = cy.org_id
        where o.slug = 'nexus-demo')::int as cycles
  `;

  const roster = await sql`
    select p.full_name, p.role::text as role
    from profiles p
    join organizations o on o.id = p.org_id
    where o.slug = 'nexus-demo'
    order by
      case p.role when 'executive' then 0 when 'admin' then 1
                  when 'hr' then 2 when 'lead' then 3 else 4 end,
      p.full_name
  `;

  console.log(
    `\nseeded ${counts.people} people, ${counts.commitments} commitments, ` +
      `${counts.cycles} cycles.\n`,
  );
  console.log(
    "Set NEXUS_FORCE_DEMO_AUTH=1 in .env.local, run npm run dev, and use the\n" +
      "persona switcher to browse as any of:\n",
  );
  for (const r of roster) {
    console.log(`  ${r.role.padEnd(10)} ${r.full_name}`);
  }
} finally {
  await sql.end();
}
