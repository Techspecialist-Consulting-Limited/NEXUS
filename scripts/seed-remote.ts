/**
 * Put the demo organisation into a real Supabase project, with working logins.
 *
 * WHY THIS EXISTS
 *
 * A freshly connected project has one account and no data, so every screen is
 * an empty state and nothing about the product is visible. The local demo has
 * eight weeks of history and eighteen people; this puts the same thing where
 * real authentication can reach it, and — the part that matters — creates a
 * password login for each person, so you can sit in the Chairman's seat, then
 * HR's, then a blocked engineer's, and see three genuinely different products.
 *
 * WHAT IT WRITES
 *
 * One organisation, slug `nexus-demo`, and one auth user per seeded profile at
 * @nexus.demo. Everything is namespaced and removable in a single command:
 *
 *   node --env-file-if-exists=.env.local scripts/seed-remote.ts --remove
 *
 * Passwords are bcrypt via pgcrypto, and email_confirmed_at is set so the
 * accounts work immediately. That is safe here because these mailboxes do not
 * exist — nobody is being confirmed on their behalf.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local scripts/seed-remote.ts [--password X]
 *   node --env-file-if-exists=.env.local scripts/seed-remote.ts --remove
 */
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
     * Order matters: profiles reference auth.users only by a plain uuid column
     * with no foreign key, so deleting the org first would orphan the logins.
     */
    const users = await sql`
      delete from auth.users where email like '%@nexus.demo' returning id
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

  /*
   * Give every seeded person a login.
   *
   * GoTrue reads auth.users.encrypted_password as bcrypt, which pgcrypto can
   * produce directly — so this needs no service-role key and no admin API.
   * instance_id and aud are not optional: GoTrue rejects rows without them
   * with an error that says nothing about which column is missing.
   */
  console.log("creating logins...");
  await sql`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- These are nullable in the schema, and GoTrue scans them into plain Go
      -- strings. A NULL makes every sign-in fail with "Database error querying
      -- schema", which names neither the column nor the table. Empty string is
      -- what GoTrue itself writes.
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone_change,
      phone_change_token, reauthentication_token
    )
    select
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p.email,
      crypt(${PASSWORD}, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p.full_name),
      now(),
      now(),
      '', '', '', '', '', '', '', ''
    from profiles p
    join organizations o on o.id = p.org_id
    where o.slug = 'nexus-demo'
      and not exists (select 1 from auth.users u where u.email = p.email)
  `;

  await sql`
    update profiles p
    set user_id = u.id
    from auth.users u
    where u.email = p.email and p.user_id is null
  `;

  const [counts] = await sql`
    select
      (select count(*) from profiles p join organizations o on o.id = p.org_id
        where o.slug = 'nexus-demo')::int as people,
      (select count(*) from commitments c join organizations o on o.id = c.org_id
        where o.slug = 'nexus-demo')::int as commitments,
      (select count(*) from auth.users where email like '%@nexus.demo')::int as logins
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
    console.log(`  ${r.role.padEnd(10)} ${r.email.padEnd(24)} ${r.full_name}`);
  }
  console.log("  staff      chidi@nexus.demo         Chidi Nwosu (blocked by another team)");
  console.log("  staff      tunde@nexus.demo         Tunde Balogun (the silent dropper)");

  await sql.end();
} catch (err) {
  console.error(`\nfailed: ${err instanceof Error ? err.message : err}`);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
