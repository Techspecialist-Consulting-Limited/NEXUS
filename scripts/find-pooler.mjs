/**
 * Find which Supabase pooler region hosts a project.
 *
 * New projects no longer publish db.<ref>.supabase.co at all, so the pooler is
 * the only route in — and its hostname embeds a region that nothing in the
 * public API reveals. The pooler does answer honestly though: the wrong region
 * says "Tenant or user not found" without touching the database, so probing is
 * cheap and unambiguous.
 *
 * Usage:  node scripts/find-pooler.mjs <project-ref> <password>
 */
import postgres from "postgres";

const [ref, password] = process.argv.slice(2);
if (!ref || !password) {
  console.error("usage: node scripts/find-pooler.mjs <project-ref> <password>");
  process.exit(1);
}

const REGIONS = [
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2",
  "eu-north-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  "ap-northeast-2", "sa-east-1", "ca-central-1",
];
const PREFIXES = ["aws-0", "aws-1"];

const enc = encodeURIComponent(password);

for (const prefix of PREFIXES) {
  for (const region of REGIONS) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const url = `postgresql://postgres.${ref}:${enc}@${host}:5432/postgres`;
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 8, idle_timeout: 2 });
    try {
      const [row] = await sql`select current_database() as db`;
      console.log(`\nFOUND — ${host}`);
      console.log(`  database: ${row.db}`);
      console.log(`\nDATABASE_URL=postgresql://postgres.${ref}:${enc}@${host}:5432/postgres`);
      await sql.end();
      process.exit(0);
    } catch (err) {
      const msg = String(err.message ?? err);
      const wrongTenant = /Tenant or user not found/i.test(msg);
      const noHost = /ENOTFOUND|EAI_AGAIN/i.test(msg);
      if (!wrongTenant && !noHost) {
        // Anything else is informative: a real auth failure means the right
        // region with the wrong password, which is worth stopping on.
        console.log(`  ${host}: ${msg.slice(0, 90)}`);
      }
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
}

console.error("\nNo pooler region accepted this project ref.");
process.exit(1);
