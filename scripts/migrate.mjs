/**
 * Apply the migrations to a real Postgres.
 *
 * Tracked and re-runnable: each file is recorded once applied, so running this
 * again is a no-op rather than a pile of "already exists" errors. Each file
 * runs in its own transaction, which also happens to be required — 0007 adds
 * an enum value that 0008 uses, and Postgres will not let a new value be used
 * in the transaction that added it.
 *
 * A checksum is stored per file. Editing a migration that has already been
 * applied is a silent way to make two environments disagree about what the
 * schema is, so it is refused rather than ignored.
 *
 * Usage:  node scripts/migrate.mjs [connection-url]   (defaults to DATABASE_URL)
 */
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "supabase", "migrations");

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No connection URL. Pass one, or set DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });

await sql`
  create table if not exists schema_migrations (
    filename    text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  )
`;

const applied = new Map(
  (await sql`select filename, checksum from schema_migrations`).map((r) => [
    r.filename,
    r.checksum,
  ]),
);

const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const file of files) {
  const body = await readFile(join(DIR, file), "utf8");
  const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

  const previous = applied.get(file);
  if (previous) {
    if (previous !== checksum) {
      console.error(
        `\n  ${file} has changed since it was applied.\n` +
          `  Migrations are a shared history — edit it and this database and\n` +
          `  every other one stop agreeing about what the schema is. Add a new\n` +
          `  migration instead.`,
      );
      await sql.end();
      process.exit(1);
    }
    console.log(`  --  ${file} (already applied)`);
    continue;
  }

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        insert into schema_migrations (filename, checksum)
        values (${file}, ${checksum})
      `;
    });
    console.log(`  ok  ${file}`);
    ran++;
  } catch (err) {
    console.error(`\n  FAIL  ${file}`);
    console.error(`        ${err.message}`);
    if (err.hint) console.error(`        hint: ${err.hint}`);
    if (err.position) console.error(`        at character ${err.position}`);
    await sql.end();
    process.exit(1);
  }
}

const [counts] = await sql`
  select
    (select count(*) from information_schema.tables where table_schema='public')::int as tables,
    (select count(*) from information_schema.views  where table_schema='public')::int as views,
    (select count(*) from pg_policies where schemaname='public')::int                 as policies
`;

console.log(
  `\n${ran} applied, ${files.length - ran} already present.\n` +
    `  tables ${counts.tables}  views ${counts.views}  policies ${counts.policies}`,
);

await sql.end();
