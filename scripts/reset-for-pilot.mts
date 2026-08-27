/**
 * Clear the reporting history so a pilot can start from nothing.
 *
 * WHAT THIS IS FOR. A database that has been used for demonstration and repair
 * carries two kinds of noise: a seeded organisation nobody works in, and test
 * submissions filed under real names while proving the pipeline worked. Neither
 * is wrong to have created; both make the first real week impossible to read.
 *
 * TWO OPERATIONS, DELIBERATELY SEPARATE.
 *
 *   --drop <slug>    the organisation and everything in it, gone. For a seeded
 *                    demo tenant that should never have been in production.
 *
 *   --reset <slug>   the organisation, its people, its units and its weeks all
 *                    stay. Only the REPORTING is cleared — check-ins,
 *                    commitments, reconciliations, briefings, notifications.
 *
 * The second is the one to reach for. Dropping an organisation to clear its
 * data would take the units somebody spent an afternoon defining and the people
 * who have already signed in, and none of that is what "start fresh" means.
 *
 * WHAT IT WILL NOT DO
 *
 * The audit log is not touched. Migration 0019 made it append-only twice over —
 * no delete policy and no delete privilege — precisely so that the record of who
 * did what cannot be tidied away. A reset that erased its own tracks would
 * defeat the point of having one.
 *
 * Nobody is deleted from an organisation being reset. Removing a colleague is a
 * decision about a person, not about data, and it belongs in Administration →
 * People where it is one click and visible.
 *
 * Usage — prints what it WOULD do and changes nothing:
 *   node --env-file-if-exists=.env.local --import tsx scripts/reset-for-pilot.mts \
 *     --drop nexus-demo --reset techspecialist-consulting-limited
 *
 * Add --confirm to carry it out. Everything runs in one transaction: it either
 * all happens or none of it does.
 */
import postgres from "postgres";

const argv = process.argv.slice(2);
const all = (name: string) =>
  argv.reduce<string[]>((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const one = (name: string) => all(name)[0];
const has = (name: string) => argv.includes(`--${name}`);

const DROP = all("drop");
const RESET = all("reset");
/**
 * Sign-in accounts to remove along with a dropped organisation, by email
 * suffix. Required and explicit: a rule broad enough to sweep a real address is
 * a rule that eventually will, and an account deleted here cannot be undeleted.
 */
const DROP_AUTH = one("drop-auth");
const CONFIRM = has("confirm");

if (DROP.length === 0 && RESET.length === 0) {
  console.error(
    "Nothing to do.\n" +
      "  --drop <slug>        delete an organisation and everything in it\n" +
      "  --reset <slug>       keep the organisation, people, units and weeks;\n" +
      "                       clear only the reporting\n" +
      "  --drop-auth <suffix> also delete sign-in accounts ending in this,\n" +
      "                       once they belong to nobody\n" +
      "  --confirm            actually do it (otherwise this is a dry run)",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Run with --env-file-if-exists=.env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });
const h = (t: string) => console.log(`\n=== ${t} ${"=".repeat(Math.max(0, 56 - t.length))}`);

/* Cleared on a reset. Ordered children-first — see the note on commitments. */
const REPORTING_TABLES = [
  "commitments",
  "reconciliations",
  "check_ins",
  "digests",
  "notifications",
  "advice",
  "ai_runs",
  "calibration",
  "memory_entries",
];

try {
  h("WHICH DATABASE");
  const [who] = await sql<{ db: string }[]>`select current_database() as db`;
  console.log(`  ${who.db}`);
  console.log(CONFIRM ? "  MODE: confirmed — changes will be committed." : "  MODE: dry run — nothing will change.");

  // -------------------------------------------------------------------------

  const orgs = await sql<{ id: string; name: string; slug: string }[]>`
    select id, name, slug from organizations where slug = any(${[...DROP, ...RESET]})`;
  const bySlug = new Map(orgs.map((o) => [o.slug, o]));

  for (const slug of [...DROP, ...RESET]) {
    if (!bySlug.has(slug)) {
      console.error(`\nNo organisation with slug "${slug}".`);
      process.exit(1);
    }
  }

  h("WHAT WOULD GO");

  for (const slug of DROP) {
    const org = bySlug.get(slug)!;
    console.log(`\n  DROP ENTIRELY — ${org.name}`);
    for (const t of [...REPORTING_TABLES, "profiles", "departments", "cycles", "invitations"]) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(t)} where org_id = ${org.id}`;
      if (n > 0) console.log(`    ${String(n).padStart(5)}  ${t}`);
    }
    const [{ n: audits }] = await sql<{ n: number }[]>`
      select count(*)::int as n from audit_events where org_id = ${org.id}`;
    if (audits > 0) console.log(`    ${String(audits).padStart(5)}  audit_events  (goes with the organisation)`);
  }

  for (const slug of RESET) {
    const org = bySlug.get(slug)!;
    console.log(`\n  CLEAR REPORTING — ${org.name}`);
    for (const t of REPORTING_TABLES) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(t)} where org_id = ${org.id}`;
      if (n > 0) console.log(`    ${String(n).padStart(5)}  ${t}`);
    }
    const [{ n: stale }] = await sql<{ n: number }[]>`
      select count(*)::int as n from invitations
       where org_id = ${org.id} and accepted_at is null`;
    if (stale > 0) console.log(`    ${String(stale).padStart(5)}  invitations that were never accepted`);

    console.log(`\n    KEPT:`);
    for (const t of ["profiles", "departments", "cycles"]) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(t)} where org_id = ${org.id}`;
      console.log(`    ${String(n).padStart(5)}  ${t}`);
    }
    const [{ n: keptAudit }] = await sql<{ n: number }[]>`
      select count(*)::int as n from audit_events where org_id = ${org.id}`;
    console.log(`    ${String(keptAudit).padStart(5)}  audit_events  (append-only by design — migration 0019)`);

    const people = await sql<{ full_name: string; role: string; email: string }[]>`
      select full_name, role::text, email from profiles
       where org_id = ${org.id} and status = 'active' order by role, full_name`;
    console.log(`\n    The people who stay:`);
    for (const p of people) console.log(`           ${p.role.padEnd(10)} ${p.full_name.padEnd(20)} ${p.email}`);
  }

  if (DROP_AUTH) {
    const accounts = await sql<{ email: string }[]>`
      select email from auth.users where email like ${"%" + DROP_AUTH} order by email`;
    console.log(`\n  SIGN-IN ACCOUNTS ending in "${DROP_AUTH}": ${accounts.length}`);
    for (const a of accounts) console.log(`           ${a.email}`);
  }

  // -------------------------------------------------------------------------

  if (!CONFIRM) {
    console.log(
      "\nDry run. Nothing was changed.\nAdd --confirm to carry this out.",
    );
    process.exit(0);
  }

  h("CARRYING IT OUT");

  await sql.begin(async (tx) => {
    for (const slug of RESET) {
      const org = bySlug.get(slug)!;
      /*
       * Commitments first, and this is not tidiness.
       *
       * commitments.created_cycle_id and .target_cycle_id are ON DELETE
       * RESTRICT, so anything that removes a cycle while a commitment still
       * points at it fails outright. Clearing commitments first makes the rest
       * of the order irrelevant.
       */
      for (const t of REPORTING_TABLES) {
        const rows = await tx`delete from ${tx(t)} where org_id = ${org.id} returning 1`;
        if (rows.length) console.log(`  ${org.name}: cleared ${rows.length} ${t}`);
      }
      const inv = await tx`
        delete from invitations
         where org_id = ${org.id} and accepted_at is null returning 1`;
      if (inv.length) console.log(`  ${org.name}: cleared ${inv.length} unaccepted invitations`);

      /*
       * Forget that a briefing was ever delivered.
       *
       * exec_digest_last_at is what the cadence gate compares against, and
       * exec_digest_next_at is a one-off somebody asked for. Left behind, the
       * first brief of the pilot would be held back as though it had already
       * gone out — a schedule silently honouring a week that no longer exists.
       */
      await tx`
        update organizations
           set settings = settings - 'exec_digest_last_at' - 'exec_digest_next_at'
         where id = ${org.id}`;
      console.log(`  ${org.name}: cleared the delivery marks`);
    }

    for (const slug of DROP) {
      const org = bySlug.get(slug)!;
      // Same RESTRICT, same reason: release the cycles before the cascade runs.
      await tx`delete from commitments where org_id = ${org.id}`;
      await tx`delete from organizations where id = ${org.id}`;
      console.log(`  dropped ${org.name} and everything in it`);
    }

    if (DROP_AUTH) {
      /*
       * Only accounts that now belong to nobody.
       *
       * A sign-in account and a profile are different records, and an address
       * can legitimately hold an account with no profile — somebody who signed
       * in before accepting an invitation. Checking for a remaining profile
       * means a real colleague in that state is never swept up by a suffix
       * that happened to match.
       */
      const gone = await tx<{ email: string }[]>`
        delete from auth.users u
         where u.email like ${"%" + DROP_AUTH}
           and not exists (select 1 from profiles p where lower(p.email) = lower(u.email))
        returning u.email`;
      console.log(`  deleted ${gone.length} sign-in accounts ending in "${DROP_AUTH}"`);
    }
  });

  h("AFTER");
  for (const o of await sql<{ name: string; people: number }[]>`
    select o.name,
           (select count(*)::int from profiles p where p.org_id = o.id) as people
      from organizations o order by o.created_at`) {
    console.log(`  ${o.name.padEnd(38)} ${o.people} people`);
  }
  for (const slug of RESET) {
    const org = bySlug.get(slug)!;
    for (const t of REPORTING_TABLES) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(t)} where org_id = ${org.id}`;
      if (n > 0) console.log(`  LEFT OVER: ${n} ${t} in ${org.name}`);
    }
  }
  console.log("\nDone.");
} finally {
  await sql.end();
}
