/**
 * Prove the Azure deployment actually works, end to end.
 *
 * Runs a real extraction through the real provider and checks the thing that
 * matters most: that source_quote comes back VERBATIM. A model that
 * paraphrases there makes the interface put words in people's mouths while
 * claiming to quote them, and no amount of prompt wording fixes it after the
 * fact — you find out by asking.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/check-azure.ts
 */
import { azureConfigFromEnv, AzureProvider, isV1Endpoint } from "../lib/ai/azure";

const config = azureConfigFromEnv();
if (!config) {
  console.error("Azure is not configured. Needs all three of:");
  console.error("  AZURE_OPENAI_ENDPOINT   " + (process.env.AZURE_OPENAI_ENDPOINT ? "set" : "MISSING"));
  console.error("  AZURE_OPENAI_API_KEY    " + (process.env.AZURE_OPENAI_API_KEY ? "set" : "MISSING"));
  console.error("  AZURE_OPENAI_DEPLOYMENT " + (process.env.AZURE_OPENAI_DEPLOYMENT ? "set" : "MISSING"));
  process.exit(1);
}

console.log(`endpoint:   ${config.endpoint}`);
console.log(`surface:    ${isV1Endpoint(config.endpoint) ? "v1-compatible" : "classic"}`);
console.log(`deployment: ${config.deployment}\n`);

const provider = new AzureProvider(config);
const TEXT =
  "Finished the deployment pipeline rollout and shipped the drill-down view. " +
  "Still blocked on brand assets from Creative Hub. Next week I will migrate " +
  "the reporting pipeline.";

try {
  console.log("running a real extraction...\n");
  const { data, usage } = await provider.extract({
    text: TEXT,
    openCommitments: [
      { id: "c1", title: "Roll staging onto the new deployment pipeline" },
      { id: "c2", title: "Integrate the new brand assets into the app shell" },
    ],
    personName: "Chidi Nwosu",
    cycleLabel: "W33 · 10 Aug–16 Aug",
  });

  console.log(`commitments found: ${data.commitments.length}`);
  for (const c of data.commitments) {
    const verbatim = TEXT.includes(c.source_quote);
    console.log(`  ${verbatim ? "ok  " : "PARAPHRASED"} ${c.title}`);
    console.log(`         quote: "${c.source_quote}"`);
    if (!verbatim) {
      console.log("         ^ not present in the original text");
    }
  }

  console.log(`\nupdates: ${data.updates.length}`);
  for (const u of data.updates) {
    console.log(`  ${u.commitment_title} -> ${u.status} (declared: ${u.declared})`);
  }
  console.log(`blockers: ${data.blockers.length ? data.blockers.join("; ") : "none"}`);

  console.log(
    `\ntokens: ${usage.promptTokens} in / ${usage.completionTokens} out · ` +
      `${usage.latencyMs}ms` +
      (usage.costUsd !== undefined ? ` · $${usage.costUsd.toFixed(5)}` : " · cost not configured"),
  );

  const allVerbatim = data.commitments.every((c) => TEXT.includes(c.source_quote));
  console.log(
    allVerbatim
      ? "\nPASS — the deployment works and quotes verbatim."
      : "\nFAIL — the model paraphrased a source quote. Do not trust the provenance.",
  );
  process.exit(allVerbatim ? 0 : 1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nFAIL — ${message}`);

  if (/404/.test(message)) {
    console.error(
      "\nA 404 here usually means the deployment name is wrong, or the endpoint\n" +
        "shape does not match the client. Check AZURE_OPENAI_DEPLOYMENT against\n" +
        "the deployment list in the Foundry portal.",
    );
  } else if (/401|403/.test(message)) {
    console.error("\nThat is the key being rejected, not the deployment.");
  }
  process.exit(1);
}
