/**
 * One-time bootstrap for the live database, mirroring migrate-live.mjs's
 * pattern: reads LIVE_DATABASE_URL rather than DATABASE_URL, so this can
 * never accidentally target whatever `npm run dev` is pointed at.
 *
 * Run once, before the first `npm run db:migrate:live` against a database —
 * migration 0006_rls.sql calls `auth.uid()`, which only exists on Supabase by
 * default. See scripts/setup-auth-shim.mjs for what it actually creates.
 *
 * Usage:  node scripts/setup-shim-live.mjs   (reads LIVE_DATABASE_URL)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.LIVE_DATABASE_URL;
if (!url) {
  console.error(
    "\n  No LIVE_DATABASE_URL set.\n" +
      "  Add it to .env.local, e.g.:\n" +
      "  LIVE_DATABASE_URL=postgresql://nexus:<password>@nexus-postgres-live.postgres.database.azure.com:5432/nexus?sslmode=require\n",
  );
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [join(HERE, "setup-auth-shim.mjs"), url], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
