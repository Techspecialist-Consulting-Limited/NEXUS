import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    /*
     * Never call a real model from a test.
     *
     * With Azure configured, aiProvider() would return the live provider and
     * the suite would make billed, non-deterministic, minute-long calls on
     * every run. The mock is what these tests are written against.
     */
    env: { NEXUS_FORCE_MOCK_AI: "1" },
    include: ["tests/**/*.test.ts"],
    // Booting PGlite and replaying 500 seeded commitments through a plpgsql
    // loop is not fast. It is still far faster than standing up Docker.
    testTimeout: 180_000,
    hookTimeout: 240_000,
    // PGlite instances are memory-hungry; run files sequentially.
    fileParallelism: false,
  },
});
