import { azureConfigFromEnv, AzureProvider } from "../lib/ai/azure";
const provider = new AzureProvider(azureConfigFromEnv()!);
const { data, usage } = await provider.narrate({
  personName: "Chidi Nwosu",
  cycleLabel: "W33 · 10 Aug–16 Aug",
  metrics: {
    promised_count: 5, delivered_count: 2, blocked_count: 2, dropped_count: 1,
    silent_drop_count: 0, carryover_count: 0, unplanned_count: 0,
    protected_count: 2, delivery_rate: 67, signal_integrity: 100,
  },
  unmentioned: ["Ship the campaign landing page"],
});
console.log("narrative:\n  " + data.narrative + "\n");
console.log("coaching:");
for (const c of data.coaching) console.log(`  [${c.title || "—"}] ${c.body}  (based on: ${c.based_on || "—"})`);
console.log("\nquestions:");
for (const q of data.questions) console.log("  " + q);
console.log(`\nvalidated ok · ${usage.latencyMs}ms · ${usage.completionTokens} out`);
process.exit(0);
