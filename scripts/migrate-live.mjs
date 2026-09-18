/**
 * Migrate the live/staging database, deliberately, without touching
 * DATABASE_URL — that variable is what `npm run dev`'s `predev` hook
 * auto-migrates on every start (see scripts/require-local-db.mjs), and it
 * must always point at localhost for that guard to allow `dev` to run at all.
 *
 * This reads a separate variable instead, so migrating live is its own
 * explicit command with its own URL, never a side effect of switching
 * DATABASE_URL back and forth.
 *
 * Usage:  node scripts/migrate-live.mjs   (reads LIVE_DATABASE_URL)
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
const result = spawnSync(process.execPath, [join(HERE, "migrate.mjs"), url], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
