/**
 * Refuse to let `npm run dev` run migrations against anything but a local
 * database.
 *
 * `predev` runs `db:migrate` automatically on every `npm run dev` start, so
 * whatever `DATABASE_URL` happens to be in `.env.local` gets DDL applied to it
 * without a human choosing that moment. That is fine for a local Postgres —
 * migrations are tracked and idempotent — but `.env.local` has held a prod or
 * staging URL before (see git history), and this script is the only thing
 * standing between "started the dev server" and "migrated prod".
 *
 * A deliberate migration against a remote database is still one command away:
 * `node scripts/migrate.mjs "<remote-url>"` bypasses `predev` entirely because
 * it does not go through npm's dev lifecycle.
 *
 * Usage:  node scripts/require-local-db.mjs
 */
const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "\n  predev: no DATABASE_URL set — nothing to migrate.\n" +
      "  Set it in .env.local to a local Postgres, e.g.:\n" +
      "  DATABASE_URL=postgresql://postgres:password@localhost:5432/nexus\n",
  );
  process.exit(1);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error(`\n  predev: DATABASE_URL is not a valid connection URL: ${url}\n`);
  process.exit(1);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `\n  predev: DATABASE_URL points at "${host}", not localhost.\n` +
      "  Refusing to auto-migrate a remote database just because the dev\n" +
      "  server started. Point DATABASE_URL at your local Postgres to run\n" +
      "  `npm run dev`, or migrate a remote database deliberately with:\n" +
      '    node scripts/migrate.mjs "<remote-url>"\n',
  );
  process.exit(1);
}
