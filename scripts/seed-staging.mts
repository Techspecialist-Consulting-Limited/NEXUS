/**
 * Put the demo organisation into a real Postgres, with working logins.
 *
 * WHY THIS REPLACED `seed-remote.ts`
 *
 * That script wrote real logins straight into `auth.users` in one SQL
 * statement joined against `profiles` — which only worked because identity
 * and data lived in the SAME database (a Supabase-hosted Postgres). Identity
 * moved off Supabase (see migration 0024): logins are now this app's own
 * `users` table, in the SAME database as everything else, on whichever
 * Postgres `DATABASE_URL` points at (Aiven, Neon, wherever). One connection,
 * two things it does with it: apply the demo seed, then create a real
 * Auth.js login per person and point their profile at it.
 *
 * WHAT IT WRITES
 *
 * One organisation, slug `nexus-demo`, and one login per seeded profile at
 * @nexus.invalid — an RFC 2606 reserved TLD, so those mailboxes cannot exist
 * and no digest addressed to one can leave the building. Everything is
 * namespaced and removable in one command:
 *
 *   node --env-file-if-exists=.env.local --import tsx scripts/seed-staging.mts --remove
 *
 * Usage:
 *   node --env-file-if-exists=.env.local --import tsx scripts/seed-staging.mts [--password X]
 *   node --env-file-if-exists=.env.local --import tsx scripts/seed-staging.mts --remove
 */
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../lib/password";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, "..", "supabase", "seed", "seed.sql");

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const passwordFlag = args.indexOf("--password");
const PASSWORD = passwordFlag >= 0 ? args[passwordFlag + 1] : "NexusDemo!2026";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 30 });

try {
  if (remove) {
    /*
     * Order matters: profiles reference `users` only by a plain uuid column
     * (see migration 0024's guarded FK), so deleting the org first would
     * orphan the logins rather than cascade to them.
     */
    const users = await sql`
      delete from users where email like '%@nexus.invalid' returning id
    `;
    const orgs = await sql`
      delete from organizations where slug = 'nexus-demo' returning id
    `;
    console.log(`removed ${orgs.length} organisation, ${users.length} logins.`);
    await sql.end();
    process.exit(0);
  }

  const existing = await sql`select id from organizations where slug = 'nexus-demo'`;
  if (existing.length) {
    console.error(
      "The demo organisation is already here.\n" +
        "Run with --remove first if you want to rebuild it.",
    );
    await sql.end();
    process.exit(1);
  }

  console.log("applying the demo seed...");
  await sql.unsafe(await readFile(SEED, "utf8"));

  console.log("creating logins...");
  const profiles = await sql<{ id: string; email: string; full_name: string }[]>`
    select p.id, p.email, p.full_name
    from profiles p
    join organizations o on o.id = p.org_id
    where o.slug = 'nexus-demo'
      and not exists (select 1 from users u where u.email = p.email)
  `;

  /*
   * Hashed once and reused for every seeded person — this is demo data with
   * one publicly-documented password, not real accounts, so there is nothing
   * gained by a different hash per row and a real cost (thirteen sequential
   * scrypt calls) to doing it anyway.
   */
  const passwordHash = await hashPassword(PASSWORD);

  for (const p of profiles) {
    const [user] = await sql<{ id: string }[]>`
      insert into users (name, email, password_hash)
      values (${p.full_name}, ${p.email}, ${passwordHash})
      returning id
    `;
    await sql`update profiles set user_id = ${user.id} where id = ${p.id}`;
  }

  const [counts] = await sql`
    select
      (select count(*) from profiles p join organizations o on o.id = p.org_id
        where o.slug = 'nexus-demo')::int as people,
      (select count(*) from commitments c join organizations o on o.id = c.org_id
        where o.slug = 'nexus-demo')::int as commitments,
      (select count(*) from users where email like '%@nexus.invalid')::int as logins
  `;

  const roster = await sql<{ email: string; full_name: string; role: string }[]>`
    select p.email, p.full_name, p.role::text as role
    from profiles p
    join organizations o on o.id = p.org_id
    where o.slug = 'nexus-demo'
      and p.role in ('executive', 'admin', 'hr', 'lead')
    order by
      case p.role when 'executive' then 0 when 'admin' then 1
                  when 'hr' then 2 else 3 end,
      p.full_name
  `;

  console.log(
    `\nseeded ${counts.people} people, ${counts.commitments} commitments, ` +
      `${counts.logins} logins.\n`,
  );
  console.log(`Every account uses the password:  ${PASSWORD}\n`);
  console.log("Worth signing in as:");
  for (const r of roster) {
    console.log(`  ${r.role.padEnd(10)} ${r.email.padEnd(32)} ${r.full_name}`);
  }
  /*
   * Three seats the roster query cannot surface, because what makes them worth
   * sitting in is a story in the data rather than a role in the schema.
   */
  console.log("\nAnd the seats where the data has something to say:");
  console.log("  staff      sade.adeniyi@nexus.invalid     Sade Adeniyi (held up by Finance for weeks)");
  console.log("  staff      uche.nwankwo@nexus.invalid     Uche Nwankwo (held up by Finance too — same cause, other unit)");
  console.log("  staff      aisha.lawal@nexus.invalid      Aisha Lawal (delivers what she promises)");

  await sql.end();
} catch (err) {
  console.error(`\nfailed: ${err instanceof Error ? err.message : err}`);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
