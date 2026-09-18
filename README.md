This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Migrating the live database

`DATABASE_URL` in `.env.local` is local-only — `npm run dev` runs `predev`,
which refuses to start unless `DATABASE_URL` points at `localhost` (see
`scripts/require-local-db.mjs`), so it can never migrate a remote database by
accident. Migrating live is a separate, deliberate command that reads its own
variable instead.

### What's needed

- `LIVE_DATABASE_URL` set in `.env.local` — the live Postgres connection
  string (currently Azure). Never `DATABASE_URL`.
- On a database that has **never** been migrated before, the `vector`
  extension must be allow-listed first: Azure Portal → your Postgres server →
  **Server parameters** → `azure.extensions` → add `VECTOR`. Skip this if the
  live database has already been migrated once.

### Steps

1. **First time only**, on a brand-new database:
   ```bash
   npm run db:setup-shim:live
   ```
   Creates the `pgcrypto`/`vector` extensions and the `auth` schema's
   `auth.uid()` function. Supabase provides these automatically; a plain
   Postgres (Azure, Neon, Aiven, ...) doesn't, and `0006_rls.sql` fails with
   `schema "auth" does not exist` without it. Safe to skip on a database
   that's already past this step.

2. **Every time there are new migrations to apply:**
   ```bash
   npm run db:migrate:live
   ```
   Applies `supabase/migrations/*.sql` in order. Tracked and re-runnable —
   already-applied files are skipped, so running it again when nothing changed
   is a no-op. Run this after every deploy that adds a migration, before the
   new code serves traffic.

Both commands print `FAIL <file>` with the Postgres error if a migration
doesn't apply cleanly — fix the underlying issue (or, for the `auth` schema
error, run step 1) rather than editing an already-applied migration file;
`scripts/migrate.mjs` refuses to re-apply one whose contents changed.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
