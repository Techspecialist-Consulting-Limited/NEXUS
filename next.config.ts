import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    PGlite ships WebAssembly and gzipped extension bundles (pgvector, pgcrypto)
    that it locates on disk at runtime. Bundling it rewrites those paths into
    /_next/static/media/... URLs, and Postgres then fails to boot with
    "Extension bundle not found". Marking these external leaves them to be
    required from node_modules, which is what their loaders expect.

    postgres.js is listed for the same class of reason: it is a plain Node
    driver with no business being processed by the bundler.
  */
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "postgres",
  ],
};

export default nextConfig;
