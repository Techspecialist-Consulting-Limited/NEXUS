/**
 * Probe a Postgres connection and say precisely what is wrong when it fails.
 *
 * Supabase gives several ways to connect and they fail differently:
 *   direct host   IPv6-only on new projects, so an IPv4 network just hangs
 *   pooler        IPv4, but the username is postgres.<project-ref>
 *   bad password  authenticates and is rejected, which is a different error
 *
 * "could not connect" covers all three and points at none of them.
 */
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("usage: node scripts/db-connect-test.mjs <connection-url>");
  process.exit(1);
}

const redacted = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
console.log(`connecting to ${redacted}`);

const sql = postgres(url, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});

try {
  const [row] = await sql`
    select current_database() as db,
           current_user       as who,
           version()          as version
  `;
  console.log(`  database: ${row.db}`);
  console.log(`  user:     ${row.who}`);
  console.log(`  server:   ${row.version.split(",")[0]}`);

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log(`  public tables: ${tables.length ? tables.map((t) => t.table_name).join(", ") : "(none — empty schema)"}`);

  console.log("\nPASS — connected.");
  await sql.end();
  process.exit(0);
} catch (err) {
  const msg = String(err.message ?? err);
  console.error(`\nFAIL — ${msg}`);

  if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    console.error(
      "\nThat is a network-level failure, not a credential one. New Supabase\n" +
        "projects expose the DIRECT host over IPv6 only. If this machine is\n" +
        "IPv4-only, use the Session pooler instead — note the username changes\n" +
        "to postgres.<project-ref>:\n" +
        "  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres\n" +
        "The exact host is in Project Settings -> Database -> Connection string.",
    );
  } else if (/password authentication failed|SASL/i.test(msg)) {
    console.error(
      "\nThe server was reached and rejected the credentials. If the password\n" +
        "contains @ : / ? # or %, percent-encode it — @ becomes %40.",
    );
  }
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
