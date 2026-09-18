/**
 * Whether the sign-in screen knows what it is talking about.
 *
 * `microsoftConfigured()` used to be `enabledProviders()`, asking Supabase's
 * own settings endpoint at request time — with a whole failure mode around
 * "the endpoint could not be reached, so is this really off?" (see this
 * file's git history). Identity is self-hosted now: the same three
 * environment variables that configure the Microsoft Entra ID provider (see
 * auth.ts) are the only source of truth for whether the button should
 * appear, so there is nothing left to ask over the network and nothing left
 * to fail independently of those variables themselves.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const KEYS = ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function load() {
  const mod = await import("../lib/auth-providers");
  return mod.microsoftConfigured;
}

describe("microsoftConfigured", () => {
  it("is true only once all three values are present", async () => {
    process.env.AZURE_CLIENT_ID = "id";
    process.env.AZURE_CLIENT_SECRET = "secret";
    process.env.AZURE_TENANT_ID = "tenant";

    const microsoftConfigured = await load();
    expect(microsoftConfigured()).toBe(true);
  });

  it("is false if any one of the three is missing", async () => {
    process.env.AZURE_CLIENT_ID = "id";
    process.env.AZURE_CLIENT_SECRET = "secret";
    delete process.env.AZURE_TENANT_ID;

    const microsoftConfigured = await load();
    expect(microsoftConfigured()).toBe(false);
  });

  it("is false with nothing configured", async () => {
    for (const k of KEYS) delete process.env[k];

    const microsoftConfigured = await load();
    expect(microsoftConfigured()).toBe(false);
  });
});
