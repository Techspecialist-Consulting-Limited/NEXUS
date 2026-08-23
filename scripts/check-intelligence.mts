/**
 * Exercise the intelligence layer against the live model and real data.
 *
 * The mock proves the plumbing; only this proves the wording. Each question
 * below targets one of the response shapes ASSISTANT_SYSTEM distinguishes —
 * factual, decision, risk — plus the two cases where the model is most tempted
 * to invent: a figure it was not given, and a history it was not told about.
 *
 * Usage: npm run check:intelligence
 */
import { ask } from "../lib/ai/assistant";
import { asService } from "../lib/db";

const CASES: [string, string][] = [
  ["factual  ", "How is Operations?"],
  ["decision ", "What needs my attention?"],
  ["risk     ", "Is anything slipping?"],
  ["history  ", "Has the Creative Hub dependency happened before?"],
  ["no-data  ", "What is our headcount plan for next quarter?"],
];

const [exec] = await asService((sql) => sql<{ id: string; full_name: string }>`
  select id, full_name from profiles where role = 'executive' and status = 'active' limit 1`);

for (const [label, question] of CASES) {
  const t = Date.now();
  try {
    const r = await ask({ actor: exec.id, question, history: [] });
    if (!r) { console.log(`  ${label} (no settled week)`); continue; }
    const a = r.answer;
    const words = a.detail.trim().split(/\s+/).length;
    console.log(`\n  ${label} ${question}   [${Date.now() - t}ms]`);
    console.log(`    answered=${a.answered}  ${words}w${words > 70 ? "  OVER 70" : ""}`);
    console.log(`    ANSWER  ${a.detail}`);
  } catch (e) {
    console.log(`  ${label} FAILED: ${(e as Error).message}`);
  }
}
process.exit(0);
