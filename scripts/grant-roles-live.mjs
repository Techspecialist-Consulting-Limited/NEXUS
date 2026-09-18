/**
 * Grant the `authenticated` role on the live database, reading
 * LIVE_DATABASE_URL rather than DATABASE_URL — same reasoning as
 * migrate-live.mjs and setup-shim-live.mjs.
 *
 * Run once per database after the first `npm run db:migrate:live`, and again
 * any time a later migration adds tables or functions that need the same
 * grants (safe and idempotent either way).
 *
 * Usage:  node scripts/grant-roles-live.mjs   (reads LIVE_DATABASE_URL)
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
const result = spawnSync(process.execPath, [join(HERE, "grant-roles.mjs"), url], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
