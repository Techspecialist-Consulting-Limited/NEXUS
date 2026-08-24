/**
 * Whether the sign-in screen knows what it is talking about.
 *
 * `enabledProviders()` reports which sign-in methods a Supabase project has
 * switched on. Its failure mode is the interesting part: when the settings
 * endpoint cannot be read it returns "no social providers", which is
 * indistinguishable from a project that genuinely has none.
 *
 * That shipped. A deployment carrying a wrong publishable key got a 401 here,
 * fell back, and the login screen told people Microsoft was "not switched on
 * for this project yet" — sending them to the Supabase dashboard to enable a
 * provider that had been enabled the whole time. The admin Integrations page
 * reported the same non-fact.
 *
 * So `known` is pinned here: false whenever the answer is a guess, true only
 * when it was actually read. The copy on both surfaces branches on it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SETTINGS = {
  external: { azure: true, google: false, email: true },
};

/*
 * The module reads env at import time and caches for a minute, so each case
 * gets a fresh module registry rather than the previous case's answer.
 */
async function load() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  return import("../lib/supabase-env");
}

const originalFetch = globalThis.fetch;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The warnings are deliberate; they should not clutter the test output.
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  warn.mockRestore();
});

describe("enabledProviders", () => {
  it("reports what the project actually has, and knows it", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(SETTINGS), { status: 200 }),
    ) as unknown as typeof fetch;

    const { enabledProviders } = await load();
    const providers = await enabledProviders();

    expect(providers.azure).toBe(true);
    expect(providers.google).toBe(false);
    expect(providers.known).toBe(true);
  });

  it("does not claim a provider is off when the key was rejected", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("unauthorized", { status: 401, statusText: "Unauthorized" }),
    ) as unknown as typeof fetch;

    const { enabledProviders } = await load();
    const providers = await enabledProviders();

    // Social stays off so no unusable button is offered...
    expect(providers.azure).toBe(false);
    // ...but the screen must not present that as an observation.
    expect(providers.known).toBe(false);
    // And the cause has to reach a log, or it is invisible in production.
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("401");
  });

  it("does not claim a provider is off when Supabase is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network unreachable");
    }) as unknown as typeof fetch;

    const { enabledProviders } = await load();
    const providers = await enabledProviders();

    expect(providers.known).toBe(false);
    expect(providers.email).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not claim a provider is off when there is no project at all", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

    const { enabledProviders } = await import("../lib/supabase-env");
    const providers = await enabledProviders();

    expect(providers.known).toBe(false);
  });
});
