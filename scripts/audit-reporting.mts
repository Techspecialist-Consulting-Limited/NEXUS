/**
 * Read-only audit of the reporting pipeline on a real database.
 *
 * WHAT THIS DOES NOT DO: it contains no INSERT, UPDATE, DELETE, ALTER or DROP.
 * Every statement below is a SELECT. It is safe to run against production and
 * it changes nothing.
 *
 * It answers the questions the diagnosis could not, because those need real
 * data rather than a seeded fixture:
 *
 *   - did anybody's submission actually land?
 *   - did retries leave duplicate commitments behind?
 *   - is anything orphaned, or attached to the wrong cycle?
 *   - how far did the chain get: check-in -> commitments -> reconciliation?
 *
 * Usage:
 *   node --env-file-if-exists=.env.local --import tsx scripts/audit-reporting.mts
 *
 * Reads DATABASE_URL. Prints a report. Writes nothing, anywhere.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Run with --env-file-if-exists=.env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });
const h = (t: string) => console.log(`\n=== ${t} ${"=".repeat(Math.max(0, 58 - t.length))}`);

try {
  h("WHICH DATABASE");
  const [who] = await sql`
    select current_database() as db,
           (select count(*)::int from organizations) as orgs,
           (select count(*)::int from profiles where status = 'active') as people`;
  console.log(`  ${who.db} · ${who.orgs} organisation(s) · ${who.people} active people`);

  h("CHECK-INS THAT ARRIVED");
  const arrived = await sql`
    select cy.label, count(*)::int as rows,
           count(*) filter (where ci.responded_at is not null)::int as submitted,
           count(distinct ci.profile_id)::int as people
    from check_ins ci
    join cycles cy on cy.id = ci.cycle_id
    group by cy.label, cy.starts_on
    order by cy.starts_on desc
    limit 8`;
  if (!arrived.length) console.log("  NONE. No check-in row exists at all.");
  for (const r of arrived) {
    console.log(`  ${r.label.padEnd(24)} rows=${r.rows}  submitted=${r.submitted}  people=${r.people}`);
  }

  h("DID SUBMISSIONS PRODUCE COMMITMENTS?");
  const produced = await sql`
    select cy.label,
           count(distinct ci.id)::int as submitted_checkins,
           count(distinct c.id)::int  as commitments_from_them
    from check_ins ci
    join cycles cy on cy.id = ci.cycle_id
    left join commitments c on c.source_check_in_id = ci.id
    where ci.responded_at is not null
    group by cy.label, cy.starts_on
    order by cy.starts_on desc
    limit 8`;
  for (const r of produced) {
    const bad = r.submitted_checkins > 0 && r.commitments_from_them === 0;
    console.log(
      `  ${r.label.padEnd(24)} check-ins=${r.submitted_checkins}  commitments=${r.commitments_from_them}` +
        (bad ? "   <-- SAVED BUT PRODUCED NOTHING" : ""),
    );
  }

  h("DUPLICATE COMMITMENTS (the retry hazard)");
  const dupes = await sql`
    select p.full_name, cy.label, c.title, count(*)::int as copies
    from commitments c
    join profiles p on p.id = c.profile_id
    join cycles cy on cy.id = c.target_cycle_id
    where c.deleted_at is null
    group by p.full_name, cy.label, c.title
    having count(*) > 1
    order by count(*) desc
    limit 20`;
  if (!dupes.length) console.log("  none");
  for (const d of dupes) {
    console.log(`  ${String(d.copies)}x  ${d.full_name} · ${d.label} · ${d.title.slice(0, 46)}`);
  }

  h("ORPHANS AND MISATTRIBUTION");
  const [orph] = await sql`
    select
      (select count(*)::int from commitments where source_check_in_id is null and deleted_at is null) as no_source,
      (select count(*)::int from commitments c join profiles p on p.id = c.profile_id
         where c.org_id <> p.org_id) as org_mismatch,
      (select count(*)::int from check_ins ci join profiles p on p.id = ci.profile_id
         where ci.org_id <> p.org_id) as checkin_org_mismatch`;
  console.log(`  commitments with no source check-in : ${orph.no_source}`);
  console.log(`  commitments whose org != owner's org: ${orph.org_mismatch}  (must be 0)`);
  console.log(`  check-ins whose org != owner's org  : ${orph.checkin_org_mismatch}  (must be 0)`);

  h("HOW FAR THE CHAIN GOT");
  const recon = await sql`
    select status::text as status, count(*)::int as n
    from reconciliations group by status order by count(*) desc`;
  if (!recon.length) console.log("  no reconciliations at all");
  for (const r of recon) console.log(`  ${String(r.status).padEnd(20)} ${r.n}`);

  h("PER PERSON, MOST RECENT REPORTED WEEK");
  const per = await sql`
    select p.full_name, p.role::text as role,
           max(ci.responded_at) as last_reported,
           count(*) filter (where ci.responded_at is not null)::int as reports
    from profiles p
    left join check_ins ci on ci.profile_id = p.id
    where p.status = 'active' and p.role <> 'executive'
    group by p.full_name, p.role
    order by max(ci.responded_at) nulls first`;
  for (const r of per) {
    const when = r.last_reported ? String(r.last_reported).slice(0, 16) : "NEVER";
    console.log(`  ${String(r.full_name).padEnd(22)} ${String(r.role).padEnd(7)} reports=${String(r.reports).padEnd(3)} last=${when}`);
  }

  console.log("\nDone. Nothing was modified.");
} finally {
  await sql.end();
}
