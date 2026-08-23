/**
 * Applies every migration to a throwaway Postgres and reports what was built.
 * Run with: npm run db:check
 */

import { createTestDb } from "./db-harness.mjs";

const db = await createTestDb({ log: true });

const counts = await db.query(`
  select
    (select count(*) from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE')  as tables,
    (select count(*) from information_schema.views
       where table_schema = 'public')                                as views,
    (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e')               as enums,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public')                                   as functions,
    (select count(*) from pg_policies where schemaname = 'public')   as policies,
    (select count(*) from pg_indexes where schemaname = 'public')    as indexes
`);

const c = counts.rows[0];
console.log(
  `\nAll migrations applied cleanly.\n` +
    `  tables ${c.tables}  views ${c.views}  enums ${c.enums}  ` +
    `functions ${c.functions}  policies ${c.policies}  indexes ${c.indexes}\n`,
);

// Any table with RLS enabled but no policy is invisible to every non-service
// caller — almost always an oversight rather than an intent.
const unguarded = await db.query(`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname)
  order by 1
`);

if (unguarded.rows.length) {
  console.log("RLS enabled but NO policy (nobody can read these):");
  for (const r of unguarded.rows) console.log(`  - ${r.relname}`);
  console.log("");
}

await db.close();
