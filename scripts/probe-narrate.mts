/** Show exactly what the model returns for narrate(), before validation. */
import { azureConfigFromEnv } from "../lib/ai/azure";
import { NARRATIVE_SYSTEM, narrativeUser } from "../lib/ai/prompts";
import OpenAI from "openai";

const config = azureConfigFromEnv()!;
const client = new OpenAI({
  baseURL: config.endpoint,
  apiKey: config.apiKey,
  defaultHeaders: { "api-key": config.apiKey },
});

const user = narrativeUser({
  personName: "Chidi Nwosu",
  cycleLabel: "W33 · 10 Aug–16 Aug",
  metrics: {
    promised_count: 5, delivered_count: 2, partial_count: 0,
    deferred_count: 0, blocked_count: 2, dropped_count: 1,
    silent_drop_count: 0, carryover_count: 0, unplanned_count: 0,
    protected_count: 2, delivery_rate: 67, signal_integrity: 100,
  },
  unmentioned: ["Ship the campaign landing page"],
});

const r = await client.chat.completions.create({
  model: config.deployment,
  messages: [
    { role: "system", content: NARRATIVE_SYSTEM },
    { role: "user", content: user },
  ],
  response_format: { type: "json_object" },
});

const raw = r.choices[0]?.message?.content ?? "";
console.log("raw response:\n");
console.log(raw.slice(0, 1200));
console.log("\ntop-level keys:", Object.keys(JSON.parse(raw)));
process.exit(0);
