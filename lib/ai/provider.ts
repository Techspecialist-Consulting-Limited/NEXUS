import { MockProvider } from "./mock";
import { AzureProvider, azureConfigFromEnv } from "./azure";
import type { AiProvider } from "./types";

/*
 * Which brain is running.
 *
 * Azure when it is configured, the deterministic mock otherwise. The mock is
 * not a placeholder to be deleted — it is why the app works offline, why the
 * tests are reproducible, and why a missing credential degrades the product
 * rather than breaking it.
 *
 * Selection happens once and is cached, so a request never pays for client
 * construction and the choice cannot change halfway through a page render.
 */
let cached: AiProvider | undefined;

export function aiProvider(): AiProvider {
  if (!cached) {
    /*
     * Tests must never reach a metered API.
     *
     * Once AZURE_OPENAI_* is configured, anything importing this module would
     * quietly start making real calls — including the test suite, which runs
     * on every change and would be slow, non-deterministic and billed. The
     * suite sets this flag in vitest.config.mts, so the choice is explicit
     * rather than a happy accident of which env file got loaded.
     */
    if (process.env.NEXUS_FORCE_MOCK_AI === "1") {
      cached = new MockProvider();
      return cached;
    }

    const azure = azureConfigFromEnv();
    if (azure) {
      cached = new AzureProvider(azure);
      /*
       * Printed ONCE per process — the provider is cached above, so this is
       * initialisation, not a per-request cost. It appears beside whichever
       * request first touches the AI layer, which is usually a page that
       * builds coaching or a briefing.
       *
       * It deliberately no longer warns about a missing embedding deployment.
       * Nothing calls embed() yet, so that line reported a degradation that
       * was not happening on every single boot — and a warning that is always
       * printed and never true is a warning people stop reading. The fallback
       * announces itself at the point it is actually used instead.
       */
      console.info(
        `[nexus:ai] Azure OpenAI · ${azure.deployment}` +
          (azure.fastDeployment ? ` (fast: ${azure.fastDeployment})` : ""),
      );
    } else {
      cached = new MockProvider();
    }
  }
  return cached;
}

export function providerIsMock(): boolean {
  return aiProvider().name === "mock";
}

/** What the interface should say about where its words came from. */
export function providerLabel(): string {
  const p = aiProvider();
  return p.name === "mock" ? "offline model" : `${p.name} · ${p.model}`;
}

/** Reset between tests. Never called by the app. */
export function __resetProvider() {
  cached = undefined;
}
